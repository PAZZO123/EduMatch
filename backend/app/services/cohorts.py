"""Cohort lifecycle: seed, import, read, versioned edits and reset (FR-02..FR-05, FR-18)."""
import hashlib
import json
from dataclasses import asdict, replace
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..domain.records import CohortInputs, OfferRec, PrefRec, StudentRec
from ..domain.validation import validate_import
from ..errors import ApiError
from ..models import Cohort, Offer, PlacementRun, Preference, Proposal, RESERVING, Student, User
from . import audit

FIXTURES = {
    'demo_200': 'demo/demo_200', 'stress_500': 'demo/stress_500', 'large_5000': 'demo/large_5000',
    'six_student_base': 'scenarios/six_student_base', 'six_student_fallback_on': 'scenarios/six_student_fallback_on',
    'six_student_fallback_off': 'scenarios/six_student_fallback_off', 'tied_scores': 'scenarios/tied_scores',
    'all_zero_capacity': 'scenarios/all_zero_capacity', 'capacity_surplus': 'scenarios/capacity_surplus',
    'oversubscribed_hotspot': 'scenarios/oversubscribed_hotspot', 'seat_shortage': 'scenarios/seat_shortage',
    'no_eligible_offer': 'scenarios/no_eligible_offer', 'eligibility_boundary': 'scenarios/eligibility_boundary',
    'fallback_disabled': 'scenarios/fallback_disabled',
}


# ---- conversions ------------------------------------------------------------------------------------
def inputs_to_snapshot(inputs: CohortInputs) -> dict:
    return {'students': [asdict(s) for s in inputs.students], 'offers': [asdict(o) for o in inputs.offers],
            'preferences': [asdict(p) for p in inputs.preferences], 'rules': inputs.rules}


def snapshot_to_inputs(snap: dict) -> CohortInputs:
    return CohortInputs([StudentRec(**s) for s in snap['students']], [OfferRec(**o) for o in snap['offers']],
                        [PrefRec(**p) for p in snap['preferences']], dict(snap['rules']))


def checksum(snap: dict) -> str:
    return hashlib.sha256(json.dumps(snap, sort_keys=True, default=str).encode()).hexdigest()


def load_inputs(db: Session, cohort: Cohort) -> CohortInputs:
    """Current (possibly edited) inputs for a cohort, in deterministic order."""
    cid = cohort.id
    students = [StudentRec(s.student_id, s.display_name, s.province, s.overall_score, s.math_score, s.science_score,
                           s.language_score, s.allow_fallback)
                for s in db.scalars(select(Student).where(Student.cohort_id == cid).order_by(Student.student_id))]
    offers = [OfferRec(o.offer_id, o.school_name, o.province, o.stage_programme, o.capacity, o.min_overall,
                       o.subject_min_math, o.subject_min_science, o.subject_min_language,
                       o.weight_math, o.weight_science, o.weight_language)
              for o in db.scalars(select(Offer).where(Offer.cohort_id == cid).order_by(Offer.offer_id))]
    prefs = [PrefRec(p.student_id, p.offer_id, p.rank)
             for p in db.scalars(select(Preference).where(Preference.cohort_id == cid)
                                 .order_by(Preference.student_id, Preference.rank))]
    return CohortInputs(students, offers, prefs, dict(cohort.rules))


def get_cohort(db: Session, cohort_id: str) -> Cohort:
    cohort = db.get(Cohort, cohort_id)
    if cohort is None:
        raise ApiError(404, 'COHORT_NOT_FOUND', f'Cohort "{cohort_id}" does not exist.')
    return cohort


def has_approvals(db: Session, cohort_id: str) -> bool:
    return bool(db.scalar(select(func.count()).select_from(Proposal)
                          .where(Proposal.cohort_id == cohort_id, Proposal.status == 'APPROVED')))


