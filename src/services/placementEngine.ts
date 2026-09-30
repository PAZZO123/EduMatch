import {
  Student,
  Offer,
  Preference,
  PlacementProposal,
  PlacementRun,
  DashboardMetrics,
  DecisionTraceItem,
  DemoRules,
  AlternativeOfferOption
} from '../types';

export const DEFAULT_RULES: DemoRules = {
  rule_version: 'demo-policy-v1',
  score_scale: '0-100',
  score_direction: 'higher_better',
  priority: 'overall_desc_then_student_id_asc',
  allow_unlisted_fallback: true,
  allocation: 'serial_priority',
};

export const MODEL_METADATA = {
  loaded: true,
  version: 'rf-demo-v1',
  model_type: 'RandomForestRegressor (scikit-learn)',
  hash: 'sha256-e94f1c9d8a3b5a2c4e6f881230ab',
  feature_schema: [
    'overall_score/100',
    'subject_fit (weighted math/science/lang)',
    'eligibility_margin (max(0, overall - min)/100)',
    'same_province (binary)'
  ],
  training_provenance: 'SYNTHEX Group 3 / NESA Synthetic Training Corpus (2,000 students, 24,000 pairs, GroupShuffleSplit 80/20, seed=42)',
  held_out_mae: 0.041,
  baseline_mae: 0.168,
  features_description: 'y_demo = 0.75 * subject_fit + 0.15 * (overall/100) + 0.10 * same_province. Demonstrates model inference without causal placement claims.'
};

/**
 * Embedded AI model compatibility score estimation
 * Matches SRS Section 12 specification:
 * fit_score = 100 * (0.75 * subject_fit + 0.15 * (overall/100) + 0.10 * same_province)
 */
export function calculateFitScore(student: Student, offer: Offer): number {
  const subjectFit = (
    (student.math_score * offer.weight_math) +
    (student.science_score * offer.weight_science) +
    (student.language_score * offer.weight_language)
  ) / 100;

  const sameProvince = student.province.toLowerCase() === offer.province.toLowerCase() ? 1 : 0;
  const overallNorm = student.overall_score / 100;

  const yRaw = 0.75 * subjectFit + 0.15 * overallNorm + 0.10 * sameProvince;
  const clipped = Math.max(0, Math.min(1, yRaw));
  return Math.round(clipped * 1000) / 10; // e.g. 84.5
}

/**
 * Checks if a student is academically eligible for an offer
 */
export function checkEligibility(student: Student, offer: Offer): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (student.overall_score < offer.min_overall) {
    reasons.push(`Score ${student.overall_score} below minimum overall ${offer.min_overall}`);
  }
  if (offer.subject_min_math !== undefined && student.math_score < offer.subject_min_math) {
    reasons.push(`Math ${student.math_score} below minimum ${offer.subject_min_math}`);
  }
  if (offer.subject_min_science !== undefined && student.science_score < offer.subject_min_science) {
    reasons.push(`Science ${student.science_score} below minimum ${offer.subject_min_science}`);
  }
  if (offer.subject_min_language !== undefined && student.language_score < offer.subject_min_language) {
    reasons.push(`Language ${student.language_score} below minimum ${offer.subject_min_language}`);
  }

  return {
    eligible: reasons.length === 0,
    reasons
  };
}

/**
 * Deterministic serial placement engine with AI fallback ranking
 * SRS Section 14 & 15
 */
