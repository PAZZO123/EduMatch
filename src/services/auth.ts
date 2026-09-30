/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// MOCK ROLE-BASED AUTHENTICATION — replace with secure backend authentication and authorization before production.

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

const AUTH_KEY = 'edumatch_admin_authenticated';
const USER_KEY = 'edumatch_admin_user';
const USERS_LIST_KEY = 'edumatch_users_directory';

// 1. Supported Mock Demo Accounts
export const DEMO_ACCOUNTS: Record<string, { email: string; password: string; user: UserAccount }> = {
  superadmin: {
    email: 'superadmin@edumatch.rw',
    password: 'SuperAdmin@2026',
    user: {
      id: 'USR-001',
      name: 'Eric Tuyishime',
      email: 'superadmin@edumatch.rw',
      role: 'Super Administrator',
      department: 'National Examination and School Inspection Authority',
      status: 'Active',
      lastActive: 'Just now'
    }
  },
  placement: {
    email: 'placement@edumatch.rw',
    password: 'Placement@2026',
    user: {
      id: 'USR-002',
      name: 'Aline Umutoni',
      email: 'placement@edumatch.rw',
      role: 'Placement Administrator',
      department: 'NESA Placement Directorate',
      status: 'Active',
      lastActive: '12 mins ago'
    }
  },
  school: {
    email: 'school@edumatch.rw',
    password: 'School@2026',
    user: {
      id: 'USR-003',
      name: 'Jean-Paul Gasana',
      email: 'school@edumatch.rw',
      role: 'School Administrator',
      department: 'GS Sainte Famille (Kigali)',
      status: 'Active',
      lastActive: '1 hour ago',
      schoolId: 'SCH-01',
      schoolName: 'GS Sainte Famille'
    }
  },
  officer: {
    email: 'officer@edumatch.rw',
    password: 'Officer@2026',
    user: {
      id: 'USR-004',
      name: 'Diane Uwase',
      email: 'officer@edumatch.rw',
      role: 'Placement Officer',
      department: 'NESA Basic Education Committee',
      status: 'Active',
      lastActive: '3 hours ago'
    }
  }
};

// Initial directory list
const DEFAULT_DIRECTORY: UserAccount[] = [
  DEMO_ACCOUNTS.superadmin.user,
  DEMO_ACCOUNTS.placement.user,
  DEMO_ACCOUNTS.school.user,
  DEMO_ACCOUNTS.officer.user,
  {
    id: 'USR-005',
    name: 'Thierry Mugenzi',
    email: 't.mugenzi@nesa.gov.rw',
    role: 'Placement Officer',
    department: 'Northern Province Placement Team',
    status: 'Active',
    lastActive: 'Yesterday'
  },
  {
    id: 'USR-006',
    name: 'Claire Mukamwezi',
    email: 'c.mukamwezi@nesa.gov.rw',
    role: 'Placement Administrator',
    department: 'Southern Province Directorate',
    status: 'Active',
    lastActive: '2 days ago'
  }
];

// 4 & 8. Permission Matrix: Views allowed per role
export const ROLE_PERMISSIONS: Record<RoleType, string[]> = {
  'Super Administrator': [
    'dashboard',
    'students',
    'schools',
    'placement',
    'responsible_ai',
    'analytics',
    'users',
    'acceptance',
    'settings',
    'account'
  ],
  'Placement Administrator': [
    'dashboard',
    'students',
    'schools',
    'placement',
    'responsible_ai',
    'analytics',
    'account'
  ],
  'School Administrator': [
    'dashboard',
    'schools',
    'students',
    'placement',
    'account'
  ],
  'Placement Officer': [
    'dashboard',
    'students',
    'placement',
    'responsible_ai',
    'account'
  ]
};

