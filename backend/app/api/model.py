import json

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..config import PROJECT_DIR
from ..errors import ApiError
from ..models import User
from ..schemas import ActiveModelIn
from ..security import current_user, get_db, require_admin
from ..services import audit

router = APIRouter(prefix='/model', tags=['model'])


@router.get('/status')
def status(request: Request, _: User = Depends(current_user)):
    return request.app.state.registry.status()


@router.get('/registry')
def registry(request: Request, _: User = Depends(current_user)):
    reg = request.app.state.registry
    return {'champion': reg.champion, 'selection_rule': reg.registry.get('selection_rule'),
            'active_model': reg.active.key if reg.active else None, 'models': reg.catalog()}


@router.get('/comparison')
def comparison(_: User = Depends(current_user)):
    """Full offline evaluation report (all splits, confusion matrices, robustness, learning curve)."""
    path = PROJECT_DIR / 'ml' / 'reports' / 'results.json'
    if not path.exists():
        raise ApiError(404, 'REPORT_NOT_FOUND', 'Run ml/compare_models.py to produce the comparison report.')
    return json.loads(path.read_text(encoding='utf-8'))


@router.post('/active')
def set_active(body: ActiveModelIn, request: Request, db: Session = Depends(get_db), user: User = Depends(require_admin)):
    reg = request.app.state.registry
    previous = reg.active.key if reg.active else None
    try:
        model = reg.set_active(body.model_key)
    except KeyError:
        raise ApiError(422, 'UNKNOWN_MODEL', f'Model "{body.model_key}" is not loaded.',
                       {'available': sorted(reg.models)}) from None
    audit.record(db, user, 'MODEL_ACTIVATED', previous=previous, current=model.key, model_version=model.model_version,
                 note='Affects new runs only; existing runs keep their recorded model version.')
    db.commit()
    return reg.status()
