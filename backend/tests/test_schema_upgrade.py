"""A database created by an older build (users table without title/department/...) keeps working."""
import sqlite3

from fastapi.testclient import TestClient

from app.main import create_app
from app.security import hash_password
from tests.conftest import PASSWORDS, make_settings


def test_old_users_table_is_upgraded_in_place(tmp_path):
    db_file = tmp_path / 'test.db'
    with sqlite3.connect(db_file) as old:  # the v1 schema, with one existing account
        old.execute('CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(64) UNIQUE, display_name VARCHAR(128), '
                    'role VARCHAR(16), password_hash VARCHAR(256), is_active BOOLEAN, created_at DATETIME)')
        old.execute("INSERT INTO users VALUES (1, 'admin', 'Old Admin', 'ADMIN', ?, 1, '2026-09-29 10:00:00')",
                    (hash_password(PASSWORDS['admin']),))

    with TestClient(create_app(make_settings(tmp_path))) as client:
        r = client.post('/api/auth/login', json={'username': 'admin', 'password': PASSWORDS['admin']})
        assert r.status_code == 200, r.text
        user = r.json()['user']
        assert user['display_name'] == 'Old Admin' and user['title'] == 'Super Administrator'

    with sqlite3.connect(db_file) as upgraded:
        columns = {row[1] for row in upgraded.execute('PRAGMA table_info(users)')}
        assert {'title', 'department', 'created_via', 'last_login_at'} <= columns
        assert upgraded.execute('SELECT count(*) FROM users').fetchone()[0] >= 1
