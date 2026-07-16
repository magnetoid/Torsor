/**
 * Core IDE state (Zustand). Owns the workspace-backed file tree + editor persistence, the
 * preview/build status, and a few shell toggles (terminal/database/config/billing).
 *
 * - File State: `files` is populated from a project's real WorkspaceRuntime (loadWorkspaceFiles);
 *   edits debounce-save back to the workspace (updateFileContent → saveFile), with `saveStatus`
 *   driving the editor's dirty/saved indicator. This is the single source of truth for content.
 * - Build/Preview State: `buildStatus` + `previewUrl` back the Preview tab.
 *
 * Real chat + the agent loop live in `stores/chatStore` (SSE against the control-plane); the
 * former mock "builder mode" (6 fake agents, simulateBuilderFlow, consensus) has been removed.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiRequest } from './lib/api';

// Per-file debounce timers for editor auto-save (module scope: one shared set across the
// single store instance). Keyed by FileNode.id.
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SAVE_DEBOUNCE_MS = 800;

/** UTF-8-safe base64 encode, chunked so large files don't overflow the call stack.
 *  Mirror of the atob+TextDecoder read path in loadFileContent. */
function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// --- Types ---


export type FileType = 'file' | 'folder';

/** Persistence state for a workspace-backed file, driving the editor's save indicator. */
export type FileSaveStatus = 'dirty' | 'saving' | 'saved' | 'error';

export interface FileNode {
  id: string;
  name: string;
  type: FileType;
  parentId: string | null;
  content?: string;
  extension?: string;
}

export type BuildStatus = 'idle' | 'building' | 'success' | 'error';
export type DeployStatus = 'idle' | 'building' | 'success' | 'error';

export interface DeployEntry {
  id: string;
  status: 'success' | 'error' | 'building';
  target: 'Vercel' | 'Netlify' | 'Coolify' | 'Custom';
  environment: 'Preview' | 'Staging' | 'Production';
  duration: string;
  commit: string;
  timestamp: string;
  url: string;
  logs: string[];
}

// --- Initial State ---

const INITIAL_FILES: FileNode[] = [];

// --- Store Definition ---

interface AppState {
  // 4. FILE STATE
  files: FileNode[];
  openTabs: string[];
  activeTab: string | null;
  /** The project whose real workspace backs `files` (set by loadWorkspaceFiles). Gates
   *  saves so we never POST mock/local scaffolding to a workspace we didn't load from. */
  workspaceProjectId: string | null;
  /** Per-file persistence status, keyed by FileNode.id, driving the editor indicator. */
  saveStatus: Record<string, FileSaveStatus>;
  /** Populate the file tree from a project's real workspace (WorkspaceRuntime). Makes
   *  files the agent creates visible in the IDE. */
  loadWorkspaceFiles: (projectId: string) => Promise<void>;
  /** Fetch a workspace file's real content into its tree node (id === workspace path). */
  loadFileContent: (projectId: string, fileId: string) => Promise<void>;
  openFile: (id: string) => void;
  closeTab: (id: string) => void;
  /** Update a file's content in memory and (for workspace-backed files) schedule a
   *  debounced save to the workspace. Marks the file dirty immediately. */
  updateFileContent: (id: string, content: string) => void;
  /** Persist a file's current content to the workspace now (POST /workspace/file).
   *  No-op unless the tree was loaded from a real workspace. */
  saveFile: (id: string) => Promise<void>;
  createFile: (name: string, type: FileType, parentId: string | null) => void;
  deleteFile: (id: string) => void;
  renameFile: (id: string, newName: string) => void;
  duplicateFile: (id: string) => void;

  // 5. BUILD STATE
  buildStatus: BuildStatus;
  buildTime: number;
  filesGenerated: number;
  totalTokens: number;
  previewUrl: string;
  setPreviewUrl: (url: string) => void;
  isPreviewOpen: boolean;
  triggerBuild: () => void;
  setBuildSuccess: (time: number, filesCount: number) => void;
  setBuildError: () => void;
  togglePreview: (force?: boolean) => void;

