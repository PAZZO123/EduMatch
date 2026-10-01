import React, { useState, useEffect } from 'react';
import {
  Download,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileSpreadsheet,
  ShieldCheck,
  History,
  UserCheck,
  XCircle,
  Clock,
  ExternalLink
} from 'lucide-react';
import { api } from '../services/api';
import { authService, isAdminRole, canReviewRole } from '../services/auth';
import { AuditEvent } from '../types';

interface ReviewExportScreenProps {
  activeRunId: string | null;
  onResetCohort: () => void;
}

export const ReviewExportScreen: React.FC<ReviewExportScreenProps> = ({
  activeRunId,
  onResetCohort
}) => {
  const [proposals, setProposals] = useState<any[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const role = authService.getCurrentUser()?.role;
  const isAdmin = isAdminRole(role);
  const canReview = canReviewRole(role);

  const loadReviewData = async () => {
    setLoading(true);
    try {
      let targetRunId = activeRunId;
      if (!targetRunId) {
        const sum = await api.getCohortSummary();
        targetRunId = sum.active_run_id;
      }

      if (targetRunId) {
        const [propsRes, auditRes] = await Promise.all([
          api.getProposals(targetRunId),
          api.getAuditTrail()
        ]);
        setProposals(propsRes.results);
        setAuditTrail(auditRes.audit_trail);
      } else {
        const auditRes = await api.getAuditTrail();
        setAuditTrail(auditRes.audit_trail);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReviewData();
  }, [activeRunId]);

  const handleBulkApprove = async () => {
    if (!activeRunId) return;
    setBulkLoading(true);
    setFeedback(null);
    try {
      const res = await api.bulkApprove(activeRunId);
      setFeedback({
        type: 'success',
        text: `Bulk approved ${res.bulk_approved_count} valid draft proposals. Total approved: ${res.total_approved}.`
      });
      await loadReviewData();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Bulk approval failed' });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleConfirmReset = async () => {
    setResetModalOpen(false);
    try {
      const res = await api.resetCohort();
      setProposals([]);
      onResetCohort();
      await loadReviewData();
      setFeedback({
        type: 'success',
        text: `Cohort ${res.cohort_id} restored to its original ${res.counts.students} students and ${res.counts.offers} offers. Runs and approvals were cleared; the audit history is kept.`
      });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Reset failed' });
    }
  };

  const approvedList = proposals.filter(p => p.proposal.status === 'APPROVED' && p.proposal.offer_id);
  const draftList = proposals.filter(p => (p.proposal.status === 'DRAFT' || p.proposal.status === 'CHANGED') && p.proposal.offer_id);
  const exceptionList = proposals.filter(p => !p.proposal.offer_id || p.proposal.status === 'UNASSIGNED' || p.proposal.status === 'REJECTED');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
            <span>Governance & Compliance</span>
            <span aria-hidden="true">·</span>
            <span>Approval Authority</span>
            <span aria-hidden="true">·</span>
            <span>Audit Trail</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Review, Approvals & Official Export
          </h1>
        </div>

        {/* Top Action Buttons (FR-18: reset is administrator-only) */}
        {isAdmin && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setResetModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset cohort (admin)</span>
          </button>
        </div>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg border text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Review Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Approved Placements</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-700 mt-2 tabular-nums">
            {approvedList.length} students
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Ready for official export</div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Pending Draft Approvals</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-700 mt-2 tabular-nums">
            {draftList.length} students
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Require human verification</div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Exception Queue</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-700 mt-2 tabular-nums">
            {exceptionList.length} students
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Unassigned or rejected cases</div>
        </div>
      </div>

      {/* Bulk Approval & Export Action Bar */}
      <div className="bg-white border border-[#E2E8F0] text-[#172554] rounded-[8px] p-6 shadow-xs flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-[#2563EB] mb-1 font-bold">
            Human-in-the-Loop Gate · FR-11 & FR-15
          </div>
          <h2 className="text-lg font-bold text-[#172554]">
            Formal Approval & CSV Export Center
          </h2>
          <p className="text-xs text-[#475569] mt-1 max-w-xl">
            In compliance with FR-15, only approved decisions appear in the final placement export. Draft proposals are strictly excluded from final published files.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canReview && draftList.length > 0 && activeRunId && (
            <button
              onClick={handleBulkApprove}
              disabled={bulkLoading}
              className="px-4 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-[6px] text-xs font-semibold shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              <UserCheck className="w-4 h-4" />
              <span>{bulkLoading ? 'Verifying...' : `Bulk Approve Valid Drafts (${draftList.length})`}</span>
            </button>
          )}

          {activeRunId && (
            <>
              <a
                href={api.getExportUrl(activeRunId)}
                download="edumatch_approved_placements.csv"
                className={`px-4 py-2.5 rounded-[6px] text-xs font-semibold shadow-xs transition-colors flex items-center gap-2 ${
                  approvedList.length > 0
                    ? 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed pointer-events-none'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>Export Approved CSV ({approvedList.length})</span>
              </a>

              <a
                href={api.getExceptionsExportUrl(activeRunId)}
                download="edumatch_unassigned_exceptions.csv"
                className="px-4 py-2.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] rounded-[6px] text-xs font-semibold border border-[#DBEAFE] transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                <span>Export Exceptions ({exceptionList.length})</span>
              </a>
            </>
          )}
        </div>
      </div>

      {/* Persistent Audit History (FR-16: Actor, Action, Old/New Offer, Reason, Timestamp, Run ID) */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm space-y-4 p-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 mb-1">
              <History className="w-4 h-4" />
              <span>Complete System Audit Log (FR-16)</span>
            </div>
            <h2 className="text-base font-bold text-slate-900">
              Immutable Decision History & Invariant Ledger
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {auditTrail.length} recorded events
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Target Student</th>
                <th className="py-3 px-4">Offer Mutation</th>
                <th className="py-3 px-4">Official Reason / Justification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {auditTrail.map(event => (
                <tr key={event.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                    {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>

                  <td className="py-3 px-4 font-medium text-slate-800">
                    {event.actor}
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={`text-[11px] font-bold font-mono ${
                        event.action === 'APPROVE'
                          ? 'text-emerald-700'
                          : event.action === 'CHANGE'
                          ? 'text-indigo-700'
                          : event.action === 'REJECT'
                          ? 'text-rose-700'
                          : event.action === 'SEED'
                          ? 'text-amber-700'
                          : 'text-slate-700'
                      }`}
                    >
                      {event.action}
                    </span>
                  </td>

                  <td className="py-3 px-4 font-mono font-medium text-slate-900">
                    {event.student_id || '—'}
                  </td>

                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                    {event.old_offer_id && event.new_offer_id ? (
                      <span>
                        {event.old_offer_id} → <strong>{event.new_offer_id}</strong>
                      </span>
                    ) : event.new_offer_id ? (
                      <strong>{event.new_offer_id}</strong>
                    ) : event.old_offer_id ? (
                      <span className="text-rose-600">Released {event.old_offer_id}</span>
                    ) : (
                      '—'
                    )}
                  </td>

                  <td className="py-3 px-4 text-slate-700 text-xs max-w-xs">
                    {event.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Administrator Reset Confirmation Modal (FR-18) */}
      {resetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div>
              <div className="text-xs font-mono font-bold text-rose-600 uppercase mb-1">
                Administrator Action · FR-18
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Confirm Demonstration Reset
              </h2>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                This restores the current cohort's originally loaded inputs and deletes every run, draft and approval for it. The audit history is kept. Only administrators can do this.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={() => setResetModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReset}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Confirm Reset Demonstration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
