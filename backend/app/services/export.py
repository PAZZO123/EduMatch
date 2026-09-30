"""Approved-only and exceptions CSV exports (FR-15). Cells are guarded against spreadsheet formula injection."""
import csv
import io

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Offer, PlacementRun, Proposal, Student

APPROVED_FIELDS = ['student_id', 'offer_id', 'school_name', 'preference_rank', 'fallback_used', 'fit_score',
                   'officer', 'decision_reason', 'decided_at', 'run_id', 'input_version', 'rule_version',
                   'model_version', 'synthetic']
EXCEPTION_FIELDS = ['student_id', 'status', 'reason_code', 'reason_codes', 'released_offer_id', 'overall_score',
                    'allow_fallback', 'officer', 'decision_reason', 'run_id', 'synthetic']


def _safe(value):
    if value is None:
        return ''
    text = str(value)
    return "'" + text if text[:1] in ('=', '+', '-', '@', '\t', '\r') else text


def _write(fields, rows) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    writer.writerows({k: _safe(v) for k, v in r.items()} for r in rows)
    return buf.getvalue()


def approved_csv(db: Session, run: PlacementRun) -> tuple[str, int]:
    schools = dict(db.execute(select(Offer.offer_id, Offer.school_name).where(Offer.cohort_id == run.cohort_id)).all())
    rows = db.scalars(select(Proposal).where(Proposal.run_id == run.id, Proposal.status == 'APPROVED')
                      .order_by(Proposal.student_id)).all()
    out = [{'student_id': p.student_id, 'offer_id': p.offer_id, 'school_name': schools.get(p.offer_id),
            'preference_rank': p.preference_rank, 'fallback_used': str(p.fallback_used).lower(),
            'fit_score': p.fit_score, 'officer': p.reviewer, 'decision_reason': p.decision_reason,
            'decided_at': p.reviewed_at.isoformat() if p.reviewed_at else None, 'run_id': run.id,
            'input_version': run.input_version, 'rule_version': run.rule_version,
            'model_version': run.model_version or 'RULES_ONLY', 'synthetic': 'true'} for p in rows]
    return _write(APPROVED_FIELDS, out), len(out)


def exceptions_csv(db: Session, run: PlacementRun) -> tuple[str, int]:
    students = {s.student_id: s for s in db.scalars(select(Student).where(Student.cohort_id == run.cohort_id))}
    rows = db.scalars(select(Proposal).where(Proposal.run_id == run.id, Proposal.status.in_(('UNASSIGNED', 'REJECTED')))
                      .order_by(Proposal.priority_position)).all()
    out = [{'student_id': p.student_id, 'status': p.status, 'reason_code': p.reason_code,
            'reason_codes': ';'.join(p.reason_codes), 'released_offer_id': p.released_offer_id,
            'overall_score': students[p.student_id].overall_score,
            'allow_fallback': str(students[p.student_id].allow_fallback).lower(), 'officer': p.reviewer,
            'decision_reason': p.decision_reason, 'run_id': run.id, 'synthetic': 'true'} for p in rows]
    return _write(EXCEPTION_FIELDS, out), len(out)
