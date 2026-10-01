import secrets

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..models import User
from ..roles import TITLE_TO_ROLE
from ..schemas import UserCreate, UserPatch
from ..security import end_user_sessions, get_db, hash_password, require_admin
from ..services import audit
from .auth import user_out

router = APIRouter(prefix='/users', tags=['users'])


@router.get('')
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return {'users': [user_out(u) for u in db.scalars(select(User).order_by(User.created_at.desc(), User.id.desc()))]}


@router.post('', status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Creates an active account with a one-time temporary password, returned only in this response."""
    email = body.email.strip().lower()
    if db.scalar(select(User).where(func.lower(User.username) == email)):
        raise ApiError(409, 'USER_EXISTS', 'An account with this email already exists.')
    temporary = secrets.token_urlsafe(9)
    user = User(username=email, display_name=body.name.strip(), role=TITLE_TO_ROLE[body.role], title=body.role,
                department=(body.department or '').strip(), password_hash=hash_password(temporary),
                is_active=True, created_via='ADMIN')
    db.add(user); db.flush()
    audit.record(db, admin, 'USER_CREATED', username=email, title=body.role)
    db.commit()
    return {'user': user_out(user), 'temporary_password': temporary,
            'note': 'Shown once. Share it securely; the user should change it after signing in.'}


@router.patch('/{user_id}')
def update_user(user_id: int, body: UserPatch, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if user is None:
        raise ApiError(404, 'USER_NOT_FOUND', 'User not found.')
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise ApiError(400, 'NO_CHANGES', 'Provide at least one field to change.')
    if user.id == admin.id and (changes.get('is_active') is False or
                                ('role' in changes and TITLE_TO_ROLE[changes['role']] != 'ADMIN')):
        raise ApiError(409, 'CANNOT_DEMOTE_SELF', 'You cannot deactivate or demote your own account.')
    if 'role' in changes:
        user.title, user.role = changes['role'], TITLE_TO_ROLE[changes['role']]
    for field in ('display_name', 'department', 'is_active'):
        if field in changes:
            setattr(user, field, changes[field].strip() if isinstance(changes[field], str) else changes[field])
    if changes.get('is_active') is False or 'role' in changes:
        end_user_sessions(db, user.id)          # permissions change takes effect immediately
    audit.record(db, admin, 'USER_UPDATED', username=user.username, changes=changes)
    db.commit()
    return {'user': user_out(user)}
