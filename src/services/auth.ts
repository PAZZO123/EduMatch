/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Authentication backed by the FastAPI server: HttpOnly session cookie + CSRF token, roles enforced
// server-side. The UI keeps a cached copy of the signed-in profile for synchronous rendering only —
// it grants nothing; every protected request is re-checked by the backend.

import { api, http } from './api';

export type RoleType =
  | 'Super Administrator'
  | 'Placement Administrator'
  | 'School Administrator'
  | 'Placement Officer';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: RoleType;
  department: string;
  status: 'Active' | 'Inactive';
  lastActive: string;
  schoolId?: string;
  schoolName?: string;
}

const USER_KEY = 'edumatch_admin_user';
let directoryCache: UserAccount[] = [];

// Demo account emails for the sign-in shortcuts. Passwords are NOT stored in the frontend:
// they are generated into backend/.env by `python backend/scripts/init_env.py`.
export const DEMO_ACCOUNTS: Record<string, { email: string; password: string; user: UserAccount }> = {
  superadmin: {
    email: 'superadmin@edumatch.rw',
    password: '',
    user: { id: 'demo-superadmin', name: 'Demo Super Administrator', email: 'superadmin@edumatch.rw', role: 'Super Administrator', department: 'EduMatch demo', status: 'Active', lastActive: '' }
  },
  placement: {
    email: 'placement@edumatch.rw',
    password: '',
    user: { id: 'demo-placement', name: 'Demo Placement Administrator', email: 'placement@edumatch.rw', role: 'Placement Administrator', department: 'EduMatch demo', status: 'Active', lastActive: '' }
  },
  school: {
    email: 'school@edumatch.rw',
    password: '',
    user: { id: 'demo-school', name: 'Demo School Administrator', email: 'school@edumatch.rw', role: 'School Administrator', department: 'EduMatch demo', status: 'Active', lastActive: '' }
  },
  officer: {
    email: 'officer@edumatch.rw',
    password: '',
    user: { id: 'demo-officer', name: 'Demo Placement Officer', email: 'officer@edumatch.rw', role: 'Placement Officer', department: 'EduMatch demo', status: 'Active', lastActive: '' }
  }
};

// Which screens each role may open (UI convenience; the backend enforces the real permissions).
export const ROLE_PERMISSIONS: Record<RoleType, string[]> = {
  'Super Administrator': ['dashboard', 'data', 'students', 'schools', 'placement', 'review', 'history', 'responsible_ai', 'analytics', 'users', 'acceptance', 'settings', 'account'],
  'Placement Administrator': ['dashboard', 'data', 'students', 'schools', 'placement', 'review', 'history', 'responsible_ai', 'analytics', 'acceptance', 'account'],
  'School Administrator': ['dashboard', 'schools', 'students', 'placement', 'review', 'history', 'account'],
  'Placement Officer': ['dashboard', 'data', 'students', 'schools', 'placement', 'review', 'history', 'responsible_ai', 'account']
};

/** Mirrors backend/app/roles.py: ADMIN may change inputs, reset and switch models. */
export const isAdminRole = (role?: RoleType) => role === 'Super Administrator' || role === 'Placement Administrator';
/** ADMIN and OFFICER may generate runs and approve / change / reject proposals; School Administrators only view. */
export const canReviewRole = (role?: RoleType) => isAdminRole(role) || role === 'Placement Officer';

const ROLE_BY_BACKEND: Record<string, RoleType> = {
  ADMIN: 'Super Administrator',
  OFFICER: 'Placement Officer',
  VIEWER: 'School Administrator'
};

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

export function toUserAccount(u: any): UserAccount {
  return {
    id: `USR-${u.id}`,
    name: u.display_name,
    email: u.email,
    role: (u.title as RoleType) || ROLE_BY_BACKEND[u.role] || 'Placement Officer',
    department: u.department || '',
    status: u.is_active ? 'Active' : 'Inactive',
    lastActive: u.status === 'Pending' ? 'Pending activation' : relativeTime(u.last_login_at)
  };
}

const backendId = (userId: string) => Number(userId.replace(/^USR-/, ''));

function cacheUser(user: UserAccount | null) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

function errorMessage(err: any, fallback: string): string {
  return err?.details?.message || err?.message || fallback;
}

