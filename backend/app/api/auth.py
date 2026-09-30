from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..errors import ApiError
from ..models import AuthSession, User
from ..schemas import LoginIn
from ..security import (CSRF_COOKIE, SESSION_COOKIE, create_session, current_session, end_session, get_db,
                        hash_password, throttle, verify_password)
from ..services import audit

router = APIRouter(prefix='/auth', tags=['auth'])
_DUMMY_HASH = hash_password('timing-equaliser-not-a-real-password')


def _user_out(user: User) -> dict:
    return {'username': user.username, 'display_name': user.display_name, 'role': user.role}


@router.post('/login')
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    key = f"{body.username.lower()}|{request.client.host if request.client else '-'}"
    throttle.check(key)
    user = db.scalar(select(User).where(User.username == body.username))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH) and user is not None and user.is_active
    if not ok:
        throttle.fail(key)
        audit.record(db, None, 'LOGIN_FAILED', username=body.username[:64]); db.commit()
        raise ApiError(401, 'INVALID_CREDENTIALS', 'Username or password is incorrect.')
    throttle.clear(key)
    token, csrf, expires = create_session(db, user)
    audit.record(db, user, 'LOGIN')
    db.commit()
    s = get_settings()
    max_age = s.session_hours * 3600
    response.set_cookie(SESSION_COOKIE, token, max_age=max_age, httponly=True, samesite='strict', secure=s.cookie_secure)
    response.set_cookie(CSRF_COOKIE, csrf, max_age=max_age, httponly=False, samesite='strict', secure=s.cookie_secure)
    return {'user': _user_out(user), 'csrf_token': csrf, 'expires_at': expires}


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
    return {'user': _user_out(sess.user), 'csrf_token': sess.csrf_token, 'expires_at': sess.expires_at}