  // 7. DEPLOY STATE
  deployStatus: DeployStatus;
  deployProgress: number;
  deployLogs: string[];
  deployHistory: DeployEntry[];
  startDeploy: (target: string, env: string, branch: string) => Promise<void>;
  rollbackDeploy: (id: string) => void;

  // 6. SETTINGS
  parallelLimit: number;
  autoRoute: boolean;
  apiKeys: Record<string, string>;
  setApiKeys: (keys: Record<string, string>) => void;

  // 9. TERMINAL STATE
  isTerminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  // 10. DATABASE STATE
  isDatabaseOpen: boolean;
  setDatabaseOpen: (open: boolean) => void;
  // 11. CONFIG CARDS
  activeConfigCard: 'secrets' | 'packages' | 'config' | null;
  setActiveConfigCard: (card: 'secrets' | 'packages' | 'config' | null) => void;
  // 12. BILLING MODAL
  isBillingModalOpen: boolean;
  setBillingModalOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 9. TERMINAL STATE
      isTerminalOpen: false,
      setTerminalOpen: (open) => set({ isTerminalOpen: open }),

      // 10. DATABASE STATE
      isDatabaseOpen: false,
      setDatabaseOpen: (open) => set({ isDatabaseOpen: open }),

      // 11. CONFIG CARDS
      activeConfigCard: null,
      setActiveConfigCard: (card) => set({ activeConfigCard: card }),

      // 12. BILLING MODAL
      isBillingModalOpen: false,
      setBillingModalOpen: (open) => set({ isBillingModalOpen: open }),

