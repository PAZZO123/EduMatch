import React from 'react';
import { RoleType } from '../services/auth';

interface RoleBadgeProps {
  role: RoleType | string;
  size?: 'sm' | 'md';
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, size = 'md' }) => {
  const getBadgeStyle = () => {
    switch (role) {
      case 'Super Administrator':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Placement Administrator':
        return 'bg-blue-50 text-[#0077B6] border-blue-200';
      case 'School Administrator':
        return 'bg-amber-50 text-[#D97706] border-amber-200';
      case 'Placement Officer':
        return 'bg-[#F0FAF9] text-[#20B2AA] border-[#B1E5E0]';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const isSmall = size === 'sm';

  return (
    <span
      className={`inline-flex items-center font-mono font-bold uppercase tracking-wider rounded-[4px] border ${getBadgeStyle()} ${
        isSmall ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'
      }`}
    >
      {role}
    </span>
  );
};
