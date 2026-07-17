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
  unpublish: () => Promise<void>;
  connectTarget: (target: DeployTarget, config: Record<string, string>) => void;
  updateSettings: (settings: Partial<DeployState['settings']>) => void;
  addDomain: (domain: string) => void;
  rollback: (id: string) => void;
}

const MOCK_HISTORY: Deployment[] = [
  {
    id: 'dep-1',
    target: 'torsor',
    environment: 'production',
    status: 'success',
    url: 'https://torsor-app.torsor.app',
    deployedAt: Date.now() - 86400000,
    duration: '42s',
    commit: 'feat: add auth tab',
    logs: ['[build] starting...', '[build] installing dependencies...', '[build] compiling...', '[deploy] uploading assets...', '[deploy] success!']
  },
  {
    id: 'dep-2',
    target: 'torsor',
    environment: 'production',
    status: 'success',
    url: 'https://torsor-app.torsor.app',
    deployedAt: Date.now() - 86400000 * 2,
    duration: '38s',
    commit: 'fix: layout issues',
    logs: ['[build] starting...', '[deploy] success!']
  }
];

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
      currentDeployment: MOCK_HISTORY[0],
      history: MOCK_HISTORY,
      targets: INITIAL_TARGETS,
      settings: {
        environment: 'production',
        buildCommand: 'npm run build',
        outputDir: 'dist',
        nodeVersion: '20.x',
      },
      customDomains: [
        { domain: 'torsor.dev', status: 'active', ssl: true }
      ],
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

      // Fetch the active project's current deployment state from the server.
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
    }
  )
);
