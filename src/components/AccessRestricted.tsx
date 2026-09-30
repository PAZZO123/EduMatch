import React from 'react';
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react';
import { RoleType } from '../services/auth';
import { RoleBadge } from './RoleBadge';

interface AccessRestrictedProps {
  currentRole?: RoleType;
  requestedPage: string;
  onReturnDashboard: () => void;
}

export const AccessRestricted: React.FC<AccessRestrictedProps> = ({
  currentRole,
  requestedPage,
  onReturnDashboard
}) => {
  return (
    <div className="p-8 max-w-2xl mx-auto my-12 text-center space-y-6">
      <div className="bg-white rounded-[8px] border border-[#E2E8F0] shadow-sm p-8 sm:p-10 space-y-6">
        <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 text-[#DC2626] mx-auto flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">
            Access Restricted
          </h2>
          <p className="text-sm text-[#64748B] max-w-md mx-auto">
            You don't have permission to access the <strong>{requestedPage}</strong> page under your current role privilege level.
          </p>
        </div>

        {currentRole && (
          <div className="p-4 bg-slate-50 border border-[#E2E8F0] rounded-[6px] text-xs flex items-center justify-center gap-3">
            <span className="text-[#64748B]">Your Current Role:</span>
            <RoleBadge role={currentRole} />
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={onReturnDashboard}
            className="px-5 py-2.5 bg-[#0B1F3A] hover:bg-slate-800 text-white font-semibold text-xs rounded-[6px] shadow-xs transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    </div>
  );
};