      // 4. FILE STATE
      files: INITIAL_FILES,
      openTabs: [],
      activeTab: null,
      workspaceProjectId: null,
      saveStatus: {},
      loadWorkspaceFiles: async (projectId) => {
        try {
          const base = `/api/v1/projects/${projectId}/workspace/files`;
          type Entry = { name: string; path: string; isDir: boolean };
          const nodes: FileNode[] = [];
          // Bounded BFS over the workspace directory tree; a node's id is its path and its
          // parentId is the containing directory's path (null at the root).
          const queue: string[] = [''];
          let visited = 0;
          while (queue.length > 0 && visited < 300) {
            const dir = queue.shift() as string;
            const q = dir ? `?path=${encodeURIComponent(dir)}` : '';
            const data = await apiRequest<{ items: Entry[] }>(`${base}${q}`, { auth: true });
            visited++;
            for (const e of data.items ?? []) {
              const ext = !e.isDir && e.name.includes('.') ? e.name.split('.').pop() : undefined;
              nodes.push({
                id: e.path,
                name: e.name,
                type: e.isDir ? 'folder' : 'file',
                parentId: dir === '' ? null : dir,
                extension: ext,
              });
              if (e.isDir) queue.push(e.path);
            }
          }
          // Mark this project's workspace as the save target and reset per-file status;
          // freshly-listed files are considered clean/saved.
          set({ files: nodes, workspaceProjectId: projectId, saveStatus: {} });
        } catch {
          // No workspace yet, or a backend without the runtime capability: leave files as-is.
          set({ workspaceProjectId: null });
        }
      },
      loadFileContent: async (projectId, fileId) => {
        try {
          const data = await apiRequest<{ contentBase64?: string }>(
            `/api/v1/projects/${projectId}/workspace/file?path=${encodeURIComponent(fileId)}`,
            { auth: true }
          );
          const b64 = data.contentBase64 ?? '';
          const bin = atob(b64);
          const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
          const content = new TextDecoder().decode(bytes);
          set((state) => ({ files: state.files.map((f) => (f.id === fileId ? { ...f, content } : f)) }));
        } catch {
          // Best-effort: leave the node without content if the read fails.
        }
      },
      openFile: (id) => set((state) => {
        const isOpen = state.openTabs.includes(id);
        return {
          openTabs: isOpen ? state.openTabs : [...state.openTabs, id],
          activeTab: id
        };
      }),
      closeTab: (id) => set((state) => {
        const newTabs = state.openTabs.filter(t => t !== id);
        return {
          openTabs: newTabs,
          activeTab: state.activeTab === id ? (newTabs[newTabs.length - 1] || null) : state.activeTab
        };
      }),
      updateFileContent: (id, content) => {
        set((state) => ({
          files: state.files.map(f => f.id === id ? { ...f, content } : f),
          // Only track/save files backed by a real workspace; local scaffolding stays untracked.
          saveStatus: get().workspaceProjectId
            ? { ...state.saveStatus, [id]: 'dirty' as FileSaveStatus }
            : state.saveStatus,
        }));
        if (!get().workspaceProjectId) return;
        // Debounce the network write so we don't POST on every keystroke.
        const existing = saveTimers.get(id);
        if (existing) clearTimeout(existing);
        saveTimers.set(id, setTimeout(() => {
          saveTimers.delete(id);
          void get().saveFile(id);
        }, SAVE_DEBOUNCE_MS));
      },
      saveFile: async (id) => {
        const projectId = get().workspaceProjectId;
        if (!projectId) return; // not workspace-backed → nothing to persist
        const file = get().files.find(f => f.id === id);
        if (!file || file.type !== 'file') return;
        // Cancel any pending debounce so an explicit save (Cmd/Ctrl+S) wins cleanly.
        const pending = saveTimers.get(id);
        if (pending) { clearTimeout(pending); saveTimers.delete(id); }
        set((state) => ({ saveStatus: { ...state.saveStatus, [id]: 'saving' } }));
        try {
          await apiRequest(`/api/v1/projects/${projectId}/workspace/file`, {
            method: 'POST',
            auth: true,
            body: JSON.stringify({
              path: id, // FileNode.id === workspace path for workspace-backed files
              contentBase64: encodeBase64Utf8(file.content ?? ''),
            }),
          });
          set((state) => ({ saveStatus: { ...state.saveStatus, [id]: 'saved' } }));
        } catch {
          // Surface via the editor's save indicator ('Save failed'); an authed 401 is
          // separately handled by lib/api's central session-expiry redirect.
          set((state) => ({ saveStatus: { ...state.saveStatus, [id]: 'error' } }));
        }
      },
      createFile: (name, type, parentId) => set((state) => {
        const ext = name.split('.').pop();
        const newFile: FileNode = {
          id: `file-${Date.now()}`,
          name,
          type,
          parentId,
          extension: type === 'file' ? ext : undefined,
          content: type === 'file' ? '' : undefined
        };
        return { files: [...state.files, newFile] };
      }),
      deleteFile: (id) => set((state) => {
        const getIdsToDelete = (targetId: string): string[] => {
          const children = state.files.filter(f => f.parentId === targetId).map(f => f.id);
          return [targetId, ...children.flatMap(getIdsToDelete)];
        };
        const idsToDelete = getIdsToDelete(id);
        const newTabs = state.openTabs.filter(t => !idsToDelete.includes(t));
        
        return {
          files: state.files.filter(f => !idsToDelete.includes(f.id)),
          openTabs: newTabs,
          activeTab: idsToDelete.includes(state.activeTab!) ? (newTabs[newTabs.length - 1] || null) : state.activeTab
        };
      }),
      renameFile: (id, newName) => set((state) => {
        const ext = newName.split('.').pop();
        return {
          files: state.files.map(f => f.id === id ? { ...f, name: newName, extension: f.type === 'file' ? ext : undefined } : f)
        };
      }),
      duplicateFile: (id) => set((state) => {
        const file = state.files.find(f => f.id === id);
        if (!file || file.type === 'folder') return state;
        
        const nameParts = file.name.split('.');
        const ext = nameParts.pop();
        const baseName = nameParts.join('.');
        const newName = `${baseName} (copy).${ext}`;
        
        const newFile: FileNode = {
          ...file,
          id: `file-${Date.now()}`,
          name: newName,
        };
        
        return { files: [...state.files, newFile] };
      }),