export const authService = {
  isAuthenticated(): boolean {
    try {
      return localStorage.getItem(AUTH_KEY) === 'true';
    } catch {
      return false;
    }
  },

  getCurrentUser(): UserAccount | null {
    try {
      const data = localStorage.getItem(USER_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // Fallback
    }
    if (this.isAuthenticated()) {
      return DEMO_ACCOUNTS.superadmin.user;
    }
    return null;
  },

  hasPermission(role: RoleType | undefined, viewId: string): boolean {
    if (!role) return false;
    const allowed = ROLE_PERMISSIONS[role] || [];
    return allowed.includes(viewId);
  },

  async login(email: string, password: string): Promise<{ success: boolean; error?: string; user?: UserAccount }> {
    // Brief realistic delay
    await new Promise(resolve => setTimeout(resolve, 450));

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    // Check against demo accounts
    for (const key of Object.keys(DEMO_ACCOUNTS)) {
      const account = DEMO_ACCOUNTS[key];
      if (account.email.toLowerCase() === cleanEmail && account.password === cleanPassword) {
        try {
          localStorage.setItem(AUTH_KEY, 'true');
          localStorage.setItem(USER_KEY, JSON.stringify(account.user));
        } catch (e) {
          console.error(e);
        }
        return { success: true, user: account.user };
      }
    }

    // Legacy fallback for admin@edumatch.rw
    if (cleanEmail === 'admin@edumatch.rw' && cleanPassword === 'EduMatch@2026') {
      const user = DEMO_ACCOUNTS.superadmin.user;
      localStorage.setItem(AUTH_KEY, 'true');
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return { success: true, user };
    }

    return {
      success: false,
      error: 'Invalid email or password.'
    };
  },

  async register(params: {
    name: string;
    email: string;
    password: string;
    role: 'Placement Officer' | 'School Administrator';
    department?: string;
  }): Promise<{ success: boolean; error?: string; user?: UserAccount }> {
    await new Promise(resolve => setTimeout(resolve, 500));

    const cleanEmail = params.email.trim().toLowerCase();
    const cleanName = params.name.trim();

    if (!cleanName || !cleanEmail || !params.password) {
      return { success: false, error: 'All fields are required.' };
    }

    // Security requirement: Never allow Super Administrator or Placement Administrator via public signup
    if (params.role !== 'Placement Officer' && params.role !== 'School Administrator') {
      return { success: false, error: 'Unauthorized role assignment requested.' };
    }

    const list = this.getUsersDirectory();
    if (list.some(u => u.email.toLowerCase() === cleanEmail)) {
      return { success: false, error: 'An account with this email address already exists.' };
    }

    const createdUser: UserAccount = {
      id: `USR-${String(list.length + 1).padStart(3, '0')}`,
      name: cleanName,
      email: cleanEmail,
      role: params.role,
      department: params.department || (params.role === 'School Administrator' ? 'Assigned Secondary Institution' : 'District Placement Committee'),
      status: 'Active',
      lastActive: 'Just now'
    };

    const updatedList = [createdUser, ...list];
    try {
      localStorage.setItem(USERS_LIST_KEY, JSON.stringify(updatedList));
      localStorage.setItem(AUTH_KEY, 'true');
      localStorage.setItem(USER_KEY, JSON.stringify(createdUser));
    } catch (e) {
      console.error(e);
    }

    return { success: true, user: createdUser };
  },

  logout(): void {
    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.error(e);
    }
  },

  updateCurrentUser(updated: Partial<UserAccount>): UserAccount | null {
    const current = this.getCurrentUser();
    if (!current) return null;
    const merged: UserAccount = { ...current, ...updated };
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(merged));
      // Also update in directory
      this.updateUserInDirectory(merged);
    } catch (e) {
      console.error(e);
    }
    return merged;
  },

  // 6. User Management Directory
  getUsersDirectory(): UserAccount[] {
    try {
      const data = localStorage.getItem(USERS_LIST_KEY);
      if (data) return JSON.parse(data);
    } catch {
      // Fallback
    }
    return DEFAULT_DIRECTORY;
  },

  saveUserToDirectory(newUser: Omit<UserAccount, 'id' | 'lastActive'>): UserAccount {
    const list = this.getUsersDirectory();
    const user: UserAccount = {
      ...newUser,
      id: `USR-00${list.length + 1}`,
      lastActive: 'New'
    };
    const updated = [user, ...list];
    try {
      localStorage.setItem(USERS_LIST_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    return user;
  },

  updateUserInDirectory(user: UserAccount): void {
    const list = this.getUsersDirectory();
    const updated = list.map(u => (u.id === user.id ? user : u));
    try {
      localStorage.setItem(USERS_LIST_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  },

  toggleUserStatus(userId: string): UserAccount[] {
    const list = this.getUsersDirectory();
    const updated = list.map(u => {
      if (u.id === userId) {
        return {
          ...u,
          status: (u.status === 'Active' ? 'Inactive' : 'Active') as 'Active' | 'Inactive'
        };
      }
      return u;
    });
    try {
      localStorage.setItem(USERS_LIST_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    return updated;
  }
};
