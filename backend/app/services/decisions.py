"""Human review: approve / change / reject (FR-11..FR-14, SRS §17).

Each decision runs inside one BEGIN IMMEDIATE transaction: check run + proposal revision,
release the student's own seat (for change), verify the replacement against every other
active reservation, write proposal + audit event, bump revision, re-verify the whole plan,
commit. Any failure rolls everything back, so a failed request never moves a seat."""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..domain.allocation import rank_alternatives
from ..domain.invariants import check_plan
from ..domain.rules import eligibility_failures, pair_features
from ..errors import ApiError
from ..ml_registry import ModelRegistry
from ..models import Cohort, Offer, PlacementRun, Proposal, User
from . import audit
from .cohorts import load_inputs
from .runs import plan_rows, refresh_status, reservations

DECIDABLE = {'approve': ('DRAFT', 'CHANGED'), 'reject': ('DRAFT', 'CHANGED'),
             'change': ('DRAFT', 'CHANGED', 'REJECTED', 'UNASSIGNED')}


def get_proposal(db: Session, proposal_id: str) -> Proposal:
    proposal = db.get(Proposal, proposal_id)
    if proposal is None:
        raise ApiError(404, 'PROPOSAL_NOT_FOUND', f'Proposal "{proposal_id}" does not exist.')
    return proposal


def _check_run_is_active(db: Session, run: PlacementRun) -> Cohort:
    cohort = db.get(Cohort, run.cohort_id)
    if run.status == 'STALE':
        raise ApiError(409, 'RUN_STALE', 'Inputs changed after this run was generated. Generate a fresh run.',
                       {'stale_reason': run.stale_reason})
    if cohort.active_run_id != run.id or run.status == 'SUPERSEDED':
        raise ApiError(409, 'RUN_NOT_ACTIVE', 'This run is no longer the active plan for the cohort.')
    if run.input_version != cohort.input_version:
        raise ApiError(409, 'RUN_STALE', 'Run input version no longer matches the cohort.')
    return cohort


def decide(db: Session, proposal_id: str, action: str, offer_id: str | None, reason: str | None,
           expected_revision: int, user: User, registry: ModelRegistry) -> Proposal:
    proposal = get_proposal(db, proposal_id)
    run = proposal.run
    cohort = _check_run_is_active(db, run)
    if expected_revision != proposal.revision:
        raise ApiError(409, 'STALE_REVISION', 'This proposal changed since you loaded it. Refresh and retry.',
                       {'current_revision': proposal.revision, 'status': proposal.status})
    if proposal.status not in DECIDABLE[action]:
        code = 'ALREADY_APPROVED' if proposal.status == 'APPROVED' else 'INVALID_TRANSITION'
        raise ApiError(409, code, f'Cannot {action} a proposal whose status is {proposal.status}.')
    reason = (reason or '').strip()
    if action in ('change', 'reject') and not reason:
        raise ApiError(422, 'REASON_REQUIRED', f'A reason is required to {action} a proposal.')
    if len(reason) > 1000:
        raise ApiError(422, 'REASON_TOO_LONG', 'Reason must be at most 1000 characters.')

    inputs = load_inputs(db, cohort)
    student = next(s for s in inputs.students if s.student_id == proposal.student_id)
    old_offer = proposal.offer_id
    now = datetime.now(timezone.utc)

    if action == 'approve':
        # Re-verify the entire active plan before any approval (FR-11).
        invariants = check_plan(inputs, plan_rows(db, run.id))
        if not invariants['passed']:
            raise ApiError(409, 'PLAN_INVALID', 'The active plan fails hard-constraint checks; approval refused.', invariants)
        proposal.status = 'APPROVED'
        reason = reason or 'Approved as proposed.'

    elif action == 'reject':
        proposal.released_offer_id, proposal.offer_id = old_offer, None
        proposal.status, proposal.preference_rank, proposal.fallback_used = 'REJECTED', None, False
        proposal.reason_codes = [*proposal.reason_codes, 'OFFICER_REJECTED']

    else:  # change
        if not offer_id:
            raise ApiError(422, 'OFFER_REQUIRED', 'offer_id is required for a change.')
        if offer_id == old_offer:
            raise ApiError(422, 'NO_CHANGE', 'The student already holds this offer.')
        target = db.get(Offer, (cohort.id, offer_id))
        if target is None:
            raise ApiError(422, 'UNKNOWN_OFFER', f'Offer "{offer_id}" is not in this cohort.')
        offer_rec = next(o for o in inputs.offers if o.offer_id == offer_id)
        failures = eligibility_failures(student, offer_rec)
        if failures:
            raise ApiError(422, 'INELIGIBLE_OFFER', 'Student does not meet this offer\'s eligibility rules.',
                           {'failures': failures})
        listed = {p.offer_id: p.rank for p in inputs.preferences if p.student_id == student.student_id}
        if offer_id not in listed and not (inputs.fallback_enabled and student.allow_fallback):
            raise ApiError(422, 'PREFERENCE_NOT_AUTHORIZED', 'Offer is not a listed choice and the student has not '
                                                             'authorised unlisted fallback (or rules disable it).')
        held = reservations(db, run.id, exclude_proposal=proposal.id)   # the student's own seat is released
        if held.get(offer_id, 0) >= target.capacity:
            raise ApiError(409, 'CAPACITY_FULL', f'Offer {offer_id} has no free seat.',
                           {'capacity': target.capacity, 'reserved_by_others': held.get(offer_id, 0)})
        model = registry.active
        proposal.offer_id, proposal.status, proposal.released_offer_id = offer_id, 'CHANGED', None
        proposal.preference_rank = listed.get(offer_id)
        proposal.fallback_used = offer_id not in listed
        proposal.fit_score = (round(100 * float(model.score([pair_features(student, offer_rec)])[0]), 2)
                              if model and proposal.fallback_used else None)
        proposal.reason_codes = [*proposal.reason_codes, 'OFFICER_CHANGED']
        db.flush()
        invariants = check_plan(inputs, plan_rows(db, run.id))
        if not invariants['passed']:
            raise ApiError(409, 'PLAN_INVALID', 'Change would break a hard constraint; nothing was changed.', invariants)

    proposal.revision += 1
    proposal.decision_reason, proposal.reviewer, proposal.reviewed_at = reason, user.username, now
    run.revision += 1
    db.flush()
    refresh_status(db, run)
    audit.record(db, user, {'approve': 'PROPOSAL_APPROVED', 'reject': 'PROPOSAL_REJECTED',
                            'change': 'PROPOSAL_CHANGED'}[action],
                 cohort_id=cohort.id, run_id=run.id, proposal_id=proposal.id, student_id=proposal.student_id,
                 old_offer_id=old_offer, new_offer_id=proposal.offer_id, reason=reason, revision=proposal.revision,
                 input_version=run.input_version, rule_version=run.rule_version, model_version=run.model_version)
    return proposal


