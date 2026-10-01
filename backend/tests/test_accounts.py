"""Accounts: roles enforced server-side, self-registration, admin user management, profile and password."""
from fastapi.testclient import TestClient

from tests.conftest import Api


def test_viewer_is_read_only(api, client):
    cohort = api.seed('six_student_base')
    run = api.run(cohort)
    viewer = Api(TestClient(client.app)).login('viewer')
    assert viewer.get(f"/api/runs/{run['run_id']}/proposals").status_code == 200
    assert viewer.get(f"/api/runs/{run['run_id']}/export.csv").status_code == 200
    body = {'cohort_id': cohort['cohort_id'], 'expected_input_version': cohort['input_version']}
    assert viewer.post('/api/runs', json=body).json()['code'] == 'FORBIDDEN'
    s1 = viewer.proposals(run['run_id'])['S1']
    assert viewer.decide(s1, 'approve').json()['code'] == 'FORBIDDEN'
    assert viewer.post(f"/api/runs/{run['run_id']}/bulk-approve", json={'expected_run_revision': 1}).status_code == 403
    me = viewer.get('/api/auth/me').json()['user']
    assert (me['role'], me['title']) == ('VIEWER', 'School Administrator')


def test_self_registration_requires_activation(api, client):
    anon = TestClient(client.app)
    r = anon.post('/api/auth/register', json={'name': 'New Officer', 'email': 'New.Officer@example.rw',
                                               'password': 'long-enough-pw', 'role': 'Placement Officer'})
    assert r.status_code == 201 and r.json()['status'] == 'PENDING_ACTIVATION'
    assert anon.post('/api/auth/register', json={'name': 'X', 'email': 'boss@example.rw', 'password': 'long-enough-pw',
                                                  'role': 'Super Administrator'}).status_code == 400
    assert anon.post('/api/auth/register', json={'name': 'Dup', 'email': 'new.officer@example.rw',
                                                  'password': 'long-enough-pw', 'role': 'Placement Officer'}
                     ).json()['code'] == 'USER_EXISTS'
    login = {'username': 'new.officer@example.rw', 'password': 'long-enough-pw'}
    assert anon.post('/api/auth/login', json=login).json()['code'] == 'ACCOUNT_INACTIVE'
    users = api.get('/api/users').json()['users']
    pending = next(u for u in users if u['email'] == 'new.officer@example.rw')
    assert pending['status'] == 'Pending' and pending['role'] == 'OFFICER'
    assert api.patch(f"/api/users/{pending['id']}", json={'is_active': True}).status_code == 200
    r = anon.post('/api/auth/login', json=login)
    assert r.status_code == 200 and r.json()['user']['title'] == 'Placement Officer'


def test_admin_creates_user_with_temporary_password(api, client):
    r = api.post('/api/users', json={'name': 'School Head', 'email': 'head@school.rw', 'role': 'School Administrator',
                                      'department': 'GS Example'})
    assert r.status_code == 201
    temp = r.json()['temporary_password']
    other = TestClient(client.app)
    login = other.post('/api/auth/login', json={'username': 'head@school.rw', 'password': temp})
    assert login.status_code == 200 and login.json()['user']['role'] == 'VIEWER'


def test_officer_cannot_manage_users_and_admin_cannot_demote_self(api, officer):
    assert officer.get('/api/users').status_code == 403
    me = api.get('/api/auth/me').json()['user']
    r = api.patch(f"/api/users/{me['id']}", json={'is_active': False})
    assert r.status_code == 409 and r.json()['code'] == 'CANNOT_DEMOTE_SELF'


def test_deactivation_ends_sessions_immediately(api, officer):
    uid = next(u['id'] for u in api.get('/api/users').json()['users'] if u['username'] == 'officer')
    assert officer.get('/api/cohorts').status_code == 200
    api.patch(f'/api/users/{uid}', json={'is_active': False})
    assert officer.get('/api/cohorts').status_code == 401


def test_profile_and_password_change(client):
    from tests.conftest import PASSWORDS
    user = Api(TestClient(client.app)).login('officer')
    r = user.patch('/api/auth/me', json={'display_name': 'Officer Renamed', 'department': 'Southern Team'})
    assert r.json()['user']['display_name'] == 'Officer Renamed'
    bad = user.post('/api/auth/password', json={'current_password': 'wrong', 'new_password': 'another-long-pw'})
    assert bad.json()['code'] == 'WRONG_PASSWORD'
    ok = user.post('/api/auth/password', json={'current_password': PASSWORDS['officer'], 'new_password': 'another-long-pw'})
    assert ok.status_code == 200
    assert user.get('/api/auth/me').status_code == 200          # current session kept
    fresh = TestClient(client.app)
    assert fresh.post('/api/auth/login', json={'username': 'officer', 'password': 'another-long-pw'}).status_code == 200