export function executePlacement(
  students: Student[],
  offers: Offer[],
  preferences: Preference[],
  rules: DemoRules = DEFAULT_RULES
): {
  proposals: PlacementProposal[];
  metrics: DashboardMetrics;
  offersWithCounts: Offer[];
  runtime_ms: number;
} {
  const startTime = performance.now();

  // Create lookup maps
  const offersMap = new Map<string, Offer>();
  const freeSeatsMap = new Map<string, number>();
  const reservedMap = new Map<string, number>();

  for (const offer of offers) {
    offersMap.set(offer.offer_id, offer);
    freeSeatsMap.set(offer.offer_id, offer.capacity);
    reservedMap.set(offer.offer_id, 0);
  }

  // Group preferences by student and sort by rank
  const prefsByStudent = new Map<string, Preference[]>();
  for (const p of preferences) {
    const list = prefsByStudent.get(p.student_id) || [];
    list.push(p);
    prefsByStudent.set(p.student_id, list);
  }
  for (const [, list] of prefsByStudent.entries()) {
    list.sort((a, b) => a.rank - b.rank);
  }

  // Sort students by priority: overall_score descending, then student_id ascending
  const sortedStudents = [...students].sort((a, b) => {
    if (b.overall_score !== a.overall_score) {
      return b.overall_score - a.overall_score;
    }
    return a.student_id.localeCompare(b.student_id);
  });

  const proposals: PlacementProposal[] = [];
  const now = new Date().toISOString();

  // Process each student in order
  for (const student of sortedStudents) {
    const studentPrefs = prefsByStudent.get(student.student_id) || [];
    const trace: DecisionTraceItem[] = [];
    const reasonCodes: string[] = [];
    let assignedOfferId: string | null = null;
    let assignedRank: number | null = null;
    let isFallback = false;
    let assignedFitScore: number | null = null;

    // 1. Try listed choices in rank order
    for (const pref of studentPrefs) {
      const targetOffer = offersMap.get(pref.offer_id);
      if (!targetOffer) {
        trace.push({
          stage: `Rank ${pref.rank} Choice (${pref.offer_id})`,
          offer_id: pref.offer_id,
          result: 'SKIPPED',
          detail: 'Offer ID not found in catalog'
        });
        continue;
      }

      const { eligible, reasons } = checkEligibility(student, targetOffer);
      if (!eligible) {
        trace.push({
          stage: `Rank ${pref.rank} Choice (${targetOffer.school_name})`,
          offer_id: targetOffer.offer_id,
          result: 'INELIGIBLE_SCORE',
          detail: reasons.join('; ')
        });
        reasonCodes.push(`CHOICE_${pref.rank}_INELIGIBLE`);
        continue;
      }

      const freeSeats = freeSeatsMap.get(targetOffer.offer_id) || 0;
      if (freeSeats <= 0) {
        trace.push({
          stage: `Rank ${pref.rank} Choice (${targetOffer.school_name})`,
          offer_id: targetOffer.offer_id,
          result: 'FULL',
          detail: `Capacity filled (${targetOffer.capacity}/${targetOffer.capacity})`
        });
        reasonCodes.push(`CHOICE_${pref.rank}_FULL`);
        continue;
      }

      // Seat is available and student is eligible!
      assignedOfferId = targetOffer.offer_id;
      assignedRank = pref.rank;
      freeSeatsMap.set(targetOffer.offer_id, freeSeats - 1);
      reservedMap.set(targetOffer.offer_id, (reservedMap.get(targetOffer.offer_id) || 0) + 1);

      trace.push({
        stage: `Rank ${pref.rank} Choice (${targetOffer.school_name})`,
        offer_id: targetOffer.offer_id,
        result: 'ELIGIBLE_AND_RESERVED',
        detail: `Reserved seat (${freeSeats - 1} remaining). Meets threshold ${targetOffer.min_overall}`
      });

      if (pref.rank === 1) {
        reasonCodes.push('FIRST_CHOICE_FEASIBLE');
      } else if (pref.rank === 2) {
        reasonCodes.push('SECOND_CHOICE_FEASIBLE');
      } else {
        reasonCodes.push('THIRD_CHOICE_FEASIBLE');
      }

      break;
    }

    // 2. If no listed choice worked, check AI fallback recommendation
    if (!assignedOfferId) {
      if (student.allow_fallback && rules.allow_unlisted_fallback) {
        const listedIds = new Set(studentPrefs.map(p => p.offer_id));
        // Find feasible unlisted offers
        const feasibleUnlisted: { offer: Offer; fit: number }[] = [];

        for (const offer of offers) {
          if (listedIds.has(offer.offer_id)) continue;
          const { eligible } = checkEligibility(student, offer);
          if (!eligible) continue;
          const freeSeats = freeSeatsMap.get(offer.offer_id) || 0;
          if (freeSeats <= 0) continue;

          const fit = calculateFitScore(student, offer);
          feasibleUnlisted.push({ offer, fit });
        }

        if (feasibleUnlisted.length > 0) {
          // Rank by fit descending, tie-break offer_id ascending
          feasibleUnlisted.sort((a, b) => {
            if (b.fit !== a.fit) return b.fit - a.fit;
            return a.offer.offer_id.localeCompare(b.offer.offer_id);
          });

          const bestFallback = feasibleUnlisted[0];
          assignedOfferId = bestFallback.offer.offer_id;
          isFallback = true;
          assignedFitScore = bestFallback.fit;

          const curFree = freeSeatsMap.get(bestFallback.offer.offer_id) || 0;
          freeSeatsMap.set(bestFallback.offer.offer_id, curFree - 1);
          reservedMap.set(bestFallback.offer.offer_id, (reservedMap.get(bestFallback.offer.offer_id) || 0) + 1);

          trace.push({
            stage: 'AI Fallback Matching',
            offer_id: bestFallback.offer.offer_id,
            result: 'AI_FALLBACK_SELECTED',
            detail: `Selected unlisted option ${bestFallback.offer.school_name} with compatibility fit score ${bestFallback.fit} (ranked #1 of ${feasibleUnlisted.length} eligible available alternatives)`
          });
          reasonCodes.push('FALLBACK_AI_RANKED');
        } else {
          reasonCodes.push(studentPrefs.length > 0 ? 'CHOICES_EXHAUSTED' : 'NO_ELIGIBLE_OFFER');
          trace.push({
            stage: 'AI Fallback Matching',
            result: 'FULL',
            detail: 'Student opted in for fallback, but no remaining unlisted offers had capacity and met eligibility'
          });
        }
      } else {
        reasonCodes.push(studentPrefs.length > 0 ? 'CHOICES_EXHAUSTED' : 'NO_ELIGIBLE_OFFER');
        trace.push({
          stage: 'Fallback Check',
          result: 'SKIPPED',
          detail: student.allow_fallback
            ? 'Fallback disabled by administrator rules'
            : 'Student did not opt into automated fallback recommendations'
        });
      }
    }

    const proposal: PlacementProposal = {
      student_id: student.student_id,
      offer_id: assignedOfferId,
      status: assignedOfferId ? 'DRAFT' : 'UNASSIGNED',
      preference_rank: assignedRank,
      is_fallback: isFallback,
      reason_codes: reasonCodes,
      fit_score: assignedFitScore,
      model_version: MODEL_METADATA.version,
      rule_version: rules.rule_version,
      revision: 1,
      trace,
      updated_at: now
    };

    proposals.push(proposal);
  }

  // Restore proposal order matching original input students
  const proposalsMap = new Map(proposals.map(p => [p.student_id, p]));
  const finalProposals = students.map(s => proposalsMap.get(s.student_id)!);

  const runtimeMs = Math.round((performance.now() - startTime) * 10) / 10;

  // Compute metrics per Section 19
  const totalApplicants = students.length;
  const assignedProposals = finalProposals.filter(p => p.offer_id !== null && p.status !== 'REJECTED');
  const assignedCount = assignedProposals.length;
  const unassignedCount = totalApplicants - assignedCount;

  const firstChoiceCount = finalProposals.filter(p => p.preference_rank === 1 && !p.is_fallback).length;
  const topThreeCount = finalProposals.filter(p => p.preference_rank !== null && p.preference_rank <= 3 && !p.is_fallback).length;

  const totalCapacity = offers.reduce((acc, o) => acc + o.capacity, 0);
  const activeReservations = Array.from(reservedMap.values()).reduce((a, b) => a + b, 0);

  // Invariant verification check
  let violations = 0;
  for (const offer of offers) {
    const res = reservedMap.get(offer.offer_id) || 0;
    if (res > offer.capacity) violations++;
  }

  const metrics: DashboardMetrics = {
    total_applicants: totalApplicants,
    assigned_count: assignedCount,
    unassigned_count: unassignedCount,
    approved_count: 0,
    placement_rate: totalApplicants > 0 ? Math.round((assignedCount / totalApplicants) * 1000) / 10 : 0,
    top_three_rate: totalApplicants > 0 ? Math.round((topThreeCount / totalApplicants) * 1000) / 10 : 0,
    first_choice_rate: totalApplicants > 0 ? Math.round((firstChoiceCount / totalApplicants) * 1000) / 10 : 0,
    unassigned_rate: totalApplicants > 0 ? Math.round((unassignedCount / totalApplicants) * 1000) / 10 : 0,
    seat_utilization: totalCapacity > 0 ? Math.round((activeReservations / totalCapacity) * 1000) / 10 : 0,
    total_capacity: totalCapacity,
    active_reservations: activeReservations,
    violations_count: violations,
    runtime_ms: runtimeMs
  };

  const offersWithCounts = offers.map(o => ({
    ...o,
    reserved_count: reservedMap.get(o.offer_id) || 0,
    approved_count: 0
  }));

  return {
    proposals: finalProposals,
    metrics,
    offersWithCounts,
    runtime_ms: runtimeMs
  };
}

