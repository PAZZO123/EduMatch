import React, { useEffect, useState } from 'react';
import { ArrowLeft, Download, History, RefreshCw, Search } from 'lucide-react';
import { api, HistoryEntry, HistoryResult } from '../services/api';

const REASON_LABEL: Record<HistoryEntry['archived_reason'], { text: string; cls: string }> = {
  COMPLETED: { text: 'Completed (all decided)', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  SUPERSEDED: { text: 'Replaced by a newer run', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  COHORT_RESET: { text: 'Cohort was reset', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  COHORT_REPLACED: { text: 'Cohort re-imported', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  COHORT_DELETED: { text: 'Cohort deleted', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
};

const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

const STATUS_CLS: Record<string, string> = {
  APPROVED: 'bg-emerald-100 text-emerald-800',
  DRAFT: 'bg-blue-100 text-blue-800',
  CHANGED: 'bg-purple-100 text-purple-800',
  REJECTED: 'bg-rose-100 text-rose-800',
  UNASSIGNED: 'bg-amber-100 text-amber-800'
};

export const HistoryScreen: React.FC<{ onOpenPlacements: () => void }> = ({ onOpenPlacements }) => {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [current, setCurrent] = useState<{ cohort: string; runId: string; status: string | null } | null>(null);
  const [selected, setSelected] = useState<(HistoryEntry & { results: HistoryResult[] }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, sum] = await Promise.all([api.listHistory(), api.getCohortSummary()]);
      setEntries(h.history);
      setCurrent(sum.active_run_id ? { cohort: sum.cohort_id, runId: sum.active_run_id, status: sum.active_run_status } : null);
    } catch (err: any) {
      setError(err.message || 'Could not load the placement history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const open = async (id: number) => {
    setError(null);
    try {
      setSelected(await api.getHistory(id));
      setSearch('');
      setStatusFilter('ALL');
      window.scrollTo({ top: 0 });
    } catch (err: any) {
      setError(err.message || 'Could not load this placement.');
    }
  };

  // ---------------------------------------------------------------- detail view
  if (selected) {
    const rows = selected.results.filter(r => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [r.student_id, r.display_name, r.school_name || ''].some(v => v.toLowerCase().includes(q));
    });
    const label = REASON_LABEL[selected.archived_reason];
    return (
      <div className="p-8 max-w-7xl mx-auto space-y-6">
        <button onClick={() => setSelected(null)} className="text-xs font-semibold text-[#2563EB] hover:underline flex items-center gap-1 cursor-pointer">
          <ArrowLeft className="w-3.5 h-3.5" /> All previous placements
        </button>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E2E8F0] pb-5">
          <div>
            <div className="text-xs font-semibold text-[#64748B] mb-1">Placement run of {when(selected.run_created_at)}</div>
            <h1 className="text-2xl font-bold text-[#172554] tracking-tight">{selected.cohort_id}</h1>
            <div className="text-xs text-[#64748B] mt-1 flex flex-wrap items-center gap-2">
              <span>Run by {selected.run_created_by}</span>·
              <span>{selected.mode === 'AI' ? `AI model ${selected.model_version}` : 'Rules only'}</span>·
              <span>{selected.rule_version}</span>·
              <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${label.cls}`}>{label.text}</span>
            </div>
          </div>
          <a
            href={api.getHistoryExportUrl(selected.id)}
            className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-[6px] text-xs font-bold flex items-center gap-1.5 self-start md:self-auto"
          >
            <Download className="w-3.5 h-3.5" /> Download results (CSV)
          </a>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
          {[
            ['Students', selected.students, 'text-[#172554]'],
            ['Placed', selected.placed, 'text-emerald-700'],
            ['Approved', selected.approved, 'text-[#2563EB]'],
            ['Not placed', selected.unplaced, 'text-amber-600'],
            ['Got 1st choice', pct(selected.first_choice_rate), 'text-[#172554]'],
            ['Officer exceptions', selected.officer_exceptions, 'text-rose-600']
          ].map(([k, v, cls]) => (
            <div key={k as string} className="p-3 bg-white rounded border border-[#E2E8F0]">
              <div className="text-[10px] text-slate-500 font-semibold uppercase">{k}</div>
              <div className={`text-lg font-black mt-1 ${cls}`}>{v as any}</div>
            </div>
          ))}
        </div>

        <div className="p-3 bg-white rounded-[6px] border border-[#E2E8F0] flex flex-wrap items-center gap-2 text-xs">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search student or school..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-xs font-medium cursor-pointer"
          >
            <option value="ALL">Status: All</option>
            <option value="APPROVED">Approved</option>
            <option value="DRAFT">Draft (not decided)</option>
            <option value="CHANGED">Changed (awaiting approval)</option>
            <option value="UNASSIGNED">Not placed</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <span className="text-slate-500">{rows.length} of {selected.results.length} students</span>
        </div>

        <div className="bg-white rounded-[6px] border border-[#E2E8F0] overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Student</th>
                <th className="py-3 px-4">School</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 min-w-[320px]">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {rows.slice(0, 500).map(r => (
                <tr key={r.student_id} className="align-top hover:bg-slate-50">
                  <td className="py-2.5 px-4">
                    <div className="font-bold text-[#172554]">{r.display_name}</div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {r.student_id} · {r.overall_score ?? '—'}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-[#172554]">
                    {r.school_name || <span className="text-rose-600 font-semibold">—</span>}
                    {r.officer_exception && (
                      <div className="text-[10px] text-rose-700 font-semibold mt-0.5">Exception: {r.officer_exception}</div>
                    )}
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${STATUS_CLS[r.status] || 'bg-slate-100 text-slate-700'}`}>
                      {r.status === 'UNASSIGNED' ? 'Not placed' : r.status.charAt(0) + r.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[11px] text-slate-600 leading-snug">
                    {r.reason_text}
                    {r.suggested_action && <div className="mt-1 text-amber-700">→ {r.suggested_action}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 && (
            <div className="p-3 text-center text-[11px] text-slate-500">Showing 500 of {rows.length}. Download the CSV for all rows.</div>
          )}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- list view
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div>
          <div className="text-xs font-semibold text-[#64748B] mb-1">Placement History</div>
          <h1 className="text-2xl font-bold text-[#172554] tracking-tight">Previous Placements</h1>
          <p className="text-xs text-[#64748B] mt-1 max-w-2xl">
            Every placement run is kept here with its results and each student’s reason, even after a newer run, a reset,
            a re-import or a deleted cohort.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-[6px] border border-slate-200 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Reload
        </button>
      </div>

      {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">{error}</div>}

      {current && !entries?.some(e => e.run_id === current.runId) && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-[6px] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[#172554]">
          <div>
            <strong>Current run</strong> for {current.cohort} ({current.status?.toLowerCase().replace('_', ' ')}). It appears
            here once it is completed or replaced.
          </div>
          <button onClick={onOpenPlacements} className="px-3 py-1.5 bg-[#2563EB] text-white rounded font-semibold cursor-pointer self-start">
            Open Placements
          </button>
        </div>
      )}

      {entries === null ? (
        <div className="p-8 text-center text-xs text-slate-400">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="p-10 bg-white border border-dashed border-slate-200 rounded-[6px] text-center text-xs text-slate-500 space-y-2">
          <History className="w-8 h-8 mx-auto text-slate-300" />
          <div>No previous placements yet. A run is recorded here when it is completed, replaced by a newer run, or its cohort is reset or removed.</div>
        </div>
      ) : (
        <div className="bg-white rounded-[6px] border border-[#E2E8F0] overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#64748B] font-semibold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Run date</th>
                <th className="py-3 px-4">Cohort</th>
                <th className="py-3 px-4">Outcome</th>
                <th className="py-3 px-4 text-right">Students</th>
                <th className="py-3 px-4 text-right">Placed</th>
                <th className="py-3 px-4 text-right">Approved</th>
                <th className="py-3 px-4 text-right">Not placed</th>
                <th className="py-3 px-4 text-right">1st choice</th>
                <th className="py-3 px-4 text-right">Exceptions</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {entries.map(e => {
                const label = REASON_LABEL[e.archived_reason];
                return (
                  <tr key={e.id} onClick={() => open(e.id)} className="hover:bg-slate-50 cursor-pointer">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#172554] whitespace-nowrap">{when(e.run_created_at)}</div>
                      <div className="text-[10px] text-slate-400">by {e.run_created_by}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-mono font-semibold text-[#172554]">{e.cohort_id}</div>
                      <div className="text-[10px] text-slate-400">{e.mode === 'AI' ? e.model_version : 'rules only'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap ${label.cls}`}>{label.text}</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{e.students}</td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-700">{e.placed}</td>
                    <td className="py-3 px-4 text-right font-mono text-[#2563EB]">{e.approved}</td>
                    <td className="py-3 px-4 text-right font-mono text-amber-600">{e.unplaced}</td>
                    <td className="py-3 px-4 text-right font-mono">{pct(e.first_choice_rate)}</td>
                    <td className="py-3 px-4 text-right font-mono text-rose-600">{e.officer_exceptions || 0}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap" onClick={ev => ev.stopPropagation()}>
                      <button onClick={() => open(e.id)} className="px-2 py-1 text-[11px] font-semibold text-[#2563EB] hover:underline cursor-pointer">
                        View
                      </button>
                      <a href={api.getHistoryExportUrl(e.id)} className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:underline">
                        CSV
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
