import { create } from 'zustand';
import { apiRequest } from '../lib/api';

export type NotificationType =
  | 'invite_received'
  | 'member_joined'
  | 'deploy_success'
  | 'deploy_failed'
  | 'plan_limit_warning'
  | 'plan_upgraded'
  | 'security_alert'
  | 'agent_complete';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  link?: string;
  metadata?: {
    workspaceId?: string;
    projectId?: string;
    userName?: string;
    userAvatar?: string;
    location?: string;
    // Present on real `invite_received` notifications so the Accept action can
    // hit POST /api/v1/teams/invites/{inviteId}/accept.
    inviteId?: string;
  };
  // Client-only notifications from live events (deploys, agent runs) that were
  // never persisted server-side. Kept out of server round-trips so their
  // read/delete calls don't 404.
  _local?: boolean;
}

interface NotificationState {
  notifications: Notification[];
  isLoading: boolean;
  fetchNotifications: () => Promise<void>;
  addNotification: (notification: Omit<Notification, 'id' | 'isRead' | 'timestamp'>) => void;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  getUnreadCount: () => number;
}

interface ApiNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Notification['metadata'];
  isRead: boolean;
  timestamp: string;
}

export const useNotificationStore = create<NotificationState>()((set, get) => ({
  notifications: [],
  isLoading: false,

  // Load the real per-user feed and merge it under any client-only live events.
  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const data = await apiRequest<{ items: ApiNotification[] }>('/api/v1/notifications', { auth: true });
      const server: Notification[] = (data.items ?? []).map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link ?? undefined,
        metadata: n.metadata ?? undefined,
        isRead: n.isRead,
        timestamp: n.timestamp,
      }));
      set((state) => ({
        notifications: [...state.notifications.filter((n) => n._local), ...server],
        isLoading: false,
      }));
    } catch {
      // No backend / not authed yet — keep whatever we have (incl. local events).
      set({ isLoading: false });
    }
  },

  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: `local-${Math.random().toString(36).substring(2, 9)}`,
      isRead: false,
      timestamp: new Date().toISOString(),
      _local: true,
    };
    set((state) => ({ notifications: [newNotification, ...state.notifications] }));
  },

  markAsRead: (id) => {
    const n = get().notifications.find((x) => x.id === id);
    set((state) => ({
      notifications: state.notifications.map((x) => (x.id === id ? { ...x, isRead: true } : x)),
    }));
    if (n && !n._local) {
      void apiRequest(`/api/v1/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', auth: true }).catch(() => {});
    }
  },

  markAllRead: () => {
    set((state) => ({ notifications: state.notifications.map((n) => ({ ...n, isRead: true })) }));
    void apiRequest('/api/v1/notifications/read-all', { method: 'POST', auth: true }).catch(() => {});
  },

  removeNotification: (id) => {
    const n = get().notifications.find((x) => x.id === id);
    set((state) => ({ notifications: state.notifications.filter((x) => x.id !== id) }));
    if (n && !n._local) {
      void apiRequest(`/api/v1/notifications/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true }).catch(() => {});
    }
  },

  clearAll: () => {
    const hadServer = get().notifications.some((n) => !n._local);
    set({ notifications: [] });
    if (hadServer) {
      void apiRequest('/api/v1/notifications', { method: 'DELETE', auth: true }).catch(() => {});
    }
  },

  getUnreadCount: () => get().notifications.filter((n) => !n.isRead).length,
}));
