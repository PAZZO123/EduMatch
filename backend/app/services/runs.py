"""Placement runs: generate (SRS §15 orchestration), simulate (dry-run), read and metrics."""
import threading
import time
from collections import defaultdict

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from ..domain.allocation import allocate
from ..domain.invariants import check_plan
from ..domain.metrics import plan_metrics
from ..errors import ApiError
from ..ml_registry import ModelRegistry
from ..models import Cohort, PlacementRun, Proposal, RESERVING, User
from . import audit
from .cohorts import has_approvals, load_inputs

_cohort_locks: dict[str, threading.Lock] = defaultdict(threading.Lock)
_locks_guard = threading.Lock()


def _cohort_lock(cohort_id: str) -> threading.Lock:
    with _locks_guard:
        return _cohort_locks[cohort_id]


def resolve_model(registry: ModelRegistry, mode: str, model_key: str | None):
    """Returns (mode, model or None). AI requested but unavailable -> explicit RULES_ONLY, never random scores."""
    if mode == 'RULES_ONLY':
        return 'RULES_ONLY', None
    model = registry.get(model_key)
    if model_key and model is None:
        raise ApiError(422, 'UNKNOWN_MODEL', f'Model "{model_key}" is not loaded.', {'available': sorted(registry.models)})
    return ('AI', model) if model else ('RULES_ONLY', None)


def create_run(db: Session, cohort: Cohort, expected_input_version: int, mode: str, model_key: str | None,
               user: User, registry: ModelRegistry) -> PlacementRun:
    lock = _cohort_lock(cohort.id)
    if not lock.acquire(blocking=False):
        raise ApiError(409, 'RUN_IN_PROGRESS', 'A run for this cohort is already in progress.')
    try:
        started = time.perf_counter()
        # 1. validated snapshot + model status
        if expected_input_version != cohort.input_version:
            raise ApiError(409, 'STALE_INPUT_VERSION', 'Inputs changed since you loaded them. Refresh and retry.',
                           {'current_input_version': cohort.input_version})
        if has_approvals(db, cohort.id):
            raise ApiError(409, 'APPROVALS_EXIST', 'Approved results exist. An administrator must reset the cohort '
                                                   'before a new allocation run.')
        inputs = load_inputs(db, cohort)
        if not inputs.students:
            raise ApiError(422, 'EMPTY_COHORT', 'Cohort has no valid students.')
        mode, model = resolve_model(registry, mode, model_key)
        # 2-6. allocate with traces
        result = allocate(inputs, model.score if model else None)
        assignments = [{'student_id': p.student_id, 'offer_id': p.offer_id, 'status': p.status,
                        'fallback_used': p.fallback_used} for p in result.proposals]
        # 7. independent full-plan check; abort on any violation
        invariants = check_plan(inputs, assignments)
        if not invariants['passed']:
            raise ApiError(500, 'INVARIANT_VIOLATION', 'Generated plan failed independent checks; nothing was saved.',
                           invariants)
        # 8. persist run + proposals in one transaction
        previous = cohort.active_run_id
        if previous:
            from .history import snapshot  # local import: history uses this module
            prev_run = db.get(PlacementRun, previous)
            prev_run.status = 'SUPERSEDED'
            db.flush()
            snapshot(db, prev_run, 'SUPERSEDED')
        seats = sum(o.capacity for o in inputs.offers)
        metrics = plan_metrics(len(inputs.students), seats, [
            {'offer_id': p.offer_id, 'status': p.status, 'preference_rank': p.preference_rank,
             'fallback_used': p.fallback_used, 'reason_code': p.reason_code} for p in result.proposals])
        run = PlacementRun(cohort_id=cohort.id, status='GENERATED', mode=mode, input_version=cohort.input_version,
                           rule_version=cohort.rule_version, model_key=model.key if model else None,
                           model_version=model.model_version if model else None,
                           model_sha256=model.sha256 if model else None, metrics=metrics, runtime_ms=0,
                           invariants={k: v for k, v in invariants.items() if k != 'problems'}, created_by=user.username)
        db.add(run); db.flush()
        db.add_all([Proposal(run_id=run.id, cohort_id=cohort.id, student_id=p.student_id, offer_id=p.offer_id,
                             status=p.status, priority_position=p.priority_position, preference_rank=p.preference_rank,
                             fallback_used=p.fallback_used, fit_score=p.fit_score, reason_code=p.reason_code,
                             reason_codes=p.reason_codes, trace=p.trace, engine_offer_id=p.offer_id)
                    for p in result.proposals])
        cohort.active_run_id = run.id
        run.runtime_ms = round((time.perf_counter() - started) * 1000, 2)
        run.metrics = {**metrics, 'allocation_ms': result.runtime_ms, 'scored_pairs': result.scored_pairs}
        audit.record(db, user, 'RUN_GENERATED', cohort_id=cohort.id, run_id=run.id, mode=mode,
                     model_version=run.model_version, replaced_run=previous, runtime_ms=run.runtime_ms,
                     assigned=metrics['draft']['assigned'], unassigned=metrics['unassigned'])
        db.commit()
        return run
    finally:
        lock.release()


