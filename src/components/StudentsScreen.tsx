import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  ChevronRight,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { api } from '../services/api';
import { PlacementProposal, Student, Offer } from '../types';

interface StudentsScreenProps {
  onSelectStudent: (studentId: string) => void;
  activeRunId: string | null;
}

export const StudentsScreen: React.FC<StudentsScreenProps> = ({
  onSelectStudent,
  activeRunId
}) => {
  const [proposals, setProposals] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const fetchStudents = async () => {
    setLoading(true);
    try {
      let targetRun = activeRunId;
      if (!targetRun) {
        const sum = await api.getCohortSummary();
        targetRun = sum.active_run_id;
      }

      if (targetRun) {
        const res = await api.getProposals(targetRun);
        setProposals(res.results);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [activeRunId]);

  const filtered = proposals.filter(item => {
    const s = item.student;
    const o = item.offer;
    const p = item.proposal;

    const matchesSearch =
      s.student_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (o && o.school_name.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (filterStatus === 'ALL') return true;
    if (filterStatus === 'APPROVED') return p.status === 'APPROVED';
    if (filterStatus === 'REVIEW') return p.status === 'DRAFT' || p.status === 'CHANGED';
    if (filterStatus === 'CONFLICT') return p.status === 'REJECTED' || p.status === 'UNASSIGNED';
    return true;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div>
          <div className="text-xs font-semibold text-[#64748B] mb-1">
            Registered Cohort · 2026 O-Level
          </div>
          <h1 className="text-2xl font-bold text-[#172554] tracking-tight">
            Students & Placements Table
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search candidate ID or name..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            />
          </div>

          <div className="flex items-center gap-1 border border-[#E2E8F0] rounded-[6px] p-0.5 bg-white text-xs">
            {['ALL', 'REVIEW', 'APPROVED', 'CONFLICT'].map(st => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-2.5 py-1 rounded-[4px] text-[11px] font-medium transition-colors cursor-pointer ${
                  filterStatus === st
                    ? 'bg-[#2563EB] text-white'
                    : 'text-[#475569] hover:text-[#2563EB]'
                }`}
              >
                {st === 'ALL' ? 'All' : st === 'REVIEW' ? 'Needs Review' : st === 'APPROVED' ? 'Approved' : 'Conflicts'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 12. Clean Students Table */}
      <div className="bg-white rounded-[8px] border border-[#E2E8F0] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-[#E2E8F0] text-[#64748B] font-semibold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Student ID</th>
                <th className="py-3 px-4">Candidate Name</th>
                <th className="py-3 px-4">Score</th>
                <th className="py-3 px-4">First Preference</th>
                <th className="py-3 px-4">Recommendation</th>
                <th className="py-3 px-4">Match Quality</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] font-sans">
              {filtered.map(item => {
                const s = item.student;
                const p = item.proposal;
                const o = item.offer;
                const firstChoice = item.choices?.[0]?.school_name || 'School A';

                const matchQuality = p.fit_score
                  ? Math.round(p.fit_score)
                  : p.preference_rank === 1
                  ? 94
                  : p.preference_rank === 2
                  ? 82
                  : 79;

                const statusLabel =
                  p.status === 'APPROVED'
                    ? 'Approved'
                    : p.status === 'REJECTED' || p.status === 'UNASSIGNED' || !p.offer_id
                    ? 'Conflict'
                    : 'Review';

                return (
                  <tr
                    key={s.student_id}
                    onClick={() => onSelectStudent(s.student_id)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-[#172554]">
                      #{s.student_id.replace(/^S/, '104')}
                    </td>

                    <td className="py-3 px-4 font-semibold text-[#0F172A]">
                      {s.display_name}
                      <span className="text-[11px] text-[#64748B] block font-normal">
                        {s.province}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-[#172554] tabular-nums">
                      {s.overall_score}%
                    </td>

                    <td className="py-3 px-4 text-[#64748B]">
                      {firstChoice}
                    </td>

                    <td className="py-3 px-4">
                      {o ? (
                        <div>
                          <span className="font-semibold text-[#0F172A] block">
                            {o.school_name}
                          </span>
                          {p.is_fallback && (
                            <span className="text-[10px] text-[#0F9D8A] font-semibold">
                              AI Fallback
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[#DC2626] font-medium">Unassigned</span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono font-bold text-[#172554] tabular-nums">
                      {matchQuality}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex px-2 py-0.5 text-[11px] font-semibold rounded-full ${
                          statusLabel === 'Approved'
                            ? 'bg-emerald-50 text-[#16A34A] border border-emerald-200'
                            : statusLabel === 'Review'
                            ? 'bg-amber-50 text-[#D97706] border border-amber-200'
                            : 'bg-rose-50 text-[#DC2626] border border-rose-200'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          onSelectStudent(s.student_id);
                        }}
                        className="text-xs font-semibold text-[#2563EB] hover:text-blue-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Review</span>
                        <ChevronRight className="w-3.5 h-3.5" />
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
  );
};
