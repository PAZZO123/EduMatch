"""Synthetic demo policy and feature functions. These are NOT NESA rules."""
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

FEATURES = ['overall_norm', 'subject_fit', 'eligibility_margin', 'same_province']
STUDENT_FIELDS = ['student_id', 'display_name', 'cohort_id', 'province', 'overall_score',
                  'math_score', 'science_score', 'language_score', 'allow_fallback']
OFFER_FIELDS = ['offer_id', 'school_name', 'province', 'stage_programme', 'capacity',
                'min_overall', 'subject_min_math', 'subject_min_science', 'subject_min_language',
                'weight_math', 'weight_science', 'weight_language']
PREF_FIELDS = ['student_id', 'offer_id', 'rank']
PAIR_FIELDS = ['student_id', 'offer_id', 'split'] + FEATURES + [
    'y_demo', 'eligible', 'listed_preference_rank', 'synthetic']

def truth(v):
    return str(v).lower() == 'true'

def load_csv(path):
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))

def save_csv(path, fields, rows):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator='\n')
        writer.writeheader(); writer.writerows(rows)

def save_json(path, value):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

def pair_features(student, offer):
    overall = float(student['overall_score'])
    fit = sum(float(student[f'{sub}_score']) * float(offer[f'weight_{sub}'])
              for sub in ['math', 'science', 'language']) / 100
    return [overall / 100, fit, max(0, overall - float(offer['min_overall'])) / 100,
            int(student['province'] == offer['province'])]

def teacher_target(features):
    return round(.75 * features[1] + .15 * features[0] + .10 * features[3], 6)

def eligible(student, offer):
    if float(student['overall_score']) < float(offer['min_overall']):
        return False
    for sub in ['math', 'science', 'language']:
        limit = offer.get(f'subject_min_{sub}', '')
        if limit not in ['', None] and float(student[f'{sub}_score']) < float(limit):
            return False
    return True

def allocate(students, offers, preferences, fallback=False, predictor=None):
    """Serial merit, then choice rank; optional authorized fallback (demo only).

    predictor: callable(list of feature vectors) -> scores in [0, 1].
    With no predictor, fallback uses the disclosed synthetic teacher formula.
    """
    by_offer = {o['offer_id']: o for o in offers}
    free = {k: int(v['capacity']) for k, v in by_offer.items()}
    by_student = defaultdict(list)
    for pref in preferences:
        by_student[pref['student_id']].append(pref)
    rows = []
    for s in sorted(students, key=lambda x: (-float(x['overall_score']), x['student_id'])):
        choices = sorted(by_student[s['student_id']], key=lambda x: int(x['rank']))
        trace = []; chosen = None; rank = ''; fit_score = ''; used_fallback = False
        for pref in choices:
            oid = pref['offer_id']; offer = by_offer[oid]
            if not eligible(s, offer):
                trace.append(f'{oid}:INELIGIBLE')
            elif free[oid] <= 0:
                trace.append(f'{oid}:CAPACITY_FULL')
            else:
                chosen = oid; rank = int(pref['rank']); trace.append(f'{oid}:FEASIBLE'); break
        if chosen is None and fallback and truth(s['allow_fallback']):
            listed = {p['offer_id'] for p in choices}
            available = [o for o in offers if o['offer_id'] not in listed
                         and eligible(s, o) and free[o['offer_id']] > 0]
            if available:
                feat = [pair_features(s, o) for o in available]
                scores = predictor(feat) if predictor else [teacher_target(f) for f in feat]
                scored = sorted(zip(available, scores), key=lambda x: (-float(x[1]), x[0]['offer_id']))
                chosen = scored[0][0]['offer_id']; fit_score = round(100 * float(scored[0][1]), 4)
                used_fallback = True; trace.append(f'{chosen}:FALLBACK_RANKED')
        if chosen is not None:
            free[chosen] -= 1
            reason = 'FALLBACK_TEACHER_RANKED' if used_fallback and not predictor else (
                'FALLBACK_MODEL_RANKED' if used_fallback else f'LISTED_CHOICE_{rank}')
        elif not any(eligible(s, o) for o in offers):
            reason = 'NO_ELIGIBLE_OFFER'
        elif not any(eligible(s, by_offer[p['offer_id']]) for p in choices):
            reason = 'NO_ELIGIBLE_CHOICE'
        else:
            reason = 'CHOICES_EXHAUSTED'
        rows.append({'student_id': s['student_id'], 'offer_id': chosen or '',
                     'status': 'DRAFT' if chosen else 'UNASSIGNED', 'preference_rank': rank,
                     'fallback_used': str(used_fallback).lower(), 'fit_score': fit_score,
                     'reason_code': reason, 'decision_trace': ';'.join(trace),
                     'synthetic': 'true'})
    return rows

PLACEMENT_FIELDS = ['student_id', 'offer_id', 'status', 'preference_rank', 'fallback_used',
                    'fit_score', 'reason_code', 'decision_trace', 'synthetic']

