import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  Workspace, 
  WorkspaceMember, 
  WorkspaceInvite, 
  AuditLogEntry, 
  WorkspacePlan,
  PlanLimits,
  WorkspaceUsage
} from '../types/workspace';
import { PLANS } from '../lib/constants';
import { useEditorStore } from './editorStore';
import { useChatStore } from './chatStore';
import { useCanvasStore } from './canvasStore';
import { apiRequest } from '../lib/api';

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  members: WorkspaceMember[];
  invites: WorkspaceInvite[];
  auditLog: AuditLogEntry[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchWorkspaces: () => Promise<void>;
  fetchUsage: () => Promise<void>;
  fetchMembers: (workspaceId: string) => Promise<void>;
  fetchAuditLog: () => Promise<void>;
  switchWorkspace: (id: string) => void;
  createWorkspace: (name: string, slug: string) => Promise<string>;
  updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<void>;
  deleteWorkspace: (id: string) => Promise<void>;
  inviteMember: (email: string, role: WorkspaceInvite['role']) => Promise<void>;
  removeMember: (userId: string) => Promise<void>;
  changeMemberRole: (userId: string, role: WorkspaceMember['role']) => Promise<void>;
  acceptInvite: (inviteId: string) => Promise<void>;
  revokeInvite: (inviteId: string) => Promise<void>;
  getActiveWorkspace: () => Workspace | undefined;
}