# ---- create / replace -------------------------------------------------------------------------------
def _write_inputs(db: Session, cohort_id: str, inputs: CohortInputs):
    db.execute(delete(Preference).where(Preference.cohort_id == cohort_id))
    db.execute(delete(Student).where(Student.cohort_id == cohort_id))
    db.execute(delete(Offer).where(Offer.cohort_id == cohort_id))
    db.flush()
    db.add_all([Student(cohort_id=cohort_id, **asdict(s)) for s in inputs.students])
    db.add_all([Offer(cohort_id=cohort_id, **asdict(o)) for o in inputs.offers])
    db.flush()
    db.add_all([Preference(cohort_id=cohort_id, **asdict(p)) for p in inputs.preferences])


def create_cohort(db: Session, cohort_id: str, inputs: CohortInputs, source_label: str, user: User,
                  replace_existing: bool) -> Cohort:
    existing = db.get(Cohort, cohort_id)
    if existing is not None:
        if not replace_existing:
            raise ApiError(409, 'COHORT_EXISTS', f'Cohort "{cohort_id}" already exists. Pass reset=true to replace it.')
        from .history import archive_cohort_runs
        archive_cohort_runs(db, cohort_id, 'COHORT_REPLACED')
        db.execute(delete(PlacementRun).where(PlacementRun.cohort_id == cohort_id))
        db.execute(delete(Proposal).where(Proposal.cohort_id == cohort_id))
        version = existing.input_version + 1
        db.delete(existing); db.flush()
    else:
        version = 1
    snap = inputs_to_snapshot(inputs)
    cohort = Cohort(id=cohort_id, source_label=source_label, synthetic=bool(inputs.rules.get('synthetic', True)),
                    input_version=version, rules=inputs.rules, checksum=checksum(snap), original_snapshot=snap,
                    validation_status='VALID')
    db.add(cohort); db.flush()
    _write_inputs(db, cohort_id, inputs)
    audit.record(db, user, 'COHORT_LOADED', cohort_id=cohort_id, source=source_label, replaced=existing is not None,
                 students=len(inputs.students), offers=len(inputs.offers), preferences=len(inputs.preferences))
    return cohort


def seed(db: Session, fixture: str, reset: bool, user: User) -> Cohort:
    if fixture not in FIXTURES:
        raise ApiError(422, 'UNKNOWN_FIXTURE', f'Unknown fixture "{fixture}".', {'available': sorted(FIXTURES)})
    folder = Path(get_settings().data_dir) / FIXTURES[fixture]
    read = lambda name: (folder / name).read_bytes()  # noqa: E731
    cohort_id, inputs = validate_import(read('students.csv'), read('offers.csv'), read('preferences.csv'),
                                        read('rules.json') if (folder / 'rules.json').exists() else None)
    return create_cohort(db, cohort_id, inputs, f'SEED:{fixture}', user, replace_existing=reset)


# ---- versioned edits (FR-05) -------------------------------------------------------------------------
def _begin_edit(db: Session, cohort: Cohort, expected_version: int):
    if expected_version != cohort.input_version:
        raise ApiError(409, 'STALE_INPUT_VERSION', 'Inputs changed since you loaded them. Refresh and retry.',
                       {'current_input_version': cohort.input_version})
    if has_approvals(db, cohort.id):
        raise ApiError(409, 'APPROVALS_EXIST', 'Approved results exist. Reset the cohort before changing inputs.')


def _after_edit(db: Session, cohort: Cohort, reason: str):
    cohort.input_version += 1
    stale = db.scalars(select(PlacementRun).where(PlacementRun.cohort_id == cohort.id,
                                                  PlacementRun.status.in_(('GENERATED', 'UNDER_REVIEW')))).all()
    for run in stale:
        run.status, run.stale_reason = 'STALE', reason
    return [r.id for r in stale]


def update_offer(db: Session, cohort: Cohort, offer_id: str, changes: dict, expected_version: int, user: User) -> Offer:
    _begin_edit(db, cohort, expected_version)
    offer = db.get(Offer, (cohort.id, offer_id))
    if offer is None:
        raise ApiError(404, 'OFFER_NOT_FOUND', f'Offer "{offer_id}" not found in cohort.')
    before = {k: getattr(offer, k) for k in changes}
    for key, value in changes.items():
        setattr(offer, key, value)
    stale = _after_edit(db, cohort, f'offer {offer_id} edited')
    audit.record(db, user, 'OFFER_EDITED', cohort_id=cohort.id, before=before, after=changes, offer_id=offer_id,
                 stale_runs=stale, input_version=cohort.input_version)
    return offer