def bulk_approve(db: Session, run: PlacementRun, expected_run_revision: int, user: User) -> dict:
    """P1: approve every unchanged, engine-generated DRAFT in one transaction after one full-plan check."""
    cohort = _check_run_is_active(db, run)
    if expected_run_revision != run.revision:
        raise ApiError(409, 'STALE_REVISION', 'The run changed since you loaded it. Refresh and retry.',
                       {'current_revision': run.revision})
    inputs = load_inputs(db, cohort)
    invariants = check_plan(inputs, plan_rows(db, run.id))
    if not invariants['passed']:
        raise ApiError(409, 'PLAN_INVALID', 'The active plan fails hard-constraint checks; approval refused.', invariants)
    drafts = db.scalars(select(Proposal).where(Proposal.run_id == run.id, Proposal.status == 'DRAFT')).all()
    now = datetime.now(timezone.utc)
    for p in drafts:
        p.status, p.revision = 'APPROVED', p.revision + 1
        p.decision_reason, p.reviewer, p.reviewed_at = 'Bulk-approved unchanged valid proposal.', user.username, now
    run.revision += 1
    db.flush()
    refresh_status(db, run)
    audit.record(db, user, 'BULK_APPROVED', cohort_id=cohort.id, run_id=run.id, count=len(drafts),
                 reason='Bulk approval of unchanged valid proposals.')
    return {'approved': len(drafts), 'run_revision': run.revision, 'run_status': run.status}


def alternatives(db: Session, proposal: Proposal, registry: ModelRegistry, compare_models: bool) -> dict:
    """Eligible offers feasible against every OTHER active reservation, with the active model's fit
    score. With compare_models=true every loaded model scores the same list side by side."""
    run = proposal.run
    cohort = db.get(Cohort, run.cohort_id)
    inputs = load_inputs(db, cohort)
    student = next(s for s in inputs.students if s.student_id == proposal.student_id)
    held = reservations(db, run.id, exclude_proposal=proposal.id)
    free = {o.offer_id: o.capacity - held.get(o.offer_id, 0) for o in inputs.offers}
    model = registry.active
    rows = rank_alternatives(student, inputs, free, model.score if model else None, exclude_offer=proposal.offer_id)
    offers = {o.offer_id: o for o in inputs.offers}
    feats = [pair_features(student, offers[r['offer_id']]) for r in rows]
    if model and model.explainable:
        for r, f in zip(rows, feats):
            r['score_breakdown'] = model.breakdown(f)
    if compare_models and rows:
        for key, m in registry.models.items():
            scores = m.score(feats)
            for r, sc in zip(rows, scores):
                r.setdefault('model_scores', {})[key] = round(100 * float(sc), 2)
    return {'proposal_id': proposal.id, 'student_id': student.student_id, 'current_offer_id': proposal.offer_id,
            'fallback_authorized': inputs.fallback_enabled and student.allow_fallback,
            'model_version': model.model_version if model else None,
            'ai_label': 'Local model loaded' if model else 'AI unavailable',
            'score_note': 'Compatibility score (0-100) vs. a synthetic formula; not an admission probability.',
            'alternatives': [r for r in rows if r['authorized']],
            'not_authorized': [r for r in rows if not r['authorized']]}
