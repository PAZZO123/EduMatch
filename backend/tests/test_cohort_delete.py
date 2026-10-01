"""Cohorts can be deleted by administrators, and a fresh install starts empty (no auto-loaded sample)."""
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from tests.conftest import Api, make_settings


def test_no_sample_cohort_is_loaded_by_default(tmp_path):
    assert Settings.model_fields['auto_seed_fixture'].default is None
    settings = make_settings(tmp_path)
    settings = settings.model_copy(update={'auto_seed_fixture': Settings.model_fields['auto_seed_fixture'].default})
    with TestClient(create_app(settings)) as c:
        assert Api(c).login('admin').get('/api/cohorts').json()['cohorts'] == []


def test_admin_deletes_cohort_and_audit_is_kept(api, officer):
    cohort = api.seed('six_student_base')
    run = api.run(cohort)
    api.decide(api.proposals(run['run_id'])['S1'], 'approve')
    cid = cohort['cohort_id']

    assert officer.post(f'/api/cohorts/{cid}/delete', json={'confirm': True}).status_code == 403
    assert api.post(f'/api/cohorts/{cid}/delete', json={'confirm': False}).status_code in (400, 422)

    r = api.post(f'/api/cohorts/{cid}/delete', json={'confirm': True})
    assert r.status_code == 200, r.text
    assert r.json() == {'deleted': cid, 'students': 6, 'runs': 1, 'approvals': 1}
    assert api.get('/api/cohorts').json()['cohorts'] == []
    assert api.get(f'/api/cohorts/{cid}/summary').status_code == 404
    assert api.get(f"/api/runs/{run['run_id']}").status_code == 404
    actions = [e['action'] for e in api.get('/api/audit', params={'limit': 200}).json()['events']]
    assert 'COHORT_DELETED' in actions and 'PROPOSAL_APPROVED' in actions   # history survives

    assert api.seed('six_student_base')['counts']['students'] == 6          # can be loaded again