      // 5. BUILD STATE
      buildStatus: 'idle',
      buildTime: 0,
      filesGenerated: 0,
      totalTokens: 0,
      previewUrl: '',
      setPreviewUrl: (url) => set({ previewUrl: url }),
      isPreviewOpen: true,
      triggerBuild: () => set({ buildStatus: 'building' }),
      setBuildSuccess: (time, filesCount) => set({
        buildStatus: 'success',
        buildTime: time,
        filesGenerated: filesCount,
      }),
      setBuildError: () => set({ buildStatus: 'error' }),
      togglePreview: (force) => set((state) => ({ 
        isPreviewOpen: force !== undefined ? force : !state.isPreviewOpen 
      })),

      // 7. DEPLOY STATE
      deployStatus: 'idle',
      deployProgress: 0,
      deployLogs: [],
      deployHistory: [
        {
          id: 'dep-1',
          status: 'success',
          target: 'Vercel',
          environment: 'Production',
          duration: '42s',
          commit: 'a1b2c3d',
          timestamp: '2 hours ago',
          url: 'https://tesseract-demo.vercel.app',
          logs: ['→ Installing dependencies...', '✓ 200 OK']
        },
        {
          id: 'dep-2',
          status: 'error',
          target: 'Netlify',
          environment: 'Staging',
          duration: '15s',
          commit: 'f5e4d3c',
          timestamp: '5 hours ago',
          url: '',
          logs: ['→ Building application...', 'error: Build failed']
        }
      ],
      startDeploy: async (target, env, branch) => {
        set({ deployStatus: 'building', deployProgress: 0, deployLogs: [] });
        
        const logs = [
          "→ Installing dependencies...",
          "  added 847 packages in 12s",
          "→ Building application...",
          "  ✓ 23 modules transformed",
          "  ✓ Bundle size: 142kb (gzipped: 48kb)",
          "→ Optimizing assets...",
          "  ✓ Images compressed (saved 34%)",
          `→ Deploying to ${target}...`,
          "  ✓ Uploaded 12 files",
          "  ✓ Edge functions deployed",
          "→ Running health check...",
          "  ✓ 200 OK",
          "",
          "✅ Deployment successful!",
          `🔗 https://tesseract-demo.${target.toLowerCase()}.app`
        ];

        for (let i = 0; i < logs.length; i++) {
          await new Promise(r => setTimeout(r, 400));
          set(state => ({ 
            deployLogs: [...state.deployLogs, logs[i]],
            deployProgress: Math.min(((i + 1) / logs.length) * 100, 100)
          }));
        }

        const newDeploy: DeployEntry = {
          id: `dep-${Date.now()}`,
          status: 'success',
          target: target as any,
          environment: env as any,
          duration: '38s',
          commit: 'g7h8i9j',
          timestamp: 'Just now',
          url: `https://tesseract-demo.${target.toLowerCase()}.app`,
          logs: logs
        };

        set(state => ({ 
          deployStatus: 'success',
          deployHistory: [newDeploy, ...state.deployHistory]
        }));
      },
      rollbackDeploy: (id) => {
        // Mock rollback
        set(state => ({
          deployHistory: state.deployHistory.map(d => d.id === id ? { ...d, timestamp: 'Rolled back just now' } : d)
        }));
      },

      // 6. SETTINGS
      parallelLimit: 3,
      autoRoute: true,
      apiKeys: {},
      setApiKeys: (keys) => set({ apiKeys: keys }),

    }),
    {
      name: 'array-ide-storage',
      partialize: (state) => ({
        openTabs: state.openTabs,
        apiKeys: state.apiKeys,
        files: state.files,
      }),
    }
  )
);

// --- Typed Selectors ---

export const useFiles = () => useAppStore((state) => state.files);
export const useBuildStatus = () => useAppStore((state) => ({
  status: state.buildStatus,
  time: state.buildTime,
  filesGenerated: state.filesGenerated,
  totalTokens: state.totalTokens,
  previewUrl: state.previewUrl
}));
