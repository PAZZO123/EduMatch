import React, { useState, useEffect } from 'react';
import {
  Server,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Zap,
  Globe,
  Code2,
  ExternalLink
} from 'lucide-react';
import { getApiBaseUrl, setCustomApiBaseUrl, api } from '../services/api';

interface BackendSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBackendChanged: () => void;
}

export const BackendSettingsModal: React.FC<BackendSettingsModalProps> = ({
  isOpen,
  onClose,
  onBackendChanged
}) => {
  const [url, setUrl] = useState('');
  const [pingStatus, setPingStatus] = useState<'IDLE' | 'TESTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [pingMessage, setPingMessage] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setUrl(getApiBaseUrl());
      setPingStatus('IDLE');
      setLatencyMs(null);
      setPingMessage('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const testConnection = async () => {
    setPingStatus('TESTING');
    setPingMessage('Pinging /health endpoint...');
    const t0 = performance.now();
    try {
      // Test either custom url or current
      const testUrl = url.trim().replace(/\/+$/, '') || '/api';
      const res = await fetch(`${testUrl}/health`);
      const dur = Math.round(performance.now() - t0);
      setLatencyMs(dur);

      if (res.ok) {
        const data = await res.json();
        setPingStatus('SUCCESS');
        setPingMessage(`Connected! ${data.system || 'Backend'} (${dur} ms latency)`);
      } else {
        setPingStatus('ERROR');
        setPingMessage(`Server responded with HTTP ${res.status}: ${res.statusText}`);
      }
    } catch (err: any) {
      setPingStatus('ERROR');
      setPingMessage(`Connection failed: ${err.message || 'Network unreachable'}`);
    }
  };

  const handleSave = () => {
    setCustomApiBaseUrl(url);
    onBackendChanged();
    onClose();
  };

  const handleResetDefault = () => {
    setUrl('/api');
    setCustomApiBaseUrl('/api');
    onBackendChanged();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-5 text-slate-900">
        <div className="flex items-start justify-between border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-indigo-600 uppercase mb-1">
              <Server className="w-3.5 h-3.5" />
              <span>Full-Stack Integration</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              Backend Connection & API Contract
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            EduMatch AI includes a built-in full-stack Express API backend handling all SRS contracts at <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-indigo-600">/api</code>. You can also connect to an external Python FastAPI service (e.g., <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">http://localhost:8000/api</code>).
          </p>

          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-700">
              API Base URL
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="/api or http://localhost:8000/api"
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={testConnection}
                disabled={pingStatus === 'TESTING'}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>Test Ping</span>
              </button>
            </div>
          </div>

          {/* Test Status feedback */}
          {pingStatus !== 'IDLE' && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                pingStatus === 'SUCCESS'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : pingStatus === 'ERROR'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-900'
              }`}
            >
              <div className="flex items-center gap-2">
                {pingStatus === 'SUCCESS' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : pingStatus === 'ERROR' ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                ) : (
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
                <span>{pingMessage}</span>
              </div>
              {latencyMs !== null && (
                <span className="font-mono font-bold text-slate-700">
                  {latencyMs} ms
                </span>
              )}
            </div>
          )}

          {/* SRS Route Reference */}
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <span className="font-semibold text-slate-800 block text-[11px] uppercase tracking-wider">
              Implemented SRS API Endpoints (Section 17 & 18):
            </span>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <div>POST /api/auth/login</div>
              <div>POST /api/demo/seed</div>
              <div>GET /api/cohorts/:id/summary</div>
              <div>GET /api/offers</div>
              <div>PATCH /api/offers/:id</div>
              <div>GET /api/model/status</div>
              <div>POST /api/runs</div>
              <div>GET /api/runs/:id/proposals</div>
              <div>GET /api/proposals/:id/alternatives</div>
              <div>POST /api/proposals/:id/decision</div>
              <div>GET /api/runs/:id/export.csv</div>
              <div>GET /api/audit-trail</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <button
            onClick={handleResetDefault}
            className="text-xs text-slate-500 hover:text-slate-800 underline cursor-pointer"
          >
            Reset to built-in /api
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
