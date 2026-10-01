"""Upload-wizard format (choices as students.csv columns), dry-run validation, and plain-language reasons,
using the Rwanda demo upload set in EduMatch_AI_Synthetic_Data/upload_demo/."""
import csv
import io

from tests.conftest import DATA

RW = DATA / 'upload_demo' / 'rwanda_2026'
RW_BAD = DATA / 'upload_demo' / 'rwanda_2026_with_errors'
SIX = DATA / 'scenarios' / 'six_student_base'


def wizard_files(folder, rules=True):
    files = {'students': ('students_2026.csv', (folder / 'students_2026.csv').read_bytes(), 'text/csv'),
             'offers': ('schools_2026.csv', (folder / 'schools_2026.csv').read_bytes(), 'text/csv')}
    if rules:
        files['rules'] = ('placement_rules.json', (folder / 'placement_rules.json').read_bytes(), 'application/json')
    return files


def test_dry_run_reports_counts_and_saves_nothing(api):
    r = api.post('/api/cohorts/import', params={'dry_run': True}, files=wizard_files(RW))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body['valid'] and not body['persisted'] and body['cohort_id'] == 'RW-2026-S3-DEMO'
    assert body['counts']['students'] == 320 and body['counts']['offers'] == 27
    assert len(body['provinces']) == 5 and body['rule_version'] == 'rw-demo-policy-2026-v1'
    assert api.get('/api/cohorts').json()['cohorts'] == []


def test_error_variant_points_at_uploaded_rows(api):
    r = api.post('/api/cohorts/import', params={'dry_run': True}, files=wizard_files(RW_BAD))
    assert r.status_code == 422
    found = {(e['file'], e['row'], e['field'], e['code']) for e in r.json()['details']['errors']}
    assert ('students.csv', 6, 'math_score', 'INVALID_SCORE') in found
    assert ('students.csv', 11, 'science_score', 'INVALID_SCORE') in found
    assert ('students.csv', 16, 'student_id', 'DUPLICATE_OR_MISSING_ID') in found
    assert ('students.csv', 21, 'choice_2', 'UNKNOWN_OFFER') in found          # the column the officer can fix
    assert ('offers.csv', 4, 'capacity', 'INVALID_CAPACITY') in found
    assert api.get('/api/cohorts').json()['cohorts'] == []


def test_choice_columns_equal_separate_preferences_file(api):
    """The same six-student fixture gives the same plan whether choices are columns or a preferences.csv."""
    prefs = {}
    for row in csv.DictReader(io.StringIO((SIX / 'preferences.csv').read_text(encoding='utf-8'))):
        prefs.setdefault(row['student_id'], {})[int(row['rank'])] = row['offer_id']
    rows = list(csv.DictReader(io.StringIO((SIX / 'students.csv').read_text(encoding='utf-8'))))
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(rows[0]) + ['choice_1', 'choice_2', 'choice_3'], lineterminator='\n')
    w.writeheader()
    for r in rows:
        w.writerow({**r, **{f'choice_{k}': prefs[r['student_id']].get(k, '') for k in (1, 2, 3)}})
    files = {'students': ('students.csv', buf.getvalue().encode(), 'text/csv'),
             'offers': ('offers.csv', (SIX / 'offers.csv').read_bytes(), 'text/csv'),
             'rules': ('rules.json', (SIX / 'rules.json').read_bytes(), 'application/json')}
    cohort = api.post('/api/cohorts/import', files=files).json()
    props = api.proposals(api.run(cohort)['run_id'])
    assert {k: v['offer_id'] for k, v in props.items()} == {
        'S1': 'A', 'S2': 'A', 'S3': 'B', 'S4': 'C', 'S5': None, 'S6': None}


def test_rwanda_run_gives_clear_reasons_and_suggestions(api):
    cohort = api.post('/api/cohorts/import', files=wizard_files(RW)).json()
    run = api.run(cohort)
    assert run['invariants']['passed'] and run['mode'] == 'AI'
    props = list(api.proposals(run['run_id']).values())
    assert all(p['reason_text'] for p in props)
    by_code = {p['reason_code']: p for p in props}
    assert by_code['LISTED_CHOICE_1']['reason_text'].startswith('Placed at 1st choice')
    assert 'because' in by_code['LISTED_CHOICE_2']['reason_text']
    ai = by_code['FALLBACK_AI_RANKED']
    assert 'AI suggested' in ai['reason_text'] and '/100' in ai['reason_text'] and ai['suggested_action'] is None
    for code in ('NO_ELIGIBLE_OFFER', 'NO_ELIGIBLE_CHOICE', 'CHOICES_EXHAUSTED'):
        assert by_code[code]['reason_text'].startswith('Not placed') and by_code[code]['suggested_action']

    # An officer change that is later approved keeps describing the school actually given, with the change reason.
    target = next(p for p in props if p['fallback_used'])
    alts = api.get(f"/api/proposals/{target['proposal_id']}/alternatives").json()['alternatives']
    new_offer = next(a['offer_id'] for a in alts if a['offer_id'] != target['offer_id'] and a['seats_available'] > 0)
    changed = api.decide(target, 'change', offer_id=new_offer, reason='Family asked for a school nearer home')
    assert changed.status_code == 200, changed.text
    assert api.decide(changed.json(), 'approve').status_code == 200
    rows = {r['student_id']: r for r in csv.DictReader(io.StringIO(api.get(f"/api/runs/{run['run_id']}/export.csv").text))}
    reason = rows[target['student_id']]['placement_reason']
    assert reason.startswith('Officer changed the placement to') and 'Family asked for a school nearer home' in reason

    # The exceptions CSV carries the same reason and suggested action for every unplaced student.
    exc = list(csv.DictReader(io.StringIO(api.get(f"/api/runs/{run['run_id']}/exceptions.csv").text)))
    assert exc and all(row['reason_text'] and row['suggested_action'] for row in exc)
    assert all(row['display_name'] for row in exc)
