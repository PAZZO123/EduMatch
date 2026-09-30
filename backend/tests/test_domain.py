"""Pure domain tests: allocation regression against every reference fixture, invariants and validation."""
import csv
import json

import numpy as np
import pytest

from app.domain.allocation import allocate
from app.domain.invariants import check_plan
from app.domain.metrics import plan_metrics
from app.domain.rules import teacher_score
from app.domain.validation import ImportErrors, validate_import
from tests.conftest import DATA

CLEAN = sorted([p for p in (DATA / 'demo').iterdir() if p.is_dir()] +
               [p for p in (DATA / 'scenarios').iterdir() if p.is_dir()])
INVALID = sorted(p for p in (DATA / 'invalid_inputs').iterdir() if p.is_dir())


def load(folder):
    read = lambda n: (folder / n).read_bytes()  # noqa: E731
    return validate_import(read('students.csv'), read('offers.csv'), read('preferences.csv'),
                           read('rules.json') if (folder / 'rules.json').exists() else None)[1]


def expected(folder, name):
    with open(folder / name, newline='', encoding='utf-8') as f:
        return {r['student_id']: r for r in csv.DictReader(f)}


def teacher(features):
    return np.array([teacher_score(f) for f in features])


def rows(result):
    return [{'student_id': p.student_id, 'offer_id': p.offer_id, 'status': p.status,
             'preference_rank': p.preference_rank, 'fallback_used': p.fallback_used, 'reason_code': p.reason_code}
            for p in result.proposals]


@pytest.mark.parametrize('folder', CLEAN, ids=lambda p: p.name)
def test_rules_only_matches_reference(folder):
    inputs = load(folder)
    inputs.rules['allow_unlisted_fallback'] = False
    result = allocate(inputs)
    ref = expected(folder, 'expected_rules_only_placements.csv')
    assert {p.student_id: p.offer_id or '' for p in result.proposals} == {k: v['offer_id'] for k, v in ref.items()}
    assert check_plan(inputs, rows(result))['passed']


@pytest.mark.parametrize('folder', CLEAN, ids=lambda p: p.name)
def test_formula_fallback_matches_reference(folder):
    """With the disclosed teaching formula as scorer, the engine must reproduce the reference exactly."""
    inputs = load(folder)
    result = allocate(inputs, teacher)
    ref = expected(folder, 'expected_teacher_fallback_placements.csv')
    assert {p.student_id: p.offer_id or '' for p in result.proposals} == {k: v['offer_id'] for k, v in ref.items()}
    unassigned = {k: v['reason_code'] for k, v in ref.items() if not v['offer_id']}
    assert {p.student_id: p.reason_code for p in result.proposals if not p.offer_id} == unassigned
    assert check_plan(inputs, rows(result))['passed']


def test_six_student_fixture_plan_reasons_and_metrics():
    inputs = load(DATA / 'scenarios' / 'six_student_base')
    result = allocate(inputs, teacher)
    got = {p.student_id: (p.offer_id, p.reason_code) for p in result.proposals}
    assert got == {'S1': ('A', 'LISTED_CHOICE_1'), 'S2': ('A', 'LISTED_CHOICE_1'), 'S3': ('B', 'LISTED_CHOICE_2'),
                   'S4': ('C', 'LISTED_CHOICE_1'), 'S5': (None, 'CHOICES_EXHAUSTED'), 'S6': (None, 'NO_ELIGIBLE_OFFER')}
    s3 = next(p for p in result.proposals if p.student_id == 'S3')
    assert s3.reason_codes[:2] == ['FIRST_CHOICE_FULL', 'SECOND_CHOICE_FEASIBLE']
    m = plan_metrics(6, 4, rows(result))
    assert (m['draft']['assigned'], m['unassigned']) == (4, 2)
    assert m['draft']['top_three_rate'] == pytest.approx(4 / 6, abs=1e-6)
    assert m['draft']['first_choice_rate'] == pytest.approx(0.5)
    assert m['utilization'] == 1.0 and m['approved']['assigned'] == 0
    # Determinism: identical on repeat.
    assert [(p.student_id, p.offer_id) for p in allocate(inputs, teacher).proposals] == \
           [(p.student_id, p.offer_id) for p in result.proposals]


def test_fallback_requires_opt_in_rule_and_model():
    inputs = load(DATA / 'scenarios' / 'six_student_fallback_on')
    assert {p.student_id: p.offer_id for p in allocate(inputs, teacher).proposals}['S3'] == 'C'
    no_model = {p.student_id: p for p in allocate(inputs, None).proposals}['S3']
    assert no_model.offer_id is None and 'AI_UNAVAILABLE' in no_model.reason_codes
    inputs.rules['allow_unlisted_fallback'] = False
    disabled = {p.student_id: p for p in allocate(inputs, teacher).proposals}['S3']
    assert disabled.offer_id is None and 'FALLBACK_DISABLED_BY_RULE' in disabled.reason_codes


def test_invariant_checker_catches_each_violation_type():
    inputs = load(DATA / 'scenarios' / 'six_student_base')
    base = rows(allocate(inputs))
    over = [dict(r, offer_id='A', status='DRAFT') if r['student_id'] == 'S3' else r for r in base]
    assert check_plan(inputs, over)['capacity_violations'] == 1
    inelig = [dict(r, offer_id='C', status='DRAFT') if r['student_id'] == 'S6' else r for r in base]
    assert check_plan(inputs, inelig)['eligibility_violations'] == 1
    unlisted = [dict(r, offer_id='B', status='DRAFT') if r['student_id'] == 'S4' else r for r in base]
    res = check_plan(inputs, unlisted)
    assert res['preference_authority_violations'] == 1 and not res['passed']
    assert check_plan(inputs, base + [base[0]])['duplicate_placement_violations'] >= 1
    assert check_plan(inputs, base[1:])['accountability_violations'] == 1


def test_tied_scores_break_by_student_id():
    inputs = load(DATA / 'scenarios' / 'tied_scores')
    order = [p.student_id for p in allocate(inputs).proposals]
    scores = {s.student_id: s.overall_score for s in inputs.students}
    assert order == sorted(order, key=lambda sid: (-scores[sid], sid))


def test_zero_capacity_places_nobody():
    result = allocate(load(DATA / 'scenarios' / 'all_zero_capacity'), teacher)
    assert all(p.offer_id is None for p in result.proposals)


@pytest.mark.parametrize('folder', INVALID, ids=lambda p: p.name)
def test_invalid_fixtures_are_rejected_with_expected_code(folder):
    spec = json.loads((folder / 'expected_validation_errors.json').read_text(encoding='utf-8'))
    with pytest.raises(ImportErrors) as exc:
        load(folder)
    codes = {e['code'] for e in exc.value.errors}
    assert spec['expected_primary_code'] in codes
    for want in spec['errors']:
        assert any(e['file'] == want['file'] and e['code'] == want['code'] for e in exc.value.errors), want


def test_blank_score_is_an_error_not_zero():
    folder = DATA / 'scenarios' / 'six_student_base'
    students = (folder / 'students.csv').read_text(encoding='utf-8').replace('S1,Synthetic Student 1,SYN-FIXTURE,Southern Province,90',
                                                                              'S1,Synthetic Student 1,SYN-FIXTURE,Southern Province,')
    with pytest.raises(ImportErrors) as exc:
        validate_import(students.encode(), (folder / 'offers.csv').read_bytes(), (folder / 'preferences.csv').read_bytes())
    err = exc.value.errors[0]
    assert (err['file'], err['row'], err['field'], err['code']) == ('students.csv', 2, 'overall_score', 'INVALID_SCORE')
