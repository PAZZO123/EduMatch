import React, { useState, useEffect } from 'react';
import {
  Layers,
  Cpu,
  School,
  FileCheck,
  CheckCircle2,
  Settings,
  User,
  ExternalLink,
  ChevronDown
} from 'lucide-react';
import { api } from '../services/api';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenSettings: () => void;
  activeRunId: string | null;
  activeRunStatus: string | null;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onOpenSettings,
  activeRunId,
  activeRunStatus
}) => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [backendHealthy, setBackendHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    api.checkHealth()
      .then(() => setBackendHealthy(true))
      .catch(() => setBackendHealthy(false));

    api.getMe()
      .then(res => setCurrentUser(res.user))
      .catch(() => {});
  }, []);

  const navLinks = [
    { id: 'landing', label: 'Overview' },
    { id: 'cohorts', label: 'Data & Cohorts' },
    { id: 'schools', label: 'Schools' },
    { id: 'workspace', label: 'Placement Workspace' },
    { id: 'review', label: 'Review & Export' },
    { id: 'acceptance', label: 'Acceptance Tests' }
  ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Zone 1: Single text element Brand Wordmark */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => onSelectTab('landing')}
              className="text-left group cursor-pointer focus:outline-none"
            >
              <span className="text-xl font-extrabold tracking-tight text-slate-900 group-hover:text-indigo-600 transition-colors">
                EduMatch AI
              </span>
            </button>

            {/* Quiet context metadata (unboxed, separated) */}
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 border-l border-slate-200 pl-4">
              <span>NESA O-Level Pilot</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-600">Synthetic v1.0</span>
              {activeRunId && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-indigo-600 font-medium">{activeRunId}</span>
                  {activeRunStatus && (
                    <span className="text-emerald-600 font-medium">({activeRunStatus})</span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Zone 2: Clean text navigation links */}
          <nav className="hidden md:flex items-center gap-1 sm:gap-2">
            {navLinks.map(link => {
              const isActive = currentTab === link.id;
              return (
                <button
                  key={link.id}
                  onClick={() => onSelectTab(link.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Actions & Officer Profile */}
          <div className="flex items-center gap-3">
            {/* Backend connectivity badge */}
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md border border-slate-200 transition-colors"
              title="API & Backend Connectivity Settings"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  backendHealthy === true
                    ? 'bg-emerald-500 ring-2 ring-emerald-200'
                    : backendHealthy === false
                    ? 'bg-rose-500'
                    : 'bg-amber-400'
                }`}
              />
              <span className="hidden sm:inline font-mono text-[11px]">
                {backendHealthy === true ? 'Backend Connected' : 'API Standby'}
              </span>
              <Settings className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {/* Officer Profile button */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 text-xs text-slate-700">
              <div className="w-7 h-7 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold flex items-center justify-center text-xs">
                AU
              </div>
              <div className="hidden xl:block text-left">
                <div className="font-semibold text-slate-900 leading-tight">A. Umutoni</div>
                <div className="text-[10px] text-slate-500 leading-tight">NESA Officer</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
