"""Placement history: a permanent snapshot of each run and every student's result.

A run is snapshotted when it completes (everything decided), when a newer run replaces it, and before a
cohort reset / re-import / delete removes it. The snapshot keeps the metrics, the officer decisions and a
plain-language reason per student, so previous placements stay viewable and exportable forever."""
import csv
import io
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..errors import ApiError
from ..models import AuditEvent, Cohort, Offer, PlacementHistory, PlacementRun, Proposal, Student
from .explain import reason_summary

RESULT_FIELDS = ['student_id', 'display_name', 'province', 'overall_score', 'offer_id', 'school_name', 'status',
                 'preference_rank', 'fallback_used', 'fit_score', 'officer_exception', 'reason_text',
                 'suggested_action', 'reviewer', 'decision_reason']


def snapshot(db: Session, run: PlacementRun, reason: str) -> PlacementHistory:
    """Create or refresh the history record for a run (idempotent per run)."""
    from .runs import live_metrics  # local import: runs imports this module lazily
    cohort = db.get(Cohort, run.cohort_id)
    students = {s.student_id: s for s in db.scalars(select(Student).where(Student.cohort_id == run.cohort_id))}
    schools = dict(db.execute(select(Offer.offer_id, Offer.school_name).where(Offer.cohort_id == run.cohort_id)).all())
    proposals = db.scalars(select(Proposal).where(Proposal.run_id == run.id).order_by(Proposal.priority_position)).all()
    # Officer change / assignment reasons live in the audit log (a later approval overwrites decision_reason).
    change_reasons = {e.proposal_id: e.reason for e in db.scalars(
        select(AuditEvent).where(AuditEvent.run_id == run.id,
                                 AuditEvent.action.in_(('PROPOSAL_CHANGED', 'PROPOSAL_ASSIGNED')))
        .order_by(AuditEvent.at))}
    live = live_metrics(db, run)
    results = []
    for p in proposals:
        s = students.get(p.student_id)
        exceptions = [label for label, on in (('outside choices', p.override_preference),
                                              ('below entry requirements', p.override_eligibility)) if on]
        results.append({'student_id': p.student_id, 'display_name': s.display_name if s else p.student_id,
                        'province': s.province if s else None, 'overall_score': s.overall_score if s else None,
                        'offer_id': p.offer_id, 'school_name': schools.get(p.offer_id), 'status': p.status,
                        'preference_rank': p.preference_rank, 'fallback_used': p.fallback_used,
                        'fit_score': p.fit_score, 'officer_exception': '; '.join(exceptions),
                        **reason_summary(p, schools, change_reasons.get(p.id)), 'reviewer': p.reviewer,
                        'decision_reason': p.decision_reason})
    metrics = {**live['metrics'], 'violations': live['violations']['total_violations'],
               'officer_exceptions': live['violations'].get('officer_exceptions', 0)}
    entry = db.scalar(select(PlacementHistory).where(PlacementHistory.run_id == run.id))
    if entry is None:
        entry = PlacementHistory(run_id=run.id)
        db.add(entry)
    entry.cohort_id, entry.cohort_source = run.cohort_id, cohort.source_label if cohort else '—'
    entry.run_created_at, entry.run_created_by = run.created_at, run.created_by
    entry.archived_at, entry.archived_reason, entry.run_status = datetime.now(timezone.utc), reason, run.status
    entry.mode, entry.model_version, entry.rule_version = run.mode, run.model_version, run.rule_version
    entry.input_version, entry.runtime_ms = run.input_version, run.runtime_ms
    entry.metrics, entry.results = metrics, results
    db.flush()
    return entry


def archive_cohort_runs(db: Session, cohort_id: str, reason: str):
    """Snapshot every run of a cohort that is about to be removed (already-archived superseded runs are kept)."""
    for run in db.scalars(select(PlacementRun).where(PlacementRun.cohort_id == cohort_id)):
        exists = db.scalar(select(PlacementHistory.id).where(PlacementHistory.run_id == run.id))
        if exists and run.status == 'SUPERSEDED':
            continue
        snapshot(db, run, reason)


def _summary(h: PlacementHistory) -> dict:
    m = h.metrics or {}
    draft, approved = m.get('draft', {}), m.get('approved', {})
    return {'id': h.id, 'run_id': h.run_id, 'cohort_id': h.cohort_id, 'cohort_source': h.cohort_source,
            'run_created_at': h.run_created_at, 'run_created_by': h.run_created_by, 'archived_at': h.archived_at,
            'archived_reason': h.archived_reason, 'run_status': h.run_status, 'mode': h.mode,
            'model_version': h.model_version, 'rule_version': h.rule_version, 'input_version': h.input_version,
            'runtime_ms': h.runtime_ms, 'students': m.get('valid_applicants'), 'placed': draft.get('assigned'),
            'approved': approved.get('assigned'), 'unplaced': m.get('unassigned'),
            'first_choice_rate': draft.get('first_choice_rate'), 'top_three_rate': draft.get('top_three_rate'),
            'ai_fallback': draft.get('fallback_assigned'), 'violations': m.get('violations'),
            'officer_exceptions': m.get('officer_exceptions', 0)}


def list_history(db: Session, cohort_id: str | None = None) -> list[dict]:
    q = select(PlacementHistory).order_by(PlacementHistory.run_created_at.desc())
    if cohort_id:
        q = q.where(PlacementHistory.cohort_id == cohort_id)
    return [_summary(h) for h in db.scalars(q)]


def get_history(db: Session, history_id: int) -> PlacementHistory:
    h = db.get(PlacementHistory, history_id)
    if h is None:
        raise ApiError(404, 'HISTORY_NOT_FOUND', f'History record {history_id} does not exist.')
    return h


def detail(db: Session, history_id: int) -> dict:
    h = get_history(db, history_id)
    return {**_summary(h), 'metrics': h.metrics, 'results': h.results}


def export_csv(db: Session, history_id: int) -> tuple[str, int]:
    from .export import _safe
    h = get_history(db, history_id)
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=RESULT_FIELDS, lineterminator='\n', extrasaction='ignore')
    w.writeheader()
    w.writerows({k: _safe(r.get(k)) for k in RESULT_FIELDS} for r in h.results)
    return buf.getvalue(), len(h.results)