def simulate(db: Session, cohort: Cohort, mode: str, model_key: str | None, capacity_overrides: dict[str, int],
             registry: ModelRegistry) -> dict:
    """Dry run on the current snapshot: nothing is persisted. Enables rules-only vs AI, model-vs-model
    and capacity what-if comparisons on exactly the same inputs (SRS §19)."""
    inputs = load_inputs(db, cohort)
    unknown = set(capacity_overrides) - {o.offer_id for o in inputs.offers}
    if unknown:
        raise ApiError(422, 'UNKNOWN_OFFER', 'Capacity override for unknown offer(s).', {'offers': sorted(unknown)})
    if any(v < 0 for v in capacity_overrides.values()):
        raise ApiError(422, 'INVALID_CAPACITY', 'Capacity overrides must be non-negative integers.')
    mode, model = resolve_model(registry, mode, model_key)
    started = time.perf_counter()
    result = allocate(inputs, model.score if model else None, capacity_overrides)
    rows = [{'student_id': p.student_id, 'offer_id': p.offer_id, 'status': p.status, 'preference_rank': p.preference_rank,
             'fallback_used': p.fallback_used, 'reason_code': p.reason_code} for p in result.proposals]
    invariants = check_plan(inputs, rows, capacity_overrides)
    seats = sum(capacity_overrides.get(o.offer_id, o.capacity) for o in inputs.offers)
    return {'cohort_id': cohort.id, 'input_version': cohort.input_version, 'mode': mode,
            'model_version': model.model_version if model else None, 'capacity_overrides': capacity_overrides,
            'runtime_ms': round((time.perf_counter() - started) * 1000, 2),
            'metrics': plan_metrics(len(inputs.students), seats, rows),
            'invariants': {k: v for k, v in invariants.items() if k != 'problems'}, 'persisted': False}


def get_run(db: Session, run_id: str) -> PlacementRun:
    run = db.get(PlacementRun, run_id)
    if run is None:
        raise ApiError(404, 'RUN_NOT_FOUND', f'Run "{run_id}" does not exist.')
    return run


def plan_rows(db: Session, run_id: str) -> list[dict]:
    rows = db.execute(select(Proposal.student_id, Proposal.offer_id, Proposal.status, Proposal.preference_rank,
                             Proposal.fallback_used, Proposal.reason_code, Proposal.override_preference,
                             Proposal.override_eligibility).where(Proposal.run_id == run_id)).all()
    return [dict(r._mapping) for r in rows]


def live_metrics(db: Session, run: PlacementRun) -> dict:
    """Metrics recomputed from the current proposal states, plus a fresh independent invariant check."""
    cohort = db.get(Cohort, run.cohort_id)
    inputs = load_inputs(db, cohort)
    rows = plan_rows(db, run.id)
    invariants = check_plan(inputs, rows)
    return {'run_id': run.id, 'status': run.status, 'mode': run.mode,
            'ai_label': 'Local model' if run.mode == 'AI' else 'Rules-only (AI not used)',
            'model_version': run.model_version, 'rule_version': run.rule_version, 'input_version': run.input_version,
            'runtime_ms': run.runtime_ms, 'allocation_ms': run.metrics.get('allocation_ms'),
            'metrics': plan_metrics(len(inputs.students), sum(o.capacity for o in inputs.offers), rows),
            'violations': {k: v for k, v in invariants.items() if k != 'problems'}}


def refresh_status(db: Session, run: PlacementRun):
    if run.status in ('STALE', 'SUPERSEDED'):
        return
    pending = db.scalar(select(func.count()).select_from(Proposal)
                        .where(Proposal.run_id == run.id, Proposal.status.in_(('DRAFT', 'CHANGED'))))
    was_completed = run.status == 'COMPLETED'
    run.status = 'COMPLETED' if pending == 0 else 'UNDER_REVIEW'
    if run.status == 'COMPLETED' and not was_completed:
        from .history import snapshot
        db.flush()
        snapshot(db, run, 'COMPLETED')


def list_proposals(db: Session, run: PlacementRun, status: str | None, offer_id: str | None, student_id: str | None,
                   reason: str | None, fallback: bool | None, limit: int, offset: int) -> tuple[int, list[Proposal]]:
    q = select(Proposal).where(Proposal.run_id == run.id)
    if status:
        statuses = [s.strip().upper() for s in status.split(',')]
        q = q.where(Proposal.status.in_(statuses))
    if offer_id:
        q = q.where(or_(Proposal.offer_id == offer_id, Proposal.released_offer_id == offer_id))
    if student_id:
        q = q.where(Proposal.student_id.contains(student_id))
    if reason:
        q = q.where(Proposal.reason_code == reason)
    if fallback is not None:
        q = q.where(Proposal.fallback_used == fallback)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(Proposal.priority_position).limit(limit).offset(offset)).all()
    return total, rows


def reservations(db: Session, run_id: str, exclude_proposal: str | None = None) -> dict[str, int]:
    q = select(Proposal.offer_id, func.count()).where(Proposal.run_id == run_id, Proposal.status.in_(RESERVING),
                                                      Proposal.offer_id.is_not(None))
    if exclude_proposal:
        q = q.where(Proposal.id != exclude_proposal)
    return dict(db.execute(q.group_by(Proposal.offer_id)).all())
