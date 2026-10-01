"""Placement history survives re-runs, resets and deletes; officers can assign unplaced students to any school
with free seats, with recorded exceptions (capacity is never exceeded)."""
import csv
import io


def _history(api):
    return api.get('/api/history').json()['history']


def test_history_keeps_superseded_completed_and_removed_runs(api):
    cohort = api.seed('six_student_base')
    first = api.run(cohort)
    second = api.run(cohort)                                   # replaces the first draft run
    h = _history(api)
    assert [x['run_id'] for x in h] == [first['run_id']] and h[0]['archived_reason'] == 'SUPERSEDED'
    assert h[0]['students'] == 6 and h[0]['placed'] == 4

    # Complete the second run: approve every placed student, reject nothing -> snapshot as COMPLETED.
    run_rev = api.get(f"/api/runs/{second['run_id']}").json()['revision']
    assert api.post(f"/api/runs/{second['run_id']}/bulk-approve", json={'expected_run_revision': run_rev}).status_code == 200
    h = {x['run_id']: x for x in _history(api)}
    assert h[second['run_id']]['archived_reason'] == 'COMPLETED' and h[second['run_id']]['approved'] == 4

    # Reset removes the runs from the cohort, but the history keeps them with every student's result.
    assert api.post(f"/api/cohorts/{cohort['cohort_id']}/reset", json={'confirm': True}).status_code == 200
    h = {x['run_id']: x for x in _history(api)}
    assert h[second['run_id']]['archived_reason'] == 'COHORT_RESET'
    detail = api.get(f"/api/history/{h[second['run_id']]['id']}").json()
    by_student = {r['student_id']: r for r in detail['results']}
    assert by_student['S1']['status'] == 'APPROVED' and by_student['S1']['school_name']
    assert by_student['S6']['status'] == 'UNASSIGNED' and by_student['S6']['suggested_action']
    rows = list(csv.DictReader(io.StringIO(api.get(f"/api/history/{h[second['run_id']]['id']}/export.csv").text)))
    assert len(rows) == 6 and all(r['reason_text'] for r in rows)

    # Deleting the cohort keeps its history too.
    third = api.run(api.get(f"/api/cohorts/{cohort['cohort_id']}/summary").json())
    api.post(f"/api/cohorts/{cohort['cohort_id']}/delete", json={'confirm': True})
    assert {x['run_id'] for x in _history(api)} >= {first['run_id'], second['run_id'], third['run_id']}


