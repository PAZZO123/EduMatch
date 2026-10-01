from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..errors import ApiError
from ..models import AuthSession, User
from ..roles import TITLE_TO_ROLE
from ..schemas import LoginIn, PasswordChangeIn, ProfilePatch, RegisterIn
from ..security import (CSRF_COOKIE, SESSION_COOKIE, create_session, current_session, end_session,
                        end_user_sessions, get_db, hash_password, throttle, verify_password)
from ..services import audit

router = APIRouter(prefix='/auth', tags=['auth'])
_DUMMY_HASH = hash_password('timing-equaliser-not-a-real-password')


def user_out(user: User) -> dict:
    pending = not user.is_active and user.created_via == 'SELF' and user.last_login_at is None
    return {'id': user.id, 'username': user.username, 'email': user.username, 'display_name': user.display_name,
            'role': user.role, 'title': user.title, 'department': user.department,
            'status': 'Pending' if pending else ('Active' if user.is_active else 'Inactive'),
            'is_active': user.is_active, 'created_via': user.created_via,
            'last_login_at': user.last_login_at, 'created_at': user.created_at}


def _client_key(request: Request, name: str) -> str:
    return f"{name.lower()}|{request.client.host if request.client else '-'}"


@router.post('/login')
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    key = _client_key(request, body.username)
    throttle.check(key)
    user = db.scalar(select(User).where(func.lower(User.username) == body.username.strip().lower()))
    if not verify_password(body.password, user.password_hash if user else _DUMMY_HASH) or user is None:
        throttle.fail(key)
        audit.record(db, None, 'LOGIN_FAILED', username=body.username[:64]); db.commit()
        raise ApiError(401, 'INVALID_CREDENTIALS', 'Username or password is incorrect.')
    if not user.is_active:
        # Only revealed after a correct password, so it does not leak which accounts exist.
        raise ApiError(403, 'ACCOUNT_INACTIVE', 'This account is not active yet. An administrator must activate it.')
    throttle.clear(key)
    token, csrf, expires = create_session(db, user)
    user.last_login_at = datetime.now(timezone.utc)
    audit.record(db, user, 'LOGIN')
    db.commit()
    s = get_settings()
    max_age = s.session_hours * 3600
    response.set_cookie(SESSION_COOKIE, token, max_age=max_age, httponly=True, samesite='strict', secure=s.cookie_secure)
    response.set_cookie(CSRF_COOKIE, csrf, max_age=max_age, httponly=False, samesite='strict', secure=s.cookie_secure)
    return {'user': user_out(user), 'csrf_token': csrf, 'expires_at': expires}


@router.post('/register', status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    """Self-service sign-up. Accounts start INACTIVE and cannot sign in until an administrator activates them,
    and only non-administrative titles can be requested."""
    if not get_settings().allow_self_registration:
        raise ApiError(403, 'REGISTRATION_DISABLED', 'Self-registration is disabled. Ask an administrator for an account.')
    key = _client_key(request, 'register')
    throttle.check(key)
    email = body.email.strip().lower()
    if db.scalar(select(User).where(func.lower(User.username) == email)):
        throttle.fail(key)
        raise ApiError(409, 'USER_EXISTS', 'An account with this email already exists.')
    user = User(username=email, display_name=body.name.strip(), role=TITLE_TO_ROLE[body.role], title=body.role,
                department=(body.department or '').strip(), password_hash=hash_password(body.password),
                is_active=False, created_via='SELF')
    db.add(user); db.flush()
    audit.record(db, None, 'USER_REGISTERED', username=email, title=body.role)
    db.commit()
    return {'user': user_out(user), 'status': 'PENDING_ACTIVATION',
            'message': 'Account created. An administrator must activate it before you can sign in.'}


@router.post('/logout')
def logout(request: Request, response: Response, sess: AuthSession = Depends(current_session),
           db: Session = Depends(get_db)):
    audit.record(db, sess.user, 'LOGOUT')
    end_session(db, request.cookies.get(SESSION_COOKIE))
    db.commit()
    response.delete_cookie(SESSION_COOKIE); response.delete_cookie(CSRF_COOKIE)
    return {'signed_out': True}


@router.get('/me')
def me(sess: AuthSession = Depends(current_session)):
    return {'user': user_out(sess.user), 'csrf_token': sess.csrf_token, 'expires_at': sess.expires_at}


@router.patch('/me')
def update_me(body: ProfilePatch, sess: AuthSession = Depends(current_session), db: Session = Depends(get_db)):
    user = sess.user
    changes = {k: v.strip() for k, v in body.model_dump(exclude_none=True).items()}
    if not changes:
        raise ApiError(400, 'NO_CHANGES', 'Provide at least one field to change.')
    for k, v in changes.items():
        setattr(user, k, v)
    audit.record(db, user, 'PROFILE_UPDATED', changed=sorted(changes))
    db.commit()
    return {'user': user_out(user)}


@router.post('/password')
def change_password(body: PasswordChangeIn, request: Request, sess: AuthSession = Depends(current_session),
                    db: Session = Depends(get_db)):
    user = sess.user
    if not verify_password(body.current_password, user.password_hash):
        raise ApiError(422, 'WRONG_PASSWORD', 'Current password is incorrect.')
    if body.new_password == body.current_password:
        raise ApiError(422, 'PASSWORD_UNCHANGED', 'The new password must differ from the current one.')
    user.password_hash = hash_password(body.new_password)
    end_user_sessions(db, user.id, keep_token=request.cookies.get(SESSION_COOKIE))   # sign out other devices
    audit.record(db, user, 'PASSWORD_CHANGED')
    db.commit()
    return {'changed': True}
