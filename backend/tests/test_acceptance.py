"""End-to-end acceptance gate (SRS §20, AT-01..AT-08) through the real HTTP API."""
import csv
import io
import json
import shutil
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

from app.main import create_app
from app.models import Proposal
from tests.conftest import DATA, Api, make_settings

SIX = DATA / 'scenarios' / 'six_student_base'


def offers_by_id(api, cohort_id):
    return {o['offer_id']: o for o in api.get('/api/offers', params={'cohort_id': cohort_id}).json()['offers']}


def export_rows(api, run_id):
    r = api.get(f'/api/runs/{run_id}/export.csv')
    assert r.status_code == 200 and r.headers['content-type'].startswith('text/csv')
    assert 'attachment' in r.headers['content-disposition']
    return list(csv.DictReader(io.StringIO(r.text)))


# ---- AT-01: auth, seed, import validation ----------------------------------------------------------
def test_unauthenticated_requests_fail(client):
    for method, url in [('get', '/api/cohorts'), ('get', '/api/model/status'), ('post', '/api/runs'),
                        ('get', '/api/runs/x/export.csv'), ('post', '/api/demo/seed')]:
        r = getattr(client, method)(url, **({'json': {}} if method == 'post' else {}))
        assert r.status_code == 401, (url, r.status_code)
        assert r.json()['code'] in ('NOT_AUTHENTICATED', 'SESSION_EXPIRED')
    assert client.get('/api/health').status_code == 200


def test_bad_password_csrf_roles_and_lockout(client, officer):
    assert client.post('/api/auth/login', json={'username': 'admin', 'password': 'wrong-password'}).status_code == 401
    # Officer cannot seed or reset (admin only)...
    assert officer.post('/api/demo/seed', json={'fixture': 'demo_200'}).status_code == 403
    # ...and a mutation without the CSRF header is refused even with a valid session.
    officer.csrf = None
    assert officer.post('/api/runs', json={'cohort_id': 'x', 'expected_input_version': 1}).json()['code'] == 'CSRF_FAILED'
    for _ in range(5):
        client.post('/api/auth/login', json={'username': 'ghost', 'password': 'nope-nope'})
    assert client.post('/api/auth/login', json={'username': 'ghost', 'password': 'nope-nope'}).status_code == 429


def test_logout_invalidates_session(api):
    assert api.post('/api/auth/logout').status_code == 200
    assert api.get('/api/cohorts').status_code == 401


def test_seed_requires_reset_to_replace(api):
    api.seed('demo_200')
    r = api.post('/api/demo/seed', json={'fixture': 'demo_200', 'reset': False})
    assert r.status_code == 409 and r.json()['code'] == 'COHORT_EXISTS'
    summary = api.seed('demo_200', reset=True)
    assert summary['counts'] == {'students': 200, 'offers': 12, 'preferences': 600, 'total_seats': 184, 'rejected_rows': 0}
    assert summary['synthetic'] and summary['data_label'] == 'Synthetic data'


@pytest.mark.parametrize('case', sorted(p.name for p in (DATA / 'invalid_inputs').iterdir()))
def test_bad_csv_gives_row_errors_and_no_partial_import(api, case):
    folder = DATA / 'invalid_inputs' / case
    files = {n: (f'{n}.csv', (folder / f'{n}.csv').read_bytes(), 'text/csv') for n in ('students', 'offers', 'preferences')}
    r = api.post('/api/cohorts/import', files=files)
    assert r.status_code == 422, r.text
    body = r.json()
    assert body['code'] == 'VALIDATION_FAILED'
    spec = json.loads((folder / 'expected_validation_errors.json').read_text(encoding='utf-8'))
    assert spec['expected_primary_code'] in {e['code'] for e in body['details']['errors']}
    assert all({'file', 'row', 'field', 'code', 'message'} <= e.keys() for e in body['details']['errors'])
    assert api.get('/api/cohorts').json()['cohorts'] == []          # nothing committed


def test_valid_multipart_import(api):
    files = {n: (f'{n}.csv', (SIX / f'{n}.csv').read_bytes(), 'text/csv') for n in ('students', 'offers', 'preferences')}
    files['rules'] = ('rules.json', (SIX / 'rules.json').read_bytes(), 'application/json')
    r = api.post('/api/cohorts/import', files=files)
    assert r.status_code == 200 and r.json()['counts']['students'] == 6 and r.json()['source_label'] == 'IMPORT'