const DEFAULT_USAGE: WorkspaceUsage = {
  projectCount: 0,
  memberCount: 1,
  tokensUsedThisMonth: 0,
  storageMB: 0,
  lastResetDate: new Date().toISOString(),
};

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      activeWorkspaceId: '',
      members: [],
      invites: [],
      auditLog: [],
      isLoading: false,
      error: null,

      fetchWorkspaces: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiRequest<{ items: any[] }>('/api/v1/teams', { auth: true });
          const workspaces = response.items.map(t => ({
            ...t,
            limits: PLANS[t.plan as WorkspacePlan]?.limits || PLANS.free.limits,
            // Baseline usage; real token usage is filled in by fetchUsage() below and
            // memberCount by fetchMembers(). projectCount/storageMB have no per-team
            // backend source yet and stay at the honest zero baseline.
            usage: { ...DEFAULT_USAGE },
          }));
          set({
            workspaces,
            activeWorkspaceId: workspaces.length > 0 && !get().activeWorkspaceId
              ? workspaces[0].id
              : get().activeWorkspaceId,
            isLoading: false
          });
          // Populate real token usage from usage_events (server-recorded on every model call).
          get().fetchUsage();
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to fetch workspaces' });
        }
      },

      // Real per-user token usage from /usage/summary (usage_events). Applied to the
      // active workspace so the billing/usage bar reflects actual consumption, not a
      // hardcoded zero. This is per-user accounting; per-team aggregation is future work.
      fetchUsage: async () => {
        try {
          const res = await apiRequest<{ totals: { tokensIn: number; tokensOut: number } }>(
            '/api/v1/usage/summary',
            { auth: true }
          );
          const used = (res.totals?.tokensIn ?? 0) + (res.totals?.tokensOut ?? 0);
          const activeId = get().activeWorkspaceId;
          set((state) => ({
            workspaces: state.workspaces.map(ws =>
              ws.id === activeId ? { ...ws, usage: { ...ws.usage, tokensUsedThisMonth: used } } : ws
            ),
          }));
        } catch {
          // leave usage at its baseline on a transient error
        }
      },

      fetchMembers: async (workspaceId: string) => {
        if (!workspaceId) return;
        set({ isLoading: true, error: null });
        try {
          const response = await apiRequest<{ items: WorkspaceMember[] }>(`/api/v1/teams/${workspaceId}/members`, { auth: true });
          set((state) => ({
            members: response.items,
            isLoading: false,
            // Reflect the real member count in usage for this workspace.
            workspaces: state.workspaces.map(ws =>
              ws.id === workspaceId ? { ...ws, usage: { ...ws.usage, memberCount: response.items.length } } : ws
            ),
          }));
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to fetch members' });
        }
      },

      fetchAuditLog: async () => {
        try {
          const response = await apiRequest<{ items: Omit<AuditLogEntry, 'workspaceId'>[] }>(
            '/api/v1/audit',
            { auth: true },
          );
          const workspaceId = get().activeWorkspaceId;
          set({ auditLog: response.items.map((e) => ({ ...e, workspaceId })) });
        } catch (error) {
          set({ error: error instanceof Error ? error.message : 'Failed to fetch audit log' });
        }
      },

      switchWorkspace: (id) => {
        set({ activeWorkspaceId: id });
        get().fetchMembers(id);
        
        // Clear project-specific state
        useEditorStore.getState().reset();
        useChatStore.getState().reset();
        useCanvasStore.getState().reset();
      },

      createWorkspace: async (name, slug) => {
        set({ isLoading: true, error: null });
        try {
          const t = await apiRequest<any>('/api/v1/teams', {
            method: 'POST',
            auth: true,
            body: JSON.stringify({ name, slug })
          });
          const newWorkspace: Workspace = {
            ...t,
            limits: PLANS[t.plan as WorkspacePlan]?.limits || PLANS.free.limits,
            usage: DEFAULT_USAGE
          };
          set((state) => ({ 
            workspaces: [...state.workspaces, newWorkspace],
            activeWorkspaceId: newWorkspace.id,
            isLoading: false
          }));
          return newWorkspace.id;
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to create workspace' });
          throw error;
        }
      },

      updateWorkspace: async (id, data) => {
        set({ isLoading: true, error: null });
        try {
          const t = await apiRequest<any>(`/api/v1/teams/${id}`, {
            method: 'PATCH',
            auth: true,
            body: JSON.stringify(data)
          });
          set((state) => ({
            workspaces: state.workspaces.map((ws) => 
              ws.id === id ? { ...ws, ...t } : ws
            ),
            isLoading: false
          }));
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to update workspace' });
          throw error;
        }
      },

      deleteWorkspace: async (id) => {
        set({ isLoading: true, error: null });
        try {
          await apiRequest(`/api/v1/teams/${id}`, { method: 'DELETE', auth: true });
          set((state) => ({
            workspaces: state.workspaces.filter((ws) => ws.id !== id),
            activeWorkspaceId: state.activeWorkspaceId === id 
              ? state.workspaces.find((ws) => ws.id !== id)?.id || '' 
              : state.activeWorkspaceId,
            isLoading: false
          }));
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to delete workspace' });
          throw error;
        }
      },

      inviteMember: async (email, role) => {
        set({ isLoading: true, error: null });
        try {
          const workspaceId = get().activeWorkspaceId;
          await apiRequest(`/api/v1/teams/${workspaceId}/invites`, {
            method: 'POST',
            auth: true,
            body: JSON.stringify({ email, role })
          });
          // Refresh members/invites or just optimistically update if we had an invites array
          set({ isLoading: false });
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to invite member' });
          throw error;
        }
      },

      removeMember: async (userId) => {
        set({ isLoading: true, error: null });
        try {
          const workspaceId = get().activeWorkspaceId;
          await apiRequest(`/api/v1/teams/${workspaceId}/members/${userId}`, {
            method: 'DELETE',
            auth: true
          });
          set((state) => ({
            members: state.members.filter(m => m.userId !== userId),
            isLoading: false
          }));
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to remove member' });
          throw error;
        }
      },

      changeMemberRole: async (userId, role) => {
        set({ isLoading: true, error: null });
        try {
          const workspaceId = get().activeWorkspaceId;
          await apiRequest(`/api/v1/teams/${workspaceId}/members/${userId}/role`, {
            method: 'PATCH',
            auth: true,
            body: JSON.stringify({ role })
          });
          set((state) => ({
            members: state.members.map(m => m.userId === userId ? { ...m, role } : m),
            isLoading: false
          }));
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to change role' });
          throw error;
        }
      },

      acceptInvite: async (inviteId) => {
        set({ isLoading: true, error: null });
        try {
          await apiRequest(`/api/v1/teams/invites/${inviteId}/accept`, {
            method: 'POST',
            auth: true
          });
          // Ideally refresh workspaces here since we just joined one
          await get().fetchWorkspaces();
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to accept invite' });
          throw error;
        }
      },

      revokeInvite: async (inviteId) => {
        set({ isLoading: true, error: null });
        try {
          await apiRequest(`/api/v1/teams/invites/${inviteId}`, {
            method: 'DELETE',
            auth: true
          });
          set((state) => ({
            invites: state.invites.filter(i => i.id !== inviteId),
            isLoading: false
          }));
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Failed to revoke invite' });
          throw error;
        }
      },

      getActiveWorkspace: () => {
        const { workspaces, activeWorkspaceId } = get();
        return workspaces.find(ws => ws.id === activeWorkspaceId);
      },
    }),
    {
      name: 'torsor-workspace-storage',
      partialize: (state) => ({ activeWorkspaceId: state.activeWorkspaceId }),
    }
  )
);

// Computed Selectors
export const useActiveWorkspace = () => {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  return workspaces.find((ws) => ws.id === activeWorkspaceId) || workspaces[0];
};

export const useWorkspacePlan = () => {
  const workspace = useActiveWorkspace();
  return workspace ? PLANS[workspace.plan].limits : PLANS.free.limits;
};

export const useWorkspaceUsage = () => {
  const workspace = useActiveWorkspace();
  return workspace ? workspace.usage : DEFAULT_USAGE;
};

export const useIsAtLimit = (resource: 'projects' | 'tokens' | 'storage' | 'members') => {
  const limits = useWorkspacePlan();
  const usage = useWorkspaceUsage();

  switch (resource) {
    case 'projects':
      return limits.maxProjects !== -1 && usage.projectCount >= limits.maxProjects;
    case 'tokens':
      return limits.maxTokensPerMonth !== -1 && usage.tokensUsedThisMonth >= limits.maxTokensPerMonth;
    case 'storage':
      return limits.maxStorageMB !== -1 && usage.storageMB >= limits.maxStorageMB;
    case 'members':
      return limits.maxMembers !== -1 && usage.memberCount >= limits.maxMembers;
    default:
      return false;
  }
};

export const useCanUseFeature = (feature: keyof PlanLimits) => {
  const limits = useWorkspacePlan();
  return !!limits[feature];
};