export const authService = {
  /** Cached flag for first paint; App confirms it with `restoreSession()` against the server. */
  isAuthenticated(): boolean {
    return this.getCurrentUser() !== null;
  },

  getCurrentUser(): UserAccount | null {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? (JSON.parse(data) as UserAccount) : null;
    } catch {
      return null;
    }
  },

  /** Ask the server whether the session cookie is still valid; refreshes the cached profile. */
  async restoreSession(): Promise<UserAccount | null> {
    try {
      const { user } = await api.getMe();
      const account = toUserAccount(user);
      cacheUser(account);
      return account;
    } catch {
      cacheUser(null);
      return null;
    }
  },

  hasPermission(role: RoleType | undefined, viewId: string): boolean {
    if (!role) return false;
    return (ROLE_PERMISSIONS[role] || []).includes(viewId);
  },

  async login(email: string, password: string): Promise<{ success: boolean; error?: string; user?: UserAccount }> {
    try {
      const res = await api.login(email.trim().toLowerCase(), password);
      const user = toUserAccount(res.user);
      cacheUser(user);
      return { success: true, user };
    } catch (err: any) {
      return { success: false, error: errorMessage(err, 'Invalid email or password.') };
    }
  },

  /** Self-registration creates an INACTIVE account; an administrator must activate it before sign-in. */
  async register(params: {
    name: string;
    email: string;
    password: string;
    role: 'Placement Officer' | 'School Administrator';
    department?: string;
  }): Promise<{ success: boolean; error?: string; user?: UserAccount }> {
    try {
      const res = await http.post<any>('/auth/register', {
        name: params.name.trim(),
        email: params.email.trim().toLowerCase(),
        password: params.password,
        role: params.role,
        department: params.department
      });
      // Not signed in yet: surface the pending-activation message instead of entering the app.
      return { success: false, error: res.message };
    } catch (err: any) {
      return { success: false, error: errorMessage(err, 'Registration could not be completed.') };
    }
  },

  logout(): void {
    cacheUser(null);
    api.logout().catch(() => undefined);
  },

  /** Updates the display name / department on the server; the email is the sign-in name and stays fixed. */
  updateCurrentUser(updated: Partial<UserAccount>): UserAccount | null {
    const current = this.getCurrentUser();
    if (!current) return null;
    const merged: UserAccount = { ...current, ...updated, email: current.email };
    cacheUser(merged);
    const body: Record<string, string> = {};
    if (updated.name) body.display_name = updated.name;
    if (updated.department !== undefined) body.department = updated.department;
    if (Object.keys(body).length) {
      http
        .patch<any>('/auth/me', body)
        .then(res => cacheUser(toUserAccount(res.user)))
        .catch(() => undefined);
    }
    return merged;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    try {
      await http.post('/auth/password', { current_password: currentPassword, new_password: newPassword });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: errorMessage(err, 'Password could not be changed.') };
    }
  },

  // ---- User management (administrators) ----------------------------------------------------
  /** Last directory fetched from the server (synchronous, for rendering). */
  getUsersDirectory(): UserAccount[] {
    return directoryCache;
  },

  async refreshUsersDirectory(): Promise<UserAccount[]> {
    const res = await http.get<{ users: any[] }>('/users');
    directoryCache = res.users.map(toUserAccount);
    return directoryCache;
  },

  /** Creates an active account; the server returns a one-time temporary password to hand over securely. */
  async saveUserToDirectory(
    newUser: Omit<UserAccount, 'id' | 'lastActive'>
  ): Promise<{ user: UserAccount; temporaryPassword: string }> {
    const res = await http.post<any>('/users', {
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      department: newUser.department
    });
    await this.refreshUsersDirectory();
    return { user: toUserAccount(res.user), temporaryPassword: res.temporary_password };
  },

  async updateUserInDirectory(user: UserAccount): Promise<void> {
    await http.patch(`/users/${backendId(user.id)}`, {
      display_name: user.name,
      department: user.department,
      role: user.role,
      is_active: user.status === 'Active'
    });
    await this.refreshUsersDirectory();
  },

  async toggleUserStatus(userId: string): Promise<UserAccount[]> {
    const user = directoryCache.find(u => u.id === userId);
    if (!user) return directoryCache;
    await http.patch(`/users/${backendId(userId)}`, { is_active: user.status !== 'Active' });
    return this.refreshUsersDirectory();
  }
};
