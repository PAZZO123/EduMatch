import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  CheckCircle2,
  XCircle,
  MoreVertical,
  Mail,
  Edit,
  UserCheck,
  UserX,
  X
} from 'lucide-react';
import { authService, UserAccount, RoleType } from '../services/auth';
import { RoleBadge } from './RoleBadge';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');

  // Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<RoleType>('Placement Officer');
  const [newDepartment, setNewDepartment] = useState('NESA Placement Committee');
  const [feedback, setFeedback] = useState<string | null>(null);

  // View / Edit Modal State
  const [activeUserDetail, setActiveUserDetail] = useState<UserAccount | null>(null);

  const loadUsers = () => {
    setUsers(authService.getUsersDirectory());
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newEmail.trim()) return;

    authService.saveUserToDirectory({
      name: newName.trim(),
      email: newEmail.trim().toLowerCase(),
      role: newRole,
      department: newDepartment.trim(),
      status: 'Active'
    });

    setFeedback(`User ${newName} created successfully.`);
    setAddModalOpen(false);
    setNewName('');
    setNewEmail('');
    loadUsers();
  };

  const handleToggleStatus = (userId: string) => {
    const updated = authService.toggleUserStatus(userId);
    setUsers(updated);
    setFeedback('User status updated.');
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.department.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    return true;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E2E8F0] pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#64748B] mb-1">
            <Shield className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Super Administrator Privileges</span>
          </div>
          <h1 className="text-2xl font-bold text-[#0B1F3A] tracking-tight">
            User & Access Management
          </h1>
          <p className="text-xs text-[#64748B] mt-0.5">
            Manage administrative personnel, assignment officers, and role-based permissions.
          </p>
        </div>

        <button
          onClick={() => {
            setFeedback(null);
            setAddModalOpen(true);
          }}
          className="px-4 py-2 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs rounded-[6px] shadow-xs transition-colors flex items-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Add User</span>
        </button>
      </div>

      {feedback && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-[6px] text-xs text-[#16A34A] font-medium flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="font-bold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search name, email, department..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
          />
        </div>

        <div className="flex items-center gap-1 border border-[#E2E8F0] rounded-[6px] p-0.5 bg-white text-xs overflow-x-auto">
          {['ALL', 'Super Administrator', 'Placement Administrator', 'School Administrator', 'Placement Officer'].map(r => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-2.5 py-1 rounded-[4px] text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                roleFilter === r
                  ? 'bg-[#0B1F3A] text-white'
                  : 'text-[#64748B] hover:text-[#0B1F3A]'
              }`}
            >
              {r === 'ALL' ? 'All Roles' : r.replace(' Administrator', ' Admin')}
            </button>
          ))}
        </div>
      </div>

      {/* 6. Professional User Directory Table */}
      <div className="bg-white rounded-[8px] border border-[#E2E8F0] overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-[#E2E8F0] text-[#64748B] font-semibold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Department / Affiliation</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Last Active</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filteredUsers.map(user => {
                const isActive = user.status === 'Active';

                return (
                  <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#0B1F3A] text-white flex items-center justify-center font-bold text-xs shrink-0">
                          {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <span className="font-semibold text-[#0F172A] block">{user.name}</span>
                          <span className="font-mono text-[11px] text-[#64748B]">{user.email}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <RoleBadge role={user.role} />
                    </td>

                    <td className="py-3 px-4 text-[#64748B]">
                      {user.department}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          isActive
                            ? 'bg-emerald-50 text-[#16A34A] border border-emerald-200'
                            : 'bg-slate-100 text-[#64748B] border border-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-[#16A34A]' : 'bg-slate-400'}`} />
                        <span>{user.status}</span>
                      </span>
                    </td>

                    <td className="py-3 px-4 text-[#64748B] font-mono text-[11px]">
                      {user.lastActive}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setActiveUserDetail(user)}
                          className="px-2 py-1 text-xs text-[#2563EB] hover:bg-blue-50 rounded-[4px] font-semibold transition-colors cursor-pointer"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user.id)}
                          className={`px-2 py-1 text-xs rounded-[4px] font-semibold transition-colors cursor-pointer ${
                            isActive
                              ? 'text-[#DC2626] hover:bg-rose-50'
                              : 'text-[#16A34A] hover:bg-emerald-50'
                          }`}
                        >
                          {isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#0B1F3A]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] shadow-xl max-w-md w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h3 className="font-bold text-sm text-[#0B1F3A]">Add New Administrative User</h3>
                <span className="text-[11px] text-[#64748B]">Create credentials and role privileges</span>
              </div>
              <button onClick={() => setAddModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#0B1F3A] mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. Marie Mukamana"
                  className="w-full p-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B1F3A] mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="m.mukamana@edumatch.rw"
                  className="w-full p-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B1F3A] mb-1">
                  Account Role *
                </label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as RoleType)}
                  className="w-full p-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:ring-1 focus:ring-[#2563EB]"
                >
                  <option value="Placement Officer">Placement Officer (Review & proposals)</option>
                  <option value="Placement Administrator">Placement Administrator (Directorate level)</option>
                  <option value="School Administrator">School Administrator (Institution quota)</option>
                  <option value="Super Administrator">Super Administrator (Full authority)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#0B1F3A] mb-1">
                  Department / Organization
                </label>
                <input
                  type="text"
                  value={newDepartment}
                  onChange={e => setNewDepartment(e.target.value)}
                  placeholder="NESA Basic Education Committee"
                  className="w-full p-2 bg-white border border-[#E2E8F0] rounded-[6px] text-xs focus:ring-1 focus:ring-[#2563EB]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-3.5 py-1.5 text-[#64748B] hover:text-[#0B1F3A] text-xs font-semibold rounded-[6px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#2563EB] hover:bg-blue-700 text-white font-semibold text-xs rounded-[6px] transition-colors"
                >
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Details Modal */}
      {activeUserDetail && (
        <div className="fixed inset-0 z-50 bg-[#0B1F3A]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-[8px] border border-[#E2E8F0] shadow-xl max-w-sm w-full p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="font-bold text-sm text-[#0B1F3A]">User Profile Card</h3>
              <button onClick={() => setActiveUserDetail(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-[#64748B]">User ID</span>
                <span className="font-mono text-[#0B1F3A]">{activeUserDetail.id}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-[#64748B]">Name</span>
                <span className="font-bold text-[#0B1F3A]">{activeUserDetail.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-[#64748B]">Email</span>
                <span className="font-mono text-[#0B1F3A]">{activeUserDetail.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 items-center">
                <span className="text-[#64748B]">Role</span>
                <RoleBadge role={activeUserDetail.role} size="sm" />
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-[#64748B]">Department</span>
                <span className="text-[#0B1F3A]">{activeUserDetail.department}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-[#64748B]">Status</span>
                <span className="font-semibold text-[#16A34A]">{activeUserDetail.status}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-[#64748B]">Last Active</span>
                <span className="font-mono text-[#64748B]">{activeUserDetail.lastActive}</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setActiveUserDetail(null)}
                className="px-4 py-1.5 bg-[#0B1F3A] text-white rounded-[6px] font-semibold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
