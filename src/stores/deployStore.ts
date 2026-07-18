import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiRequest } from '../lib/api';
import { useProjectStore } from './projectStore';
import { useLayoutStore } from './layoutStore';
import { useNotificationStore } from './notificationStore';

export type DeployStatus = 'idle' | 'building' | 'deploying' | 'success' | 'error';
export type DeployTarget = 'torsor' | 'vercel' | 'netlify' | 'coolify' | 'gcp' | 'ssh';
export type Environment = 'production' | 'staging' | 'preview';

export interface Deployment {
  id: string;
  target: DeployTarget;
  environment: Environment;
  status: DeployStatus;
  url?: string;
  deployedAt: number;
  duration: string;
  commit: string;
  logs: string[];
}

export interface TargetConfig {
  id: DeployTarget;
  name: string;
  description: string;
  connected: boolean;
  config?: Record<string, string>;
}

// DeploymentEvent is one row of the server's append-only deploy history log.
export interface DeploymentEvent {
  id: string;
  action: 'deploy' | 'stop';
  status: 'running' | 'stopped' | 'error';
  url: string;
  createdAt: string;
}

/** Map a server deploy-history event to the Deployment shape the History view renders. */
const eventToDeployment = (environment: Environment) => (e: DeploymentEvent): Deployment => ({
  id: e.id,
  target: 'torsor',
  environment,
  status: e.status === 'error' ? 'error' : 'success',
  url: e.url || undefined,
  deployedAt: new Date(e.createdAt).getTime(),
  duration: '',
  commit: e.action === 'deploy' ? 'Published workspace app' : 'Unpublished',
  logs: [],
});

interface DeployState {
  currentDeployment: Deployment | null;
  history: Deployment[];
  targets: TargetConfig[];
  settings: {
    environment: Environment;
    buildCommand: string;
    outputDir: string;
    nodeVersion: string;
  };
  customDomains: { domain: string; status: 'pending' | 'active'; ssl: boolean }[];
  isDeploying: boolean;
  
  // Actions
  deploy: (target: DeployTarget) => Promise<void>;
  fetchDeployment: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  unpublish: () => Promise<void>;
  connectTarget: (target: DeployTarget, config: Record<string, string>) => void;
  updateSettings: (settings: Partial<DeployState['settings']>) => void;
  addDomain: (domain: string) => void;
  rollback: (id: string) => void;
}

const INITIAL_TARGETS: TargetConfig[] = [
  { id: 'torsor', name: 'Torsor Cloud', description: 'Free hosting on torsor.app', connected: true },
  { id: 'vercel', name: 'Vercel', description: 'Connect your Vercel account', connected: false },
  { id: 'netlify', name: 'Netlify', description: 'Connect your Netlify account', connected: false },
  { id: 'coolify', name: 'Coolify', description: 'Deploy to your own server', connected: false },
  { id: 'gcp', name: 'Google Cloud Run', description: 'Deploy as a container', connected: false },
  { id: 'ssh', name: 'Custom Server (SSH)', description: 'Host + port + SSH key', connected: false },
];

