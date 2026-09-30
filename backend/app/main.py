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
from sqlalchemy import select

from .api import auth, cohorts, model, runs
from .config import Settings, get_settings, use_settings
from .db import Database
from .errors import install_error_handlers
from .ml_registry import ModelRegistry
from .models import User
from .security import hash_password

log = logging.getLogger('edumatch')


def _ensure_users(db: Database, settings: Settings):
    with db.sessionmaker() as s:
        for username, password, role, name in [
                (settings.admin_username, settings.admin_password, 'ADMIN', 'Demo Administrator'),
                (settings.officer_username, settings.officer_password, 'OFFICER', 'Demo Officer')]:
            if s.scalar(select(User).where(User.username == username)) is None:
                s.add(User(username=username, display_name=name, role=role, password_hash=hash_password(password)))
        s.commit()


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
        response.headers['Cache-Control'] = 'no-store'
        log.info('%s %s %s %.1fms rid=%s', request.method, request.url.path, response.status_code,
                 (time.perf_counter() - started) * 1000, request.state.request_id)
        return response

    install_error_handlers(app)

    @app.get('/api/health', tags=['health'])
    def health(request: Request):
        return {'status': 'ok', 'ai': request.app.state.registry.status()['label']}

    for r in (auth.router, cohorts.router, model.router, runs.router):
        app.include_router(r, prefix='/api')
    return app


logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')
