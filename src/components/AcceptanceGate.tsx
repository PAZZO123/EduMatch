import React, { useState } from 'react';
import { CheckCircle2, XCircle, Play, ShieldCheck, AlertTriangle, Database } from 'lucide-react';
import { api } from '../services/api';

interface GateResult {
  id: string;
  requirements: string;
  name: string;
  status: 'PASS' | 'FAIL';
  duration_ms: number;
  log: string[];
}

interface GateReport {
  passed: number;
  total: number;
  duration_ms: number;
  note: string;
  results: GateResult[];
}

// What each gate proves (SRS §20). The backend decides PASS / FAIL; nothing is computed in the browser.
const GATES: { id: string; requirements: string; name: string; assertion: string }[] = [
  { id: 'AT-01', requirements: 'FR-01–05', name: 'Authentication, seed and CSV validation', assertion: 'Unauthorized requests fail; seed works; every bad CSV fixture gives row-level errors with no partial import; zero capacities and tied scores are handled.' },
  { id: 'AT-02', requirements: 'FR-06, 08–09', name: 'Six-student fixture plan, reasons and metrics', assertion: 'S1→A, S2→A, S3→B, S4→C, S5 and S6 unassigned; 66.7% top-three, 50% first choice, 100% utilization, 0 violations, identical on repeat.' },
  { id: 'AT-03', requirements: 'FR-07', name: 'Local model inference and held-out MAE', assertion: 'Model loads in the backend; held-out MAE beats the mean-target baseline; reloading the artifact reproduces the same score.' },
  { id: 'AT-04', requirements: 'FR-07–08', name: 'Fallback variant: B=0, C=2, S3 opt-in', assertion: 'With fallback, S3 gets AI-ranked C with a score and S4 still gets C; without fallback S3 stays unassigned.' },
  { id: 'AT-05', requirements: 'FR-11–14', name: 'Draft export, atomic changes, stale and duplicate writes', assertion: 'Draft export is empty; after approving S1 it has exactly S1; changing S3 to full A fails atomically; stale and repeated approvals add no seat.' },
  { id: 'AT-06', requirements: 'FR-10, 13, 16', name: 'Rejection, seat release and persistent history', assertion: 'Rejecting S3 releases seat B, S3 stays in the exception queue, and actor/reason survive a backend restart.' },
  { id: 'AT-07', requirements: 'FR-15, 17–18', name: 'Approved CSV reconciliation and reset', assertion: 'Approved CSV rows equal approved database rows; metrics use all valid applicants; reset restores known counts.' },
  { id: 'AT-08', requirements: 'NFR-02, 04', name: '500-student performance target', assertion: 'A 500-student / 20-offer run completes in ≤ 10 s locally with zero violations.' }
];

export const AcceptanceGate: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<GateReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAll = async () => {
    setRunning(true);
    setError(null);
    try {
      setReport(await api.runAcceptanceGate());
    } catch (err: any) {
      setError(err.message || 'The acceptance gate could not be run.');
    } finally {
      setRunning(false);
    }
  };

  const byId = new Map((report?.results || []).map(r => [r.id, r]));
  const allPassed = report && report.passed === report.total;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium mb-1">
            <span>Acceptance Verification</span>
            <span aria-hidden="true">·</span>
            <span>SRS §20 and §21</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Acceptance Gate (AT-01 to AT-08)</h1>
        </div>

        <button
          onClick={runAll}
          disabled={running}
          className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-lg shadow-sm transition-colors flex items-center gap-2 cursor-pointer"
        >
          <Play className={`w-3.5 h-3.5 ${running ? 'animate-pulse' : ''}`} />
          <span>{running ? 'Running on the backend…' : 'Run all acceptance tests'}</span>
        </button>
      </div>

      <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50/60 text-xs text-indigo-950 flex items-start gap-3">
        <Database className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
        <p>
          The backend starts a temporary copy of itself with an empty database and runs each test through the real API, using
          the same code, trained model and fixtures. Your current cohort, runs and approvals are not affected.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-4 rounded-xl border border-rose-200 bg-rose-50 text-xs text-rose-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="p-6 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Acceptance status</div>
          <div className="text-2xl font-bold text-slate-900 mt-1 flex items-center gap-2">
            {!report ? (
              <>
                <ShieldCheck className="w-7 h-7 text-slate-400" />
                <span>Not run yet</span>
              </>
            ) : allPassed ? (
              <>
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                <span>All {report.total} gates passed</span>
              </>
            ) : (
              <>
                <XCircle className="w-7 h-7 text-rose-600" />
                <span>
                  {report.passed} of {report.total} gates passed
                </span>
              </>
            )}
          </div>
          {report && <p className="text-xs text-slate-500 mt-1">Completed in {(report.duration_ms / 1000).toFixed(1)} s.</p>}
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="text-center p-3 bg-slate-50 rounded-lg border border-slate-200 min-w-[90px]">
            <span className="text-[10px] text-slate-500 block">Gates</span>
            <span className="text-lg font-bold text-slate-900">{GATES.length}</span>
          </div>
          <div className="text-center p-3 bg-emerald-50 rounded-lg border border-emerald-200 min-w-[90px]">
            <span className="text-[10px] text-emerald-800 block">Passed</span>
            <span className="text-lg font-bold text-emerald-700">{report ? report.passed : '—'}</span>
          </div>
          <div className="text-center p-3 bg-rose-50 rounded-lg border border-rose-200 min-w-[90px]">
            <span className="text-[10px] text-rose-800 block">Failed</span>
            <span className="text-lg font-bold text-rose-700">{report ? report.total - report.passed : '—'}</span>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {GATES.map(gate => {
          const result = byId.get(gate.id);
          const status = running ? 'RUNNING' : result?.status || 'READY';
          return (
            <div
              key={gate.id}
              className={`p-5 rounded-xl border bg-white transition-colors ${
                status === 'PASS' ? 'border-emerald-200' : status === 'FAIL' ? 'border-rose-300' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-xs text-indigo-700">{gate.id}</span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <span className="text-xs font-medium text-slate-500 font-mono">{gate.requirements}</span>
                    <span aria-hidden="true" className="text-slate-300">·</span>
                    <h3 className="text-sm font-bold text-slate-900">{gate.name}</h3>
                  </div>
                  <p className="text-xs text-slate-600">{gate.assertion}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {result && !running && <span className="text-[11px] font-mono text-slate-400">{result.duration_ms} ms</span>}
                  <span
                    className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 font-mono ${
                      status === 'PASS'
                        ? 'text-emerald-700 bg-emerald-100/70'
                        : status === 'FAIL'
                        ? 'text-rose-700 bg-rose-100/70'
                        : status === 'RUNNING'
                        ? 'text-indigo-700 bg-indigo-100/70 animate-pulse'
                        : 'text-slate-500 bg-slate-100'
                    }`}
                  >
                    {status === 'PASS' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {status === 'FAIL' && <XCircle className="w-3.5 h-3.5" />}
                    {status}
                  </span>
                </div>
              </div>

              {result && !running && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <div className="bg-slate-950 rounded-lg p-3 text-[11px] font-mono space-y-1 overflow-x-auto">
                    {result.log.map((line, i) => (
                      <div key={i} className={/^(FAIL|ERROR)/.test(line) ? 'text-rose-400' : 'text-emerald-300'}>
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
