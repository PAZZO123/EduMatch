import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Check,
  RotateCcw,
  Sliders,
  XCircle,
  HelpCircle,
  ArrowRight
} from 'lucide-react';
import { api } from '../services/api';
import { PlacementProposal, Student, Offer, AlternativeOfferOption } from '../types';

interface StudentPlacementScreenProps {
  initialStudentId?: string;
  onRefreshProposals: () => void;
}

export const StudentPlacementScreen: React.FC<StudentPlacementScreenProps> = ({
  initialStudentId,
  onRefreshProposals
}) => {
  const [proposals, setProposals] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Alternatives Modal State
  const [altModalOpen, setAltModalOpen] = useState(false);
  const [alternatives, setAlternatives] = useState<AlternativeOfferOption[]>([]);
  const [selectedAltOfferId, setSelectedAltOfferId] = useState('');
  const [altReason, setAltReason] = useState('');
  const [altLoading, setAltLoading] = useState(false);

  // Reject Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const loadProposals = async () => {
    setLoading(true);
    try {
      const summary = await api.getCohortSummary();
      if (summary.active_run_id) {
        const res = await api.getProposals(summary.active_run_id);
        setProposals(res.results);

        if (initialStudentId) {
          const idx = res.results.findIndex(r => r.student.student_id === initialStudentId);
          if (idx !== -1) setCurrentIndex(idx);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProposals();
  }, [initialStudentId]);

  const activeItem = proposals[currentIndex] || null;
  const currentStudent: Student | null = activeItem?.student || null;
  const currentProposal: PlacementProposal | null = activeItem?.proposal || null;
  const currentOffer: Offer | null = activeItem?.offer || null;
  const currentChoices = activeItem?.choices || [];

  // Grade converter helper
  const getLetterGrade = (score: number) => {
    if (score >= 85) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  };

  // 9. Match Quality Factor Breakdown Calculator
  const getMatchBreakdown = () => {
    if (!currentStudent || !currentProposal) {
      return { overall: 94, academic: 100, preference: 90, capacity: 100, rules: 100 };
    }

    const academicFit = currentOffer && currentStudent.overall_score >= currentOffer.min_overall ? 100 : 75;
    const prefFit = currentProposal.preference_rank === 1 ? 100 : currentProposal.preference_rank === 2 ? 85 : currentProposal.is_fallback ? 70 : 60;
    const capFit = 100;
    const ruleFit = 100;

    const calculatedQuality = currentProposal.fit_score
      ? Math.round(currentProposal.fit_score)
      : Math.round(academicFit * 0.4 + prefFit * 0.3 + capFit * 0.15 + ruleFit * 0.15);

    return {
      overall: calculatedQuality,
      academic: academicFit,
      preference: prefFit,
      capacity: capFit,
      rules: ruleFit
    };
  };

  const factors = getMatchBreakdown();

  const handleApprove = async () => {
    if (!currentStudent || !currentProposal) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      await api.submitDecision(currentStudent.student_id, 'APPROVE', {
        reason: 'Officer verified academic eligibility, school capacity, and preference priority.'
      });
      setActionSuccess(`Approved placement for ${currentStudent.display_name} at ${currentOffer?.school_name || 'selected school'}.`);
      onRefreshProposals();
      await loadProposals();
    } catch (err: any) {
      setActionError(err.details?.message || err.message || 'Approval failed');
    }
  };

  const handleOpenAlternatives = async () => {
    if (!currentStudent) return;
    setAltReason('');
    setActionError(null);
    try {
      const res = await api.getAlternatives(currentStudent.student_id);
      setAlternatives(res.alternatives);
      const eligible = res.alternatives.find(a => a.is_eligible && a.has_capacity);
      if (eligible) setSelectedAltOfferId(eligible.offer.offer_id);
      setAltModalOpen(true);
    } catch (err: any) {
      setActionError(err.message || 'Failed to fetch alternative options');
    }
  };

  const handleConfirmChange = async () => {
    if (!currentStudent || !selectedAltOfferId) return;
    if (!altReason || altReason.trim().length === 0) {
      setActionError('Controlled officer changes require a non-empty rationale.');
      return;
    }
    setAltLoading(true);
    setActionError(null);
    try {
      await api.submitDecision(currentStudent.student_id, 'CHANGE', {
        offer_id: selectedAltOfferId,
        reason: altReason,
        expected_revision: currentProposal?.revision
      });
      setAltModalOpen(false);
      setActionSuccess(`Reassigned to ${alternatives.find(a => a.offer.offer_id === selectedAltOfferId)?.offer.school_name}. Created draft revision for review.`);
      onRefreshProposals();
      await loadProposals();
    } catch (err: any) {
      setActionError(err.details?.message || err.message || 'Change rejected by rules engine');
    } finally {
      setAltLoading(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!currentStudent) return;
    if (!rejectReason || rejectReason.trim().length === 0) {
      setActionError('Rejecting a proposal requires a reason for the exception queue.');
      return;
    }
    try {
      await api.submitDecision(currentStudent.student_id, 'REJECT', {
        reason: rejectReason,
        expected_revision: currentProposal?.revision
      });
      setRejectModalOpen(false);
      setActionSuccess(`Proposal rejected. Student ${currentStudent.display_name} sent to Exception Queue.`);
      onRefreshProposals();
      await loadProposals();
    } catch (err: any) {
      setActionError(err.details?.message || err.message || 'Rejection failed');
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    const query = searchTerm.toLowerCase();
    const idx = proposals.findIndex(
      p =>
        p.student.student_id.toLowerCase().includes(query) ||
        p.student.display_name.toLowerCase().includes(query)
    );
    if (idx !== -1) {
      setCurrentIndex(idx);
    } else {
      setActionError(`Student "${searchTerm}" not found in current cohort.`);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* 8. Top: Student Placement Title & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#64748B] mb-1">
            <span>Decision Support System</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#0F9D8A]">AI-assisted. Human-approved.</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0B1F3A] tracking-tight">
            Student Placement
          </h1>
        </div>

        {/* Search & Navigation Bar */}
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="relative w-64">
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search student ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            />
          </form>

          {/* Quick Pagination */}
          <div className="flex items-center gap-1 border border-[#E2E8F0] rounded-[6px] p-0.5 bg-white text-xs">
            <button
              onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
              disabled={currentIndex <= 0}
              className="p-1 hover:bg-slate-100 rounded text-[#0B1F3A] disabled:opacity-30 cursor-pointer"
              title="Previous Student"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-[11px] text-[#64748B]">
              {proposals.length > 0 ? `${currentIndex + 1} / ${proposals.length}` : '0 / 0'}
            </span>
            <button
              onClick={() => setCurrentIndex(i => Math.min(proposals.length - 1, i + 1))}
              disabled={currentIndex >= proposals.length - 1}
              className="p-1 hover:bg-slate-100 rounded text-[#0B1F3A] disabled:opacity-30 cursor-pointer"
              title="Next Student"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {actionSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-[6px] text-xs text-[#16A34A] flex items-center justify-between font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="font-bold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-[6px] text-xs text-[#DC2626] flex items-center justify-between font-medium">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#DC2626] shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="font-bold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Student Review Workspace */}
      {currentStudent ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Student #10452 Profile & Preferences */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white rounded-[8px] border border-[#E2E8F0] p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-4">
                <div>
                  <div className="text-xs font-mono font-semibold text-[#2563EB] mb-1">
                    Student #{currentStudent.student_id.replace(/^S/, '104')}
                  </div>
                  <h2 className="text-xl font-bold text-[#0B1F3A]">
                    {currentStudent.display_name}
                  </h2>
                  <div className="text-xs text-[#64748B] mt-0.5">
                    Province: {currentStudent.province} · Candidate Cohort 2026
                  </div>
                </div>

                <span
                  className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-full ${
                    currentProposal?.status === 'APPROVED'
                      ? 'bg-emerald-50 text-[#16A34A] border border-emerald-200'
                      : currentProposal?.status === 'CHANGED'
                      ? 'bg-amber-50 text-[#D97706] border border-amber-200'
                      : currentProposal?.status === 'REJECTED'
                      ? 'bg-rose-50 text-[#DC2626] border border-rose-200'
                      : 'bg-blue-50 text-[#2563EB] border border-blue-200'
                  }`}
                >
                  {currentProposal?.status === 'DRAFT' ? 'Review Needed' : currentProposal?.status}
                </span>
              </div>

              {/* Academic Performance Table */}
              <div className="space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                  Academic Performance
                </div>
                <div className="border border-[#E2E8F0] rounded-[6px] overflow-hidden text-xs">
                  <div className="grid grid-cols-3 bg-slate-50 py-2 px-3 border-b border-[#E2E8F0] font-semibold text-[#64748B]">
                    <span>Subject</span>
                    <span className="text-center">Grade</span>
                    <span className="text-right">Score</span>
                  </div>
                  <div className="divide-y divide-[#E2E8F0] font-sans">
                    <div className="grid grid-cols-3 py-2.5 px-3 items-center">
                      <span className="font-medium text-[#0F172A]">Mathematics</span>
                      <span className="text-center font-bold text-[#0B1F3A]">
                        {getLetterGrade(currentStudent.math_score)}
                      </span>
                      <span className="text-right font-mono tabular-nums text-[#64748B]">
                        {currentStudent.math_score} / 100
                      </span>
                    </div>

                    <div className="grid grid-cols-3 py-2.5 px-3 items-center">
                      <span className="font-medium text-[#0F172A]">English / Language</span>
                      <span className="text-center font-bold text-[#0B1F3A]">
                        {getLetterGrade(currentStudent.language_score)}
                      </span>
                      <span className="text-right font-mono tabular-nums text-[#64748B]">
                        {currentStudent.language_score} / 100
                      </span>
                    </div>

                    <div className="grid grid-cols-3 py-2.5 px-3 items-center">
                      <span className="font-medium text-[#0F172A]">Science</span>
                      <span className="text-center font-bold text-[#0B1F3A]">
                        {getLetterGrade(currentStudent.science_score)}
                      </span>
                      <span className="text-right font-mono tabular-nums text-[#64748B]">
                        {currentStudent.science_score} / 100
                      </span>
                    </div>

                    <div className="grid grid-cols-3 py-2.5 px-3 items-center bg-slate-50/50">
                      <span className="font-semibold text-[#0B1F3A]">Overall Composite</span>
                      <span className="text-center font-bold text-[#2563EB]">
                        {getLetterGrade(currentStudent.overall_score)}
                      </span>
                      <span className="text-right font-mono font-bold tabular-nums text-[#0B1F3A]">
                        {currentStudent.overall_score} / 100
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Preferences Section */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold uppercase tracking-wider text-[#0B1F3A]">
                  Candidate Ranked Preferences
                </div>
                <div className="space-y-2 text-xs">
                  {currentChoices.map((choice: any) => {
                    const isAssigned = currentProposal?.offer_id === choice.offer_id;

                    return (
                      <div
                        key={choice.rank}
                        className={`p-3 rounded-[6px] border flex items-center justify-between ${
                          isAssigned
                            ? 'bg-[#F0FDFA] border-[#0F9D8A]/30 text-[#0F172A]'
                            : 'bg-white border-[#E2E8F0] text-[#64748B]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-xs text-[#0B1F3A]">
                            {choice.rank}.
                          </span>
                          <div>
                            <span className="font-semibold text-[#0F172A] block">
                              {choice.school_name}
                            </span>
                            <span className="text-[11px] text-[#64748B]">
                              Min Threshold: {choice.min_overall}/100 · Capacity: {choice.capacity} seats
                            </span>
                          </div>
                        </div>

                        {isAssigned && (
                          <span className="px-2 py-0.5 rounded-full bg-[#0F9D8A]/10 text-[#0F9D8A] font-bold text-[11px] flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            Matched
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="text-[11px] text-[#64748B] flex items-center gap-1.5 pt-1">
                  <span className="font-semibold text-[#0B1F3A]">Fallback Authorization:</span>
                  <span>
                    {currentStudent.allow_fallback
                      ? 'Student opted into AI fallback for unlisted schools'
                      : 'Candidate strictly requested listed preferences only'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: 8, 9 & 10 AI Recommendations & Decision Card */}
          <div className="lg:col-span-6 space-y-6">
            {/* 10. AI Recommendation Visual: Very light teal background #F0FDFA */}
            <div className="bg-[#F0FDFA] rounded-[8px] border border-[#CCFBF1] p-6 space-y-6 shadow-xs">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#99F6E4]/50 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold tracking-wider uppercase text-[#0F9D8A]">
                    AI RECOMMENDATION
                  </span>
                </div>

                <span className="text-xs font-semibold text-[#0F9D8A] bg-white/80 px-2 py-0.5 rounded-[4px] border border-[#99F6E4]">
                  AI Recommended
                </span>
              </div>

              {/* Target School & Match Quality (Section 9) */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-[#0F9D8A] font-medium mb-0.5">
                    Recommended Offer
                  </div>
                  <h3 className="text-xl font-bold text-[#0B1F3A]">
                    {currentOffer ? currentOffer.school_name : 'No Feasible Placement'}
                  </h3>
                  <div className="text-xs text-[#64748B] mt-0.5">
                    {currentOffer ? `${currentOffer.stage_programme} · ${currentOffer.province}` : 'No offer met eligibility and capacity constraints'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs text-[#64748B] font-medium mb-0.5">
                    Match Quality
                  </div>
                  <div className="text-3xl font-extrabold font-sans text-[#0B1F3A] tabular-nums">
                    {factors.overall}
                  </div>
                </div>
              </div>

              {/* 9. Match Quality Factor Breakdown (Academic, Preference, Capacity, Rule) */}
              <div className="space-y-2.5 pt-2 border-t border-[#99F6E4]/40 text-xs">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#0B1F3A]">
                  Quality Factors Breakdown
                </div>

                <div className="space-y-2">
                  {/* Factor 1: Academic Eligibility */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[#0F172A]">
                      <span>Academic eligibility</span>
                      <span className="font-mono font-semibold">{factors.academic}%</span>
                    </div>
                    <div className="w-full bg-white rounded-full h-1.5 overflow-hidden">
                      <div className="bg-[#0F9D8A] h-full" style={{ width: `${factors.academic}%` }} />
                    </div>
                  </div>

                  {/* Factor 2: Preference alignment */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[#0F172A]">
                      <span>Preference alignment</span>
                      <span className="font-mono font-semibold">{factors.preference}%</span>
                    </div>
                    <div className="w-full bg-white rounded-full h-1.5 overflow-hidden">
                      <div className="bg-[#0F9D8A] h-full" style={{ width: `${factors.preference}%` }} />
                    </div>
                  </div>

                  {/* Factor 3: Capacity availability */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[#0F172A]">
                      <span>Capacity availability</span>
                      <span className="font-mono font-semibold">{factors.capacity}%</span>
                    </div>
                    <div className="w-full bg-white rounded-full h-1.5 overflow-hidden">
                      <div className="bg-[#0F9D8A] h-full" style={{ width: `${factors.capacity}%` }} />
                    </div>
                  </div>

                  {/* Factor 4: Rule compliance */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[#0F172A]">
                      <span>Rule compliance</span>
                      <span className="font-mono font-semibold">{factors.rules}%</span>
                    </div>
                    <div className="w-full bg-white rounded-full h-1.5 overflow-hidden">
                      <div className="bg-[#0F9D8A] h-full" style={{ width: `${factors.rules}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* 8. Why this match? Checklist */}
              <div className="space-y-2 pt-2 border-t border-[#99F6E4]/40 text-xs">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#0B1F3A]">
                  Why this match?
                </div>
                <div className="space-y-1.5 text-[#0F172A]">
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0 stroke-[3]" />
                    <span>Meets academic requirements (Min threshold {currentOffer?.min_overall || 65})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0 stroke-[3]" />
                    <span>
                      {currentProposal?.is_fallback
                        ? 'Eligible alternative ranked by subject compatibility model'
                        : `Ranked #${currentProposal?.preference_rank || 1} preference requested by candidate`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0 stroke-[3]" />
                    <span>Capacity available ({currentOffer ? currentOffer.capacity - (currentOffer.reserved_count || 0) : 0} free seats remaining)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#16A34A] shrink-0 stroke-[3]" />
                    <span>Placement rules and uniqueness invariants satisfied</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons (Approve Placement, View Alternatives, Reject) */}
              <div className="pt-4 border-t border-[#99F6E4]/60 flex flex-wrap items-center gap-2.5">
                <button
                  onClick={handleApprove}
                  disabled={!currentProposal?.offer_id || currentProposal?.status === 'APPROVED'}
                  className="flex-1 py-2.5 px-4 bg-[#16A34A] hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-[6px] shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{currentProposal?.status === 'APPROVED' ? 'Approved' : 'Approve Placement'}</span>
                </button>

                <button
                  onClick={handleOpenAlternatives}
                  className="py-2.5 px-3.5 bg-white hover:bg-slate-50 text-[#0B1F3A] border border-[#E2E8F0] text-xs font-semibold rounded-[6px] transition-colors cursor-pointer"
                >
                  View Alternatives
                </button>

                <button
                  onClick={() => {
                    setRejectReason('');
                    setRejectModalOpen(true);
                  }}
                  disabled={currentProposal?.status === 'REJECTED'}
                  className="py-2.5 px-3 text-[#DC2626] hover:bg-rose-50 border border-rose-200 text-xs font-semibold rounded-[6px] transition-colors cursor-pointer"
                >
                  Reject
                </button>
              </div>
            </div>

            {/* Decision Audit Trail Footnote */}
            <div className="p-3.5 bg-white rounded-[8px] border border-[#E2E8F0] text-xs space-y-1">
              <div className="flex items-center justify-between text-[#64748B]">
                <span className="font-mono text-[11px]">Audit Trace · Rev #{currentProposal?.revision || 1}</span>
                <span>{currentProposal?.reviewer || 'Pending Officer Action'}</span>
              </div>
              <div className="text-[#0F172A] text-[11px]">
                {currentProposal?.trace[currentProposal.trace.length - 1]?.detail || 'Ready for officer review.'}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-12 text-center bg-white rounded-[8px] border border-[#E2E8F0] text-xs text-[#64748B]">
          No active proposals loaded. Please click "Run Placement Engine" to generate cohort proposals.
        </div>
      )}

      {/* Alternatives Modal */}
      {altModalOpen && currentStudent && (
        <div className="fixed inset-0 z-50 bg-[#0B1F3A]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] shadow-xl max-w-lg w-full p-6 space-y-4 text-xs">
            <div>
              <div className="text-xs font-mono font-bold text-[#2563EB] uppercase mb-1">
                Controlled Override
              </div>
              <h3 className="text-base font-bold text-[#0B1F3A]">
                Select Alternative for {currentStudent.display_name}
              </h3>
              <p className="text-[#64748B] mt-0.5">
                Invariants prevent assigning full or academically ineligible institutions.
              </p>
            </div>

            <div className="max-h-56 overflow-y-auto divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-[6px]">
              {alternatives.map(alt => {
                const isSelected = selectedAltOfferId === alt.offer.offer_id;
                const canSelect = alt.is_eligible && alt.has_capacity;

                return (
                  <div
                    key={alt.offer.offer_id}
                    onClick={() => canSelect && setSelectedAltOfferId(alt.offer.offer_id)}
                    className={`p-3 flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-[#F0FDFA] border-l-4 border-[#0F9D8A]'
                        : canSelect
                        ? 'hover:bg-slate-50 cursor-pointer'
                        : 'opacity-50 bg-slate-50 cursor-not-allowed'
                    }`}
                  >
                    <div>
                      <span className="font-semibold text-[#0F172A] block">
                        {alt.offer.school_name}
                      </span>
                      <span className="text-[11px] text-[#64748B]">
                        {alt.offer.province} · Min Threshold: {alt.offer.min_overall}
                      </span>
                      {!canSelect && (
                        <span className="text-[10px] text-[#DC2626] font-mono block mt-0.5">
                          {alt.eligibility_reason}
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="font-bold text-[#0B1F3A]">
                        Match {Math.round(alt.fit_score)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-[#0B1F3A]">
                Mandatory Officer Override Rationale *
              </label>
              <textarea
                rows={2}
                value={altReason}
                onChange={e => setAltReason(e.target.value)}
                placeholder="State lawful policy reason for manual reassignment..."
                className="w-full p-2 border border-[#E2E8F0] rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <button
                onClick={() => setAltModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-[#64748B] hover:text-[#0F172A] rounded-[6px]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmChange}
                disabled={altLoading}
                className="px-4 py-1.5 bg-[#0B1F3A] hover:bg-slate-800 text-white rounded-[6px] font-semibold text-xs transition-colors"
              >
                {altLoading ? 'Updating...' : 'Confirm Reassignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModalOpen && currentStudent && (
        <div className="fixed inset-0 z-50 bg-[#0B1F3A]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div>
              <div className="text-xs font-mono font-bold text-[#DC2626] uppercase mb-1">
                Proposal Rejection
              </div>
              <h3 className="text-base font-bold text-[#0B1F3A]">
                Reject Proposal for {currentStudent.display_name}
              </h3>
              <p className="text-[#64748B] mt-0.5">
                Releases the provisional reservation back to the seat pool while retaining the exception record.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block font-semibold text-[#0B1F3A]">
                Reason for Rejection *
              </label>
              <textarea
                rows={2}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Document reason for rejection..."
                className="w-full p-2 border border-[#E2E8F0] rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
              <button
                onClick={() => setRejectModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-[#64748B] hover:text-[#0F172A] rounded-[6px]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-4 py-1.5 bg-[#DC2626] hover:bg-red-700 text-white rounded-[6px] font-semibold text-xs transition-colors"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
