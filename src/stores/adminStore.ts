import { create } from 'zustand';

import { apiRequest } from '../lib/api';

export type UserRole = 'user' | 'admin' | 'super_admin';

export interface AdminStats {
  totals: {
    users: number;
    projects: number;
    files: number;
    activeSessions: number;
    tasks: number;
  };
  tasksByStatus: Record<string, number>;
  growth: {
    newUsers7d: number;
    newProjects7d: number;
  };
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  avatarUrl: string | null;
  projectCount: number;
  lastActiveAt: string | null;
  createdAt: string;
}

interface AdminUsersResponse {
  items: AdminUser[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminWorkspace {
  id: string;
  status: string;
  runtime: string;
  owner: string;
  project: string;
  createdAt: string;
}

export interface AdminPlatform {
  providers: string[];
  workspaces: { total: number; byStatus: Record<string, number> };
  usageTotals: { tokensIn: number; tokensOut: number };
  usageByProvider: { provider: string; tokensIn: number; tokensOut: number; calls: number }[];
}

export interface PlatformSettings {
  maintenanceMode: boolean;
  announcement: string;
}

export interface AdminPlatformUpdate {
  id: string;
  version: string;
  title: string;
  body: string;
  publishedAt: string;
}

export interface AdminFeedback {
  id: string;
  userEmail: string;
  category: string;
  message: string;
  page: string;
  status: 'new' | 'reviewed';
  createdAt: string;
}

interface AdminState {
  stats: AdminStats | null;
  users: AdminUser[];
  usersTotal: number;
  workspaces: AdminWorkspace[];
  platform: AdminPlatform | null;
  settings: PlatformSettings;
  isLoadingStats: boolean;
  isLoadingUsers: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
  fetchUsers: (params?: { search?: string; limit?: number; offset?: number }) => Promise<void>;
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
  fetchWorkspaces: () => Promise<void>;
  fetchPlatform: () => Promise<void>;
  fetchSettings: () => Promise<void>;
  saveSettings: (updates: Partial<PlatformSettings>) => Promise<void>;

  // Central update system (super admin): broadcasts, changelog, feedback triage.
  updates: AdminPlatformUpdate[];
  feedback: AdminFeedback[];
  broadcast: (title: string, message: string, link?: string) => Promise<number>;
  fetchUpdates: () => Promise<void>;
  publishUpdate: (u: { version: string; title: string; body: string; broadcast: boolean }) => Promise<void>;
  deleteUpdate: (id: string) => Promise<void>;
  fetchFeedback: () => Promise<void>;
  setFeedbackStatus: (id: string, status: 'new' | 'reviewed') => Promise<void>;
}

export const useAdminStore = create<AdminState>()((set, get) => ({
  stats: null,
  users: [],
  usersTotal: 0,
  workspaces: [],
  platform: null,
  settings: { maintenanceMode: false, announcement: '' },
  isLoadingStats: false,
  isLoadingUsers: false,
  error: null,
  fetchStats: async () => {
    set({ isLoadingStats: true, error: null });
    try {
      const stats = await apiRequest<AdminStats>('/api/v1/admin/stats', { auth: true });
      set({ stats, isLoadingStats: false });
    } catch (error) {
      set({ isLoadingStats: false, error: error instanceof Error ? error.message : 'Failed to load stats' });
    }
  },
  fetchUsers: async (params = {}) => {
    set({ isLoadingUsers: true, error: null });
    try {
      const search = new URLSearchParams();
      if (params.search) search.set('search', params.search);
      if (params.limit != null) search.set('limit', String(params.limit));
      if (params.offset != null) search.set('offset', String(params.offset));
      const qs = search.toString();
      const response = await apiRequest<AdminUsersResponse>(`/api/v1/admin/users${qs ? `?${qs}` : ''}`, { auth: true });
      set({ users: response.items, usersTotal: response.total, isLoadingUsers: false });
    } catch (error) {
      set({ isLoadingUsers: false, error: error instanceof Error ? error.message : 'Failed to load users' });
    }
  },
  updateUserRole: async (userId, role) => {
    const updated = await apiRequest<AdminUser>(`/api/v1/admin/users/${userId}/role`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify({ role }),
    });
    set({
      users: get().users.map((u) => (u.id === userId ? { ...u, role: updated.role } : u)),
    });
  },
  fetchWorkspaces: async () => {
    try {
      const res = await apiRequest<{ items: AdminWorkspace[] }>('/api/v1/admin/workspaces', { auth: true });
      set({ workspaces: res.items });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load workspaces' });
    }
  },
  fetchPlatform: async () => {
    try {
      const platform = await apiRequest<AdminPlatform>('/api/v1/admin/platform', { auth: true });
      set({ platform });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load platform stats' });
    }
  },
  fetchSettings: async () => {
    try {
      const settings = await apiRequest<PlatformSettings>('/api/v1/admin/settings', { auth: true });
      set({ settings });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load settings' });
    }
  },
  saveSettings: async (updates) => {
    const next = { ...get().settings, ...updates };
    set({ settings: next });
    await apiRequest('/api/v1/admin/settings', { method: 'PATCH', auth: true, body: JSON.stringify(next) });
  },

  updates: [],
  feedback: [],
  broadcast: async (title, message, link) => {
    const res = await apiRequest<{ notified: number }>('/api/v1/admin/notifications/broadcast', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ title, message, link: link ?? '' }),
    });
    return res.notified;
  },
  fetchUpdates: async () => {
    try {
      const res = await apiRequest<{ items: AdminPlatformUpdate[] }>('/api/v1/updates', { auth: true });
      set({ updates: res.items });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load updates' });
    }
  },
  publishUpdate: async (u) => {
    await apiRequest('/api/v1/admin/updates', { method: 'POST', auth: true, body: JSON.stringify(u) });
    await get().fetchUpdates();
  },
  deleteUpdate: async (id) => {
    await apiRequest(`/api/v1/admin/updates/${id}`, { method: 'DELETE', auth: true });
    set({ updates: get().updates.filter((u) => u.id !== id) });
  },
  fetchFeedback: async () => {
    try {
      const res = await apiRequest<{ items: AdminFeedback[] }>('/api/v1/admin/feedback', { auth: true });
      set({ feedback: res.items });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load feedback' });
    }
  },
  setFeedbackStatus: async (id, status) => {
    await apiRequest(`/api/v1/admin/feedback/${id}`, { method: 'PATCH', auth: true, body: JSON.stringify({ status }) });
    set({ feedback: get().feedback.map((f) => (f.id === id ? { ...f, status } : f)) });
  },
}));
