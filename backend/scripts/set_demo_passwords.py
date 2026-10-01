"""Make the demo accounts' passwords match backend/.env (and create any that are missing).

The backend only creates demo accounts on first start, so editing a password in .env later has no effect
on an existing database. Run this after changing .env:   python scripts/set_demo_passwords.py   (from backend/)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import Database  # noqa: E402
from app.main import _ensure_users  # noqa: E402
from app.models import AuthSession, User  # noqa: E402
from app.security import hash_password  # noqa: E402


def main():
    s = get_settings()
    db = Database(s.database_url)
    db.create_all()
    _ensure_users(db, s)  # creates any configured account that doesn't exist yet
    accounts = [(s.admin_username, s.admin_password), (s.placement_admin_username, s.placement_admin_password),
                (s.officer_username, s.officer_password), (s.school_admin_username, s.school_admin_password)]
    with db.sessionmaker() as session:
        for username, password in accounts:
            if not username or not password:
                continue
            user = session.scalar(select(User).where(func.lower(User.username) == username.lower()))
            user.password_hash = hash_password(password)
            user.is_active = True
            session.query(AuthSession).filter(AuthSession.user_id == user.id).delete()  # old sign-ins end
            print(f'{username:28} {user.title:26} password set from .env')
        session.commit()


if __name__ == '__main__':
    main()
