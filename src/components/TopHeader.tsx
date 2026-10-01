import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Download,
  Server,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  LogOut,
  User,
  Settings,
  Shield,
  HelpCircle,
  FileText,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { authService, UserAccount, canReviewRole } from '../services/auth';
import { RoleBadge } from './RoleBadge';

interface TopHeaderProps {
  currentView: string;
  onNavigateView: (view: string) => void;
  onRunEngine: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  activeRunId: string | null;
  isRunning: boolean;
  approvedCount: number;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  currentView,
  onNavigateView,
  onRunEngine,
  onOpenSettings,
  onLogout,
  activeRunId,
  isRunning,
  approvedCount
}) => {
  const [backendOk, setBackendOk] = useState(true);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentUser: UserAccount | null = authService.getCurrentUser();

  useEffect(() => {
    api.checkHealth()
      .then(() => setBackendOk(true))
      .catch(() => setBackendOk(false));
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const initials = currentUser
    ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)
    : 'AD';

  // SRS §3: officers generate runs too; School Administrators are read-only.
  const canRunPlacement = canReviewRole(currentUser?.role);

  return (
    <>
      <header className="h-14 bg-white border-b border-[#E2E8F0] px-6 flex items-center justify-between sticky top-0 z-30 select-none">
        {/* Left: 4 & 10. EduMatch AI Administration Portal */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <span className="font-extrabold text-[#172554] text-sm tracking-tight hidden sm:inline">
              EduMatch AI
            </span>
            <span className="text-[#64748B] text-xs hidden sm:inline">·</span>
            <span className="text-xs font-semibold text-[#172554]">
              Administration Portal
            </span>
          </div>

        </div>

        {/* Right Actions & Account Menu */}
        <div className="flex items-center gap-3">
          {/* Backend health status dot */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-xs text-[#64748B] hover:text-[#172554] hover:bg-slate-100 transition-colors cursor-pointer"
            title="Backend Connection Status"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                backendOk ? 'bg-[#16A34A]' : 'bg-[#DC2626]'
              }`}
            />
            <span className="hidden sm:inline font-mono text-[11px]">
              {backendOk ? 'API Connected' : 'API Standby'}
            </span>
          </button>

          {/* Export Approved CSV */}
          {activeRunId && approvedCount > 0 && (
            <a
              href={api.getExportUrl(activeRunId)}
              download="edumatch_approved_placements.csv"
              className="px-3 py-1.5 rounded-[6px] text-xs font-semibold text-[#1D4ED8] bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#DBEAFE] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export ({approvedCount})</span>
            </a>
          )}

          {/* Run Placement Engine (for Super Admin & Placement Admin) */}
          {canRunPlacement && (
            <button
              onClick={onRunEngine}
              disabled={isRunning}
              className="px-3.5 py-1.5 rounded-[6px] text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isRunning ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3 h-3 fill-current" />
              )}
              <span>{isRunning ? 'Allocating...' : 'Run Placement'}</span>
            </button>
          )}

          {/* 2 & 9. Polished Account Menu & Dropdown */}
          <div className="relative pl-3 border-l border-[#E2E8F0]" ref={dropdownRef}>
            <button
              onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
              className="flex items-center gap-2.5 p-1 rounded-[6px] hover:bg-[#EFF6FF] transition-colors cursor-pointer text-left"
            >
              <div className="w-7 h-7 rounded-full bg-[#2563EB] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                {initials}
              </div>
              <div className="hidden md:block text-left leading-tight">
                <span className="text-xs font-bold text-[#172554] block truncate max-w-[140px]">
                  {currentUser?.name || 'Administrator'}
                </span>
                <span className="text-[10px] text-[#64748B] block truncate max-w-[140px]">
                  {currentUser?.role || 'Super Administrator'}
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-[#64748B] transition-transform ${profileDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* 9. Polished Account Dropdown */}
            {profileDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-[8px] border border-[#E2E8F0] shadow-xl py-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                {/* Header summary */}
                <div className="px-3.5 py-2.5 border-b border-[#E2E8F0] space-y-1">
                  <div className="font-bold text-[#172554] text-xs truncate">
                    {currentUser?.name || 'Administrator'}
                  </div>
                  <div className="text-[11px] text-[#64748B] font-mono truncate">
                    {currentUser?.email || 'admin@edumatch.rw'}
                  </div>
                  <div className="pt-0.5">
                    <RoleBadge role={currentUser?.role || 'Super Administrator'} size="sm" />
                  </div>
                </div>

                {/* Navigation links */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onNavigateView('account');
                    }}
                    className="w-full px-3.5 py-1.5 text-left text-[#0F172A] hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                  >
                    <User className="w-3.5 h-3.5 text-[#2563EB]" />
                    <span>My Account</span>
                  </button>

                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      setProfileModalOpen(true);
                    }}
                    className="w-full px-3.5 py-1.5 text-left text-[#0F172A] hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <Shield className="w-3.5 h-3.5 text-[#64748B]" />
                    <span>Profile Details</span>
                  </button>

                  {currentUser?.role === 'Super Administrator' && (
                    <button
                      onClick={() => {
                        setProfileDropdownOpen(false);
                        onOpenSettings();
                      }}
                      className="w-full px-3.5 py-1.5 text-left text-[#0F172A] hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5 text-[#64748B]" />
                      <span>Settings & API</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      setHelpModalOpen(true);
                    }}
                    className="w-full px-3.5 py-1.5 text-left text-[#0F172A] hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-[#64748B]" />
                    <span>Help & Documentation</span>
                  </button>
                </div>

                {/* Distinct Logout */}
                <div className="border-t border-[#E2E8F0] pt-1 mt-0.5">
                  <button
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      onLogout();
                    }}
                    className="w-full px-3.5 py-2 text-left text-[#DC2626] hover:bg-rose-50 flex items-center gap-2 font-semibold cursor-pointer transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5 text-[#DC2626]" />
                    <span>Logout</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Profile Details Modal */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] shadow-xl max-w-sm w-full p-6 space-y-4 text-xs">
            <div className="flex items-center gap-3 border-b border-[#E2E8F0] pb-3">
              <div className="w-10 h-10 rounded-full bg-[#2563EB] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                {initials}
              </div>
              <div>
                <h3 className="font-bold text-sm text-[#172554]">{currentUser?.name}</h3>
                <span className="text-[#64748B] text-xs">{currentUser?.department}</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-[#64748B]">Email</span>
                <span className="font-mono font-medium text-[#172554]">{currentUser?.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 items-center">
                <span className="text-[#64748B]">Assigned Role</span>
                <RoleBadge role={currentUser?.role || ''} size="sm" />
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-[#64748B]">Affiliation</span>
                <span className="text-[#172554]">{currentUser?.department}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#64748B]">Status</span>
                <span className="font-semibold text-[#16A34A]">{currentUser?.status || 'Active'}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  setProfileModalOpen(false);
                  onNavigateView('account');
                }}
                className="px-3.5 py-1.5 text-[#2563EB] hover:bg-blue-50 rounded-[6px] font-semibold text-xs"
              >
                Go to My Account
              </button>
              <button
                onClick={() => setProfileModalOpen(false)}
                className="px-4 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-[6px] font-semibold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Help & Guide Modal */}
      {helpModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#2563EB]" />
                <h3 className="font-bold text-sm text-[#172554]">Platform Guidance & Help</h3>
              </div>
              <button onClick={() => setHelpModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-[#64748B] leading-relaxed">
              <p>
                <strong>EduMatch AI</strong> is an institutional decision-support system assisting Rwanda's National Examination and School Inspection Authority (NESA) with secondary school allocations.
              </p>
              <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-[6px] space-y-1 text-[#172554]">
                <div className="font-semibold">Role-Based Security Model</div>
                <p className="text-[11px] text-[#64748B]">
                  Your account role controls which candidate pools, quota limits, and administrative controls you can execute.
                </p>
              </div>
              <p>
                For technical issues or quota adjustments, contact NESA System Administration at <span className="font-mono text-[#2563EB]">admin@edumatch.rw</span>.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setHelpModalOpen(false)}
                className="px-4 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-[6px] font-semibold text-xs cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
