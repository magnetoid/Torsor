import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  };
}

interface NotificationState {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id' | 'isRead' | 'timestamp'>) => void;
  markAsRead: (id: string) => void;
  markAllRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  getUnreadCount: () => number;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'invite_received',
    title: 'Workspace Invitation',
    message: 'Sarah invited you to Irving Studio',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago
    isRead: false,
    metadata: {
      userName: 'Sarah Chen',
      userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
      workspaceId: 'ws-irving'
    }
  },
  {
    id: '2',
    type: 'deploy_success',
    title: 'Deploy Successful',
    message: 'Project "torsor-api" deployed successfully to Vercel',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), // 5 hours ago
    isRead: false,
    link: '/project/torsor-api'
  },
  {
    id: '3',
    type: 'plan_limit_warning',
    title: 'Usage Warning',
    message: "You've used 80% of your monthly token limit",
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(), // 12 hours ago
    isRead: true,
    link: '/settings/billing'
  },
  {
    id: '4',
    type: 'agent_complete',
    title: 'Agent Task Finished',
    message: 'Torsor Agent finished building "auth-module"',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    isRead: true,
    link: '/project/auth-module'
  },
  {
    id: '5',
    type: 'security_alert',
    title: 'Security Alert',
    message: 'New login detected from San Francisco, CA',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(), // 2 days ago
    isRead: true,
    metadata: {
      location: 'San Francisco, CA'
    }
  },
  {
    id: '6',
    type: 'member_joined',
    title: 'New Member',
    message: 'Alex Rivera joined your workspace',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(), // 3 days ago
    isRead: true,
    metadata: {
      userName: 'Alex Rivera',
      userAvatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex'
    }
  }
];

// Ids of the demo seed rows above — used by the persist migration to strip them from
// existing users' storage so real accounts see real notifications (or the empty state).
const MOCK_IDS = new Set(MOCK_NOTIFICATIONS.map((n) => n.id));

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      // Demo rows only in dev builds; production starts at the real empty state and fills
      // from real events (deploys, agent runs) via addNotification.
      notifications: import.meta.env.DEV ? MOCK_NOTIFICATIONS : [],
      
      addNotification: (notification) => {
        const newNotification: Notification = {
          ...notification,
          id: Math.random().toString(36).substring(7),
          isRead: false,
          timestamp: new Date().toISOString(),
        };
        set((state) => ({
          notifications: [newNotification, ...state.notifications]
        }));
      },

      markAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) => 
            n.id === id ? { ...n, isRead: true } : n
          )
        }));
      },

      markAllRead: () => {
        set((state) => ({
          notifications: state.notifications.map((n) => ({ ...n, isRead: true }))
        }));
      },

      removeNotification: (id) => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id)
        }));
      },

      clearAll: () => {
        set({ notifications: [] });
      },

      getUnreadCount: () => {
        return get().notifications.filter((n) => !n.isRead).length;
      },
    }),
    {
      name: 'torsor-notifications',
      version: 1,
      // v0 → v1: drop the fabricated demo rows that used to ship to every account.
      migrate: (persisted: unknown) => {
        const state = persisted as { notifications?: Notification[] } | undefined;
        return {
          ...(state ?? {}),
          notifications: (state?.notifications ?? []).filter((n) => !MOCK_IDS.has(n.id)),
        };
      },
    }
  )
);
