import React, { useState } from 'react';
import {
  User,
  KeyRound,
  Shield,
  CheckCircle2,
  Mail,
  Building,
  Clock,
  Edit2,
  Lock,
  X
} from 'lucide-react';
import { authService, UserAccount } from '../services/auth';
import { RoleBadge } from './RoleBadge';

interface MyAccountScreenProps {
  currentUser: UserAccount | null;
  onUserUpdated: () => void;
}

export const MyAccountScreen: React.FC<MyAccountScreenProps> = ({
  currentUser,
  onUserUpdated
}) => {
  const [feedback, setFeedback] = useState<string | null>(null);

  // Edit Profile Modal
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [nameInput, setNameInput] = useState(currentUser?.name || '');
  const [emailInput, setEmailInput] = useState(currentUser?.email || '');

  // Change Password Modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !emailInput.trim()) return;

    authService.updateCurrentUser({
      name: nameInput.trim(),
      email: emailInput.trim()
    });

    setFeedback('Profile details updated successfully.');
    setEditProfileOpen(false);
    onUserUpdated();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    const result = await authService.changePassword(currentPassword, newPassword);
    if (!result.success) {
      setPasswordError(result.error || 'Password could not be changed.');
      return;
    }
    setFeedback('Password changed. Other signed-in devices were signed out.');
    setPasswordModalOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const user = currentUser || {
    name: 'Eric Tuyishime',
    email: 'superadmin@edumatch.rw',
    role: 'Super Administrator',
    department: 'National Examination and School Inspection Authority',
    status: 'Active',
    lastActive: 'Just now'
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="border-b border-[#E2E8F0] pb-5">
        <div className="text-xs font-semibold text-[#64748B] mb-1">
          Account Administration & Security
        </div>
        <h1 className="text-2xl font-bold text-[#172554] tracking-tight">
          My Account
        </h1>
        <p className="text-xs text-[#64748B] mt-0.5">
          View your administrative identity, current role permissions, and session credentials.
        </p>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-[6px] text-xs text-[#16A34A] font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="font-bold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Profile Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Column: Profile Card */}
        <div className="md:col-span-7 bg-white rounded-[8px] border border-[#E2E8F0] p-6 space-y-6">
          <div className="flex items-start justify-between border-b border-[#E2E8F0] pb-5">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-[#2563EB] text-white flex items-center justify-center font-bold text-base shadow-xs">
                {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h2 className="text-lg font-bold text-[#172554]">{user.name}</h2>
                <div className="font-mono text-xs text-[#64748B]">{user.email}</div>
                <div className="mt-1">
                  <RoleBadge role={user.role} />
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setNameInput(user.name);
                setEmailInput(user.email);
                setEditProfileOpen(true);
              }}
              className="px-3 py-1.5 text-xs font-semibold text-[#172554] hover:bg-slate-100 rounded-[6px] border border-[#E2E8F0] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 text-[#64748B]" />
              <span>Edit Profile</span>
            </button>
          </div>

          {/* Details Table */}
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-[#64748B]">Full Name</span>
              <span className="font-semibold text-[#172554]">{user.name}</span>
            </div>

            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-[#64748B]">Email Address</span>
              <span className="font-mono text-[#172554]">{user.email}</span>
            </div>

            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-[#64748B]">Assigned Role</span>
              <RoleBadge role={user.role} size="sm" />
            </div>

            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-[#64748B]">Account Status</span>
              <span className="inline-flex items-center gap-1 text-[#16A34A] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                <span>{user.status || 'Active'}</span>
              </span>
            </div>

            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-[#64748B]">Department / Agency</span>
              <span className="text-[#172554]">{user.department}</span>
            </div>

            <div className="flex justify-between py-2">
              <span className="text-[#64748B]">Last Session Login</span>
              <span className="font-mono text-[#64748B]">{user.lastActive || 'Just now'}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between">
            <div className="text-[11px] text-[#64748B]">
              Session managed via local role-based security context.
            </div>

            <button
              onClick={() => setPasswordModalOpen(true)}
              className="px-3.5 py-1.5 text-xs font-semibold text-[#2563EB] hover:bg-blue-50 rounded-[6px] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Change Password</span>
            </button>
          </div>
        </div>

        {/* Right Column: Privilege & Scope Overview */}
        <div className="md:col-span-5 bg-white rounded-[8px] border border-[#E2E8F0] p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#172554] border-b border-[#E2E8F0] pb-3">
            <Shield className="w-4 h-4 text-[#2563EB]" />
            <span>Role Privilege Level</span>
          </div>

          <p className="text-xs text-[#64748B] leading-relaxed">
            Your permissions are determined by the <strong>{user.role}</strong> credential group.
          </p>

          <div className="space-y-2 text-xs">
            <div className="p-3 bg-slate-50 border border-[#E2E8F0] rounded-[6px] space-y-1">
              <div className="font-semibold text-[#172554]">Review & Recommendations</div>
              <p className="text-[11px] text-[#64748B]">
                Access to student scores, school capacities, and explainable AI placement proposals.
              </p>
            </div>

            {user.role === 'Super Administrator' && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-[6px] space-y-1">
                <div className="font-semibold text-[#2563EB]">User & System Management</div>
                <p className="text-[11px] text-slate-600">
                  Full authority to add users, change role assignments, and configure backend API connections.
                </p>
              </div>
            )}

            {user.role === 'School Administrator' && (
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-[6px] space-y-1">
                <div className="font-semibold text-[#D97706]">School Quota Oversight</div>
                <p className="text-[11px] text-slate-600">
                  Focused access to physical seat quotas, incoming applicants, and confirmed school rosters.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {editProfileOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-bold text-sm text-[#172554]">Edit Profile Details</h3>
              <button onClick={() => setEditProfileOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#172554] mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  className="w-full p-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172554] mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  className="w-full p-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setEditProfileOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-[#64748B] hover:text-[#172554]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs rounded-[6px]"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {passwordModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-bold text-sm text-[#172554]">Change Account Password</h3>
              <button onClick={() => setPasswordModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            {passwordError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-[#DC2626] rounded-[6px] text-xs">
                {passwordError}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#172554] mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full p-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172554] mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full p-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#172554] mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full p-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-[#64748B] hover:text-[#172554]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold text-xs rounded-[6px]"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
