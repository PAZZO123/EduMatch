import React, { useState, useEffect } from 'react';
import {
  Upload,
  RefreshCw,
  Cpu,
  Play,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Database,
  Trash2
} from 'lucide-react';
import { api } from '../services/api';
import { authService, isAdminRole, canReviewRole } from '../services/auth';
import { DashboardMetrics } from '../types';

interface DataCohortScreenProps {
  onRunCompleted: (runId: string, metrics: DashboardMetrics) => void;
  onNavigateWorkspace: () => void;
  onCohortChanged: () => void;
}

type ImportError = { file: string; row: number | null; field: string | null; code: string; message: string };

const FILE_SLOTS = [
  { key: 'students', label: 'students.csv (or students_2026.csv)', accept: '.csv', required: true },
  { key: 'offers', label: 'offers.csv (or schools_2026.csv)', accept: '.csv', required: true },
  { key: 'preferences', label: 'preferences.csv (optional if students.csv has choice_1..3)', accept: '.csv', required: false },
  { key: 'rules', label: 'rules.json (optional)', accept: '.json', required: false }
] as const;

const FIXTURES = [
  {
    id: '200_standard' as const,
    title: '200-Student Standard Cohort (P0 target)',
    detail: '200 applicants · 12 school offers · 3 ranked choices each · fixed seed'
  },
  {
    id: '6_fixture' as const,
    title: '6-Student Hand-Checkable Fixture (SRS §21)',
    detail: 'S1–S6 · offers A, B, C · expected plan is known in advance'
  },
  {
    id: '500_stress' as const,
    title: '500-Student Stress Fixture (NFR-02 / AT-08)',
    detail: '500 applicants · 20 offers · run target ≤ 10 s'
  }
];

const pct = (v: number | null | undefined) => (v == null ? 'N/A' : `${(v * 100).toFixed(1)}%`);

