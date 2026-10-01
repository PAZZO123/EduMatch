"""Independent plan checker (SRS §16). Written separately from the allocator on purpose:
it re-derives every hard constraint from the raw inputs and the proposed assignments."""
from collections import Counter

from .records import CohortInputs
from .rules import is_eligible


def check_plan(inputs: CohortInputs, assignments: list[dict], capacity_overrides: dict[str, int] | None = None) -> dict:
    """assignments: [{'student_id', 'offer_id' (or None), 'status', 'fallback_used'}] for the active plan.
    Only seat-holding statuses (DRAFT/CHANGED/APPROVED) count toward capacity."""
    students = {s.student_id: s for s in inputs.students}
    offers = {o.offer_id: o for o in inputs.offers}
    listed = {(p.student_id, p.offer_id) for p in inputs.preferences}
    capacity = {oid: (capacity_overrides or {}).get(oid, o.capacity) for oid, o in offers.items()}
    problems = []

    seen = Counter(a['student_id'] for a in assignments)
    for sid, n in seen.items():
        if n > 1:
            problems.append({'type': 'uniqueness', 'student_id': sid, 'detail': f'{n} records in plan'})
    for sid in students.keys() - seen.keys():
        problems.append({'type': 'accountability', 'student_id': sid, 'detail': 'valid student missing from plan'})

    holding = [a for a in assignments if a['offer_id'] and a['status'] in ('DRAFT', 'CHANGED', 'APPROVED')]
    load = Counter(a['offer_id'] for a in holding)
    for oid, n in load.items():
        if oid not in offers:
            problems.append({'type': 'eligibility', 'offer_id': oid, 'detail': 'offer not in input snapshot'})
        elif n > capacity[oid]:
            problems.append({'type': 'capacity', 'offer_id': oid, 'detail': f'{n} reservations > capacity {capacity[oid]}'})
    for a in holding:
        s, o = students.get(a['student_id']), offers.get(a['offer_id'])
        if s is None or o is None:
            problems.append({'type': 'accountability', 'student_id': a['student_id'], 'detail': 'unknown student/offer'})
            continue
        # An officer assignment may carry a recorded, reasoned exception; capacity and uniqueness never do.
        if not is_eligible(s, o) and not a.get('override_eligibility'):
            problems.append({'type': 'eligibility', 'student_id': s.student_id, 'offer_id': o.offer_id})
        if ((s.student_id, o.offer_id) not in listed and not (inputs.fallback_enabled and s.allow_fallback)
                and not a.get('override_preference')):
            problems.append({'type': 'preference_authority', 'student_id': s.student_id, 'offer_id': o.offer_id})
    approved = Counter(a['student_id'] for a in assignments if a['status'] == 'APPROVED')
    problems += [{'type': 'uniqueness', 'student_id': sid, 'detail': 'multiple approvals'} for sid, n in approved.items() if n > 1]

    counts = Counter(p['type'] for p in problems)
    return {'capacity_violations': counts['capacity'], 'eligibility_violations': counts['eligibility'],
            'duplicate_placement_violations': counts['uniqueness'],
            'preference_authority_violations': counts['preference_authority'],
            'accountability_violations': counts['accountability'],
            'total_violations': len(problems), 'passed': not problems, 'problems': problems[:50],
            'officer_exceptions': sum(1 for a in holding if a.get('override_eligibility') or a.get('override_preference'))}
