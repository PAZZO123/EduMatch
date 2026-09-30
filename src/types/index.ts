export interface Student {
  student_id: string;
  display_name: string;
  cohort_id: string;
  province: string;
  overall_score: number;
  math_score: number;
  science_score: number;
  language_score: number;
  allow_fallback: boolean;
}

export interface Offer {
  offer_id: string;
  school_name: string;
  province: string;
  stage_programme: string;
  capacity: number;
  min_overall: number;
  subject_min_math?: number;
  subject_min_science?: number;
  subject_min_language?: number;
  weight_math: number;
  weight_science: number;
  weight_language: number;
  reserved_count?: number;
  approved_count?: number;
}

export interface Preference {
  student_id: string;
  offer_id: string;
  rank: 1 | 2 | 3;
}

export type ProposalStatus = 'DRAFT' | 'APPROVED' | 'CHANGED' | 'REJECTED' | 'UNASSIGNED';

export interface DecisionTraceItem {
  stage: string;
  offer_id?: string;
  result: 'ELIGIBLE_AND_RESERVED' | 'FULL' | 'INELIGIBLE_SCORE' | 'INELIGIBLE_SUBJECT' | 'SKIPPED' | 'AI_FALLBACK_SELECTED';
  detail: string;
}

export interface PlacementProposal {
  student_id: string;
  offer_id: string | null;
  status: ProposalStatus;
  preference_rank: number | null; // 1, 2, 3 or null if unassigned/fallback
  is_fallback: boolean;
  reason_codes: string[];
  fit_score: number | null; // 0-100 (never probability)
  model_version: string;
  rule_version: string;
  revision: number;
  trace: DecisionTraceItem[];
  reviewer?: string;
  decision_reason?: string;
  updated_at: string;
}

export interface PlacementRun {
  run_id: string;
  cohort_id: string;
  status: 'READY' | 'GENERATED' | 'UNDER_REVIEW' | 'COMPLETED' | 'STALE';
  mode: 'AI_ASSISTED' | 'RULES_ONLY';
  input_version: number;
  rule_version: string;
  model_version: string;
  runtime_ms: number;
  created_at: string;
  metrics: DashboardMetrics;
}

export interface DashboardMetrics {
  total_applicants: number;
  assigned_count: number;
  unassigned_count: number;
  approved_count: number;
  placement_rate: number; // %
  top_three_rate: number; // %
  first_choice_rate: number; // %
  unassigned_rate: number; // %
  seat_utilization: number; // %
  total_capacity: number;
  active_reservations: number;
  violations_count: number;
  runtime_ms: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: 'GENERATE' | 'APPROVE' | 'CHANGE' | 'REJECT' | 'RESET' | 'SEED';
  student_id?: string;
  old_offer_id?: string | null;
  new_offer_id?: string | null;
  reason: string;
  run_id?: string;
  revision?: number;
}

export interface ModelStatus {
  loaded: boolean;
  version: string;
  model_type: string;
  hash: string;
  feature_schema: string[];
  training_provenance: string;
  held_out_mae: number;
  baseline_mae: number;
  features_description: string;
}

export interface DemoRules {
  rule_version: string;
  score_scale: string;
  score_direction: 'higher_better';
  priority: 'overall_desc_then_student_id_asc';
  allow_unlisted_fallback: boolean;
  allocation: 'serial_priority';
}

export interface AlternativeOfferOption {
  offer: Offer;
  is_eligible: boolean;
  has_capacity: boolean;
  fit_score: number;
  eligibility_reason: string;
}
