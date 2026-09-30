"""Human-readable explanations generated only from recorded decision facts (FR-09)."""
from ..models import PlacementRun, Proposal

RULE_LABEL = {'min_overall': 'overall score', 'subject_min_math': 'maths score',
              'subject_min_science': 'science score', 'subject_min_language': 'language score'}


def _fmt(x):
    return f'{x:g}' if isinstance(x, (int, float)) else str(x)


def explain(proposal: Proposal, run: PlacementRun, total: int, overall: float, schools: dict[str, str]) -> list[str]:
    name = lambda oid: f'{oid} ({schools.get(oid, "unknown")})' if oid else '—'  # noqa: E731
    lines = [f'Priority position {proposal.priority_position} of {total}: overall score {_fmt(overall)} '
             f'(demo policy — overall score descending, then student ID ascending).']
    for step in proposal.trace:
        if step['kind'] == 'LISTED':
            head = f"Choice {step['rank']} {name(step['offer_id'])}: "
            if step['outcome'] == 'INELIGIBLE':
                why = '; '.join(f"{RULE_LABEL.get(f['rule'], f['rule'])} {_fmt(f['actual'])} is below the required "
                                f"{_fmt(f['required'])}" for f in step['failures'])
                lines.append(head + f'not eligible — {why}.')
            elif step['outcome'] == 'CAPACITY_FULL':
                lines.append(head + f"eligible but full — all {step['capacity']} seat(s) already reserved by "
                                    f"higher-priority students.")
            else:
                lines.append(head + f"eligible with {step['seats_left_before']} of {step['capacity']} seat(s) free "
                                    f"→ proposed.")
        elif step['kind'] == 'FALLBACK':
            if step['outcome'] == 'SELECTED':
                lines.append(f"No listed choice was feasible. The student opted in to fallback, so model "
                             f"{run.model_version} ranked {step['candidates_considered']} eligible, available, unlisted "
                             f"offer(s); the best was {name(step['offer_id'])} with compatibility score "
                             f"{step['fit_score']:.1f}/100.")
            else:
                lines.append('No listed choice was feasible and no eligible unlisted offer had a free seat.')
    codes = set(proposal.reason_codes)
    if 'FALLBACK_NOT_OPTED_IN' in codes:
        lines.append('The student did not opt in to unlisted fallback, so no alternative was proposed.')
    if 'FALLBACK_DISABLED_BY_RULE' in codes:
        lines.append('Unlisted fallback is disabled by the current rules.')
    if 'AI_UNAVAILABLE' in codes:
        lines.append('The AI model was unavailable; this run used rules-only mode, so no fallback was ranked.')
    final = {'NO_ELIGIBLE_OFFER': 'Unassigned: the student meets no offer\'s eligibility rules in this cohort.',
             'NO_ELIGIBLE_CHOICE': 'Unassigned: the student is not eligible for any listed choice.',
             'CHOICES_EXHAUSTED': 'Unassigned: every eligible listed choice was already full.'}
    if proposal.reason_code in final and proposal.status == 'UNASSIGNED':
        lines.append(final[proposal.reason_code])
    if proposal.status in ('CHANGED', 'REJECTED', 'APPROVED') and proposal.reviewer:
        verb = {'CHANGED': 'changed to ' + name(proposal.offer_id), 'REJECTED': 'rejected', 'APPROVED': 'approved'}
        lines.append(f"Officer {proposal.reviewer} {verb[proposal.status]}: \"{proposal.decision_reason}\".")
    lines.append(f"Provenance: rule {run.rule_version}, input v{run.input_version}, "
                 f"{'model ' + run.model_version if run.model_version else 'rules-only mode'}.")
    return lines