def allocation_metrics(students, offers, rows):
    n = len(students); assigned = [r for r in rows if r['offer_id']]
    seats = sum(int(o['capacity']) for o in offers)
    top = sum(r['preference_rank'] not in ['', None] for r in assigned)
    first = sum(str(r['preference_rank']) == '1' for r in assigned)
    return {'valid_applicants': n, 'assigned': len(assigned), 'unassigned': n-len(assigned),
            'fallback_assigned': sum(truth(r['fallback_used']) for r in assigned),
            'available_seats': seats, 'top_three_rate': round(top/n, 6) if n else None,
            'first_choice_rate': round(first/n, 6) if n else None,
            'utilization': round(len(assigned)/seats, 6) if seats else None,
            'reason_counts': dict(Counter(r['reason_code'] for r in rows))}

def validate_inputs(students, offers, prefs):
    errors = []
    def add(file, row, field, code):
        errors.append({'file': file, 'row': row, 'field': field, 'code': code})
    seen_s = set(); seen_o = set()
    for i, s in enumerate(students, 2):
        sid = s['student_id']
        if not sid or sid in seen_s: add('students.csv', i, 'student_id', 'DUPLICATE_OR_MISSING_ID')
        seen_s.add(sid)
        for field in ['overall_score', 'math_score', 'science_score', 'language_score']:
            try:
                value = float(s[field]); valid = 0 <= value <= 100
            except (ValueError, TypeError): valid = False
            if not valid: add('students.csv', i, field, 'INVALID_SCORE')
        if str(s['allow_fallback']).lower() not in ['true', 'false']:
            add('students.csv', i, 'allow_fallback', 'INVALID_BOOLEAN')
    for i, o in enumerate(offers, 2):
        if not o['offer_id'] or o['offer_id'] in seen_o: add('offers.csv', i, 'offer_id', 'DUPLICATE_OR_MISSING_ID')
        seen_o.add(o['offer_id'])
        try:
            cap = float(o['capacity']); valid = cap >= 0 and cap.is_integer()
        except (ValueError, TypeError): valid = False
        if not valid: add('offers.csv', i, 'capacity', 'INVALID_CAPACITY')
        for field in ['min_overall', 'subject_min_math', 'subject_min_science', 'subject_min_language']:
            if field != 'min_overall' and o[field] == '': continue
            try: valid = 0 <= float(o[field]) <= 100
            except (ValueError, TypeError): valid = False
            if not valid: add('offers.csv', i, field, 'INVALID_THRESHOLD')
        try:
            weights = [float(o[f'weight_{sub}']) for sub in ['math', 'science', 'language']]
            valid = min(weights) >= 0 and abs(sum(weights)-1) <= 1e-6
        except (ValueError, TypeError): valid = False
        if not valid: add('offers.csv', i, 'weight_*', 'INVALID_WEIGHTS')
    ranks = set(); choices = set(); per_student = defaultdict(list)
    for i, pref in enumerate(prefs, 2):
        sid, oid = pref['student_id'], pref['offer_id']
        if sid not in seen_s: add('preferences.csv', i, 'student_id', 'UNKNOWN_STUDENT')
        if oid not in seen_o: add('preferences.csv', i, 'offer_id', 'UNKNOWN_OFFER')
        try: rank = int(pref['rank']); valid = str(pref['rank']) == str(rank) and 1 <= rank <= 3
        except (ValueError, TypeError): rank = -1; valid = False
        if not valid: add('preferences.csv', i, 'rank', 'INVALID_RANK')
        if (sid, rank) in ranks: add('preferences.csv', i, 'rank', 'DUPLICATE_RANK')
        if (sid, oid) in choices: add('preferences.csv', i, 'offer_id', 'DUPLICATE_CHOICE')
        ranks.add((sid, rank)); choices.add((sid, oid)); per_student[sid].append(rank)
    for sid in seen_s:
        rs = sorted(per_student[sid])
        if rs != list(range(1, len(rs)+1)) or not 1 <= len(rs) <= 3:
            add('preferences.csv', 0, sid, 'MISSING_OR_NONCONTIGUOUS_CHOICES')
    return errors

def verify_plan(students, offers, prefs, rows, fallback):
    assert len(rows) == len(students)
    assert len({r['student_id'] for r in rows}) == len(students)
    by_s = {s['student_id']: s for s in students}; by_o = {o['offer_id']: o for o in offers}
    choices = {(p['student_id'], p['offer_id']): int(p['rank']) for p in prefs}
    counts = Counter()
    for r in rows:
        assert r['student_id'] in by_s
        if not r['offer_id']:
            assert r['status'] == 'UNASSIGNED'; continue
        assert r['offer_id'] in by_o
        assert eligible(by_s[r['student_id']], by_o[r['offer_id']])
        counts[r['offer_id']] += 1
        key = r['student_id'], r['offer_id']
        if key in choices:
            assert int(r['preference_rank']) == choices[key] and not truth(r['fallback_used'])
        else:
            assert fallback and truth(by_s[r['student_id']]['allow_fallback']) and truth(r['fallback_used'])
    assert all(count <= int(by_o[oid]['capacity']) for oid, count in counts.items())
    return {'capacity_violations': 0, 'eligibility_violations': 0,
            'duplicate_placement_violations': 0, 'preference_authority_violations': 0}
