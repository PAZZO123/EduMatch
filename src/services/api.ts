/**
 * EduMatch AI — client for the FastAPI backend (backend/, see docs/API.md).
 *
 * The screens were written against an earlier in-browser mock. This module keeps the same
 * function names and return shapes, but every call now goes to the real backend: the trained
 * model, persistent SQLite storage, server-side eligibility/capacity checks and the audit trail.
 * Mapping between backend responses and the UI types lives here, so components stay unchanged.
 */
import {
  Student,
  Offer,
  PlacementProposal,
  AuditEvent,
  ModelStatus,
  AlternativeOfferOption,
  DashboardMetrics,
  DecisionTraceItem
} from '../types';

// ---------------------------------------------------------------------------------------------
// Transport: same-origin cookie session + CSRF header on every mutation
// ---------------------------------------------------------------------------------------------
let customBaseUrl = '';

export function setCustomApiBaseUrl(url: string) {
  customBaseUrl = url.trim().replace(/\/+$/, '');
  try {
    if (customBaseUrl && customBaseUrl !== '/api') localStorage.setItem('edumatch_api_base', customBaseUrl);
    else localStorage.removeItem('edumatch_api_base');
  } catch {
    /* storage unavailable */
  }
}

export function getApiBaseUrl(): string {
  if (customBaseUrl) return customBaseUrl;
  try {
    return localStorage.getItem('edumatch_api_base') || '/api';
  } catch {
    return '/api';
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
}

function readCsrfCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)edumatch_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details: any;
  constructor(status: number, body: any) {
    super(body?.message || `API request failed with status ${status}`);
    this.status = status;
    this.code = body?.code;
    this.details = body; // components read err.details?.message
  }
}

/** Fired when the backend says the session is gone; App listens and returns to the login screen. */
export const UNAUTHORIZED_EVENT = 'edumatch:unauthorized';

