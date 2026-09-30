"""Deterministic serial-priority allocation (SRS §14-15) with an optional AI fallback ranker.

Students are processed by overall score descending, then student_id ascending. Each takes the
first listed choice that is eligible and has a free seat. If none works and fallback is both
enabled by the rules and opted into by the student, the remaining eligible, available,
unlisted offers are ranked by the scorer and the best is reserved. Every decision is recorded
as a structured trace so explanations are generated from facts, not re-derived later.
"""
import time
from collections import defaultdict
from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np

from .records import CohortInputs, OfferRec, StudentRec
from .rules import eligibility_failures, is_eligible, pair_features, priority_key

Scorer = Callable[[np.ndarray], np.ndarray]     # (n, 4) features -> (n,) scores in [0, 1]
ORDINAL = {1: 'FIRST', 2: 'SECOND', 3: 'THIRD'}
FALLBACK_CANDIDATES_IN_TRACE = 5


@dataclass
class ProposalDraft:
    student_id: str
    offer_id: str | None
    status: str                    # DRAFT | UNASSIGNED
    priority_position: int
    preference_rank: int | None
    fallback_used: bool
    fit_score: float | None        # 0-100, only when the model chose the offer
    reason_code: str
    reason_codes: list[str]
    trace: list[dict] = field(default_factory=list)


@dataclass
class AllocationResult:
    proposals: list[ProposalDraft]
    mode: str                      # AI | RULES_ONLY
    runtime_ms: float
    scored_pairs: int


def _fallback_scores(inputs: CohortInputs, listed: dict[str, set[str]], scorer: Scorer | None):
    """Score every (opted-in student, eligible unlisted offer) pair in ONE batched model call.
    Features don't depend on capacity, so pre-scoring is exact and keeps runs fast."""
    if scorer is None or not inputs.fallback_enabled:
        return {}
    keys, feats = [], []
    for s in inputs.students:
        if not s.allow_fallback:
            continue
        for o in inputs.offers:
            if o.offer_id not in listed[s.student_id] and is_eligible(s, o):
                keys.append((s.student_id, o.offer_id)); feats.append(pair_features(s, o))
    if not keys:
        return {}
    scores = np.clip(np.asarray(scorer(np.asarray(feats, dtype=float)), dtype=float), 0.0, 1.0)
    return dict(zip(keys, scores.tolist()))


