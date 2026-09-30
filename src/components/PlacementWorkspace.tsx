import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  CheckCircle,
  Clock,
  Sparkles,
  ArrowRight,
  AlertCircle,
  HelpCircle,
  Check,
  RotateCcw,
  Sliders,
  ChevronRight,
  UserCheck,
  ShieldCheck,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { api } from '../services/api';
import { PlacementProposal, Student, Offer, DashboardMetrics } from '../types';

interface PlacementWorkspaceProps {
  activeRunId: string | null;
  onSelectReview: () => void;
  onRequestRun: () => void;
}

export const PlacementWorkspace: React.FC<PlacementWorkspaceProps> = ({
  activeRunId,
  onSelectReview,
  onRequestRun
}) => {
  const [proposals, setProposals] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);

  // Decision Modal state inside workspace
  const [decisionModalOpen, setDecisionModalOpen] = useState(false);
  const [decisionAction, setDecisionAction] = useState<'APPROVE' | 'CHANGE' | 'REJECT'>('APPROVE');
  const [overrideOfferId, setOverrideOfferId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [alternatives, setAlternatives] = useState<any[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchProposals = async () => {
    setLoading(true);
    try {
      // If no active run ID passed, check cohort summary
      let targetRunId = activeRunId;
      if (!targetRunId) {
        const sum = await api.getCohortSummary();
        targetRunId = sum.active_run_id;
      }

      if (targetRunId) {
        const res = await api.getProposals(targetRunId);
        setProposals(res.results);
        setMetrics(res.metrics);
        // keep selected student updated if open
        if (selectedStudent) {
          const updated = res.results.find(r => r.student.student_id === selectedStudent.student.student_id);
          if (updated) setSelectedStudent(updated);
        }
      } else {
        setProposals([]);
        setMetrics(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, [activeRunId]);

  const handleOpenDecision = async (item: any, action: 'APPROVE' | 'CHANGE' | 'REJECT') => {
    setSelectedStudent(item);
    setDecisionAction(action);
    setOverrideReason('');
    setActionError(null);
    setDecisionModalOpen(true);

    if (action === 'CHANGE') {
      try {
        const altRes = await api.getAlternatives(item.student.student_id);
        setAlternatives(altRes.alternatives);
        const firstEligible = altRes.alternatives.find(a => a.is_eligible && a.has_capacity);
        if (firstEligible) {
          setOverrideOfferId(firstEligible.offer.offer_id);
        }
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleExecuteDecision = async () => {
    if (!selectedStudent) return;
    setActionError(null);
    setActionLoading(true);

    try {
      await api.submitDecision(selectedStudent.student.student_id, decisionAction, {
        offer_id: decisionAction === 'CHANGE' ? overrideOfferId : undefined,
        reason: overrideReason,
        expected_revision: selectedStudent.proposal.revision
      });
      setDecisionModalOpen(false);
      await fetchProposals();
    } catch (err: any) {
      setActionError(err.details?.message || err.message || 'Operation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredProposals = proposals.filter(item => {
    const s = item.student;
    const p = item.proposal;
    const o = item.offer;

    const matchesSearch =
      s.student_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o && o.school_name.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'UNASSIGNED') {
      return p.status === 'UNASSIGNED' || p.status === 'REJECTED' || !p.offer_id;
    }
    return p.status === statusFilter;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Page Title & Quick Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
            <span>Placement Workspace</span>
            <span aria-hidden="true">·</span>
            <span>Deterministic Serial Priority</span>
            <span aria-hidden="true">·</span>
            <span className="text-indigo-600 font-semibold">Active Plan</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Placement Proposals & Decision Queue
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchProposals}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            title="Refresh Proposals"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onSelectReview}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Review & Export Screen →</span>
          </button>
        </div>
      </div>

      {/* Metrics Banner (SRS Section 19: Placement rate, top-three rate, first-choice rate, unassigned rate, utilization, runtime) */}
      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="p-3.5 bg-white rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Placement Rate</span>
            <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {metrics.placement_rate}%
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
              {metrics.assigned_count}/{metrics.total_applicants}
            </span>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 block">First-Choice Rate</span>
            <span className="text-xl font-bold font-mono text-indigo-600 tabular-nums">
              {metrics.first_choice_rate}%
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
              Rank-1 choices
            </span>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Top-Three Rate</span>
            <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {metrics.top_three_rate}%
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
              Rank 1–3 listed
            </span>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Unassigned Rate</span>
            <span className="text-xl font-bold font-mono text-rose-600 tabular-nums">
              {metrics.unassigned_rate}%
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
              {metrics.unassigned_count} students
            </span>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Seat Utilization</span>
            <span className="text-xl font-bold font-mono text-slate-900 tabular-nums">
              {metrics.seat_utilization}%
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
              {metrics.active_reservations}/{metrics.total_capacity} seats
            </span>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Invariants Check</span>
            <span className="text-xl font-bold font-mono text-emerald-600 tabular-nums">
              {metrics.violations_count} Errors
            </span>
            <span className="text-[10px] text-emerald-700 block mt-0.5 font-sans">
              100% compliant
            </span>
          </div>

          <div className="p-3.5 bg-white rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Measured Runtime</span>
            <span className="text-xl font-bold font-mono text-indigo-700 tabular-nums">
              {metrics.runtime_ms} ms
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5 font-sans">
              SRS target &le;10s
            </span>
          </div>
        </div>
      )}

      {/* Empty State when no run has been executed */}
      {proposals.length === 0 && !loading && (
        <div className="p-12 bg-white rounded-xl border border-dashed border-slate-300 text-center max-w-lg mx-auto space-y-4">
          <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              No Active Allocation Proposals
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              To evaluate students and view proposals, execute an allocation run on the current cohort snapshot.
            </p>
          </div>
          <button
            onClick={onRequestRun}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            Go to Data & Run Engine
          </button>
        </div>
      )}

      {/* Main Workspace Layout: Filter Bar + Data Grid + Detail Drawer */}
      {proposals.length > 0 && (
        <div className="space-y-4">
          {/* Filter Bar & Search */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-3.5 rounded-xl border border-slate-200">
            {/* Status Segmented Buttons */}
            <div className="flex flex-wrap items-center gap-1">
              {[
                { id: 'ALL', label: 'All Applicants' },
                { id: 'DRAFT', label: 'Draft Proposals' },
                { id: 'APPROVED', label: 'Approved' },
                { id: 'CHANGED', label: 'Changed' },
                { id: 'UNASSIGNED', label: 'Exceptions / Unassigned' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === tab.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search student ID, name, school..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Master-Detail Split Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Proposals Table */}
            <div className={`space-y-4 transition-all ${selectedStudent ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-3 px-4">Applicant</th>
                        <th className="py-3 px-4">Score</th>
                        <th className="py-3 px-4">Proposed Offer</th>
                        <th className="py-3 px-4">Rank / Fallback</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 font-sans">
                      {filteredProposals.map(item => {
                        const s: Student = item.student;
                        const p: PlacementProposal = item.proposal;
                        const o: Offer | null = item.offer;
                        const isSelected = selectedStudent?.student.student_id === s.student_id;

                        return (
                          <tr
                            key={s.student_id}
                            onClick={() => setSelectedStudent(item)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-indigo-50/70' : 'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">
                                {s.display_name}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500">
                                {s.student_id} · {s.province}
                              </div>
                            </td>

                            <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                              {s.overall_score}/100
                            </td>

                            <td className="py-3 px-4">
                              {o ? (
                                <div>
                                  <span className="font-semibold text-slate-900 block truncate max-w-[200px]">
                                    {o.school_name}
                                  </span>
                                  <span className="text-[11px] text-slate-500 block truncate max-w-[200px]">
                                    {o.stage_programme}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-rose-600 font-medium">
                                  No feasible offer
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              {p.is_fallback ? (
                                <div>
                                  <span className="text-indigo-700 font-semibold block text-[11px]">
                                    AI Fallback Fit: {p.fit_score}/100
                                  </span>
                                  <span className="text-slate-400 text-[10px]">
                                    Unlisted alternative
                                  </span>
                                </div>
                              ) : p.preference_rank ? (
                                <span className="font-medium text-slate-800">
                                  Rank #{p.preference_rank} Choice
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-[11px]">
                                  {p.reason_codes[0] || 'UNASSIGNED'}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4">
                              <span
                                className={`text-[11px] font-bold ${
                                  p.status === 'APPROVED'
                                    ? 'text-emerald-700'
                                    : p.status === 'CHANGED'
                                    ? 'text-amber-700'
                                    : p.status === 'REJECTED'
                                    ? 'text-rose-700'
                                    : p.status === 'UNASSIGNED'
                                    ? 'text-slate-500'
                                    : 'text-indigo-700'
                                }`}
                              >
                                {p.status === 'DRAFT' ? 'Draft Proposal' : p.status}
                              </span>
                            </td>

                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setSelectedStudent(item);
                                }}
                                className="p-1.5 hover:bg-slate-200/60 rounded text-slate-500 hover:text-slate-900 transition-colors"
                                title="Inspect facts and trace"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Student Detail Panel (SRS Section 6 & 9) */}
            {selectedStudent && (
              <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-6 space-y-6 shadow-sm sticky top-20">
                <div className="flex items-start justify-between border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mb-1">
                      <span>{selectedStudent.student.student_id}</span>
                      <span aria-hidden="true">·</span>
                      <span>Revision #{selectedStudent.proposal.revision}</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {selectedStudent.student.display_name}
                    </h3>
                  </div>

                  <button
                    onClick={() => setSelectedStudent(null)}
                    className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700"
                  >
                    ✕
                  </button>
                </div>

                {/* Academic Scorecard */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Examination Academic Profile
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Overall</span>
                      <span className="text-base font-bold font-mono text-slate-900 tabular-nums">
                        {selectedStudent.student.overall_score}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Math</span>
                      <span className="text-base font-bold font-mono text-slate-900 tabular-nums">
                        {selectedStudent.student.math_score}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Science</span>
                      <span className="text-base font-bold font-mono text-slate-900 tabular-nums">
                        {selectedStudent.student.science_score}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Language</span>
                      <span className="text-base font-bold font-mono text-slate-900 tabular-nums">
                        {selectedStudent.student.language_score}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Preferences Inspection */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Ranked Preference Choices
                  </div>
                  <div className="space-y-2 text-xs">
                    {selectedStudent.choices.map((c: any) => (
                      <div
                        key={c.rank}
                        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-semibold text-slate-900">
                            Rank {c.rank}: {c.school_name}
                          </span>
                          <span className="text-[11px] text-slate-500 block font-mono">
                            Min: {c.min_overall} · Capacity: {c.capacity}
                          </span>
                        </div>
                        {selectedStudent.proposal.offer_id === c.offer_id ? (
                          <span className="text-[11px] font-bold text-emerald-700">
                            Assigned
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            Considered
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Decision Trace Facts (FR-09: Explain decisions) */}
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Deterministic Decision Trace (FR-09)
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    {selectedStudent.proposal.trace.map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-[11px] space-y-1"
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-slate-800">{item.stage}</span>
                          <span
                            className={
                              item.result === 'ELIGIBLE_AND_RESERVED' || item.result === 'AI_FALLBACK_SELECTED'
                                ? 'text-emerald-700'
                                : 'text-slate-500'
                            }
                          >
                            {item.result}
                          </span>
                        </div>
                        <div className="text-slate-600 font-sans">{item.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Officer Action Buttons (FR-11, FR-12, FR-13) */}
                <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleOpenDecision(selectedStudent, 'APPROVE')}
                    disabled={!selectedStudent.proposal.offer_id || selectedStudent.proposal.status === 'APPROVED'}
                    className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg shadow-sm transition-colors cursor-pointer"
                  >
                    Approve Proposal
                  </button>

                  <button
                    onClick={() => handleOpenDecision(selectedStudent, 'CHANGE')}
                    className="py-2 px-3 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                  >
                    Controlled Change
                  </button>

                  <button
                    onClick={() => handleOpenDecision(selectedStudent, 'REJECT')}
                    disabled={selectedStudent.proposal.status === 'REJECTED'}
                    className="py-2 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                  >
                    Reject to Exception
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Decision Action Modal (Approve, Change, Reject) */}
      {decisionModalOpen && selectedStudent && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div>
              <div className="text-xs font-mono font-bold uppercase text-indigo-600 mb-1">
                Human Oversight Action · {decisionAction}
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                {decisionAction === 'APPROVE' && `Confirm Approval for ${selectedStudent.student.display_name}`}
                {decisionAction === 'CHANGE' && `Change School Offer for ${selectedStudent.student.display_name}`}
                {decisionAction === 'REJECT' && `Reject Proposal for ${selectedStudent.student.display_name}`}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {decisionAction === 'APPROVE' && 'Locks the placement in active plan after verifying capacity and uniqueness.'}
                {decisionAction === 'CHANGE' && 'Select an alternative school offer. Invariants check prevents over-capacity or ineligible assignments.'}
                {decisionAction === 'REJECT' && 'Releases the student\'s reserved seat back into the pool while retaining the exception record.'}
              </p>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Change Offer Selection */}
            {decisionAction === 'CHANGE' && (
              <div className="space-y-3 text-xs">
                <label className="block font-semibold text-slate-700">
                  Select Feasible Alternative Offer
                </label>
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {alternatives.map(alt => {
                    const isEligible = alt.is_eligible && alt.has_capacity;
                    return (
                      <div
                        key={alt.offer.offer_id}
                        onClick={() => isEligible && setOverrideOfferId(alt.offer.offer_id)}
                        className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                          overrideOfferId === alt.offer.offer_id
                            ? 'bg-indigo-50 border-l-4 border-indigo-600'
                            : isEligible
                            ? 'hover:bg-slate-50'
                            : 'opacity-50 cursor-not-allowed bg-slate-50/50'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-slate-900">
                            {alt.offer.school_name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {alt.offer.stage_programme} · Min: {alt.offer.min_overall}
                          </div>
                          {!isEligible && (
                            <div className="text-[10px] text-rose-600 font-mono mt-0.5">
                              {alt.eligibility_reason}
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-900 text-xs">
                            AI Fit: {alt.fit_score}/100
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mandatory Reason Input (FR-12 & FR-13) */}
            <div className="space-y-1.5 text-xs">
              <label className="block font-semibold text-slate-700">
                Officer Justification & Reason {decisionAction !== 'APPROVE' && <span className="text-rose-600">* (Mandatory)</span>}
              </label>
              <textarea
                rows={3}
                placeholder={
                  decisionAction === 'CHANGE'
                    ? 'State official policy justification for manual placement reassignment...'
                    : decisionAction === 'REJECT'
                    ? 'State reason for proposal rejection...'
                    : 'Optional approval notes...'
                }
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                onClick={() => setDecisionModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteDecision}
                disabled={actionLoading}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-lg shadow-sm transition-colors cursor-pointer ${
                  decisionAction === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : decisionAction === 'REJECT'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {actionLoading ? 'Saving...' : `Confirm ${decisionAction}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
