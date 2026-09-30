from sqlalchemy.orm import Session

from ..models import AuditEvent, User


def record(db: Session, user: User | None, action: str, *, cohort_id=None, run_id=None, proposal_id=None,
           student_id=None, old_offer_id=None, new_offer_id=None, reason=None, **details) -> AuditEvent:
    event = AuditEvent(actor=user.username if user else 'system', role=user.role if user else 'SYSTEM', action=action,
                       cohort_id=cohort_id, run_id=run_id, proposal_id=proposal_id, student_id=student_id,
                       old_offer_id=old_offer_id, new_offer_id=new_offer_id, reason=reason, details=details)
    db.add(event)
    return event
