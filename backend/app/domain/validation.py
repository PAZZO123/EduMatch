"""CSV/JSON import validation (FR-03, FR-04). Validates the whole batch and returns every
problem as {file, row, field, code, message}; callers commit nothing if any error exists.
Error codes match the dataset's invalid-input fixtures. Blank scores never become zero."""
import csv
import io
import json
import math
import re
from collections import defaultdict

from .records import DEFAULT_RULES, SUBJECTS, CohortInputs, OfferRec, PrefRec, StudentRec

STUDENT_COLUMNS = ['student_id', 'display_name', 'cohort_id', 'province', 'overall_score', 'math_score',
                   'science_score', 'language_score', 'allow_fallback']
OFFER_COLUMNS = ['offer_id', 'school_name', 'province', 'stage_programme', 'capacity', 'min_overall',
                 'subject_min_math', 'subject_min_science', 'subject_min_language',
                 'weight_math', 'weight_science', 'weight_language']
PREF_COLUMNS = ['student_id', 'offer_id', 'rank']
# Alternative layout: ranked choices as columns of students.csv instead of a separate preferences.csv.
CHOICE_COLUMNS = ['choice_1', 'choice_2', 'choice_3']
ID_PATTERN = re.compile(r'^[A-Za-z0-9_.\-]{1,64}$')
MAX_ERRORS = 500
SUPPORTED_RULES = {'priority': 'overall_desc_then_student_id_asc', 'allocation': 'serial_priority',
                   'score_scale': '0-100', 'score_direction': 'higher_better'}


class ImportErrors(Exception):
    def __init__(self, errors: list[dict]):
        super().__init__(f'{len(errors)} validation error(s)')
        self.errors = errors


class _Collector:
    def __init__(self):
        self.errors = []

    def add(self, file, row, field, code, message):
        if len(self.errors) < MAX_ERRORS:
            self.errors.append({'file': file, 'row': row, 'field': field, 'code': code, 'message': message})


def _read_csv(name: str, raw: bytes, columns: list[str], err: _Collector) -> list[dict]:
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        err.add(name, 0, None, 'INVALID_ENCODING', 'File must be UTF-8 encoded CSV.'); return []
    reader = csv.DictReader(io.StringIO(text, newline=''))
    header = [h.strip() for h in (reader.fieldnames or [])]
    missing = [c for c in columns if c not in header]
    if missing:
        err.add(name, 1, ','.join(missing), 'MISSING_COLUMN', f'Missing required column(s): {", ".join(missing)}.')
        return []
    rows = [{(k or '').strip(): (v or '').strip() if isinstance(v, str) else v for k, v in r.items()} for r in reader]
    if not rows:
        err.add(name, 0, None, 'EMPTY_FILE', 'File contains no data rows.')
    return rows


def _number(value: str):
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def _check_id(err, file, row, field, value, code='DUPLICATE_OR_MISSING_ID'):
    if not value:
        err.add(file, row, field, code, f'{field} is required.'); return False
    if not ID_PATTERN.match(value):
        err.add(file, row, field, 'INVALID_ID', f'{field} must be 1-64 characters of letters, digits, _ . -'); return False
    return True


def parse_rules(raw: bytes | None, err: _Collector) -> dict:
    if raw is None:
        return dict(DEFAULT_RULES)
    try:
        rules = json.loads(raw.decode('utf-8-sig'))
        assert isinstance(rules, dict)
    except Exception:
        err.add('rules.json', 0, None, 'INVALID_JSON', 'rules.json must be a JSON object.'); return dict(DEFAULT_RULES)
    merged = {**DEFAULT_RULES, **rules}
    if not isinstance(merged.get('rule_version'), str) or not merged['rule_version'].strip():
        err.add('rules.json', 0, 'rule_version', 'INVALID_RULE', 'rule_version must be a non-empty string.')
    if not isinstance(merged.get('allow_unlisted_fallback'), bool):
        err.add('rules.json', 0, 'allow_unlisted_fallback', 'INVALID_RULE', 'allow_unlisted_fallback must be true/false.')
    for key, supported in SUPPORTED_RULES.items():
        if merged.get(key) != supported:
            err.add('rules.json', 0, key, 'UNSUPPORTED_RULE', f'Only {key}="{supported}" is implemented in this demo.')
    return merged


