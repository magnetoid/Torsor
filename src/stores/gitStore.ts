import { create } from 'zustand';
import { toast } from 'sonner';
import { useProjectStore } from './projectStore';
import {
  apiGitStatus,
  apiGitLog,
  apiGitBranches,
  apiGitInit,
  apiGitStage,
  apiGitUnstage,
  apiGitCommit,
  apiGitCreateBranch,
  apiGitCheckout,
  apiGitRevert,
  apiGitPush,
  apiGitPull,
} from '../lib/api';

export interface GitFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  staged: boolean;
  additions: number;
  deletions: number;
}

export interface Commit {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
}

interface GitState {
  initialized: boolean;
  currentBranch: string;
  branches: string[];
  ahead: number;
  behind: number;
  changes: GitFile[];
  history: Commit[];
  remoteUrl: string | null;
  isGitHubConnected: boolean;
  autoCommitEnabled: boolean;
  isLoading: boolean;
  isBusy: boolean;
  error: string | null;

  // All actions run real `git` in the active project's workspace via the control
  // plane. The project id comes from the active project; no id is client-trusted.
  refresh: () => Promise<void>;
  init: () => Promise<void>;
  toggleStage: (path: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  commit: (message: string, push?: boolean, amend?: boolean) => Promise<void>;
  push: () => Promise<void>;
  pull: () => Promise<void>;
  switchBranch: (branch: string) => Promise<void>;
  createBranch: (branch: string) => Promise<void>;
  revert: (hash: string) => Promise<void>;
  connectGitHub: () => void;
  toggleAutoCommit: () => void;
}

const activeProjectId = () => useProjectStore.getState().activeProjectId;

export const useGitStore = create<GitState>()((set, get) => {
  // Run a git mutation then refresh; surfaces backend errors honestly as toasts.
  const mutate = async (label: string, fn: (projectId: string) => Promise<unknown>) => {
    const projectId = activeProjectId();
    if (!projectId) {
      toast.error('Open a project first');
      return;
    }
    set({ isBusy: true });
    try {
      await fn(projectId);
      await get().refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : `${label} failed`;
      set({ error: message });
      toast.error(message);
    } finally {
      set({ isBusy: false });
    }
  };

  return {
    initialized: false,
    currentBranch: 'main',
    branches: [],
    ahead: 0,
    behind: 0,
    changes: [],
    history: [],
    remoteUrl: null,
    isGitHubConnected: false,
    autoCommitEnabled: false,
    isLoading: false,
    isBusy: false,
    error: null,

    refresh: async () => {
      const projectId = activeProjectId();
      if (!projectId) {
        set({ error: 'No active project', isLoading: false });
        return;
      }
      set({ isLoading: true, error: null });
      try {
        const [status, history, branches] = await Promise.all([
          apiGitStatus(projectId),
          apiGitLog(projectId).catch(() => [] as Commit[]),
          apiGitBranches(projectId).catch(() => [] as string[]),
        ]);
        set({
          initialized: status.initialized,
          currentBranch: status.branch || 'main',
          ahead: status.ahead,
          behind: status.behind,
          changes: status.changes,
          remoteUrl: status.remoteUrl || null,
          isGitHubConnected: !!status.remoteUrl,
          history,
          branches,
          isLoading: false,
        });
      } catch (err) {
        set({
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load git status',
        });
      }
    },

    init: () => mutate('git init', (pid) => apiGitInit(pid)),

    toggleStage: async (path) => {
      const file = get().changes.find((f) => f.path === path);
      const staged = file?.staged ?? false;
      await mutate(
        staged ? 'unstage' : 'stage',
        (pid) => (staged ? apiGitUnstage(pid, [path]) : apiGitStage(pid, [path])),
      );
    },

    stageAll: () => mutate('stage all', (pid) => apiGitStage(pid)),
    unstageAll: () => mutate('unstage all', (pid) => apiGitUnstage(pid)),

    commit: async (message, push = false, amend = false) => {
      await mutate('commit', async (pid) => {
        await apiGitCommit(pid, message, { amend });
        if (push) await apiGitPush(pid);
      });
    },

    push: () => mutate('push', (pid) => apiGitPush(pid)),
    pull: () => mutate('pull', (pid) => apiGitPull(pid)),
    switchBranch: (branch) => mutate('checkout', (pid) => apiGitCheckout(pid, branch)),
    createBranch: (branch) => mutate('create branch', (pid) => apiGitCreateBranch(pid, branch)),
    revert: (hash) => mutate('revert', (pid) => apiGitRevert(pid, hash)),

    // No GitHub OAuth is wired; a remote is configured with plain git. Be honest
    // rather than pretend a connection was made.
    connectGitHub: () =>
      toast('Add a remote in the terminal (git remote add origin <url>), then push.'),

    toggleAutoCommit: () => set((state) => ({ autoCommitEnabled: !state.autoCommitEnabled })),
  };
});