def allocate(inputs: CohortInputs, scorer: Scorer | None = None,
             capacity_overrides: dict[str, int] | None = None) -> AllocationResult:
    started = time.perf_counter()
    offers: dict[str, OfferRec] = {o.offer_id: o for o in inputs.offers}
    capacity = {oid: (capacity_overrides or {}).get(oid, o.capacity) for oid, o in offers.items()}
    free = dict(capacity)
    choices: dict[str, list] = defaultdict(list)
    for p in inputs.preferences:
        choices[p.student_id].append(p)
    listed = {s.student_id: {p.offer_id for p in choices[s.student_id]} for s in inputs.students}
    scores = _fallback_scores(inputs, listed, scorer)
    mode = 'AI' if scorer is not None else 'RULES_ONLY'

    proposals = []
    for position, s in enumerate(sorted(inputs.students, key=priority_key), start=1):
        trace, codes = [], []
        chosen = rank = fit = None
        fallback_used = False
        for p in sorted(choices[s.student_id], key=lambda x: x.rank):
            o = offers[p.offer_id]; label = ORDINAL.get(p.rank, f'RANK_{p.rank}')
            failures = eligibility_failures(s, o)
            if failures:
                trace.append({'kind': 'LISTED', 'rank': p.rank, 'offer_id': o.offer_id, 'outcome': 'INELIGIBLE',
                              'failures': failures})
                codes.append(f'{label}_CHOICE_INELIGIBLE')
            elif free[o.offer_id] <= 0:
                trace.append({'kind': 'LISTED', 'rank': p.rank, 'offer_id': o.offer_id, 'outcome': 'CAPACITY_FULL',
                              'capacity': capacity[o.offer_id]})
                codes.append(f'{label}_CHOICE_FULL')
            else:
                trace.append({'kind': 'LISTED', 'rank': p.rank, 'offer_id': o.offer_id, 'outcome': 'FEASIBLE',
                              'seats_left_before': free[o.offer_id], 'capacity': capacity[o.offer_id]})
                codes.append(f'{label}_CHOICE_FEASIBLE')
                chosen, rank = o.offer_id, p.rank
                break

        if chosen is None:
            if not inputs.fallback_enabled:
                codes.append('FALLBACK_DISABLED_BY_RULE')
            elif not s.allow_fallback:
                codes.append('FALLBACK_NOT_OPTED_IN')
            elif scorer is None:
                codes.append('AI_UNAVAILABLE')
            else:
                candidates = sorted(
                    ((scores[(s.student_id, oid)], oid) for oid in offers
                     if (s.student_id, oid) in scores and free[oid] > 0),
                    key=lambda x: (-x[0], x[1]))
                if candidates:
                    best_score, chosen = candidates[0]
                    fit, fallback_used = round(100 * best_score, 2), True
                    codes += ['FALLBACK_AUTHORIZED', 'FALLBACK_AI_RANKED']
                    trace.append({'kind': 'FALLBACK', 'offer_id': chosen, 'outcome': 'SELECTED',
                                  'fit_score': fit, 'candidates_considered': len(candidates),
                                  'top_candidates': [{'offer_id': oid, 'fit_score': round(100 * sc, 2)}
                                                     for sc, oid in candidates[:FALLBACK_CANDIDATES_IN_TRACE]]})
                else:
                    codes.append('FALLBACK_NO_FEASIBLE_OFFER')
                    trace.append({'kind': 'FALLBACK', 'offer_id': None, 'outcome': 'NO_FEASIBLE_OFFER'})

        if chosen is not None:
            free[chosen] -= 1
            reason = 'FALLBACK_AI_RANKED' if fallback_used else f'LISTED_CHOICE_{rank}'
        elif not any(is_eligible(s, o) for o in offers.values()):
            reason = 'NO_ELIGIBLE_OFFER'
        elif not any(is_eligible(s, offers[p.offer_id]) for p in choices[s.student_id]):
            reason = 'NO_ELIGIBLE_CHOICE'
        else:
            reason = 'CHOICES_EXHAUSTED'
        if chosen is None:
            codes.append(reason)
        proposals.append(ProposalDraft(
            student_id=s.student_id, offer_id=chosen, status='DRAFT' if chosen else 'UNASSIGNED',
            priority_position=position, preference_rank=rank, fallback_used=fallback_used, fit_score=fit,
            reason_code=reason, reason_codes=codes, trace=trace))

    return AllocationResult(proposals=proposals, mode=mode, scored_pairs=len(scores),
                            runtime_ms=round((time.perf_counter() - started) * 1000, 3))


def rank_alternatives(student: StudentRec, inputs: CohortInputs, free_seats: dict[str, int],
                      scorer: Scorer | None, exclude_offer: str | None = None) -> list[dict]:
    """Eligible offers with a free seat for this student, each marked listed/unlisted and whether
    the student is authorised to receive it. Scored by the model when available."""
    listed = {p.offer_id: p.rank for p in inputs.preferences if p.student_id == student.student_id}
    rows = [o for o in inputs.offers if o.offer_id != exclude_offer and is_eligible(student, o)
            and free_seats.get(o.offer_id, 0) > 0]
    scores = (np.clip(np.asarray(scorer(np.asarray([pair_features(student, o) for o in rows], dtype=float))), 0, 1)
              if scorer is not None and rows else [None] * len(rows))
    fallback_ok = inputs.fallback_enabled and student.allow_fallback
    out = []
    for o, sc in zip(rows, scores):
        rank = listed.get(o.offer_id)
        out.append({'offer_id': o.offer_id, 'school_name': o.school_name, 'listed_rank': rank,
                    'authorized': rank is not None or fallback_ok,
                    'fit_score': None if sc is None else round(100 * float(sc), 2),
                    'seats_available': free_seats[o.offer_id]})
    out.sort(key=lambda r: (r['listed_rank'] is None, r['listed_rank'] or 0,
                            -(r['fit_score'] or 0), r['offer_id']))
    return out