def test_officer_assigns_unplaced_student_to_any_open_school(api, officer):
    cohort = api.seed('six_student_base')   # S5: A full, C ineligible (65 < 70); S6: 45, below every cutoff
    run = api.run(cohort)
    props = officer.proposals(run['run_id'])

    # Every seat is taken (A: S1+S2, B: S3, C: S4), so there is no open school for S5 at all.
    assert officer.get(f"/api/proposals/{props['S5']['proposal_id']}/open-offers").json()['options'] == []

    # Free a seat at A by rejecting S2, then S6 (not listed B/C, below every cutoff) can be placed only with exceptions.
    officer.decide(props['S2'], 'reject', reason='Family moved abroad')
    s6 = officer.proposals(run['run_id'])['S6']
    opts = {o['offer_id']: o for o in officer.get(f"/api/proposals/{s6['proposal_id']}/open-offers").json()['options']}
    assert 'A' in opts and opts['A']['exceptions_needed'] == ['BELOW_ENTRY_REQUIREMENTS']   # A is a listed choice
    assert opts['A']['fit_score'] is not None

    r = officer.decide(s6, 'assign', offer_id='A', reason='Head teacher agreed to admit on appeal')
    assert r.status_code == 422 and r.json()['code'] == 'INELIGIBLE_OFFER'           # must confirm the exception
    assert officer.decide(s6, 'assign', offer_id='A', reason='x', revision=s6['revision']).status_code == 422

    body = {'action': 'assign', 'expected_revision': s6['revision'], 'offer_id': 'A',
            'reason': 'Head teacher agreed to admit on appeal', 'allow_below_cutoff': True}
    r = officer.post(f"/api/proposals/{s6['proposal_id']}/decision", json=body)
    assert r.status_code == 200, r.text
    p = r.json()
    assert p['status'] == 'CHANGED' and p['offer_id'] == 'A' and p['override_eligibility'] and not p['override_preference']
    assert 'Recorded exception' in p['reason_text'] and 'below the school' in p['reason_text']

    # The plan checker accepts the recorded exception; approval works and the export shows it.
    assert officer.decide(officer.proposals(run['run_id'])['S6'], 'approve').status_code == 200
    m = api.get(f"/api/runs/{run['run_id']}/metrics").json()
    assert m['violations']['total_violations'] == 0 and m['violations']['officer_exceptions'] == 1
    rows = {x['student_id']: x for x in csv.DictReader(io.StringIO(api.get(f"/api/runs/{run['run_id']}/export.csv").text))}
    assert rows['S6']['officer_exception'] == 'below entry requirements'
    assert 'Head teacher agreed to admit on appeal' in rows['S6']['placement_reason']

    # Capacity is never an exception: A is now full again, so nobody else can be assigned there.
    s5 = officer.proposals(run['run_id'])['S5']
    body = {'action': 'assign', 'expected_revision': s5['revision'], 'offer_id': 'A', 'reason': 'x',
            'allow_below_cutoff': True}
    r = officer.post(f"/api/proposals/{s5['proposal_id']}/decision", json=body)
    assert r.status_code == 409 and r.json()['code'] == 'CAPACITY_FULL'

    # After a reset, the history snapshot still shows the assignment with the officer's reason and the exception.
    assert api.post(f"/api/cohorts/{cohort['cohort_id']}/reset", json={'confirm': True}).status_code == 200
    entry = next(h for h in api.get('/api/history').json()['history'] if h['run_id'] == run['run_id'])
    assert entry['archived_reason'] == 'COHORT_RESET' and entry['officer_exceptions'] == 1
    s6_hist = next(r for r in api.get(f"/api/history/{entry['id']}").json()['results'] if r['student_id'] == 'S6')
    assert s6_hist['officer_exception'] == 'below entry requirements' and s6_hist['status'] == 'APPROVED'
    assert 'Head teacher agreed to admit on appeal' in s6_hist['reason_text']


def test_assign_outside_choices_is_recorded(api):
    cohort = api.seed('six_student_base')
    run = api.run(cohort)
    props = api.proposals(run['run_id'])
    api.decide(props['S4'], 'reject', reason='Declined the offer')                 # frees C (min 70)
    s5 = api.proposals(run['run_id'])['S5']                                        # listed A, C; 65 < 70 at C
    api.decide(props['S3'], 'reject', reason='Declined the offer')                 # frees B (min 50), not listed by S5
    s5 = api.proposals(run['run_id'])['S5']
    opts = {o['offer_id']: o for o in api.get(f"/api/proposals/{s5['proposal_id']}/open-offers").json()['options']}
    assert opts['B']['exceptions_needed'] == ['OUTSIDE_CHOICES'] and opts['B']['eligible']
    assert list(opts)[0] == 'B'                                                    # fewer / milder exceptions first
    body = {'action': 'assign', 'expected_revision': s5['revision'], 'offer_id': 'B', 'reason': 'Family agreed to B'}
    p = api.post(f"/api/proposals/{s5['proposal_id']}/decision", json=body).json()
    assert p['override_preference'] and not p['override_eligibility'] and "outside the student's choices" in p['reason_text']
    events = api.get('/api/audit', params={'student_id': 'S5'}).json()['events']
    assigned = [e for e in events if e['action'] == 'PROPOSAL_ASSIGNED']
    assert assigned and assigned[0]['reason'] == 'Family agreed to B'
