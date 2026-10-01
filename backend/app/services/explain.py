"""Human-readable explanations generated only from recorded decision facts (FR-09)."""
from ..models import PlacementRun, Proposal

RULE_LABEL = {'min_overall': 'overall score', 'subject_min_math': 'maths score',
              'subject_min_science': 'science score', 'subject_min_language': 'language score'}


def _fmt(x):
    return f'{x:g}' if isinstance(x, (int, float)) else str(x)


ORDINAL = {1: '1st', 2: '2nd', 3: '3rd'}


def _why_not(step: dict, schools: dict[str, str]) -> str:
    """Why one listed choice was not used, in a few words."""
    school = schools.get(step['offer_id'], step['offer_id'])
    head = f"{ORDINAL.get(step['rank'], step['rank'])} choice {school}"
    if step['outcome'] == 'CAPACITY_FULL':
        return f'{head} was full'
    fails = ', '.join(f"{RULE_LABEL.get(f['rule'], f['rule'])} {_fmt(f['actual'])} < {_fmt(f['required'])} required"
                      for f in step['failures'])
    return f'not eligible for {head} ({fails})'


def reason_summary(proposal: Proposal, schools: dict[str, str], change_reason: str | None = None) -> dict:
    """One plain-language sentence for why this student got this result, plus a suggested next step for
    anyone left without a seat. Built only from the recorded trace and reason codes (FR-09)."""
    trace = proposal.trace or []
    skipped = [_why_not(s, schools) for s in trace if s['kind'] == 'LISTED' and s['outcome'] != 'FEASIBLE']
    because = '; '.join(skipped)
    codes = set(proposal.reason_codes or [])
    school = schools.get(proposal.offer_id, proposal.offer_id)
    engine_school = schools.get(proposal.engine_offer_id, proposal.engine_offer_id)
    feasible = next((s for s in trace if s['kind'] == 'LISTED' and s['outcome'] == 'FEASIBLE'), None)
    fallback = next((s for s in trace if s['kind'] == 'FALLBACK' and s['outcome'] == 'SELECTED'), None)
    suggestion = None

    if feasible:
        placed = f"Placed at {ORDINAL.get(feasible['rank'], feasible['rank'])} choice {engine_school}"
        text = (f'{placed} because {because}. The student meets its entry cutoff and a seat was free.' if because
                else f'{placed}: the student meets its entry cutoff and a seat was free.')
    elif fallback:
        text = (f'None of the listed choices worked ({because}). The student allowed alternatives, so the AI '
                f"suggested {engine_school}: the most compatible eligible school with a free seat "
                f"(score {fallback['fit_score']:.0f}/100).")
    else:
        text = f'Not placed: {because}.' if because else 'Not placed.'
        assign = ('Use "Assign school": it lists every school that still has free seats, best AI fit first, including '
                  'schools outside the student\'s choices')
        if proposal.reason_code == 'NO_ELIGIBLE_OFFER':
            text = 'Not placed: the student is below the entry requirements of every school in this cohort.'
            suggestion = (f'{assign}. Placing this student anywhere is an eligibility exception, so the officer must confirm '
                          'it and give a reason (recorded in the audit log).')
        elif 'FALLBACK_NOT_OPTED_IN' in codes:
            suggestion = (f'Contact the family (the student only listed specific schools). {assign}; a school outside '
                          'their choices is recorded as an exception with your reason.')
        elif 'FALLBACK_DISABLED_BY_RULE' in codes:
            suggestion = f'Unlisted schools are switched off in the rules. {assign}, recorded as an exception.'
        elif 'AI_UNAVAILABLE' in codes:
            suggestion = f'The AI model was unavailable. {assign}.'
        elif 'FALLBACK_NO_FEASIBLE_OFFER' in codes:
            suggestion = (f'Every school this student qualifies for is full. {assign}; a school below the entry '
                          'requirements needs a confirmed exception, or add seats.')
        else:
            suggestion = f'{assign}.'

    changed = proposal.offer_id is not None and proposal.offer_id != proposal.engine_offer_id
    exceptions = [label for label, on in (('outside the student\'s choices', proposal.override_preference),
                                          ('below the school\'s entry requirements', proposal.override_eligibility)) if on]
    if exceptions and changed:
        why = f': "{change_reason or proposal.decision_reason}"' if (change_reason or proposal.status == 'CHANGED') else ''
        state = 'awaiting approval' if proposal.status == 'CHANGED' else proposal.status.lower()
        text = (f'Assigned by officer to {school}{why} ({state}). Recorded exception: {" and ".join(exceptions)}. '
                f'Engine result was: {text}')
        return {'reason_text': text, 'suggested_action': None}
    if proposal.status == 'CHANGED':
        text = f'Changed by officer to {school}: "{proposal.decision_reason}". Engine proposal was: {text}'
    elif changed:  # approved after an officer change: the reason must describe the school actually given
        why = f': "{change_reason}"' if change_reason else ' (reason in the audit log)'
        text = f'Officer changed the placement to {school}{why}. Engine proposal was: {text}'
    elif proposal.status == 'REJECTED':
        text = f'Rejected by officer: "{proposal.decision_reason}". Engine proposal was: {text}'
        suggestion = 'Use "Assign school" to place the student at another school with free seats, or record the outcome.'
    return {'reason_text': text, 'suggested_action': suggestion}


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