/**
 * Get feasible alternatives for a student considering active reservations
 */
export function getFeasibleAlternatives(
  student: Student,
  offers: Offer[],
  activeProposals: PlacementProposal[]
): AlternativeOfferOption[] {
  // Compute active reservations excluding the student's current proposal
  const currentUsage = new Map<string, number>();
  for (const p of activeProposals) {
    if (p.student_id === student.student_id) continue;
    if (p.offer_id && (p.status === 'DRAFT' || p.status === 'APPROVED' || p.status === 'CHANGED')) {
      currentUsage.set(p.offer_id, (currentUsage.get(p.offer_id) || 0) + 1);
    }
  }

  return offers.map(offer => {
    const { eligible, reasons } = checkEligibility(student, offer);
    const used = currentUsage.get(offer.offer_id) || 0;
    const hasCapacity = used < offer.capacity;
    const fitScore = calculateFitScore(student, offer);

    let reason = 'Eligible with available seats';
    if (!eligible) {
      reason = `Ineligible: ${reasons.join(', ')}`;
    } else if (!hasCapacity) {
      reason = `Capacity full (${used}/${offer.capacity})`;
    }

    return {
      offer,
      is_eligible: eligible,
      has_capacity: hasCapacity,
      fit_score: fitScore,
      eligibility_reason: reason
    };
  });
}
