"""Eligibility and model features — the single source of truth for both allocation and scoring."""
from .records import SUBJECTS, OfferRec, StudentRec


def eligibility_failures(student: StudentRec, offer: OfferRec) -> list[dict]:
    """Every hard rule the student fails for this offer (empty list = eligible)."""
    failures = []
    if student.overall_score < offer.min_overall:
        failures.append({'rule': 'min_overall', 'required': offer.min_overall, 'actual': student.overall_score})
    for sub in SUBJECTS:
        limit = offer.subject_min(sub)
        if limit is not None and student.subject(sub) < limit:
            failures.append({'rule': f'subject_min_{sub}', 'required': limit, 'actual': student.subject(sub)})
    return failures


def is_eligible(student: StudentRec, offer: OfferRec) -> bool:
    return not eligibility_failures(student, offer)


def subject_fit(student: StudentRec, offer: OfferRec) -> float:
    return sum(student.subject(s) * offer.weight(s) for s in SUBJECTS) / 100


def pair_features(student: StudentRec, offer: OfferRec) -> list[float]:
    """Model input in the fixed order [overall_norm, subject_fit, eligibility_margin, same_province]."""
    return [student.overall_score / 100, subject_fit(student, offer),
            max(0.0, student.overall_score - offer.min_overall) / 100,
            1.0 if student.province == offer.province else 0.0]


def teacher_score(features: list[float]) -> float:
    """The disclosed synthetic teaching formula. Used only for regression tests, never as 'AI'."""
    return .75 * features[1] + .15 * features[0] + .10 * features[3]


def priority_key(student: StudentRec):
    """Demo priority: overall score descending, then student_id ascending (deterministic tie-break)."""
    return (-student.overall_score, student.student_id)