# ---- AT-02: six-student fixture through the API ----------------------------------------------------
def test_six_student_plan_reasons_metrics_and_repeatability(api):
    cohort = api.seed('six_student_base')
    run = api.run(cohort)
    assert run['status'] == 'GENERATED' and run['invariants']['passed']
    props = api.proposals(run['run_id'])
    assert {k: (v['offer_id'], v['status']) for k, v in props.items()} == {
        'S1': ('A', 'DRAFT'), 'S2': ('A', 'DRAFT'), 'S3': ('B', 'DRAFT'), 'S4': ('C', 'DRAFT'),
        'S5': (None, 'UNASSIGNED'), 'S6': (None, 'UNASSIGNED')}
    assert props['S3']['reason_codes'][:2] == ['FIRST_CHOICE_FULL', 'SECOND_CHOICE_FEASIBLE']
    assert props['S3']['fit_score'] is None                         # listed choice: AI did not decide
    m = api.get(f"/api/runs/{run['run_id']}/metrics").json()
    assert m['metrics']['draft']['assigned'] == 4 and m['metrics']['unassigned'] == 2
    assert m['metrics']['draft']['top_three_rate'] == pytest.approx(0.666667)
    assert m['metrics']['draft']['first_choice_rate'] == 0.5 and m['metrics']['utilization'] == 1.0
    assert m['metrics']['approved']['assigned'] == 0 and m['violations']['total_violations'] == 0
    detail = api.get(f"/api/proposals/{props['S3']['proposal_id']}").json()
    assert any('full' in line for line in detail['explanation'])
    rerun = api.proposals(api.run(cohort)['run_id'])               # new draft run replaces the old one
    assert {k: v['offer_id'] for k, v in rerun.items()} == {k: v['offer_id'] for k, v in props.items()}


# ---- AT-03: embedded model + fallback --------------------------------------------------------------
def test_model_loaded_and_fallback_uses_it(api):
    status = api.get('/api/model/status').json()
    assert status['loaded'] and status['label'] == 'Local model loaded' and status['sha256']
    assert status['metrics']['validation']['mae'] < status['metrics']['validation']['baseline_mae']
    run = api.run(api.seed('six_student_fallback_on'))
    props = api.proposals(run['run_id'])
    assert props['S3']['offer_id'] == 'C' and props['S3']['fallback_used'] and props['S3']['fit_score'] > 0
    assert 'FALLBACK_AI_RANKED' in props['S3']['reason_codes'] and run['model_version'] == status['model_version']
    assert props['S4']['offer_id'] == 'C'
    off = api.proposals(api.run(api.seed('six_student_fallback_off'))['run_id'])
    assert off['S3']['offer_id'] is None


@pytest.mark.parametrize('model_key', ['linear_regression', 'random_forest', 'extra_trees', 'hist_gradient_boosting',
                                       'knn', 'mlp', 'decision_tree'])
def test_every_registered_model_can_drive_a_run(api, model_key):
    run = api.run(api.seed('six_student_fallback_on'), model_key=model_key)
    assert run['model_key'] == model_key and api.proposals(run['run_id'])['S3']['offer_id'] == 'C'


def test_alternatives_compare_all_models(api):
    run = api.run(api.seed('demo_200'))
    fallback = next(p for p in api.proposals(run['run_id']).values() if p['fallback_used'])
    alts = api.get(f"/api/proposals/{fallback['proposal_id']}/alternatives", params={'compare_models': True}).json()
    assert alts['fallback_authorized'] and alts['alternatives']
    assert len(alts['alternatives'][0]['model_scores']) == 7


def test_missing_model_runs_rules_only_and_says_so(tmp_path):
    empty = tmp_path / 'no_models'; empty.mkdir()
    with TestClient(create_app(make_settings(tmp_path, model_dir=empty))) as c:
        api = Api(c).login('admin')
        status = api.get('/api/model/status').json()
        assert not status['loaded'] and status['label'] == 'AI unavailable'
        run = api.run(api.seed('six_student_fallback_on'))
        assert run['mode'] == 'RULES_ONLY' and run['model_version'] is None
        s3 = api.proposals(run['run_id'])['S3']
        assert s3['offer_id'] is None and 'AI_UNAVAILABLE' in s3['reason_codes']


def test_tampered_model_is_refused(tmp_path):
    from app.config import PROJECT_DIR
    copy = tmp_path / 'models'
    shutil.copytree(PROJECT_DIR / 'ml' / 'models', copy)
    reg = json.loads((copy / 'registry.json').read_text())
    (copy / reg['models'][0]['path']).write_bytes(b'not the trusted artifact')
    with TestClient(create_app(make_settings(tmp_path, model_dir=copy))) as c:
        status = Api(c).login('admin').get('/api/model/status').json()
        assert reg['models'][0]['key'] in status['load_errors']
        assert reg['models'][0]['key'] not in status['available_models']


