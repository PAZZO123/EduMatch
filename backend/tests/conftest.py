import secrets

import pytest
from fastapi.testclient import TestClient

from app.config import PROJECT_DIR, Settings
from app.main import create_app

DATA = PROJECT_DIR / 'EduMatch_AI_Synthetic_Data'
PASSWORDS = {'admin': secrets.token_urlsafe(12), 'officer': secrets.token_urlsafe(12),
             'viewer': secrets.token_urlsafe(12)}


def make_settings(tmp_path, **overrides) -> Settings:
    values = dict(_env_file=None, database_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
                  secret_key=secrets.token_urlsafe(40), admin_password=PASSWORDS['admin'],
                  officer_password=PASSWORDS['officer'], school_admin_username='viewer',
                  school_admin_password=PASSWORDS['viewer'], auto_seed_fixture=None,
                  frontend_dist=tmp_path / 'no_frontend')
    return Settings(**{**values, **overrides})


class Api:
    """Thin client wrapper that logs in and attaches the CSRF header to mutations."""

    def __init__(self, client: TestClient):
        self.c, self.csrf = client, None

    def login(self, role='admin'):
        r = self.c.post('/api/auth/login', json={'username': role, 'password': PASSWORDS[role]})
        assert r.status_code == 200, r.text
        self.csrf = r.json()['csrf_token']
        return self

    def get(self, url, **kw):
        return self.c.get(url, **kw)

    def _h(self):
        return {'X-CSRF-Token': self.csrf} if self.csrf else {}

    def post(self, url, **kw):
        return self.c.post(url, headers=self._h(), **kw)

    def patch(self, url, **kw):
        return self.c.patch(url, headers=self._h(), **kw)

    def seed(self, fixture, reset=True):
        r = self.post('/api/demo/seed', json={'fixture': fixture, 'reset': reset})
        assert r.status_code == 200, r.text
        return r.json()

    def run(self, cohort, mode='AI', model_key=None):
        body = {'cohort_id': cohort['cohort_id'], 'expected_input_version': cohort['input_version'], 'mode': mode}
        if model_key:
            body['model_key'] = model_key
        r = self.post('/api/runs', json=body)
        assert r.status_code == 200, r.text
        return r.json()

    def proposals(self, run_id, **params):
        r = self.get(f'/api/runs/{run_id}/proposals', params={'limit': 1000, **params})
        assert r.status_code == 200, r.text
        return {p['student_id']: p for p in r.json()['proposals']}

    def decide(self, p, action, offer_id=None, reason=None, revision=None):
        body = {'action': action, 'expected_revision': p['revision'] if revision is None else revision}
        if offer_id:
            body['offer_id'] = offer_id
        if reason:
            body['reason'] = reason
        return self.post(f"/api/proposals/{p['proposal_id']}/decision", json=body)


@pytest.fixture
def settings(tmp_path):
    return make_settings(tmp_path)


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


@pytest.fixture
def api(client):
    return Api(client).login('admin')


@pytest.fixture
def officer(settings, client):
    # A second, independent cookie jar sharing the same app instance.
    other = TestClient(client.app)
    return Api(other).login('officer')
