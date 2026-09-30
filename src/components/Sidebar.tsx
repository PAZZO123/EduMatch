import React from 'react';
import {
  LayoutDashboard,
  Users,
  School,
  GitBranch,
  BarChart3,
  CheckSquare,
  Settings,
  Compass,
  ExternalLink,
  LogOut,
  Sparkles,
  Shield,
  UserCheck
} from 'lucide-react';
import { authService, UserAccount } from '../services/auth';
import { RoleBadge } from './RoleBadge';

interface SidebarProps {
  currentView: string;
  onSelectView: (view: string) => void;
  onOpenLanding: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  pendingReviewCount: number;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  action?: () => void;
}

interface NavSection {
  heading: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onSelectView,
  onOpenLanding,
  onOpenSettings,
  onLogout,
  pendingReviewCount
}) => {
  const currentUser: UserAccount | null = authService.getCurrentUser();
  const userRole = currentUser?.role || 'Super Administrator';

  const rawNavSections: NavSection[] = [
    {
      heading: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }
      ]
    },
    {
      heading: 'Placement',
      items: [
        { id: 'students', label: userRole === 'School Administrator' ? 'Assigned Students' : 'Students', icon: Users },
        { id: 'schools', label: userRole === 'School Administrator' ? 'School Quota' : 'Schools', icon: School },
        { id: 'placement', label: 'Placements', icon: GitBranch, badge: pendingReviewCount > 0 ? pendingReviewCount : undefined }
      ]
    },
    {
      heading: 'Intelligence',
      items: [
        { id: 'responsible_ai', label: 'AI Recommendations', icon: Sparkles },
        { id: 'analytics', label: 'Analytics', icon: BarChart3 }
      ]
    },
    {
      heading: 'Administration',
      items: [
        { id: 'users', label: 'User Management', icon: Shield },
        { id: 'acceptance', label: 'Audit & Tests', icon: CheckSquare },
        { id: 'settings', label: 'Settings', icon: Settings, action: onOpenSettings }
      ]
    }
  ];

  // 5. Dynamically filter nav items according to the current role's permissions
  const filteredSections = rawNavSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => authService.hasPermission(userRole, item.id))
    }))
    .filter(section => section.items.length > 0);

  const initials = currentUser
    ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)
    : 'AU';

  return (
    <aside className="w-60 shrink-0 bg-[#0B1F3A] text-slate-300 flex flex-col justify-between border-r border-[#08172c] h-screen sticky top-0 select-none">
      {/* Top Branding Section */}
      <div className="p-5">
        <div className="flex items-center gap-3">
          {/* Geometric Logo [ E ] */}
          <div className="w-8 h-8 rounded-[6px] bg-[#2563EB] flex items-center justify-center text-white font-bold text-sm shadow-sm ring-1 ring-white/20">
            <span className="font-mono tracking-tighter">E·</span>
          </div>

          <div>
            <div className="text-white font-bold text-[15px] tracking-tight leading-tight flex items-center gap-1.5">
              <span>EduMatch</span>
              <span className="text-[#0F9D8A] font-semibold text-xs px-1 py-0.2 rounded bg-[#0F9D8A]/10 border border-[#0F9D8A]/30">
                AI
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-normal leading-tight mt-0.5">
              AI-assisted. Human-approved.
            </div>
          </div>
        </div>

        {/* 5. Role-Filtered Navigation Groups */}
        <nav className="mt-7 space-y-5">
          {filteredSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              <div className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {section.heading}
              </div>
              <div className="space-y-0.5">
                {section.items.map(item => {
                  const Icon = item.icon;
                  const isActive = currentView === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.action) {
                          item.action();
                        } else {
                          onSelectView(item.id);
                        }
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#2563EB] text-white shadow-xs'
                          : 'text-slate-300 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                        <span className="truncate">{item.label}</span>
                      </div>

                      {item.badge !== undefined && (
                        <span className="px-1.5 py-0.2 text-[10px] font-mono font-bold rounded-full bg-[#D97706] text-white">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Bottom Officer Profile & Public Page Link */}
      <div className="p-4 border-t border-white/10 space-y-3">
        <button
          onClick={onOpenLanding}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[6px] text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Compass className="w-3.5 h-3.5" />
            <span>Public Site</span>
          </div>
          <ExternalLink className="w-3 h-3 text-slate-400" />
        </button>

        {/* 2 & 7. Dynamic Role-Aware Profile Card & Logout */}
        <div className="p-2.5 rounded-[6px] bg-white/5 border border-white/10 space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#2563EB] text-white flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-xs font-semibold truncate leading-tight">
                {currentUser?.name || 'Administrator'}
              </div>
              <div className="text-[10px] text-slate-400 font-mono truncate leading-tight">
                {currentUser?.email || 'admin@edumatch.rw'}
              </div>
            </div>
          </div>

          <div className="pt-0.5">
            <RoleBadge role={userRole} size="sm" />
          </div>

          <button
            onClick={onLogout}
            className="w-full mt-1 py-1 px-2 text-[11px] font-semibold text-rose-300 hover:text-white hover:bg-rose-500/20 rounded-[4px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-rose-500/20"
          >
            <LogOut className="w-3 h-3" />
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