export const useDeployStore = create<DeployState>()(
  persist(
    (set, get) => ({
      // Honest empty state: no deployment history or domains are fabricated. History
      // accumulates real deploys performed in this browser and the live deployment
      // surfaced by fetchDeployment; custom domains start empty until one is added.
      currentDeployment: null,
      history: [],
      targets: INITIAL_TARGETS,
      settings: {
        environment: 'production',
        buildCommand: 'npm run build',
        outputDir: 'dist',
        nodeVersion: '20.x',
      },
      customDomains: [],
      isDeploying: false,

      // Real deploy: publish the active project's running workspace app at its stable public
      // URL via the control-plane (POST /projects/{id}/deploy). No fake logs/URLs.
      deploy: async (targetId) => {
        const projectId = useProjectStore.getState().activeProjectId;
        const start = Date.now();
        const base: Deployment = {
          id: `dep-${start}`,
          target: targetId,
          environment: get().settings.environment,
          status: 'deploying',
          deployedAt: start,
          duration: '0s',
          commit: 'Publish workspace app',
          logs: ['[deploy] Publishing your workspace app…'],
        };
        // Only Torsor Cloud is wired. Refuse other targets honestly instead of deploying
        // to Torsor and mislabeling the result with the chosen provider.
        if (targetId !== 'torsor') {
          set({
            isDeploying: false,
            currentDeployment: {
              ...base,
              status: 'error',
              logs: [`[deploy] ${targetId} integration is coming soon — deploy to Torsor Cloud for now.`],
            },
          });
          return;
        }
        if (!projectId) {
          set({
            isDeploying: false,
            currentDeployment: { ...base, status: 'error', logs: ['[deploy] No active project selected'] },
          });
          return;
        }
        set({ isDeploying: true, currentDeployment: base });
        try {
          const res = await apiRequest<{ status: string; url: string }>(
            `/api/v1/projects/${projectId}/deploy`,
            { method: 'POST', auth: true }
          );
          const done: Deployment = {
            ...base,
            status: 'success',
            url: res.url, // relative /d/{id}/ — resolves against the app origin
            duration: `${Math.max(1, Math.round((Date.now() - start) / 1000))}s`,
            logs: [...base.logs, `[deploy] Live at ${res.url}`],
          };
          set({ isDeploying: false, currentDeployment: done, history: [done, ...get().history] });
          // Reconcile with the server's persisted history (the deploy was logged there).
          void get().fetchHistory();
          useLayoutStore.getState().pushDisclosure({
            kind: 'preview-ready',
            label: 'Your app is deployed and live.',
            actionLabel: 'Open',
            url: res.url,
          });
          useNotificationStore.getState().addNotification({
            type: 'deploy_success',
            title: 'Deploy successful',
            message: `Your app is live at ${res.url}`,
            link: res.url,
          });
        } catch (e) {
          const detail = e instanceof Error ? e.message : 'error';
          set({
            isDeploying: false,
            currentDeployment: {
              ...base,
              status: 'error',
              logs: [...base.logs, `[deploy] Failed: ${detail}`],
            },
          });
          useNotificationStore.getState().addNotification({
            type: 'deploy_failed',
            title: 'Deploy failed',
            message: detail,
          });
        }
      },

      // Fetch the active project's current deployment state from the server, plus its real
      // (server-persisted) deploy history.
      fetchDeployment: async () => {
        const projectId = useProjectStore.getState().activeProjectId;
        if (!projectId) return;
        try {
          const res = await apiRequest<{ status: string; url: string; live: boolean }>(
            `/api/v1/projects/${projectId}/deployment`,
            { auth: true }
          );
          if (res.status === 'running') {
            set({
              currentDeployment: {
                id: `dep-${projectId}`,
                target: 'torsor',
                environment: get().settings.environment,
                status: 'success',
                url: res.url,
                deployedAt: Date.now(),
                duration: '',
                commit: 'Deployed',
                logs: [res.live ? '[deploy] App is live' : '[deploy] Published (app not currently reachable)'],
              },
            });
          } else {
            set({ currentDeployment: null });
          }
        } catch {
          // leave state as-is on a transient error
        }
        // History comes from the server's append-only log, not local session memory.
        await get().fetchHistory();
      },

      // Load the project's real deploy history from the server (append-only event log).
      fetchHistory: async () => {
        const projectId = useProjectStore.getState().activeProjectId;
        if (!projectId) return;
        try {
          const res = await apiRequest<{ items: DeploymentEvent[] }>(
            `/api/v1/projects/${projectId}/deployments`,
            { auth: true }
          );
          set({ history: res.items.map(eventToDeployment(get().settings.environment)) });
        } catch {
          // leave history as-is on a transient error
        }
      },

      unpublish: async () => {
        const projectId = useProjectStore.getState().activeProjectId;
        if (projectId) {
          try {
            await apiRequest(`/api/v1/projects/${projectId}/deployment/stop`, {
              method: 'POST',
              auth: true,
            });
          } catch {
            // ignore; UI still reflects unpublished intent
          }
        }
        set({ currentDeployment: null });
      },

      connectTarget: (targetId, config) => set((state) => ({
        targets: state.targets.map(t => t.id === targetId ? { ...t, connected: true, config } : t)
      })),

      updateSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings }
      })),

      addDomain: (domain) => set((state) => ({
        customDomains: [...state.customDomains, { domain, status: 'pending', ssl: false }]
      })),

      rollback: (id) => {
        const deploy = get().history.find(d => d.id === id);
        if (deploy) {
          set({ currentDeployment: deploy });
        }
      }
    }),
    {
      name: 'torsor-deploy-storage',
      version: 1,
      // v0 shipped fabricated deployment history (dep-1/dep-2) and a fake active
      // torsor.dev custom domain. Strip those seeds from any already-persisted state
      // so upgrading users don't keep seeing fiction presented as real history.
      migrate: (persisted: any, version) => {
        if (!persisted || version >= 1) return persisted;
        const FAKE_IDS = new Set(['dep-1', 'dep-2']);
        const history = Array.isArray(persisted.history)
          ? persisted.history.filter((d: Deployment) => !FAKE_IDS.has(d?.id))
          : [];
        const current = persisted.currentDeployment;
        return {
          ...persisted,
          history,
          currentDeployment: current && FAKE_IDS.has(current.id) ? null : current ?? null,
          customDomains: Array.isArray(persisted.customDomains)
            ? persisted.customDomains.filter((d: { domain?: string }) => d?.domain !== 'torsor.dev')
            : [],
        };
      },
      // Persist only client-owned config. currentDeployment and history are server-derived
      // (fetched per active project), so persisting them would show stale/cross-project data
      // on load — fetchDeployment/fetchHistory repopulate them.
      partialize: (state) => ({
        settings: state.settings,
        targets: state.targets,
        customDomains: state.customDomains,
      }),
    }
  )
);