# ---- AT-04: approval, change, stale and duplicate writes -------------------------------------------
def test_review_transactions(api):
    cohort = api.seed('six_student_base')
    run = api.run(cohort)
    assert export_rows(api, run['run_id']) == []                    # drafts never exported
    props = api.proposals(run['run_id'])

    r = api.decide(props['S1'], 'approve')
    assert r.status_code == 200 and r.json()['status'] == 'APPROVED'
    rows = export_rows(api, run['run_id'])
    assert [x['student_id'] for x in rows] == ['S1'] and rows[0]['officer'] == 'admin'

    before = offers_by_id(api, cohort['cohort_id'])
    r = api.decide(props['S3'], 'change', offer_id='A', reason='Try A')
    assert r.status_code == 409 and r.json()['code'] == 'CAPACITY_FULL'
    assert offers_by_id(api, cohort['cohort_id']) == before        # atomic: nothing moved
    assert api.proposals(run['run_id'])['S3']['offer_id'] == 'B'

    again = api.decide(props['S1'], 'approve')                     # stale revision
    assert again.status_code == 409 and again.json()['code'] == 'STALE_REVISION'
    fresh = api.proposals(run['run_id'])['S1']
    dup = api.decide(fresh, 'approve')                             # current revision, already approved
    assert dup.status_code == 409 and dup.json()['code'] == 'ALREADY_APPROVED'
    assert offers_by_id(api, cohort['cohort_id'])['A']['reserved_count'] == 2

    # S3 listed only A and B and did not opt into fallback, so unlisted C is refused.
    assert api.decide(props['S3'], 'change', offer_id='C', reason='x').json()['code'] == 'PREFERENCE_NOT_AUTHORIZED'
    assert api.decide(api.proposals(run['run_id'])['S6'], 'change', offer_id='B', reason='x').json()['code'] == 'INELIGIBLE_OFFER'
    assert api.decide(api.proposals(run['run_id'])['S2'], 'change', offer_id='B', reason='').json()['code'] == 'REASON_REQUIRED'
    r = api.decide(api.proposals(run['run_id'])['S4'], 'change', offer_id='B', reason='x')
    assert r.status_code == 422 and r.json()['code'] == 'PREFERENCE_NOT_AUTHORIZED'


def test_new_run_and_edits_blocked_after_approval(api):
    cohort = api.seed('six_student_base')
    run = api.run(cohort)
    api.decide(api.proposals(run['run_id'])['S1'], 'approve')
    r = api.post('/api/runs', json={'cohort_id': cohort['cohort_id'], 'expected_input_version': cohort['input_version']})
    assert r.status_code == 409 and r.json()['code'] == 'APPROVALS_EXIST'
    r = api.patch('/api/offers/A', params={'cohort_id': cohort['cohort_id']},
                  json={'expected_input_version': cohort['input_version'], 'capacity': 5})
    assert r.status_code == 409 and r.json()['code'] == 'APPROVALS_EXIST'


def test_input_edit_marks_run_stale_and_blocks_decisions(api):
    cohort = api.seed('six_student_base')
    run = api.run(cohort)
    props = api.proposals(run['run_id'])
    r = api.patch('/api/offers/B', params={'cohort_id': cohort['cohort_id']},
                  json={'expected_input_version': cohort['input_version'], 'capacity': 3})
    assert r.status_code == 200 and r.json()['input_version'] == cohort['input_version'] + 1
    assert api.get(f"/api/runs/{run['run_id']}").json()['status'] == 'STALE'
    assert api.decide(props['S1'], 'approve').json()['code'] == 'RUN_STALE'
    old = api.post('/api/runs', json={'cohort_id': cohort['cohort_id'], 'expected_input_version': cohort['input_version']})
    assert old.status_code == 409 and old.json()['code'] == 'STALE_INPUT_VERSION'


def test_change_then_approve_and_db_blocks_second_approval(api, client):
    cohort = api.seed('six_student_fallback_on')
    run = api.run(cohort)
    s3 = api.proposals(run['run_id'])['S3']
    r = api.decide(s3, 'reject', reason='Officer prefers to discuss with family')
    assert r.status_code == 200 and r.json()['status'] == 'REJECTED'
    r = api.decide(api.proposals(run['run_id'])['S3'], 'change', offer_id='C', reason='Family agreed to C')
    assert r.status_code == 200 and r.json()['status'] == 'CHANGED' and r.json()['fit_score']
    assert api.decide(api.proposals(run['run_id'])['S3'], 'approve').json()['status'] == 'APPROVED'
    with client.app.state.db.sessionmaker() as s:                  # defence in depth: DB unique index
        s.add(Proposal(run_id=run['run_id'], cohort_id=cohort['cohort_id'], student_id='S3', offer_id='A',
                       status='APPROVED', priority_position=99, reason_code='X', reason_codes=[], trace=[]))
        with pytest.raises(IntegrityError):
            s.commit()


