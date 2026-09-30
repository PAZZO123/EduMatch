import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  FileCheck2,
  Lock,
  Eye,
  History,
  ArrowDown,
  UserCheck,
  Cpu
} from 'lucide-react';
import { api } from '../services/api';
import { AuditEvent } from '../types';

export const ResponsibleAIScreen: React.FC = () => {
  const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
  const [modelStatus, setModelStatus] = useState<any>(null);

  useEffect(() => {
    api.getAuditTrail().then(res => setAuditLog(res.audit_trail)).catch(() => {});
    api.getModelStatus().then(res => setModelStatus(res)).catch(() => {});
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-[#E2E8F0] pb-5">
        <div className="text-xs font-semibold text-[#0F9D8A] mb-1">
          Institutional Governance & Ethics
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#0B1F3A] tracking-tight">
          Responsible AI Framework
        </h1>
        <p className="text-sm text-[#64748B] mt-1 max-w-2xl">
          Designed specifically for Rwanda public-sector education infrastructure. Grounded in deterministic constraints, mathematical transparency, and inviolable human authority.
        </p>
      </div>

      {/* Slogan Banner */}
      <div className="p-6 bg-[#0B1F3A] text-white rounded-[8px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono uppercase tracking-wider text-[#0F9D8A] mb-1">
            Governing Directive
          </div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight">
            AI recommends. NESA decides.
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            No algorithm can publish or enforce secondary school placements autonomously. All proposals require explicit officer sign-off with recorded rationale.
          </p>
        </div>

        <div className="px-3.5 py-1.5 rounded-full bg-[#0F9D8A]/20 border border-[#0F9D8A]/40 text-[#0F9D8A] text-xs font-semibold shrink-0">
          Human-in-the-Loop 100%
        </div>
      </div>

      {/* 14. Four Pillars of Responsible AI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white rounded-[8px] border border-[#E2E8F0] space-y-2">
          <div className="w-8 h-8 rounded-[6px] bg-blue-50 border border-blue-100 text-[#2563EB] flex items-center justify-center font-bold text-xs">
            <UserCheck className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-[#0B1F3A]">Human Oversight</div>
          <div className="text-2xl font-bold font-mono text-[#0B1F3A] tabular-nums">100%</div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            Final placement requires officer approval. No autonomous write access to student records.
          </p>
        </div>

        <div className="p-5 bg-white rounded-[8px] border border-[#E2E8F0] space-y-2">
          <div className="w-8 h-8 rounded-[6px] bg-teal-50 border border-teal-100 text-[#0F9D8A] flex items-center justify-center font-bold text-xs">
            <Eye className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-[#0B1F3A]">Explainability</div>
          <div className="text-2xl font-bold font-mono text-[#0F9D8A] tabular-nums">100%</div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            Every recommendation explains the exact factors used: eligibility, preference, capacity, and rules.
          </p>
        </div>

        <div className="p-5 bg-white rounded-[8px] border border-[#E2E8F0] space-y-2">
          <div className="w-8 h-8 rounded-[6px] bg-emerald-50 border border-emerald-100 text-[#16A34A] flex items-center justify-center font-bold text-xs">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-[#0B1F3A]">Rule Compliance</div>
          <div className="text-2xl font-bold font-mono text-[#16A34A] tabular-nums">0 Violations</div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            Recommendations are pre-validated against official placement quotas and capacity invariants.
          </p>
        </div>

        <div className="p-5 bg-white rounded-[8px] border border-[#E2E8F0] space-y-2">
          <div className="w-8 h-8 rounded-[6px] bg-slate-50 border border-slate-200 text-[#0B1F3A] flex items-center justify-center font-bold text-xs">
            <Lock className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-[#0B1F3A]">Data Privacy</div>
          <div className="text-2xl font-bold font-mono text-[#0B1F3A] tabular-nums">Encrypted</div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            Student records are de-identified; zero personal contact details exposed during placement.
          </p>
        </div>
      </div>

      {/* Decision Audit Trail Pipeline Diagram */}
      <div className="bg-white rounded-[8px] border border-[#E2E8F0] p-6 space-y-6">
        <div>
          <h2 className="text-base font-bold text-[#0B1F3A]">
            Decision Audit Trail Pipeline
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Every candidate follows an immutable, verified verification sequence
          </p>
        </div>

        {/* Visual Pipeline */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-4 bg-slate-50 rounded-[6px] border border-[#E2E8F0] text-xs">
          <div className="text-center p-3 bg-white rounded-[6px] border border-[#E2E8F0] w-full md:w-44">
            <span className="text-[10px] text-[#64748B] uppercase font-semibold block">Step 1</span>
            <span className="font-bold text-[#0B1F3A] block mt-1">Student #10452</span>
            <span className="text-[11px] text-[#64748B]">Profile Loaded</span>
          </div>

          <span className="text-[#64748B] font-bold text-lg hidden md:inline">→</span>
          <span className="text-[#64748B] font-bold text-lg md:hidden">↓</span>

          <div className="text-center p-3 bg-[#F0FDFA] rounded-[6px] border border-[#99F6E4] w-full md:w-44">
            <span className="text-[10px] text-[#0F9D8A] uppercase font-semibold block">Step 2</span>
            <span className="font-bold text-[#0F9D8A] block mt-1">AI Recommends</span>
            <span className="text-[11px] text-[#0F9D8A]">School A (Quality: 94)</span>
          </div>

          <span className="text-[#64748B] font-bold text-lg hidden md:inline">→</span>
          <span className="text-[#64748B] font-bold text-lg md:hidden">↓</span>

          <div className="text-center p-3 bg-white rounded-[6px] border border-[#E2E8F0] w-full md:w-44">
            <span className="text-[10px] text-[#64748B] uppercase font-semibold block">Step 3</span>
            <span className="font-bold text-[#0B1F3A] block mt-1">Officer Reviewed</span>
            <span className="text-[11px] text-[#64748B]">Eligibility Verified</span>
          </div>

          <span className="text-[#64748B] font-bold text-lg hidden md:inline">→</span>
          <span className="text-[#64748B] font-bold text-lg md:hidden">↓</span>

          <div className="text-center p-3 bg-emerald-50 rounded-[6px] border border-emerald-200 w-full md:w-44">
            <span className="text-[10px] text-[#16A34A] uppercase font-semibold block">Step 4</span>
            <span className="font-bold text-[#16A34A] block mt-1">Officer Approved</span>
            <span className="text-[11px] text-[#16A34A]">Placement Confirmed</span>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="pt-2">
          <div className="text-xs font-bold text-[#0B1F3A] mb-3">
            Real-Time Audit History
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
                    <td className="py-2.5 px-3 font-medium text-[#0B1F3A]">
                      {event.actor}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono font-bold text-[11px] text-[#2563EB]">
                        {event.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#0B1F3A]">
                      {event.student_id ? `#${event.student_id.replace(/^S/, '104')}` : 'Cohort'}
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
