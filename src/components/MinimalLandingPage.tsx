import React from 'react';
import { ArrowRight, CheckCircle2, ShieldCheck, Compass, School, Users } from 'lucide-react';

interface MinimalLandingPageProps {
  onEnterPlatform: () => void;
}

export const MinimalLandingPage: React.FC<MinimalLandingPageProps> = ({ onEnterPlatform }) => {
  return (
    <div className="min-h-screen bg-white text-[#0F172A] flex flex-col justify-between selection:bg-[#2563EB] selection:text-white">
      {/* Top Simple Header */}
      <header className="h-16 border-b border-[#E2E8F0] px-6 sm:px-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-[6px] bg-[#2563EB] flex items-center justify-center text-white font-bold text-xs shadow-xs">
            <span className="font-mono">E·</span>
          </div>
          <span className="font-extrabold text-base tracking-tight text-[#0B1F3A]">
            EduMatch AI
          </span>
          <span className="hidden sm:inline text-xs text-[#64748B] pl-2 border-l border-[#E2E8F0]">
            AI-assisted. Human-approved.
          </span>
        </div>

        <button
          onClick={onEnterPlatform}
          className="px-3.5 py-1.5 bg-[#0B1F3A] hover:bg-slate-800 text-white text-xs font-semibold rounded-[6px] transition-colors cursor-pointer"
        >
          Launch Console
        </button>
      </header>

      {/* 15. Centered Minimal Hero */}
      <main className="max-w-4xl mx-auto px-6 py-16 sm:py-24 text-center space-y-8">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-[#0B1F3A] text-xs font-medium">
            <span>NESA Challenge 2026</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#0F9D8A] font-semibold">O-Level Secondary Placement</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-[#0B1F3A] tracking-tight leading-[1.1] text-balance">
            Smarter Placement.<br />Better Opportunities.
          </h1>

          <p className="text-base sm:text-lg text-[#64748B] max-w-2xl mx-auto leading-relaxed">
            EduMatch AI helps education authorities match students with suitable schools using data-driven recommendations while keeping human decision-makers in control.
          </p>
        </div>

        {/* Action Button */}
        <div>
          <button
            onClick={onEnterPlatform}
            className="px-6 py-3 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-sm rounded-[6px] shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <span>Explore Platform</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* 16. A Cool Hero Visual: Network of Students -> EduMatch -> Schools */}
        <div className="pt-8 pb-4">
          <div className="max-w-md mx-auto p-6 bg-slate-50/70 border border-[#E2E8F0] rounded-[8px] text-center">
            <svg
              viewBox="0 0 400 240"
              className="w-full h-auto text-slate-400 stroke-current"
              fill="none"
              strokeWidth="1.5"
            >
              {/* Top: Students */}
              <text x="200" y="22" textAnchor="middle" fill="#64748B" fontSize="11" fontWeight="700" letterSpacing="1">
                STUDENTS (APPLICANTS)
              </text>
              <circle cx="100" cy="45" r="7" fill="#0B1F3A" stroke="#0B1F3A" />
              <circle cx="165" cy="45" r="7" fill="#0B1F3A" stroke="#0B1F3A" />
              <circle cx="235" cy="45" r="7" fill="#0B1F3A" stroke="#0B1F3A" />
              <circle cx="300" cy="45" r="7" fill="#0B1F3A" stroke="#0B1F3A" />

              {/* Connecting Lines down to Core */}
              <path d="M100 52 L175 110" stroke="#CBD5E1" strokeDasharray="3 3" />
              <path d="M165 52 L190 110" stroke="#2563EB" />
              <path d="M235 52 L210 110" stroke="#2563EB" />
              <path d="M300 52 L225 110" stroke="#CBD5E1" strokeDasharray="3 3" />

              {/* Center Core: EDU MATCH */}
              <rect x="140" y="105" width="120" height="34" rx="4" fill="#0B1F3A" stroke="#2563EB" strokeWidth="1.5" />
              <text x="200" y="126" textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="700">
                EDU MATCH AI
              </text>

              {/* Connecting Lines down to Schools */}
              <path d="M175 139 L120 185" stroke="#0F9D8A" />
              <path d="M200 139 L200 185" stroke="#0F9D8A" />
              <path d="M225 139 L280 185" stroke="#0F9D8A" />

              {/* Bottom: Schools */}
              <circle cx="120" cy="192" r="7" fill="#0F9D8A" stroke="#0F9D8A" />
              <circle cx="200" cy="192" r="7" fill="#0F9D8A" stroke="#0F9D8A" />
              <circle cx="280" cy="192" r="7" fill="#0F9D8A" stroke="#0F9D8A" />
              <text x="200" y="222" textAnchor="middle" fill="#64748B" fontSize="11" fontWeight="700" letterSpacing="1">
                SCHOOLS (CAPACITY POOLS)
              </text>
            </svg>
            <div className="text-[11px] text-[#64748B] mt-2">
              Many students → Intelligent matching engine → School capacity pools
            </div>
          </div>
        </div>

        {/* Minimal Proof Points */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-[#E2E8F0] text-left">
          <div className="p-4 bg-white rounded-[8px] border border-[#E2E8F0]">
            <div className="text-xs font-bold text-[#0B1F3A] mb-1">Human-in-the-Loop</div>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Every draft recommendation requires officer approval. The platform never bypasses human judgment.
            </p>
          </div>

          <div className="p-4 bg-white rounded-[8px] border border-[#E2E8F0]">
            <div className="text-xs font-bold text-[#0B1F3A] mb-1">Deterministic Rules</div>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Guarantees zero capacity overflow and 100% eligibility threshold enforcement before sign-off.
            </p>
          </div>

          <div className="p-4 bg-white rounded-[8px] border border-[#E2E8F0]">
            <div className="text-xs font-bold text-[#0B1F3A] mb-1">Auditability & Transparency</div>
            <p className="text-xs text-[#64748B] leading-relaxed">
              Every placement records the applied rules, preference ranking, and officer justification facts.
            </p>
          </div>
        </div>
      </main>

      {/* Minimal Footer */}
      <footer className="h-14 border-t border-[#E2E8F0] px-6 text-xs text-[#64748B] flex items-center justify-between">
        <div>
          EduMatch AI · NESA Challenge Group 3
        </div>
        <div>
          AI recommends. NESA decides.
        </div>
      </footer>
    </div>
  );
};