# ---- AT-05: reject releases seat; history survives restart -----------------------------------------
def test_reject_releases_seat_and_history_persists(settings, api):
    cohort = api.seed('six_student_base')
    run = api.run(cohort)
    assert offers_by_id(api, cohort['cohort_id'])['B']['remaining_seats'] == 0
    r = api.decide(api.proposals(run['run_id'])['S3'], 'reject', reason='Needs officer follow-up')
    assert r.status_code == 200
    assert offers_by_id(api, cohort['cohort_id'])['B']['remaining_seats'] == 1
    others = api.proposals(run['run_id'])
    assert others['S5']['offer_id'] is None                        # no silent reallocation
    exc = api.get(f"/api/runs/{run['run_id']}/exceptions.csv").text
    assert 'S3,REJECTED' in exc
    with TestClient(create_app(settings)) as c2:                   # "restart" on the same database
        events = Api(c2).login('officer').get('/api/audit', params={'student_id': 'S3'}).json()['events']
        rejected = [e for e in events if e['action'] == 'PROPOSAL_REJECTED']
        assert rejected and rejected[0]['actor'] == 'admin' and rejected[0]['reason'] == 'Needs officer follow-up'
        assert rejected[0]['old_offer_id'] == 'B'


# ---- AT-06: reconciliation and reset ---------------------------------------------------------------
def test_export_reconciles_and_reset_restores(api):
    cohort = api.seed('demo_200')
    run = api.run(cohort)
    run2 = api.get(f"/api/runs/{run['run_id']}").json()
    r = api.post(f"/api/runs/{run['run_id']}/bulk-approve", json={'expected_run_revision': run2['revision']})
    assert r.status_code == 200
    approved = r.json()['approved']
    rows = export_rows(api, run['run_id'])
    m = api.get(f"/api/runs/{run['run_id']}/metrics").json()['metrics']
    assert len(rows) == approved == m['approved']['assigned'] == m['draft']['assigned']
    assert m['valid_applicants'] == 200 and api.get(f"/api/runs/{run['run_id']}").json()['status'] == 'COMPLETED'
    assert api.post(f"/api/cohorts/{cohort['cohort_id']}/reset", json={'confirm': False}).status_code == 400
    reset = api.post(f"/api/cohorts/{cohort['cohort_id']}/reset", json={'confirm': True}).json()
    assert reset['counts'] == cohort['counts'] and reset['active_run_id'] is None and not reset['has_approvals']


def test_simulation_is_dry_run_and_compares_modes(api):
    cohort = api.seed('demo_200')
    ai = api.post(f"/api/cohorts/{cohort['cohort_id']}/simulate", json={'mode': 'AI'}).json()
    rules = api.post(f"/api/cohorts/{cohort['cohort_id']}/simulate", json={'mode': 'RULES_ONLY'}).json()
    assert not ai['persisted'] and ai['invariants']['passed'] and rules['invariants']['passed']
    assert ai['metrics']['draft']['fallback_assigned'] > 0 == rules['metrics']['draft']['fallback_assigned']
    assert ai['metrics']['draft']['assigned'] >= rules['metrics']['draft']['assigned']
    more = api.post(f"/api/cohorts/{cohort['cohort_id']}/simulate",
                    json={'mode': 'RULES_ONLY', 'capacity_overrides': {'DEMO_200-O001': 50}}).json()
    assert more['metrics']['available_seats'] == rules['metrics']['available_seats'] + 40
    assert api.get(f"/api/cohorts/{cohort['cohort_id']}/summary").json()['active_run_id'] is None


def test_what_if_recomputes_ranking(api):
    cohort = api.seed('six_student_fallback_on')
    base = api.post(f"/api/cohorts/{cohort['cohort_id']}/what-if", json={'student_id': 'S3'}).json()
    boosted = api.post(f"/api/cohorts/{cohort['cohort_id']}/what-if",
                       json={'student_id': 'S3', 'math_score': 100, 'science_score': 100}).json()
    fit = lambda res, oid: next(r['fit_score'] for r in res['ranking_ignoring_capacity'] if r['offer_id'] == oid)  # noqa: E731
    assert fit(boosted, 'C') > fit(base, 'C') and not boosted['persisted']


# ---- AT-08 / NFR-02: performance -------------------------------------------------------------------
@pytest.mark.parametrize('fixture,limit_s', [('stress_500', 10.0), ('large_5000', 30.0)])
def test_run_performance(api, fixture, limit_s):
    cohort = api.seed(fixture)
    started = time.perf_counter()
    run = api.run(cohort)
    elapsed = time.perf_counter() - started
    print(f'\n{fixture}: run {run["runtime_ms"]:.0f} ms server-side, {elapsed * 1000:.0f} ms round-trip, '
          f'model {run["model_key"]}')
    assert elapsed < limit_s and run['invariants']['passed']