async function request<T>(endpoint: string, options: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...init } = options;
  const method = (init.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (json !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const token = csrfToken || readCsrfCookie();
    if (token) headers['X-CSRF-Token'] = token;
  }
  const res = await fetch(`${getApiBaseUrl()}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
    body: json !== undefined ? JSON.stringify(json) : init.body
  });
  if (!res.ok) {
    let body: any = {};
    try {
      body = await res.json();
    } catch {
      body = { message: res.statusText };
    }
    // Session endpoints report their own 401s; signalling them would make the handler's logout call itself forever.
    if (res.status === 401 && !/^\/auth\/(login|logout|me)\b/.test(endpoint)) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new ApiError(res.status, body);
  }
  return res.json();
}

export const http = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, json?: unknown) => request<T>(url, { method: 'POST', json: json ?? {} }),
  patch: <T>(url: string, json: unknown) => request<T>(url, { method: 'PATCH', json })
};

// ---------------------------------------------------------------------------------------------
// Backend response shapes (the subset used here)
// ---------------------------------------------------------------------------------------------
interface BeSummary {
  cohort_id: string;
  source_label: string;
  synthetic: boolean;
  input_version: number;
  rule_version: string;
  rules: Record<string, any>;
  checksum: string;
  validation_status: string;
  has_approvals: boolean;
  counts: { students: number; offers: number; preferences: number; total_seats: number };
  active_run_id: string | null;
  active_run_status: string | null;
}
interface BeOffer {
  offer_id: string;
  school_name: string;
  province: string;
  stage_programme: string;
  capacity: number;
  min_overall: number;
  subject_min_math: number | null;
  subject_min_science: number | null;
  subject_min_language: number | null;
  weights: { math: number; science: number; language: number };
  proposed_count: number;
  approved_count: number;
  reserved_count: number;
  remaining_seats: number;
  status: string;
}
interface BeProposal {
  proposal_id: string;
  run_id: string;
  student_id: string;
  offer_id: string | null;
  school_name: string | null;
  status: PlacementProposal['status'];
  priority_position: number;
  preference_rank: number | null;
  fallback_used: boolean;
  fit_score: number | null;
  reason_code: string;
  reason_codes: string[];
  revision: number;
  reviewer: string | null;
  reviewed_at: string | null;
  decision_reason: string | null;
  reason_text?: string;
  suggested_action?: string | null;
  override_preference?: boolean;
  override_eligibility?: boolean;
  trace?: any[];
}
interface BeRun {
  run_id: string;
  status: string;
  revision: number;
  mode: 'AI' | 'RULES_ONLY';
  input_version: number;
  rule_version: string;
  model_version: string | null;
  runtime_ms: number;
  created_at: string;
}
interface BeLiveMetrics {
  status: string;
  mode: string;
  model_version: string | null;
  runtime_ms: number;
  metrics: {
    valid_applicants: number;
    available_seats: number;
    draft: {
      assigned: number;
      placement_rate: number | null;
      top_three_rate: number | null;
      first_choice_rate: number | null;
      fallback_assigned: number;
    };
    approved: { assigned: number };
    unassigned: number;
    unassigned_rate: number | null;
    utilization: number | null;
  };
  violations: { total_violations: number };
}

/** A school that still has free seats, for an officer assigning an unplaced student. */
export interface OpenOffer {
  offer_id: string;
  school_name: string;
  province: string;
  listed_rank: number | null;
  eligible: boolean;
  failures: { rule: string; required: number; actual: number }[];
  min_overall: number;
  exceptions_needed: ('OUTSIDE_CHOICES' | 'BELOW_ENTRY_REQUIREMENTS')[];
  shortfall: number;
  fit_score: number | null;
  seats_available: number;
}

export interface HistoryEntry {
  id: number;
  run_id: string;
  cohort_id: string;
  cohort_source: string;
  run_created_at: string;
  run_created_by: string;
  archived_at: string;
  archived_reason: 'COMPLETED' | 'SUPERSEDED' | 'COHORT_RESET' | 'COHORT_REPLACED' | 'COHORT_DELETED';
  run_status: string;
  mode: string;
  model_version: string | null;
  rule_version: string;
  runtime_ms: number;
  students: number;
  placed: number;
  approved: number;
  unplaced: number;
  first_choice_rate: number | null;
  top_three_rate: number | null;
  ai_fallback: number;
  violations: number;
  officer_exceptions: number;
}

export interface HistoryResult {
  student_id: string;
  display_name: string;
  province: string | null;
  overall_score: number | null;
  offer_id: string | null;
  school_name: string | null;
  status: string;
  preference_rank: number | null;
  fallback_used: boolean;
  fit_score: number | null;
  officer_exception: string;
  reason_text: string;
  suggested_action: string | null;
  reviewer: string | null;
  decision_reason: string | null;
}

/** Files for POST /cohorts/import. Choices come from `preferences`, or from choice_1..3 columns of `students`. */
export interface ImportFiles {
  students: File;
  offers: File;
  preferences?: File | null;
  rules?: File | null;
}

export interface ImportPreview {
  valid: boolean;
  persisted: false;
  cohort_id: string;
  counts: { students: number; offers: number; preferences: number; total_seats: number };
  provinces: string[];
  zero_capacity_offers: string[];
  fallback_opt_in: number;
  rules: Record<string, any>;
  rule_version: string;
  cohort_exists: boolean;
  cohort_has_approvals: boolean;
}

function importForm(files: ImportFiles): FormData {
  const form = new FormData();
  form.append('students', files.students);
  form.append('offers', files.offers);
  if (files.preferences) form.append('preferences', files.preferences);
  if (files.rules) form.append('rules', files.rules);
  return form;
}

// ---------------------------------------------------------------------------------------------
// Session caches (current cohort, runs, proposals) so screens can keep addressing students by ID
// ---------------------------------------------------------------------------------------------
let currentCohortId: string | null = null;
const proposalByStudent = new Map<string, BeProposal>();
const runCache = new Map<string, BeRun>();
const COHORT_KEY = 'edumatch_cohort';

/** Remember the cohort the user is working on so a page reload reopens it. */
function selectCohortId(id: string | null) {
  currentCohortId = id;
  proposalByStudent.clear();
  try {
    if (id) localStorage.setItem(COHORT_KEY, id);
    else localStorage.removeItem(COHORT_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function resolveCohortId(requested?: string): Promise<string | null> {
  if (requested) return (currentCohortId = requested);
  if (currentCohortId) return currentCohortId;
  const { cohorts } = await http.get<{ cohorts: BeSummary[] }>('/cohorts');
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(COHORT_KEY);
  } catch {
    /* storage unavailable */
  }
  // The remembered cohort if it still exists, otherwise the most recently loaded one.
  currentCohortId = cohorts.find(c => c.cohort_id === remembered)?.cohort_id ?? cohorts[0]?.cohort_id ?? null;
  return currentCohortId;
}

async function getRun(runId: string, fresh = false): Promise<BeRun> {
  if (!fresh && runCache.has(runId)) return runCache.get(runId)!;
  const run = await http.get<BeRun>(`/runs/${runId}`);
  runCache.set(runId, run);
  return run;
}

const pct = (rate: number | null | undefined) => (rate == null ? 0 : Math.round(rate * 1000) / 10);

function toOffer(o: BeOffer): Offer & { remaining_seats: number } {
  return {
    offer_id: o.offer_id,
    school_name: o.school_name,
    province: o.province,
    stage_programme: o.stage_programme,
    capacity: o.capacity,
    min_overall: o.min_overall,
    subject_min_math: o.subject_min_math ?? undefined,
    subject_min_science: o.subject_min_science ?? undefined,
    subject_min_language: o.subject_min_language ?? undefined,
    weight_math: o.weights.math,
    weight_science: o.weights.science,
    weight_language: o.weights.language,
    reserved_count: o.reserved_count,
    approved_count: o.approved_count,
    remaining_seats: o.remaining_seats
  };
}

function toMetrics(m: BeLiveMetrics): DashboardMetrics {
  const x = m.metrics;
  return {
    total_applicants: x.valid_applicants,
    assigned_count: x.draft.assigned,
    unassigned_count: x.unassigned,
    approved_count: x.approved.assigned,
    placement_rate: pct(x.draft.placement_rate),
    top_three_rate: pct(x.draft.top_three_rate),
    first_choice_rate: pct(x.draft.first_choice_rate),
    unassigned_rate: pct(x.unassigned_rate),
    seat_utilization: pct(x.utilization),
    total_capacity: x.available_seats,
    active_reservations: x.draft.assigned,
    violations_count: m.violations.total_violations,
    runtime_ms: m.runtime_ms,
    fallback_count: x.draft.fallback_assigned,
    mode: m.mode,
    model_version: m.model_version
  };
}

const RULE_LABEL: Record<string, string> = {
  min_overall: 'overall score',
  subject_min_math: 'maths score',
  subject_min_science: 'science score',
  subject_min_language: 'language score'
};

function toTrace(steps: any[] = []): DecisionTraceItem[] {
  return steps.map((step): DecisionTraceItem => {
    if (step.kind === 'FALLBACK') {
      return step.outcome === 'SELECTED'
        ? {
            stage: 'AI fallback',
            offer_id: step.offer_id,
            result: 'AI_FALLBACK_SELECTED',
            detail: `Local model ranked ${step.candidates_considered} eligible unlisted offer(s); best compatibility ${Number(step.fit_score).toFixed(1)}/100.`
          }
        : { stage: 'AI fallback', result: 'SKIPPED', detail: 'No eligible unlisted offer had a free seat.' };
    }
    const stage = `Choice ${step.rank}`;
    if (step.outcome === 'INELIGIBLE') {
      const onlyOverall = step.failures.every((f: any) => f.rule === 'min_overall');
      return {
        stage,
        offer_id: step.offer_id,
        result: onlyOverall ? 'INELIGIBLE_SCORE' : 'INELIGIBLE_SUBJECT',
        detail: step.failures
          .map((f: any) => `${RULE_LABEL[f.rule] || f.rule} ${f.actual} below required ${f.required}`)
          .join('; ')
      };
    }
    if (step.outcome === 'CAPACITY_FULL') {
      return {
        stage,
        offer_id: step.offer_id,
        result: 'FULL',
        detail: `All ${step.capacity} seat(s) already reserved by higher-priority students.`
      };
    }
    return {
      stage,
      offer_id: step.offer_id,
      result: 'ELIGIBLE_AND_RESERVED',
      detail: `Eligible with ${step.seats_left_before} of ${step.capacity} seat(s) free — proposed.`
    };
  });
}

function toProposal(p: BeProposal, run: BeRun): PlacementProposal & { proposal_id: string } {
  return {
    proposal_id: p.proposal_id,
    student_id: p.student_id,
    offer_id: p.offer_id,
    status: p.status,
    preference_rank: p.preference_rank,
    is_fallback: p.fallback_used,
    reason_codes: p.reason_codes,
    fit_score: p.fit_score,
    model_version: run.model_version || 'RULES_ONLY',
    rule_version: run.rule_version,
    revision: p.revision,
    trace: toTrace(p.trace),
    reviewer: p.reviewer || undefined,
    decision_reason: p.decision_reason || undefined,
    reason_text: p.reason_text,
    suggested_action: p.suggested_action || undefined,
    override_preference: !!p.override_preference,
    override_eligibility: !!p.override_eligibility,
    updated_at: p.reviewed_at || run.created_at
  };
}

async function fetchAll<T>(path: string, key: string, pageSize: number): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await http.get<any>(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    out.push(...page[key]);
    if (out.length >= page.total || page[key].length === 0) return out;
  }
}

async function proposalFor(studentId: string): Promise<BeProposal> {
  const cached = proposalByStudent.get(studentId);
  if (cached) return cached;
  const cohortId = await resolveCohortId();
  const sum = await http.get<BeSummary>(`/cohorts/${encodeURIComponent(cohortId!)}/summary`);
  if (!sum.active_run_id) throw new ApiError(404, { code: 'RUN_NOT_FOUND', message: 'No active placement run.' });
  const res = await http.get<{ proposals: BeProposal[] }>(
    `/runs/${sum.active_run_id}/proposals?student_id=${encodeURIComponent(studentId)}&limit=50`
  );
  const match = res.proposals.find(p => p.student_id === studentId);
  if (!match) throw new ApiError(404, { code: 'PROPOSAL_NOT_FOUND', message: `No proposal for ${studentId}.` });
  proposalByStudent.set(studentId, match);
  return match;
}

const FIXTURES: Record<string, string> = {
  '200_standard': 'demo_200',
  '500_stress': 'stress_500',
  '6_fixture': 'six_student_base'
};

const AUDIT_ACTION: Record<string, AuditEvent['action']> = {
  RUN_GENERATED: 'GENERATE',
  PROPOSAL_APPROVED: 'APPROVE',
  BULK_APPROVED: 'APPROVE',
  PROPOSAL_CHANGED: 'CHANGE',
  PROPOSAL_REJECTED: 'REJECT',
  COHORT_RESET: 'RESET',
  COHORT_LOADED: 'SEED'
};

function describeAudit(e: any): string {
  if (e.reason) return e.reason;
  const d = e.details || {};
  switch (e.action) {
    case 'RUN_GENERATED':
      return `Generated ${d.mode} run: ${d.assigned} assigned, ${d.unassigned} unassigned in ${d.runtime_ms} ms (model ${d.model_version || 'none'}).`;
    case 'COHORT_LOADED':
      return `Loaded ${d.students} students and ${d.offers} offers from ${d.source}.`;
    case 'COHORT_RESET':
      return `Reset cohort; discarded ${d.discarded_runs} run(s) and ${d.discarded_approvals} approval(s).`;
    case 'OFFER_EDITED':
      return `Edited offer ${d.offer_id}; input version now ${d.input_version}.`;
    case 'MODEL_ACTIVATED':
      return `Active model changed from ${d.previous} to ${d.current}.`;
    case 'EXPORTED':
      return `Exported ${d.rows} approved row(s).`;
    default:
      return String(e.action).replace(/_/g, ' ').toLowerCase();
  }
}

// ---------------------------------------------------------------------------------------------
// Public API used by the screens (signatures unchanged from the mock)
// ---------------------------------------------------------------------------------------------
export const api = {
  async checkHealth() {
    const h = await http.get<{ status: string; ai: string }>('/health');
    return { status: h.status, system: `EduMatch AI (${h.ai})`, version: 'v1.0' };
  },

  async login(username: string, password: string) {
    const res = await http.post<{ user: any; csrf_token: string }>('/auth/login', { username, password });
    setCsrfToken(res.csrf_token);
    return { success: true, user: res.user };
  },

  async getMe() {
    const res = await http.get<{ user: any; csrf_token: string }>('/auth/me');
    setCsrfToken(res.csrf_token);
    return { user: res.user };
  },

  async logout() {
    try {
      await http.post('/auth/logout');
    } finally {
      setCsrfToken(null);
      currentCohortId = null; // keep the remembered cohort for the next sign-in
      proposalByStudent.clear();
      runCache.clear();
    }
    return { success: true };
  },

  async getModelStatus() {
    const s = await http.get<any>('/model/status');
    const status: ModelStatus & { status: string; runtime_notes: string; raw: any } = {
      loaded: s.loaded,
      version: s.model_version || 'none',
      model_type: s.loaded ? `${s.display_name} (${s.algorithm}, scikit-learn)` : 'AI unavailable',
      hash: s.sha256 || '',
      feature_schema: s.feature_schema,
      training_provenance: s.loaded
        ? `${s.training_source}: ${s.train_students_used?.toLocaleString()} students, ${s.train_pairs_used?.toLocaleString()} pairs, seed ${s.fixed_seed}`
        : '',
      held_out_mae: s.metrics?.validation?.mae ?? 0,
      baseline_mae: s.metrics?.validation?.baseline_mae ?? 0,
      features_description: `Synthetic target: ${s.target_formula}. ${s.selection_rule || ''}`,
      status: s.loaded ? 'OPERATIONAL' : 'AI_UNAVAILABLE',
      runtime_notes: 'Scores are compatibility rankings (0-100) for eligible unlisted fallbacks. Not admission probability.',
      raw: s
    };
    return status;
  },

  async getCohortSummary(cohortId?: string) {
    const id = await resolveCohortId(cohortId);
    if (!id) {
      return {
        cohort_id: '',
        source_label: 'No cohort loaded',
        is_synthetic: true,
        input_version: 0,
        rules_version: '',
        rules: {} as Record<string, any>,
        checksum: '',
        has_approvals: false,
        student_count: 0,
        offer_count: 0,
        preference_count: 0,
        total_seats: 0,
        active_run_id: null as string | null,
        active_run_status: null as string | null
      };
    }
    const s = await http.get<BeSummary>(`/cohorts/${encodeURIComponent(id)}/summary`);
    return {
      cohort_id: s.cohort_id,
      source_label: s.source_label,
      is_synthetic: s.synthetic,
      input_version: s.input_version,
      rules_version: s.rule_version,
      rules: s.rules || {},
      checksum: s.checksum,
      has_approvals: s.has_approvals,
      student_count: s.counts.students,
      offer_count: s.counts.offers,
      preference_count: s.counts.preferences,
      total_seats: s.counts.total_seats,
      active_run_id: s.active_run_id,
      active_run_status: s.active_run_status
    };
  },

  /** Every cohort in the database (newest first) and which one this browser is working on. */
  async listCohorts() {
    const current = await resolveCohortId();
    const { cohorts } = await http.get<{ cohorts: BeSummary[] }>('/cohorts');
    return { current, cohorts };
  },

  selectCohort(cohortId: string) {
    selectCohortId(cohortId);
  },

  /** Administrator: permanently remove a cohort and its runs. The audit log keeps its history. */
  async deleteCohort(cohortId: string) {
    const res = await http.post<{ deleted: string; students: number; runs: number; approvals: number }>(
      `/cohorts/${encodeURIComponent(cohortId)}/delete`,
      { confirm: true }
    );
    if (currentCohortId === cohortId) selectCohortId(null);
    runCache.clear();
    return res;
  },

  /** FR-03: multipart CSV import; a 422 carries row-level errors in err.details.details.errors. */
  async importCohort(files: ImportFiles, replace = false) {
    const s = await request<BeSummary>(`/cohorts/import?replace=${replace}`, { method: 'POST', body: importForm(files) });
    selectCohortId(s.cohort_id);
    return s;
  },

  /** Validate an upload on the backend without saving anything (dry run): real counts, or row-level errors. */
  previewImport: (files: ImportFiles) =>
    request<ImportPreview>('/cohorts/import?dry_run=true', { method: 'POST', body: importForm(files) }),

  /** FR-05: toggle the demo fallback rule; marks draft runs stale. */
  async patchRules(changes: { allow_unlisted_fallback?: boolean }) {
    const id = await resolveCohortId();
    const sum = await http.get<BeSummary>(`/cohorts/${encodeURIComponent(id!)}/summary`);
    return http.patch<{ input_version: number; rules: Record<string, any> }>(`/cohorts/${encodeURIComponent(id!)}/rules`, {
      expected_input_version: sum.input_version,
      ...changes
    });
  },

  /** Per-offer demand from the students' ranked choices, and how the active run filled each offer. */
  async getOfferDemand() {
    const cohortId = await resolveCohortId();
    type Demand = { rank1: number; rank2: number; rank3: number; placed_listed: number; placed_fallback: number };
    const demand = new Map<string, Demand>();
    if (!cohortId) return demand;
    const get = (id: string) => {
      if (!demand.has(id)) demand.set(id, { rank1: 0, rank2: 0, rank3: 0, placed_listed: 0, placed_fallback: 0 });
      return demand.get(id)!;
    };
    const sum = await http.get<BeSummary>(`/cohorts/${encodeURIComponent(cohortId)}/summary`);
    const [students, proposals] = await Promise.all([
      fetchAll<any>(`/cohorts/${encodeURIComponent(cohortId)}/students`, 'students', 500),
      sum.active_run_id ? fetchAll<BeProposal>(`/runs/${sum.active_run_id}/proposals`, 'proposals', 1000) : Promise.resolve([])
    ]);
    for (const s of students) {
      for (const c of s.choices || []) {
        const d = get(c.offer_id);
        if (c.rank === 1) d.rank1++;
        else if (c.rank === 2) d.rank2++;
        else d.rank3++;
      }
    }
    for (const p of proposals) {
      if (!p.offer_id || p.status === 'REJECTED' || p.status === 'UNASSIGNED') continue;
      if (p.fallback_used) get(p.offer_id).placed_fallback++;
      else get(p.offer_id).placed_listed++;
    }
    return demand;
  },

  /** SRS §20 AT-01..AT-08, executed by the backend against an isolated temporary database. */
  runAcceptanceGate: () => http.post<any>('/acceptance/run'),

  async getOffers() {
    const id = await resolveCohortId();
    if (!id) return { cohort_id: '', input_version: 0, offers: [] as (Offer & { remaining_seats: number })[] };
    const res = await http.get<{ cohort_id: string; input_version: number; offers: BeOffer[] }>(
      `/offers?cohort_id=${encodeURIComponent(id)}`
    );
    return { cohort_id: res.cohort_id, input_version: res.input_version, offers: res.offers.map(toOffer) };
  },

  async patchOffer(offerId: string, updates: { capacity?: number; min_overall?: number }) {
    const id = await resolveCohortId();
    const sum = await http.get<BeSummary>(`/cohorts/${encodeURIComponent(id!)}/summary`);
    const res = await http.patch<{ input_version: number; offer: BeOffer }>(
      `/offers/${encodeURIComponent(offerId)}?cohort_id=${encodeURIComponent(id!)}`,
      { expected_input_version: sum.input_version, ...updates }
    );
    return { success: true, updated_offer: toOffer(res.offer), input_version: res.input_version };
  },

  async seedDemo(fixture: '200_standard' | '6_fixture' | '500_stress', reset: boolean = true, customS3Fallback?: boolean) {
    let name = FIXTURES[fixture] || 'demo_200';
    if (fixture === '6_fixture' && customS3Fallback !== undefined) {
      name = customS3Fallback ? 'six_student_fallback_on' : 'six_student_fallback_off';
    }
    const s = await http.post<BeSummary>('/demo/seed', { fixture: name, reset });
    selectCohortId(s.cohort_id);
    return {
      success: true,
      cohort_id: s.cohort_id,
      student_count: s.counts.students,
      offer_count: s.counts.offers,
      input_version: s.input_version,
      fixture_loaded: s.source_label
    };
  },

  async runPlacement(mode: 'AI_ASSISTED' | 'RULES_ONLY' = 'AI_ASSISTED') {
    const id = await resolveCohortId();
    if (!id) throw new ApiError(422, { code: 'NO_COHORT', message: 'Load a cohort before running placement.' });
    const sum = await http.get<BeSummary>(`/cohorts/${encodeURIComponent(id)}/summary`);
    const run = await http.post<BeRun>('/runs', {
      cohort_id: id,
      expected_input_version: sum.input_version,
      mode: mode === 'RULES_ONLY' ? 'RULES_ONLY' : 'AI'
    });
    runCache.set(run.run_id, run);
    proposalByStudent.clear();
    const live = await http.get<BeLiveMetrics>(`/runs/${run.run_id}/metrics`);
    return {
      success: true,
      run_id: run.run_id,
      metrics: toMetrics(live),
      runtime_ms: run.runtime_ms,
      status: run.status,
      proposals_count: live.metrics.valid_applicants
    };
  },

  async getProposals(
    runId: string,
    filters?: { status?: string; offer_id?: string; search?: string; unassigned_only?: boolean }
  ) {
    const cohortId = await resolveCohortId();
    const qs = new URLSearchParams();
    if (filters?.unassigned_only) qs.set('status', 'UNASSIGNED,REJECTED');
    else if (filters?.status) qs.set('status', filters.status);
    if (filters?.offer_id) qs.set('offer_id', filters.offer_id);
    const query = qs.toString();
    const [run, proposals, students, offersRes, live] = await Promise.all([
      getRun(runId, true),
      fetchAll<BeProposal>(`/runs/${runId}/proposals${query ? `?${query}` : ''}`, 'proposals', 1000),
      fetchAll<any>(`/cohorts/${encodeURIComponent(cohortId!)}/students`, 'students', 500),
      api.getOffers(),
      http.get<BeLiveMetrics>(`/runs/${runId}/metrics`)
    ]);
    const studentMap = new Map(students.map(s => [s.student_id, s]));
    const offerMap = new Map(offersRes.offers.map(o => [o.offer_id, o]));
    let results = proposals.map(p => {
      proposalByStudent.set(p.student_id, p);
      const s = studentMap.get(p.student_id);
      const student: Student = {
        student_id: p.student_id,
        display_name: s?.display_name ?? p.student_id,
        cohort_id: cohortId!,
        province: s?.province ?? '',
        overall_score: s?.overall_score ?? 0,
        math_score: s?.math_score ?? 0,
        science_score: s?.science_score ?? 0,
        language_score: s?.language_score ?? 0,
        allow_fallback: !!s?.allow_fallback
      };
      return {
        proposal: toProposal(p, run),
        student,
        offer: p.offer_id ? offerMap.get(p.offer_id) || null : null,
        choices: (s?.choices || []).map((c: any) => {
          const o = offerMap.get(c.offer_id);
          return {
            rank: c.rank,
            offer_id: c.offer_id,
            school_name: o?.school_name || c.offer_id,
            min_overall: o?.min_overall,
            capacity: o?.capacity
          };
        })
      };
    });
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      results = results.filter(
        r =>
          r.student.student_id.toLowerCase().includes(q) ||
          r.student.display_name.toLowerCase().includes(q) ||
          (r.offer?.school_name || '').toLowerCase().includes(q)
      );
    }
    return { run_id: runId, total_count: results.length, metrics: toMetrics(live), results };
  },

  /** Full backend detail for one student: explanation lines, trace, exact score breakdown, history. */
  async getProposalDetail(studentId: string) {
    const p = await proposalFor(studentId);
    return http.get<any>(`/proposals/${p.proposal_id}`);
  },

  async getAlternatives(studentId: string) {
    const p = await proposalFor(studentId);
    const [res, offersRes, detail] = await Promise.all([
      http.get<any>(`/proposals/${p.proposal_id}/alternatives`),
      api.getOffers(),
      http.get<any>(`/proposals/${p.proposal_id}`)
    ]);
    const offerMap = new Map(offersRes.offers.map(o => [o.offer_id, o]));
    const alternatives: AlternativeOfferOption[] = res.alternatives
      .filter((a: any) => offerMap.has(a.offer_id))
      .map((a: any) => ({
        offer: offerMap.get(a.offer_id)!,
        is_eligible: true,
        has_capacity: a.seats_available > 0,
        fit_score: a.fit_score ?? 0,
        has_score: a.fit_score != null,
        listed_rank: a.listed_rank,
        eligibility_reason: a.listed_rank
          ? `Listed choice ${a.listed_rank} · ${a.seats_available} seat(s) free`
          : `Unlisted — student opted into AI fallback · ${a.seats_available} seat(s) free`
      }));
    return {
      student_id: studentId,
      student_name: detail.student?.display_name ?? studentId,
      overall_score: detail.student?.overall_score ?? 0,
      alternatives
    };
  },

  async submitDecision(
    studentId: string,
    action: 'APPROVE' | 'CHANGE' | 'REJECT' | 'ASSIGN',
    payload?: { offer_id?: string; reason?: string; expected_revision?: number; allow_below_cutoff?: boolean }
  ) {
    const p = await proposalFor(studentId);
    try {
      const res = await http.post<BeProposal>(`/proposals/${p.proposal_id}/decision`, {
        action: action.toLowerCase(),
        expected_revision: payload?.expected_revision ?? p.revision,
        offer_id: payload?.offer_id,
        reason: payload?.reason,
        ...(action === 'ASSIGN' ? { allow_below_cutoff: !!payload?.allow_below_cutoff } : {})
      });
      const merged: BeProposal = { ...p, ...res };
      proposalByStudent.set(studentId, merged);
      const run = await getRun(res.run_id);
      return { success: true, proposal: toProposal(merged, run) };
    } catch (err) {
      proposalByStudent.delete(studentId); // stale cache: the next call refetches the revision
      throw err;
    }
  },

  /** Every school with a free seat for an officer assignment, with the exceptions each would need. */
  async getOpenOffers(studentId: string) {
    const p = await proposalFor(studentId);
    return http.get<{ student_id: string; overall_score: number; allow_fallback: boolean; options: OpenOffer[] }>(
      `/proposals/${p.proposal_id}/open-offers`
    );
  },

  listHistory: (cohortId?: string) =>
    http.get<{ history: HistoryEntry[] }>(`/history${cohortId ? `?cohort_id=${encodeURIComponent(cohortId)}` : ''}`),
  getHistory: (id: number) => http.get<HistoryEntry & { metrics: any; results: HistoryResult[] }>(`/history/${id}`),
  getHistoryExportUrl: (id: number) => `${getApiBaseUrl()}/history/${id}/export.csv`,

  async bulkApprove(runId: string) {
    const run = await getRun(runId, true);
    const res = await http.post<{ approved: number; run_revision: number }>(`/runs/${runId}/bulk-approve`, {
      expected_run_revision: run.revision
    });
    proposalByStudent.clear();
    const live = await http.get<BeLiveMetrics>(`/runs/${runId}/metrics`);
    return { success: true, bulk_approved_count: res.approved, total_approved: live.metrics.approved.assigned };
  },

  async getAuditTrail() {
    const cohortId = await resolveCohortId();
    const res = await http.get<{ events: any[] }>(
      `/audit?limit=200${cohortId ? `&cohort_id=${encodeURIComponent(cohortId)}` : ''}`
    );
    const audit_trail: AuditEvent[] = res.events.map(e => ({
      id: `AUD-${e.id}`,
      timestamp: e.at,
      actor: e.actor,
      action: AUDIT_ACTION[e.action] || (e.action as AuditEvent['action']),
      student_id: e.student_id || undefined,
      old_offer_id: e.old_offer_id,
      new_offer_id: e.new_offer_id,
      reason: describeAudit(e),
      run_id: e.run_id || undefined,
      revision: e.details?.revision
    }));
    return { audit_trail };
  },

  // Backend capabilities the mock never had — available to any screen that wants them.
  getModelRegistry: () => http.get<any>('/model/registry'),
  getModelComparison: () => http.get<any>('/model/comparison'),
  setActiveModel: (modelKey: string) => http.post<any>('/model/active', { model_key: modelKey }),
  async simulate(body: { mode?: 'AI' | 'RULES_ONLY'; model_key?: string; capacity_overrides?: Record<string, number> } = {}) {
    const id = await resolveCohortId();
    return http.post<any>(`/cohorts/${encodeURIComponent(id!)}/simulate`, body);
  },
  async resetCohort() {
    const id = await resolveCohortId();
    proposalByStudent.clear();
    return http.post<any>(`/cohorts/${encodeURIComponent(id!)}/reset`, { confirm: true });
  },

  getExportUrl(runId: string) {
    return `${getApiBaseUrl()}/runs/${runId}/export.csv`;
  },

  getExceptionsExportUrl(runId: string) {
    return `${getApiBaseUrl()}/runs/${runId}/exceptions.csv`;
  }
};
