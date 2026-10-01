"""Authentication, sessions, CSRF and role checks (FR-01, NFR-05).

* Passwords: salted scrypt (stdlib), constant-time comparison.
* Sessions: random 256-bit token in an HttpOnly, SameSite=Strict cookie; only its SHA-256 is stored.
* CSRF: every state-changing request must echo the session's CSRF token in X-CSRF-Token.
* Brute force: repeated failed logins for a username/IP are locked out for a cooldown.
"""
import base64
import hashlib
import hmac
import secrets
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Request
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import get_settings
from .errors import ApiError
from .models import AuthSession, User
from .roles import REVIEWER_ROLES

SESSION_COOKIE = 'edumatch_session'
CSRF_COOKIE = 'edumatch_csrf'
CSRF_HEADER = 'X-CSRF-Token'
SAFE_METHODS = {'GET', 'HEAD', 'OPTIONS'}
_SCRYPT = {'n': 2 ** 14, 'r': 8, 'p': 1}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, dklen=32, **_SCRYPT)
    return 'scrypt$' + base64.b64encode(salt).decode() + '$' + base64.b64encode(digest).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_b64, digest_b64 = stored.split('$')
        assert scheme == 'scrypt'
        digest = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64), dklen=32, **_SCRYPT)
        return hmac.compare_digest(digest, base64.b64decode(digest_b64))
    except Exception:  # noqa: BLE001
        return False


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class LoginThrottle:
    def __init__(self):
        self._failures: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str):
        s = get_settings()
        with self._lock:
            recent = [t for t in self._failures.get(key, []) if time.monotonic() - t < s.login_lockout_seconds]
            self._failures[key] = recent
            if len(recent) >= s.login_max_failures:
                raise ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many failed sign-in attempts. Try again later.')

    def fail(self, key: str):
        with self._lock:
            self._failures.setdefault(key, []).append(time.monotonic())

    def clear(self, key: str):
        with self._lock:
            self._failures.pop(key, None)


throttle = LoginThrottle()


def create_session(db: Session, user: User) -> tuple[str, str, datetime]:
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    expires = datetime.now(timezone.utc) + timedelta(hours=get_settings().session_hours)
    db.execute(delete(AuthSession).where(AuthSession.expires_at < datetime.now(timezone.utc)))
    db.add(AuthSession(token_hash=_token_hash(token), user_id=user.id, csrf_token=csrf, expires_at=expires))
    return token, csrf, expires


def end_session(db: Session, token: str | None):
    if token:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == _token_hash(token)))


def get_db(request: Request):
    yield from request.app.state.db.session()


def current_session(request: Request, db: Session = Depends(get_db)) -> AuthSession:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise ApiError(401, 'NOT_AUTHENTICATED', 'Sign in required.')
    sess = db.scalar(select(AuthSession).where(AuthSession.token_hash == _token_hash(token)))
    if sess is None or sess.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc) or not sess.user.is_active:
        raise ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Sign in again.')
    if request.method not in SAFE_METHODS:
        sent = request.headers.get(CSRF_HEADER, '')
        if not sent or not hmac.compare_digest(sent, sess.csrf_token):
            raise ApiError(403, 'CSRF_FAILED', f'Missing or invalid {CSRF_HEADER} header.')
    return sess


def current_user(sess: AuthSession = Depends(current_session)) -> User:
    return sess.user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != 'ADMIN':
        raise ApiError(403, 'FORBIDDEN', 'Administrator role required.')
    return user


def require_reviewer(user: User = Depends(current_user)) -> User:
    """Officers and administrators may generate runs and decide proposals; viewers may not."""
    if user.role not in REVIEWER_ROLES:
        raise ApiError(403, 'FORBIDDEN', 'Your role is read-only. A placement officer or administrator must do this.')
    return user


def end_user_sessions(db: Session, user_id: int, keep_token: str | None = None):
    q = delete(AuthSession).where(AuthSession.user_id == user_id)
    if keep_token:
        q = q.where(AuthSession.token_hash != _token_hash(keep_token))
    db.execute(q)
