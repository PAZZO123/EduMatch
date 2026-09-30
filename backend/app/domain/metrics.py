"""Dashboard metrics exactly as defined in SRS §19. Denominator is always all data-valid
applicants; zero denominators return None (displayed as N/A)."""
from collections import Counter


def _rate(n, d):
    return round(n / d, 6) if d else None


def plan_metrics(total_applicants: int, total_seats: int, proposals: list[dict]) -> dict:
    """proposals: [{'offer_id', 'status', 'preference_rank', 'fallback_used', 'reason_code'}]."""
    holding = [p for p in proposals if p['offer_id'] and p['status'] in ('DRAFT', 'CHANGED', 'APPROVED')]
    approved = [p for p in holding if p['status'] == 'APPROVED']

    def block(rows):
        return {'assigned': len(rows),
                'placement_rate': _rate(len(rows), total_applicants),
                'top_three_rate': _rate(sum(1 for p in rows if p['preference_rank'] in (1, 2, 3)), total_applicants),
                'first_choice_rate': _rate(sum(1 for p in rows if p['preference_rank'] == 1), total_applicants),
                'fallback_assigned': sum(1 for p in rows if p['fallback_used'])}

    status = Counter(p['status'] for p in proposals)
    return {'valid_applicants': total_applicants, 'available_seats': total_seats,
            'draft': block(holding),                       # all active reservations (draft + approved)
            'approved': block(approved),                   # final decisions only
            'unassigned': status['UNASSIGNED'] + status['REJECTED'],
            'unassigned_rate': _rate(status['UNASSIGNED'] + status['REJECTED'], total_applicants),
            'utilization': _rate(len(holding), total_seats),
            'status_counts': dict(status),
            'reason_counts': dict(Counter(p['reason_code'] for p in proposals)),
            'pending_review': status['DRAFT'] + status['CHANGED']}
