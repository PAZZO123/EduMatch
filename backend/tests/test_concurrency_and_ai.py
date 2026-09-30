"""Race conditions on seats and approvals, plus AI score explanations."""
import threading

import pytest
from fastapi.testclient import TestClient

from tests.conftest import Api


def _parallel(fns):
    barrier = threading.Barrier(len(fns))
    results = [None] * len(fns)

    def worker(i, fn):
        barrier.wait()
        results[i] = fn()
    threads = [threading.Thread(target=worker, args=(i, fn)) for i, fn in enumerate(fns)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def _clients(client, n):
    return [Api(TestClient(client.app)).login('officer') for _ in range(n)]


@pytest.mark.parametrize('round_', range(5))
def test_two_officers_racing_for_the_last_seat(api, client, round_):
    cohort = api.seed('six_student_base')
    run = api.run(cohort)
    props = api.proposals(run['run_id'])
    assert api.decide(props['S3'], 'reject', reason='free the seat at B').status_code == 200
    props = api.proposals(run['run_id'])                     # B now has exactly one free seat
    a, b = _clients(client, 2)
    results = _parallel([lambda: a.decide(props['S1'], 'change', offer_id='B', reason='race 1'),
                         lambda: b.decide(props['S3'], 'change', offer_id='B', reason='race 2')])
    codes = sorted(r.status_code for r in results)
    assert codes == [200, 409], [r.json() for r in results]
    offer_b = next(o for o in api.get('/api/offers', params={'cohort_id': cohort['cohort_id']}).json()['offers']
                   if o['offer_id'] == 'B')
    assert offer_b['reserved_count'] == 1 == offer_b['capacity']
    assert api.get(f"/api/runs/{run['run_id']}/metrics").json()['violations']['total_violations'] == 0


def test_simultaneous_duplicate_approvals_allocate_once(api, client):
    cohort = api.seed('six_student_base')
    run = api.run(cohort)
    s1 = api.proposals(run['run_id'])['S1']
    results = _parallel([lambda c=c: c.decide(s1, 'approve') for c in _clients(client, 6)])
    assert sorted(r.status_code for r in results) == [200] + [409] * 5
    rows = api.get(f"/api/runs/{run['run_id']}/export.csv").text.strip().splitlines()
    assert len(rows) == 2                                      # header + S1 exactly once


def test_overlapping_runs_are_rejected_or_serialised(api, client):
    cohort = api.seed('stress_500')
    body = {'cohort_id': cohort['cohort_id'], 'expected_input_version': cohort['input_version']}
    results = _parallel([lambda c=c: c.post('/api/runs', json=body) for c in _clients(client, 4)])
    ok = [r for r in results if r.status_code == 200]
    assert ok and all(r.status_code in (200, 409) for r in results)
    active = api.get(f"/api/cohorts/{cohort['cohort_id']}/summary").json()['active_run_id']
    assert active in {r.json()['run_id'] for r in ok}          # exactly one active plan


def test_fit_score_breakdown_is_exact(api):
    status = api.get('/api/model/status').json()
    if status['model_key'] != 'linear_regression':
        pytest.skip('breakdown only exists for the linear champion')
    run = api.run(api.seed('six_student_fallback_on'))
    s3 = api.proposals(run['run_id'])['S3']
    detail = api.get(f"/api/proposals/{s3['proposal_id']}").json()
    bd = detail['score_breakdown']
    assert bd['method'] == 'exact linear decomposition'
    assert bd['baseline'] + sum(bd['contributions'].values()) == pytest.approx(s3['fit_score'], abs=0.05)
    assert bd['weights']['subject_fit'] == pytest.approx(0.75, abs=1e-3)
    assert bd['weights']['overall_norm'] == pytest.approx(0.15, abs=1e-3)
    assert bd['weights']['same_province'] == pytest.approx(0.10, abs=1e-3)
    listed = api.proposals(run['run_id'])['S1']              # listed-choice placement: AI did not decide
    assert api.get(f"/api/proposals/{listed['proposal_id']}").json()['score_breakdown'] is None
