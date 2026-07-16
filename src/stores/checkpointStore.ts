import { create } from 'zustand';
import { apiRequest } from '../lib/api';

// Project checkpoints — file-tree snapshots for restore/rollback. Metadata only on the
// client; the file contents live server-side (control-plane `checkpoints` table).
export interface CheckpointMeta {
  id: string;
  label: string;
  fileCount: number;
  createdAt: string;
}

interface CheckpointState {
  checkpoints: CheckpointMeta[];
  loading: boolean;
  creating: boolean;
  restoringId: string | null;
  error: string | null;
  fetchCheckpoints: (projectId: string) => Promise<void>;
  /** Snapshot the current workspace. Returns true on success. */
  createCheckpoint: (projectId: string, label: string) => Promise<boolean>;
  /** Restore a checkpoint's files into the workspace. Returns true on success. */
  restoreCheckpoint: (projectId: string, checkpointId: string) => Promise<boolean>;
}

export const useCheckpointStore = create<CheckpointState>((set, get) => ({
  checkpoints: [],
  loading: false,
  creating: false,
  restoringId: null,
  error: null,

  fetchCheckpoints: async (projectId) => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<{ items: CheckpointMeta[] }>(
        `/api/v1/projects/${projectId}/checkpoints`,
        { auth: true }
      );
      set({ checkpoints: data.items ?? [], loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load checkpoints' });
    }
  },

  createCheckpoint: async (projectId, label) => {
    set({ creating: true, error: null });
    try {
      await apiRequest(`/api/v1/projects/${projectId}/checkpoints`, {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ label }),
      });
      await get().fetchCheckpoints(projectId);
      set({ creating: false });
      return true;
    } catch (e) {
      set({ creating: false, error: e instanceof Error ? e.message : 'Failed to create checkpoint' });
      return false;
    }
  },

  restoreCheckpoint: async (projectId, checkpointId) => {
    set({ restoringId: checkpointId, error: null });
    try {
      await apiRequest(`/api/v1/projects/${projectId}/checkpoints/${checkpointId}/restore`, {
        method: 'POST',
        auth: true,
      });
      set({ restoringId: null });
      return true;
    } catch (e) {
      set({ restoringId: null, error: e instanceof Error ? e.message : 'Failed to restore checkpoint' });
      return false;
    }
  },
}));