export const DataCohortScreen: React.FC<DataCohortScreenProps> = ({
  onRunCompleted,
  onNavigateWorkspace,
  onCohortChanged
}) => {
  const role = authService.getCurrentUser()?.role;
  const isAdmin = isAdminRole(role);
  const canRun = canReviewRole(role);

  const [summary, setSummary] = useState<Awaited<ReturnType<typeof api.getCohortSummary>> | null>(null);
  const [cohorts, setCohorts] = useState<{ cohort_id: string; source_label: string }[]>([]);
  const [provinces, setProvinces] = useState<number>(0);
  const [model, setModel] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [runMode, setRunMode] = useState<'AI_ASSISTED' | 'RULES_ONLY'>('AI_ASSISTED');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string; toWorkspace?: boolean } | null>(null);

  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sum, list, offersRes, status] = await Promise.all([
        api.getCohortSummary(),
        api.listCohorts(),
        api.getOffers(),
        api.getModelStatus()
      ]);
      setSummary(sum);
      setCohorts(list.cohorts);
      setProvinces(new Set(offersRes.offers.map(o => o.province)).size);
      setModel(status.raw);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Could not load the cohort overview.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const afterCohortChange = async (text: string) => {
    setMessage({ type: 'success', text });
    await loadData();
    onCohortChanged();
  };

  const handleSelectCohort = async (cohortId: string) => {
    api.selectCohort(cohortId);
    await afterCohortChange(`Now working on cohort ${cohortId}.`);
  };

  const handleDeleteCohort = async () => {
    const id = summary?.cohort_id;
    if (!id) return;
    const ok = window.confirm(
      `Delete cohort ${id}?\n\nThis permanently removes its ${summary?.student_count} students, school offers, ` +
        `placement runs and any approvals. The audit log keeps a record. This cannot be undone.`
    );
    if (!ok) return;
    setBusy('delete');
    setMessage(null);
    try {
      const res = await api.deleteCohort(id);
      await afterCohortChange(
        `Deleted cohort ${res.deleted}: ${res.students} students, ${res.runs} run(s), ${res.approvals} approval(s) removed.`
      );
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Delete failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleSeed = async (fixture: '200_standard' | '6_fixture' | '500_stress') => {
    setBusy(`seed:${fixture}`);
    setMessage(null);
    try {
      const res = await api.seedDemo(fixture, true);
      await afterCohortChange(
        `Loaded ${res.fixture_loaded}: ${res.student_count} applicants and ${res.offer_count} school offers.`
      );
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Seeding failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    if (!files.students || !files.offers) {
      setMessage({ type: 'error', text: 'Choose a students file and a schools (offers) file before importing.' });
      return;
    }
    setBusy('import');
    setMessage(null);
    setImportErrors([]);
    try {
      const s = await api.importCohort(
        { students: files.students, offers: files.offers, preferences: files.preferences, rules: files.rules },
        replaceExisting
      );
      setFiles({});
      await afterCohortChange(
        `Imported cohort ${s.cohort_id}: ${s.counts.students} students, ${s.counts.offers} offers, ${s.counts.preferences} choices.`
      );
    } catch (err: any) {
      const errors: ImportError[] = err.details?.details?.errors || [];
      setImportErrors(errors);
      setMessage({ type: 'error', text: err.message || 'Import failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleToggleFallback = async (allow: boolean) => {
    setBusy('rules');
    setMessage(null);
    try {
      const res = await api.patchRules({ allow_unlisted_fallback: allow });
      await afterCohortChange(
        `Unlisted AI fallback ${allow ? 'enabled' : 'disabled'}. Input version is now v${res.input_version}; existing draft runs are marked stale.`
      );
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Rule change failed.' });
    } finally {
      setBusy(null);
    }
  };

  const handleExecuteRun = async () => {
    setBusy('run');
    setMessage(null);
    try {
      const res = await api.runPlacement(runMode);
      setMessage({
        type: 'success',
        text: `Run finished in ${Math.round(res.runtime_ms)} ms: ${res.metrics.assigned_count} draft proposals, ${res.metrics.unassigned_count} unassigned, ${res.metrics.violations_count} violations.`,
        toWorkspace: true
      });
      onRunCompleted(res.run_id, res.metrics);
      await loadData();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Allocation run failed.' });
    } finally {
      setBusy(null);
    }
  };

  const rules = summary?.rules || {};
  const fallbackOn = rules.allow_unlisted_fallback !== false;
  const locked = !!summary?.has_approvals;
  const val = model?.metrics?.validation;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
            <span>Data Operations</span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-700 font-semibold">Synthetic data · Demo policy</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Cohort Data & Allocation Pipeline</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {cohorts.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <Database className="w-3.5 h-3.5" />
              <span className="sr-only sm:not-sr-only">Cohort</span>
              <select
                value={summary?.cohort_id || ''}
                onChange={e => handleSelectCohort(e.target.value)}
                className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {cohorts.map(c => (
                  <option key={c.cohort_id} value={c.cohort_id}>
                    {c.cohort_id} ({c.source_label})
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Reload</span>
          </button>
          {isAdmin && summary?.cohort_id && (
            <button
              onClick={handleDeleteCohort}
              disabled={busy !== null}
              className="px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{busy === 'delete' ? 'Deleting…' : 'Delete cohort'}</span>
            </button>
          )}
        </div>
      </div>

      {message && (
        <div
          role="status"
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-4 ${
            message.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
          {message.toWorkspace && (
            <button onClick={onNavigateWorkspace} className="font-semibold underline hover:opacity-80 shrink-0 cursor-pointer">
              Review proposals →
            </button>
          )}
        </div>
      )}

      {/* Snapshot statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 bg-white rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">Applicants</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">{summary ? summary.student_count : '—'}</div>
          <div className="text-[11px] text-slate-500 mt-1">{summary?.is_synthetic ? 'Synthetic records' : 'Imported records'}</div>
        </div>
        <div className="p-5 bg-white rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">School offers</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">{summary ? summary.offer_count : '—'}</div>
          <div className="text-[11px] text-slate-500 mt-1">
            {summary ? `${summary.total_seats} seats · ${provinces} province${provinces === 1 ? '' : 's'}` : '—'}
          </div>
        </div>
        <div className="p-5 bg-white rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">Ranked choices</div>
          <div className="text-2xl font-bold font-mono text-slate-900 mt-1 tabular-nums">{summary ? summary.preference_count : '—'}</div>
          <div className="text-[11px] text-slate-500 mt-1">1–3 per applicant</div>
        </div>
        <div className="p-5 bg-white rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 font-medium">Input version</div>
          <div className="text-2xl font-bold font-mono text-indigo-600 mt-1 tabular-nums">v{summary ? summary.input_version : '—'}</div>
          <div className="text-[11px] text-slate-500 mt-1">Run status: {summary?.active_run_status || 'no run yet'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left column: data sources and rules */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Synthetic demo cohorts (FR-02)</h2>
              <p className="text-xs text-slate-600 mt-1">
                Loading a fixture replaces that cohort with the same records every time.
                {!isAdmin && ' Only administrators can load or import data.'}
              </p>
            </div>

            <div className="space-y-3">
              {FIXTURES.map(f => (
                <div
                  key={f.id}
                  className="p-3.5 rounded-lg border border-slate-200 hover:border-slate-300 transition-colors flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900">{f.title}</div>
                    <div className="text-[11px] text-slate-500">{f.detail}</div>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleSeed(f.id)}
                      disabled={busy !== null}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {busy === `seed:${f.id}` ? 'Loading…' : 'Load'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            {isAdmin && (
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div>
                  <div className="text-xs font-semibold text-slate-900">CSV import (FR-03 / FR-04)</div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    The whole batch is validated first. Any error rejects the batch, and nothing is saved.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {FILE_SLOTS.map(slot => (
                    <label key={slot.key} className="block text-[11px] text-slate-600">
                      <span className="font-medium">{slot.label}</span>
                      <input
                        type="file"
                        accept={slot.accept}
                        onChange={e => setFiles(prev => ({ ...prev, [slot.key]: e.target.files?.[0] || null }))}
                        className="mt-1 block w-full text-[11px] file:mr-2 file:px-2 file:py-1 file:rounded-md file:border-0 file:bg-slate-100 file:text-slate-800 file:font-semibold hover:file:bg-slate-200"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[11px] text-slate-600">
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={e => setReplaceExisting(e.target.checked)}
                      className="w-3.5 h-3.5 rounded"
                    />
                    Replace a cohort with the same ID
                  </label>
                  <button
                    onClick={handleImport}
                    disabled={busy !== null}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-md shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {busy === 'import' ? 'Validating…' : 'Validate & import'}
                  </button>
                </div>

                {importErrors.length > 0 && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 space-y-2">
                    <div className="font-bold flex items-center gap-1.5 text-rose-700">
                      <ShieldAlert className="w-4 h-4" />
                      <span>Import rejected: {importErrors.length} problem(s), nothing was saved</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-[11px] font-mono">
                        <thead className="text-rose-700">
                          <tr>
                            <th className="text-left pr-2">File</th>
                            <th className="text-left pr-2">Row</th>
                            <th className="text-left pr-2">Field</th>
                            <th className="text-left">Problem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importErrors.map((e, i) => (
                            <tr key={i} className="align-top">
                              <td className="pr-2">{e.file}</td>
                              <td className="pr-2">{e.row ?? '—'}</td>
                              <td className="pr-2">{e.field ?? '—'}</td>
                              <td className="font-sans">
                                <span className="font-mono font-semibold">{e.code}</span> {e.message}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Rules (FR-05, SRS §14) */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Demo placement policy (FR-05)</h2>
              <span className="text-[11px] font-mono text-slate-500">{summary?.rules_version}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-medium">Priority order</div>
                <div className="font-mono font-semibold text-slate-900 mt-1">{rules.priority || '—'}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Allocation: {rules.allocation || '—'}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-slate-500 font-medium">Score scale</div>
                <div className="font-mono font-semibold text-slate-900 mt-1">
                  {rules.score_scale || '—'} ({rules.score_direction === 'higher_better' ? 'higher is better' : rules.score_direction || '—'})
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Demo policy, not an approved NESA rule</div>
              </div>
            </div>

            <label className="flex items-center justify-between gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div>
                <div className="font-semibold text-slate-900">Allow AI-ranked unlisted fallback (FR-08)</div>
                <div className="text-[11px] text-slate-500">
                  Applies only to students who opted in. Changing it creates a new input version and marks draft runs stale.
                  {locked && ' Locked: approved results exist, so an administrator must reset the cohort first.'}
                </div>
              </div>
              <input
                type="checkbox"
                checked={fallbackOn}
                disabled={!isAdmin || locked || busy !== null || !summary?.cohort_id}
                onChange={e => handleToggleFallback(e.target.checked)}
                className="w-4 h-4 rounded shrink-0 disabled:opacity-50"
              />
            </label>
          </div>
        </div>

        {/* Right column: model card and run launcher */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">Embedded model (FR-07)</h2>
              </div>
              <span className={`text-xs font-mono font-bold ${model?.loaded ? 'text-emerald-600' : 'text-rose-600'}`}>
                {model ? model.label : '…'}
              </span>
            </div>

            {model?.loaded ? (
              <div className="space-y-2.5 text-xs font-mono">
                {[
                  ['Model', `${model.display_name}${model.model_key === model.champion ? ' (champion)' : ''}`],
                  ['Estimator', model.algorithm],
                  ['Version', model.model_version],
                  ['SHA-256', `${String(model.sha256).slice(0, 16)}…`],
                  ['Held-out MAE', val ? val.mae.toExponential(2) : '—'],
                  ['Baseline MAE', val ? `${val.baseline_mae.toFixed(4)} (${val.mae < val.baseline_mae ? 'beaten' : 'not beaten'})` : '—'],
                  ['Top-1 ranking accuracy', pct(val?.top1_accuracy)],
                  ['Training', `${model.training_source}, ${Number(model.train_students_used).toLocaleString()} students, seed ${model.fixed_seed}`]
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 py-1 border-b border-slate-100">
                    <span className="text-slate-500 shrink-0">{k}</span>
                    <span className="text-slate-900 font-medium text-right break-all">{v}</span>
                  </div>
                ))}
                <div className="py-1">
                  <span className="text-slate-500 block mb-1">Features</span>
                  <span className="text-slate-800 text-[11px] block">{(model.feature_schema || []).join(' · ')}</span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900">
                AI unavailable. Runs will use rules-only mode and say so. {model?.load_errors && JSON.stringify(model.load_errors)}
              </div>
            )}

            <div className="p-3 bg-slate-50 rounded-lg text-[11px] text-slate-600 font-sans border border-slate-200">
              <strong className="text-slate-900">Note:</strong> scores are compatibility rankings from 0 to 100. They are not
              admission probabilities or confidence levels. The model was trained on a disclosed synthetic formula.
            </div>
          </div>

          {canRun && (
            <div className="bg-white border border-[#E2E8F0] text-[#172554] p-6 rounded-[8px] shadow-xs space-y-5">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-[#2563EB] mb-1 font-bold">Backend orchestrator</div>
                <h2 className="text-lg font-bold text-[#172554]">Generate placement proposals</h2>
                <p className="text-xs text-[#475569] mt-1">
                  Serial allocation by priority. Listed choices are tried first; the local model ranks eligible unlisted
                  offers only for students who opted in.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 p-1 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[6px] text-xs" role="radiogroup" aria-label="Run mode">
                {(['AI_ASSISTED', 'RULES_ONLY'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={runMode === mode}
                    onClick={() => setRunMode(mode)}
                    className={`py-2 px-3 rounded-md font-semibold transition-colors cursor-pointer ${
                      runMode === mode ? 'bg-[#2563EB] text-white shadow-xs' : 'text-[#475569] hover:text-[#2563EB]'
                    }`}
                  >
                    {mode === 'AI_ASSISTED' ? 'AI-assisted' : 'Rules only'}
                  </button>
                ))}
              </div>

              {locked && (
                <p className="text-[11px] text-amber-700">
                  Approved results exist, so a new run is blocked until an administrator resets this cohort (Review & Export).
                </p>
              )}

              <button
                onClick={handleExecuteRun}
                disabled={busy !== null || locked || !summary?.cohort_id}
                className="w-full py-3.5 px-4 bg-[#2563EB] text-white hover:bg-[#1D4ED8] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-bold text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {busy === 'run' ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Running…</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    <span>Run placement</span>
                  </>
                )}
              </button>

              <div className="text-[11px] text-[#64748B] flex items-center justify-between pt-2 border-t border-[#E2E8F0]">
                <span>One active plan per cohort</span>
                <span>Saved atomically to SQLite</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
