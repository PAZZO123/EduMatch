import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Eye, UserCheck, Trophy, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { authService, isAdminRole } from '../services/auth';
import { AuditEvent } from '../types';

interface RegistryModel {
  model_key: string;
  display_name: string;
  algorithm: string;
  description: string;
  loaded: boolean;
  active: boolean;
  champion: boolean;
  fit_seconds: number;
  metrics: Record<'train' | 'validation' | 'test', { mae: number; r2: number; baseline_mae: number; top1_accuracy: number }>;
}

const pct = (v?: number) => (v == null ? '—' : `${(v * 100).toFixed(2)}%`);

export const ResponsibleAIScreen: React.FC = () => {
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [registry, setRegistry] = useState<{ champion: string; selection_rule: string; active_model: string | null; models: RegistryModel[] } | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const isAdmin = isAdminRole(authService.getCurrentUser()?.role);

  const loadRegistry = () => api.getModelRegistry().then(setRegistry).catch(() => setRegistry(null));

  useEffect(() => {
    api.getAuditTrail().then(res => setAuditLog(res.audit_trail)).catch(() => {});
    loadRegistry();
  }, []);

  const activate = async (m: RegistryModel) => {
    setSwitching(m.model_key);
    setNotice(null);
    try {
      await api.setActiveModel(m.model_key);
      await loadRegistry();
      setNotice({ type: 'success', text: `${m.display_name} will score fallbacks in new runs. Existing runs keep the model they recorded.` });
    } catch (err: any) {
      setNotice({ type: 'error', text: err.message || 'Could not switch model.' });
    } finally {
      setSwitching(null);
    }
  };

  // Same order the training script used to pick the champion: validation top-1 accuracy, then MAE.
  const ranked = [...(registry?.models || [])].sort(
    (a, b) =>
      (b.metrics?.validation?.top1_accuracy ?? -1) - (a.metrics?.validation?.top1_accuracy ?? -1) ||
      (a.metrics?.validation?.mae ?? 1) - (b.metrics?.validation?.mae ?? 1)
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-[#E2E8F0] pb-5">
        <div className="text-xs font-semibold text-[#0F9D8A] mb-1">
          Institutional Governance & Ethics
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#172554] tracking-tight">
          Responsible AI Framework
        </h1>
        <p className="text-sm text-[#64748B] mt-1 max-w-2xl">
          Designed specifically for Rwanda public-sector education infrastructure. Grounded in deterministic constraints, mathematical transparency, and inviolable human authority.
        </p>
      </div>

      {/* Slogan Banner */}
      <div className="p-6 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white rounded-[8px] shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-blue-200 mb-1">
            Governing Directive
          </div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight">
            AI recommends. NESA decides.
          </div>
          <p className="text-xs text-blue-100 mt-1 max-w-xl">
            No algorithm can publish or enforce secondary school placements autonomously. All proposals require explicit officer sign-off with recorded rationale.
          </p>
        </div>

        <div className="px-3.5 py-1.5 rounded-full bg-white/15 border border-white/30 text-white text-xs font-semibold shrink-0">
          Human-in-the-Loop 100%
        </div>
      </div>

      {/* 14. Four Pillars of Responsible AI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white rounded-[8px] border border-[#E2E8F0] space-y-2">
          <div className="w-8 h-8 rounded-[6px] bg-blue-50 border border-blue-100 text-[#2563EB] flex items-center justify-center font-bold text-xs">
            <UserCheck className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-[#172554]">Human Oversight</div>
          <div className="text-2xl font-bold font-mono text-[#172554] tabular-nums">100%</div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            Final placement requires officer approval. No autonomous write access to student records.
          </p>
        </div>

        <div className="p-5 bg-white rounded-[8px] border border-[#E2E8F0] space-y-2">
          <div className="w-8 h-8 rounded-[6px] bg-teal-50 border border-teal-100 text-[#0F9D8A] flex items-center justify-center font-bold text-xs">
            <Eye className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-[#172554]">Explainability</div>
          <div className="text-2xl font-bold font-mono text-[#0F9D8A] tabular-nums">100%</div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            Every recommendation explains the exact factors used: eligibility, preference, capacity, and rules.
          </p>
        </div>

        <div className="p-5 bg-white rounded-[8px] border border-[#E2E8F0] space-y-2">
          <div className="w-8 h-8 rounded-[6px] bg-emerald-50 border border-emerald-100 text-[#16A34A] flex items-center justify-center font-bold text-xs">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-[#172554]">Rule Compliance</div>
          <div className="text-2xl font-bold font-mono text-[#16A34A] tabular-nums">Every run</div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            The backend independently re-checks capacity, eligibility, uniqueness and preference authority before saving a plan or an approval.
          </p>
        </div>

        <div className="p-5 bg-white rounded-[8px] border border-[#E2E8F0] space-y-2">
          <div className="w-8 h-8 rounded-[6px] bg-slate-50 border border-slate-200 text-[#172554] flex items-center justify-center font-bold text-xs">
            <Lock className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-[#172554]">Data Privacy</div>
          <div className="text-2xl font-bold font-mono text-[#172554] tabular-nums">Synthetic</div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            Demo records are synthetic aliases with no national ID, phone or address. Student IDs and names are never model features.
          </p>
        </div>
      </div>

      {/* Model comparison: evidence for which model is used */}
      <div className="bg-white rounded-[8px] border border-[#E2E8F0] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#172554] flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#D97706]" />
              Model comparison
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5 max-w-3xl">
              Seven algorithms were trained on the same 2,500 synthetic students. The champion was chosen on the validation set
              only (highest top-1 ranking accuracy, then lowest error). Test-set results are shown here but were not used to choose.
            </p>
          </div>
          {!isAdmin && <span className="text-[11px] text-[#64748B]">Only administrators can switch models.</span>}
        </div>

        {notice && (
          <div
            role="status"
            className={`p-3 rounded-[6px] border text-xs ${
              notice.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            {notice.text}
          </div>
        )}

        {registry ? (
          <div className="border border-[#E2E8F0] rounded-[6px] overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B] font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3 text-right" title="Share of students whose truly best school the model ranked first">
                    Top-1 (validation)
                  </th>
                  <th className="py-2.5 px-3 text-right">Top-1 (test)</th>
                  <th className="py-2.5 px-3 text-right">MAE (validation)</th>
                  <th className="py-2.5 px-3 text-right">R²</th>
                  <th className="py-2.5 px-3 text-right">Train time</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {ranked.map((m, i) => (
                  <tr key={m.model_key} className={m.active ? 'bg-[#F0FDFA]' : 'hover:bg-slate-50'}>
                    <td className="py-2.5 px-3 font-mono text-[#64748B]">{i + 1}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-[#172554]">{m.display_name}</div>
                      <div className="text-[11px] text-[#64748B]">{m.description}</div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-[#172554]">
                      {pct(m.metrics?.validation?.top1_accuracy)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{pct(m.metrics?.test?.top1_accuracy)}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{m.metrics?.validation?.mae?.toExponential(2) ?? '—'}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{m.metrics?.validation?.r2?.toFixed(5) ?? '—'}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{m.fit_seconds?.toFixed(2)} s</td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {m.champion && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[#B45309] text-[10px] font-bold">
                            CHAMPION
                          </span>
                        )}
                        {m.active ? (
                          <span className="px-1.5 py-0.5 rounded bg-[#0F9D8A]/10 border border-[#0F9D8A]/30 text-[#0F9D8A] text-[10px] font-bold">
                            IN USE
                          </span>
                        ) : !m.loaded ? (
                          <span className="px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-[#DC2626] text-[10px] font-bold">
                            NOT LOADED
                          </span>
                        ) : (
                          isAdmin && (
                            <button
                              onClick={() => activate(m)}
                              disabled={switching !== null}
                              className="px-2 py-0.5 rounded border border-[#E2E8F0] text-[10px] font-semibold text-[#172554] hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                            >
                              {switching === m.model_key ? 'Switching…' : 'Use for new runs'}
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 text-xs text-[#64748B] border border-[#E2E8F0] rounded-[6px]">Loading model registry…</div>
        )}

        <div className="p-3 bg-amber-50 border border-amber-200 rounded-[6px] text-[11px] text-amber-900 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Caveat: the training target is a disclosed synthetic formula (.75·subject fit + .15·overall + .10·same province).
            Linear Regression wins because it can recover that formula exactly. These numbers show that the models work
            inside the system. They do not measure real placement quality. Retrain on authorised historical data before any
            real use.
          </span>
        </div>
      </div>

      <div className="bg-white rounded-[8px] border border-[#E2E8F0] p-6 space-y-6">
        <div>
          <h2 className="text-base font-bold text-[#172554]">Decision pipeline</h2>
          <p className="text-xs text-[#64748B] mt-0.5">Every proposal goes through the same recorded steps</p>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-4 bg-slate-50 rounded-[6px] border border-[#E2E8F0] text-xs">
          {[
            ['Step 1', 'Priority order', 'Overall score, then student ID', 'bg-white border-[#E2E8F0] text-[#172554]'],
            ['Step 2', 'Listed choices', 'Eligibility and free seats checked', 'bg-white border-[#E2E8F0] text-[#172554]'],
            ['Step 3', 'AI fallback', 'Only if opted in; eligible offers ranked', 'bg-[#F0FDFA] border-[#99F6E4] text-[#0F9D8A]'],
            ['Step 4', 'Officer decision', 'Approve, change or reject with a reason', 'bg-emerald-50 border-emerald-200 text-[#16A34A]']
          ].map(([step, title, sub, cls], i, arr) => (
            <React.Fragment key={step}>
              <div className={`text-center p-3 rounded-[6px] border w-full md:w-48 ${cls}`}>
                <span className="text-[10px] uppercase font-semibold block opacity-70">{step}</span>
                <span className="font-bold block mt-1">{title}</span>
                <span className="text-[11px] opacity-80">{sub}</span>
              </div>
              {i < arr.length - 1 && (
                <span className="text-[#64748B] font-bold text-lg" aria-hidden="true">
                  →
                </span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Audit Log Table */}
        <div className="pt-2">
          <div className="text-xs font-bold text-[#172554] mb-3">
            Latest audit events
          </div>
          <div className="border border-[#E2E8F0] rounded-[6px] overflow-hidden text-xs">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-[#E2E8F0] text-[#64748B] font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Actor</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Target Student</th>
                  <th className="py-2.5 px-3">Reason / Fact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {auditLog.slice(0, 5).map(event => (
                  <tr key={event.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-[#64748B]">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#172554]">
                      {event.actor}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-bold text-[11px] text-[#2563EB]">
                        {event.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#172554]">
                      {event.student_id || 'Cohort'}
                    </td>
                    <td className="py-2.5 px-3 text-[#64748B]">
                      {event.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
