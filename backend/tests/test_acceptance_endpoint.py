"""The in-app acceptance gate (POST /api/acceptance/run) passes and never touches live data."""


def test_gate_passes_and_is_isolated(api, officer):
    live = api.seed('demo_200')
    assert officer.post('/api/acceptance/run').status_code == 403            # administrators only

    r = api.post('/api/acceptance/run')
    assert r.status_code == 200, r.text
    body = r.json()
    failed = [(g['id'], g['log']) for g in body['results'] if g['status'] != 'PASS']
    assert not failed, failed
    assert body['passed'] == body['total'] == 8 and body['isolated']

    # The live database still holds exactly the one cohort we seeded, unchanged, and the session still works.
    cohorts = api.get('/api/cohorts').json()['cohorts']
    assert [c['cohort_id'] for c in cohorts] == [live['cohort_id']]
    assert cohorts[0]['input_version'] == live['input_version'] and cohorts[0]['active_run_id'] is None