def update_rules(db: Session, cohort: Cohort, changes: dict, expected_version: int, user: User) -> Cohort:
    _begin_edit(db, cohort, expected_version)
    before = {k: cohort.rules.get(k) for k in changes}
    cohort.rules = {**cohort.rules, **changes}
    stale = _after_edit(db, cohort, 'rules edited')
    audit.record(db, user, 'RULES_EDITED', cohort_id=cohort.id, before=before, after=changes, stale_runs=stale,
                 input_version=cohort.input_version)
    return cohort


def update_student(db: Session, cohort: Cohort, student_id: str, changes: dict, expected_version: int, user: User) -> Student:
    _begin_edit(db, cohort, expected_version)
    student = db.get(Student, (cohort.id, student_id))
    if student is None:
        raise ApiError(404, 'STUDENT_NOT_FOUND', f'Student "{student_id}" not found in cohort.')
    before = {k: getattr(student, k) for k in changes}
    for key, value in changes.items():
        setattr(student, key, value)
    stale = _after_edit(db, cohort, f'student {student_id} edited')
    audit.record(db, user, 'STUDENT_EDITED', cohort_id=cohort.id, student_id=student_id, before=before, after=changes,
                 stale_runs=stale, input_version=cohort.input_version)
    return student


def delete_cohort(db: Session, cohort: Cohort, user: User | None) -> dict:
    """Remove a cohort with its students, offers, choices, runs and proposals. Audit history is kept."""
    counts = {'students': db.scalar(select(func.count()).select_from(Student).where(Student.cohort_id == cohort.id)),
              'runs': db.scalar(select(func.count()).select_from(PlacementRun).where(PlacementRun.cohort_id == cohort.id)),
              'approvals': db.scalar(select(func.count()).select_from(Proposal)
                                     .where(Proposal.cohort_id == cohort.id, Proposal.status == 'APPROVED'))}
    cohort_id = cohort.id
    from .history import archive_cohort_runs
    archive_cohort_runs(db, cohort_id, 'COHORT_DELETED')
    db.execute(delete(Proposal).where(Proposal.cohort_id == cohort_id))
    db.execute(delete(PlacementRun).where(PlacementRun.cohort_id == cohort_id))
    db.delete(cohort)  # students, offers and preferences cascade
    audit.record(db, user, 'COHORT_DELETED', cohort_id=cohort_id, source=cohort.source_label, **counts)
    return {'deleted': cohort_id, **counts}


def reset_cohort(db: Session, cohort: Cohort, user: User) -> Cohort:
    """Restore the originally loaded inputs and discard all runs/decisions. Audit and placement history are kept."""
    from .history import archive_cohort_runs
    archive_cohort_runs(db, cohort.id, 'COHORT_RESET')
    runs = db.scalars(select(PlacementRun.id).where(PlacementRun.cohort_id == cohort.id)).all()
    approvals = db.scalar(select(func.count()).select_from(Proposal)
                          .where(Proposal.cohort_id == cohort.id, Proposal.status == 'APPROVED'))
    db.execute(delete(Proposal).where(Proposal.cohort_id == cohort.id))
    db.execute(delete(PlacementRun).where(PlacementRun.cohort_id == cohort.id))
    inputs = snapshot_to_inputs(cohort.original_snapshot)
    _write_inputs(db, cohort.id, inputs)
    cohort.rules = inputs.rules
    cohort.input_version += 1
    cohort.active_run_id = None
    audit.record(db, user, 'COHORT_RESET', cohort_id=cohort.id, discarded_runs=len(runs), discarded_approvals=approvals,
                 input_version=cohort.input_version)
    return cohort