def _choices_as_preferences(s_rows: list[dict], err: _Collector) -> list[dict]:
    """Turn choice_1..choice_3 columns into preference rows that remember their students.csv row and column."""
    if s_rows and 'choice_1' not in s_rows[0]:
        err.add('students.csv', 1, 'choice_1', 'MISSING_COLUMN',
                'Without preferences.csv, students.csv needs choice_1 (and optionally choice_2, choice_3) columns.')
        return []
    rows = []
    for i, r in enumerate(s_rows, start=2):
        for rank, col in enumerate(CHOICE_COLUMNS, start=1):
            if r.get(col):
                rows.append({'student_id': r['student_id'], 'offer_id': r[col], 'rank': str(rank),
                             '_file': 'students.csv', '_row': i, '_field': col})
    return rows


def validate_import(students_raw: bytes, offers_raw: bytes, prefs_raw: bytes | None, rules_raw: bytes | None = None
                    ) -> tuple[str, CohortInputs]:
    """Returns (cohort_id, inputs) or raises ImportErrors with every row-level problem.
    Ranked choices come from preferences.csv or, when it is omitted, from students.csv choice_1..choice_3."""
    err = _Collector()
    s_rows = _read_csv('students.csv', students_raw, STUDENT_COLUMNS, err)
    o_rows = _read_csv('offers.csv', offers_raw, OFFER_COLUMNS, err)
    if prefs_raw is None:
        p_rows = _choices_as_preferences(s_rows, err)
    else:
        p_rows = _read_csv('preferences.csv', prefs_raw, PREF_COLUMNS, err)
    rules = parse_rules(rules_raw, err)
    pref_file = 'preferences.csv' if prefs_raw is not None else 'students.csv'

    students, seen_s, cohort_ids = [], set(), set()
    for i, r in enumerate(s_rows, start=2):
        ok = True
        sid = r['student_id']
        if not _check_id(err, 'students.csv', i, 'student_id', sid):
            ok = False
        elif sid in seen_s:
            err.add('students.csv', i, 'student_id', 'DUPLICATE_OR_MISSING_ID', f'Duplicate student_id "{sid}".'); ok = False
        seen_s.add(sid)
        if r['cohort_id']:
            cohort_ids.add(r['cohort_id'])
        else:
            err.add('students.csv', i, 'cohort_id', 'MISSING_VALUE', 'cohort_id is required.'); ok = False
        for f in ('display_name', 'province'):
            if not r[f] or len(r[f]) > 128:
                err.add('students.csv', i, f, 'MISSING_VALUE', f'{f} is required (max 128 chars).'); ok = False
        scores = {}
        for f in ['overall_score'] + [f'{s}_score' for s in SUBJECTS]:
            x = _number(r[f])
            if r[f] == '':
                err.add('students.csv', i, f, 'INVALID_SCORE', f'{f} is blank; blank scores are never treated as zero.'); ok = False
            elif x is None or not 0 <= x <= 100:
                err.add('students.csv', i, f, 'INVALID_SCORE', f'{f}="{r[f]}" must be a number from 0 to 100.'); ok = False
            scores[f] = x
        flag = r['allow_fallback'].lower()
        if flag not in ('true', 'false'):
            err.add('students.csv', i, 'allow_fallback', 'INVALID_BOOLEAN', 'allow_fallback must be true or false.'); ok = False
        if ok:
            students.append(StudentRec(sid, r['display_name'], r['province'], scores['overall_score'], scores['math_score'],
                                       scores['science_score'], scores['language_score'], flag == 'true'))
    if len(cohort_ids) > 1:
        err.add('students.csv', 0, 'cohort_id', 'MIXED_COHORT', f'One cohort per import; found {sorted(cohort_ids)}.')

    offers, seen_o = [], set()
    for i, r in enumerate(o_rows, start=2):
        ok = True
        oid = r['offer_id']
        if not _check_id(err, 'offers.csv', i, 'offer_id', oid):
            ok = False
        elif oid in seen_o:
            err.add('offers.csv', i, 'offer_id', 'DUPLICATE_OR_MISSING_ID', f'Duplicate offer_id "{oid}".'); ok = False
        seen_o.add(oid)
        for f in ('school_name', 'province', 'stage_programme'):
            if not r[f] or len(r[f]) > 128:
                err.add('offers.csv', i, f, 'MISSING_VALUE', f'{f} is required (max 128 chars).'); ok = False
        cap = _number(r['capacity'])
        if cap is None or cap < 0 or not float(cap).is_integer():
            err.add('offers.csv', i, 'capacity', 'INVALID_CAPACITY', f'capacity="{r["capacity"]}" must be a non-negative integer.'); ok = False
        limits = {}
        for f in ['min_overall'] + [f'subject_min_{s}' for s in SUBJECTS]:
            if f != 'min_overall' and r[f] == '':
                limits[f] = None; continue
            x = _number(r[f])
            if x is None or not 0 <= x <= 100:
                err.add('offers.csv', i, f, 'INVALID_THRESHOLD', f'{f}="{r[f]}" must be 0-100.'); ok = False
            limits[f] = x
        weights = [_number(r[f'weight_{s}']) for s in SUBJECTS]
        if any(w is None or w < 0 for w in weights) or abs(sum(w or 0 for w in weights) - 1) > 1e-6:
            err.add('offers.csv', i, 'weight_*', 'INVALID_WEIGHTS', 'Three subject weights must be non-negative and sum to 1.'); ok = False
        if ok:
            offers.append(OfferRec(oid, r['school_name'], r['province'], r['stage_programme'], int(cap), limits['min_overall'],
                                   limits['subject_min_math'], limits['subject_min_science'], limits['subject_min_language'],
                                   *weights))

    prefs, ranks, pairs, per_student = [], set(), set(), defaultdict(list)
    for i, r in enumerate(p_rows, start=2):
        ok = True
        sid, oid = r['student_id'], r['offer_id']
        f_name, row, offer_field = r.get('_file', 'preferences.csv'), r.get('_row', i), r.get('_field', 'offer_id')
        if sid not in seen_s:
            err.add(f_name, row, 'student_id', 'UNKNOWN_STUDENT', f'student_id "{sid}" is not in students.csv.'); ok = False
        if oid not in seen_o:
            err.add(f_name, row, offer_field, 'UNKNOWN_OFFER', f'"{oid}" is not a school offer_id in the schools (offers) file.'); ok = False
        try:
            rank = int(r['rank']); valid_rank = str(rank) == r['rank'] and 1 <= rank <= 3
        except ValueError:
            rank, valid_rank = -1, False
        if not valid_rank:
            err.add(f_name, row, 'rank', 'INVALID_RANK', f'rank="{r["rank"]}" must be 1, 2 or 3.'); ok = False
        if (sid, rank) in ranks:
            err.add(f_name, row, 'rank', 'DUPLICATE_RANK', f'{sid} already has a rank {rank} choice.'); ok = False
        if (sid, oid) in pairs:
            err.add(f_name, row, offer_field, 'DUPLICATE_CHOICE', f'{sid} lists {oid} more than once.'); ok = False
        ranks.add((sid, rank)); pairs.add((sid, oid)); per_student[sid].append(rank)
        if ok:
            prefs.append(PrefRec(sid, oid, rank))
    for sid in sorted(seen_s):
        rs = sorted(per_student.get(sid, []))
        if not rs or rs != list(range(1, len(rs) + 1)):
            err.add(pref_file, 0, sid, 'MISSING_OR_NONCONTIGUOUS_CHOICES',
                    f'{sid} must have 1-3 choices ranked contiguously from 1.')

    if err.errors:
        raise ImportErrors(err.errors)
    return cohort_ids.pop(), CohortInputs(students, offers, prefs, rules)
