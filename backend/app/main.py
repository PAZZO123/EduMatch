"""EduMatch AI backend — FastAPI application factory.

Run:  uvicorn app.main:create_app --factory --reload   (from backend/)
Docs: http://127.0.0.1:8000/docs
"""
import logging
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select

from .api import acceptance, auth, cohorts, history, model, runs, users
from .config import Settings, get_settings, use_settings
from .db import Database
from .errors import install_error_handlers
from .ml_registry import ModelRegistry
from .models import Cohort, User
from .roles import DEFAULT_TITLE, TITLE_TO_ROLE
from .security import hash_password
from .services import cohorts as cohort_svc

log = logging.getLogger('edumatch')


def _ensure_users(db: Database, settings: Settings):
    """Create the configured demo accounts if they don't exist yet. Passwords come from .env only."""
    accounts = [(settings.admin_username, settings.admin_password, 'Super Administrator', 'Demo Super Administrator'),
                (settings.officer_username, settings.officer_password, 'Placement Officer', 'Demo Placement Officer'),
                (settings.placement_admin_username, settings.placement_admin_password, 'Placement Administrator',
                 'Demo Placement Administrator'),
                (settings.school_admin_username, settings.school_admin_password, 'School Administrator',
                 'Demo School Administrator')]
    with db.sessionmaker() as s:
        for username, password, title, name in accounts:
            if not username or not password:
                continue
            if s.scalar(select(User).where(func.lower(User.username) == username.lower())) is None:
                s.add(User(username=username, display_name=name, role=TITLE_TO_ROLE[title], title=title,
                           department='EduMatch demo', password_hash=hash_password(password), created_via='SEED'))
        # Accounts from a database created before job titles existed get the default title for their role.
        for user in s.scalars(select(User).where((User.title == '') | User.title.is_(None))):
            user.title = DEFAULT_TITLE.get(user.role, 'Placement Officer')
        s.commit()


def _auto_seed(db: Database, fixture: str | None):
    """FR-02: a fresh install opens with the repeatable synthetic demo cohort already loaded."""
    if not fixture:
        return
    with db.sessionmaker() as s:
        if s.scalar(select(func.count()).select_from(Cohort)) == 0:
            cohort = cohort_svc.seed(s, fixture, reset=False, user=None)
            s.commit()
            log.info('auto-seeded cohort %s from fixture %s', cohort.id, fixture)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    use_settings(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if settings.database_url.startswith('sqlite:///'):
            Path(settings.database_url.removeprefix('sqlite:///')).parent.mkdir(parents=True, exist_ok=True)
        app.state.db = Database(settings.database_url)
        app.state.db.create_all()
        _ensure_users(app.state.db, settings)
        _auto_seed(app.state.db, settings.auto_seed_fixture)
        app.state.registry = ModelRegistry(settings.model_dir, settings.active_model)
        status = app.state.registry.status()
        log.info('model: %s (%s)', status['label'], status.get('model_version'))
        yield
        app.state.db.engine.dispose()

    app = FastAPI(title='EduMatch AI API', version='1.0.0', lifespan=lifespan,
                  description='AI-assisted school placement demo. Synthetic data and demo policy only; '
                              'every placement passes deterministic eligibility, capacity and uniqueness checks '
                              'and requires human approval.')
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                       allow_methods=['GET', 'POST', 'PATCH', 'OPTIONS'],
                       allow_headers=['Content-Type', 'X-CSRF-Token'], expose_headers=['Content-Disposition', 'X-Row-Count', 'X-Request-ID'])

    @app.middleware('http')
    async def request_context(request: Request, call_next):
        request.state.request_id = request.headers.get('X-Request-ID') or uuid.uuid4().hex[:16]
        started = time.perf_counter()
        response = await call_next(request)
        response.headers['X-Request-ID'] = request.state.request_id
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Referrer-Policy'] = 'no-referrer'
        if request.url.path.startswith('/api'):
            response.headers['Cache-Control'] = 'no-store'
        log.info('%s %s %s %.1fms rid=%s', request.method, request.url.path, response.status_code,
                 (time.perf_counter() - started) * 1000, request.state.request_id)
        return response

    install_error_handlers(app)

    @app.get('/api/health', tags=['health'])
    def health(request: Request):
        return {'status': 'ok', 'ai': request.app.state.registry.status()['label']}

    for r in (auth.router, users.router, cohorts.router, model.router, runs.router, acceptance.router, history.router):
        app.include_router(r, prefix='/api')

    # One-process offline demo: serve the built React app (npm run build -> dist/) at /.
    if (Path(settings.frontend_dist) / 'index.html').exists():
        app.mount('/', StaticFiles(directory=settings.frontend_dist, html=True), name='frontend')
    return app


logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')