# ---- read models ------------------------------------------------------------------------------------
def preview(db: Session, cohort_id: str, inputs: CohortInputs) -> dict:
    """What a validated import would load (dry run): real counts for the upload wizard, nothing saved."""
    existing = db.get(Cohort, cohort_id)
    return {'valid': True, 'persisted': False, 'cohort_id': cohort_id,
            'counts': {'students': len(inputs.students), 'offers': len(inputs.offers),
                       'preferences': len(inputs.preferences),
                       'total_seats': sum(o.capacity for o in inputs.offers)},
            'provinces': sorted({o.province for o in inputs.offers}),
            'zero_capacity_offers': sorted(o.offer_id for o in inputs.offers if o.capacity == 0),
            'fallback_opt_in': sum(s.allow_fallback for s in inputs.students),
            'rules': inputs.rules, 'rule_version': inputs.rules.get('rule_version'),
            'cohort_exists': existing is not None,
            'cohort_has_approvals': existing is not None and has_approvals(db, cohort_id)}


def summary(db: Session, cohort: Cohort) -> dict:
    count = lambda model: db.scalar(select(func.count()).select_from(model).where(model.cohort_id == cohort.id))  # noqa: E731
    seats = db.scalar(select(func.coalesce(func.sum(Offer.capacity), 0)).where(Offer.cohort_id == cohort.id))
    active = db.get(PlacementRun, cohort.active_run_id) if cohort.active_run_id else None
    return {'cohort_id': cohort.id, 'source_label': cohort.source_label, 'synthetic': cohort.synthetic,
            'data_label': 'Synthetic data' if cohort.synthetic else 'Imported data', 'policy_label': 'Demo policy',
            'input_version': cohort.input_version, 'rule_version': cohort.rule_version, 'rules': cohort.rules,
            'checksum': cohort.checksum, 'validation_status': cohort.validation_status,
            'counts': {'students': count(Student), 'offers': count(Offer), 'preferences': count(Preference),
                       'total_seats': int(seats), 'rejected_rows': 0},
            'active_run_id': cohort.active_run_id, 'active_run_status': active.status if active else None,
            'has_approvals': has_approvals(db, cohort.id),
            'created_at': cohort.created_at, 'updated_at': cohort.updated_at}


def offers_with_reservations(db: Session, cohort: Cohort) -> list[dict]:
    reserved, approved = {}, {}
    if cohort.active_run_id:
        rows = db.execute(select(Proposal.offer_id, Proposal.status, func.count())
                          .where(Proposal.run_id == cohort.active_run_id, Proposal.status.in_(RESERVING))
                          .group_by(Proposal.offer_id, Proposal.status)).all()
        for oid, status, n in rows:
            reserved[oid] = reserved.get(oid, 0) + n
            if status == 'APPROVED':
                approved[oid] = n
    out = []
    for o in db.scalars(select(Offer).where(Offer.cohort_id == cohort.id).order_by(Offer.offer_id)):
        r = reserved.get(o.offer_id, 0)
        out.append({'offer_id': o.offer_id, 'school_name': o.school_name, 'province': o.province,
                    'stage_programme': o.stage_programme, 'capacity': o.capacity, 'min_overall': o.min_overall,
                    'subject_min_math': o.subject_min_math, 'subject_min_science': o.subject_min_science,
                    'subject_min_language': o.subject_min_language, 'weights': {
                        'math': o.weight_math, 'science': o.weight_science, 'language': o.weight_language},
                    'proposed_count': r - approved.get(o.offer_id, 0), 'approved_count': approved.get(o.offer_id, 0),
                    'reserved_count': r, 'remaining_seats': o.capacity - r,
                    'status': 'UNAVAILABLE' if o.capacity == 0 else ('FULL' if r >= o.capacity else 'OPEN')})
    return out


def with_student_override(inputs: CohortInputs, student_id: str, overrides: dict) -> tuple[CohortInputs, StudentRec]:
    target = next((s for s in inputs.students if s.student_id == student_id), None)
    if target is None:
        raise ApiError(404, 'STUDENT_NOT_FOUND', f'Student "{student_id}" not found in cohort.')
    changed = replace(target, **overrides)
    students = [changed if s.student_id == student_id else s for s in inputs.students]
    return CohortInputs(students, inputs.offers, inputs.preferences, inputs.rules), changed
