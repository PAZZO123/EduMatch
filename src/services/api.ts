import {
  Student,
  Offer,
  Preference,
  PlacementProposal,
  PlacementRun,
  AuditEvent,
  ModelStatus,
  AlternativeOfferOption
} from '../types';

let customBaseUrl = '';

export function setCustomApiBaseUrl(url: string) {
  customBaseUrl = url.trim().replace(/\/+$/, '');
  if (customBaseUrl) {
    localStorage.setItem('edumatch_api_base', customBaseUrl);
  } else {
    localStorage.removeItem('edumatch_api_base');
  }
}

export function getApiBaseUrl(): string {
  if (customBaseUrl) return customBaseUrl;
  const saved = localStorage.getItem('edumatch_api_base');
  return saved || '/api';
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const url = `${base}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    }
  });

  if (!res.ok) {
    let errorData: any = {};
    try {
      errorData = await res.json();
    } catch {
      errorData = { message: res.statusText };
    }
    const err: any = new Error(errorData.message || `API request failed with status ${res.status}`);
    err.status = res.status;
    err.code = errorData.code;
    err.details = errorData;
    throw err;
  }

  return res.json();
}

export const api = {
  async checkHealth() {
    return request<{ status: string; system: string; version: string }>('/health');
  },

  async login(username: string, password: string) {
    return request<{ success: boolean; user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  async getMe() {
    return request<{ user: any }>('/auth/me');
  },

  async logout() {
    return request<{ success: boolean }>('/auth/logout', { method: 'POST' });
  },

  async getModelStatus() {
    return request<ModelStatus & { status: string; runtime_notes: string }>('/model/status');
  },

  async getCohortSummary(cohortId: string = 'COHORT-RW-2026-SYNTH') {
    return request<{
      cohort_id: string;
      source_label: string;
      is_synthetic: boolean;
      input_version: number;
      rules_version: string;
      student_count: number;
      offer_count: number;
      preference_count: number;
      active_run_id: string | null;
      active_run_status: string | null;
    }>(`/cohorts/${cohortId}/summary`);
  },

  async getOffers() {
    return request<{
      cohort_id: string;
      input_version: number;
      offers: (Offer & { remaining_seats: number })[];
    }>('/offers');
  },

  async patchOffer(offerId: string, updates: { capacity?: number; min_overall?: number }) {
    return request<{ success: boolean; updated_offer: Offer; input_version: number }>(
      `/offers/${offerId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates)
      }
    );
  },

  async seedDemo(fixture: '200_standard' | '6_fixture' | '500_stress', reset: boolean = true, customS3Fallback?: boolean) {
    return request<{
      success: boolean;
      cohort_id: string;
      student_count: number;
      offer_count: number;
      input_version: number;
      fixture_loaded: string;
    }>('/demo/seed', {
      method: 'POST',
      body: JSON.stringify({ fixture, reset, custom_s3_fallback: customS3Fallback })
    });
  },

  async runPlacement(mode: 'AI_ASSISTED' | 'RULES_ONLY' = 'AI_ASSISTED') {
    return request<{
      success: boolean;
      run_id: string;
      metrics: any;
      runtime_ms: number;
      status: string;
      proposals_count: number;
    }>('/runs', {
      method: 'POST',
      body: JSON.stringify({ mode })
    });
  },

  async getProposals(
    runId: string,
    filters?: { status?: string; offer_id?: string; search?: string; unassigned_only?: boolean }
  ) {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.offer_id) params.append('offer_id', filters.offer_id);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.unassigned_only) params.append('unassigned_only', 'true');

    const qs = params.toString();
    return request<{
      run_id: string;
      total_count: number;
      metrics: any;
      results: {
        proposal: PlacementProposal;
        student: Student;
        offer: Offer | null;
        choices: { rank: number; offer_id: string; school_name: string; min_overall?: number; capacity?: number }[];
      }[];
    }>(`/runs/${runId}/proposals${qs ? `?${qs}` : ''}`);
  },

  async getAlternatives(studentId: string) {
    return request<{
      student_id: string;
      student_name: string;
      overall_score: number;
      alternatives: AlternativeOfferOption[];
    }>(`/proposals/${studentId}/alternatives`);
  },

  async submitDecision(
    studentId: string,
    action: 'APPROVE' | 'CHANGE' | 'REJECT',
    payload?: { offer_id?: string; reason?: string; expected_revision?: number }
  ) {
    return request<{ success: boolean; proposal: PlacementProposal }>(
      `/proposals/${studentId}/decision`,
      {
        method: 'POST',
        body: JSON.stringify({
          action,
          offer_id: payload?.offer_id,
          reason: payload?.reason,
          expected_revision: payload?.expected_revision
        })
      }
    );
  },

  async bulkApprove(runId: string) {
    return request<{ success: boolean; bulk_approved_count: number; total_approved: number }>(
      `/runs/${runId}/bulk-approve`,
      { method: 'POST' }
    );
  },

  async getAuditTrail() {
    return request<{ audit_trail: AuditEvent[] }>('/audit-trail');
  },

  getExportUrl(runId: string) {
    return `${getApiBaseUrl()}/runs/${runId}/export.csv`;
  },

  getExceptionsExportUrl(runId: string) {
    return `${getApiBaseUrl()}/runs/${runId}/exceptions.csv`;
  }
};
