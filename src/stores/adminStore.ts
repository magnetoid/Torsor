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

interface AdminState {
  stats: AdminStats | null;
  users: AdminUser[];
  usersTotal: number;
  isLoadingStats: boolean;
  isLoadingUsers: boolean;
  error: string | null;
  fetchStats: () => Promise<void>;
  fetchUsers: (params?: { search?: string; limit?: number; offset?: number }) => Promise<void>;
  updateUserRole: (userId: string, role: UserRole) => Promise<void>;
}

export const useAdminStore = create<AdminState>()((set, get) => ({
  stats: null,
  users: [],
  usersTotal: 0,
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
}));
