import { create } from 'zustand';

import { apiRequest } from '../lib/api';

/** A staged learning the reflection pass proposed after a substantive agent run. Nothing is
 *  written to the real memories/skills tables until the user accepts it here. */
export interface LearningProposal {
  id: string;
  projectId: string;
  kind: 'memory' | 'skill';
  status: string;
  /** memory → { content, kind }; skill → { name, description, instruction } */
  payload: {
    content?: string;
    kind?: string;
    name?: string;
    description?: string;
    instruction?: string;
  };
  createdAt: string;
}

const fromApi = (p: any): LearningProposal => ({
  id: p.id,
  projectId: p.projectId || p.project_id,
  kind: p.kind === 'skill' ? 'skill' : 'memory',
  status: p.status || 'pending',
  payload: p.payload || {},
  createdAt: p.createdAt || p.created_at,
});

interface LearningState {
  byProject: Record<string, LearningProposal[]>;
  loading: boolean;
  error: string | null;
  fetchProposals: (projectId: string) => Promise<void>;
  accept: (projectId: string, id: string) => Promise<void>;
  dismiss: (projectId: string, id: string) => Promise<void>;
}

export const useLearningStore = create<LearningState>()((set, get) => ({
  byProject: {},
  loading: false,
  error: null,
  fetchProposals: async (projectId) => {
    set({ loading: true, error: null });
    try {
      const res = await apiRequest<{ items: any[] }>(
        `/api/v1/projects/${projectId}/learning/proposals?status=pending`,
        { auth: true },
      );
      set((state) => ({
        byProject: { ...state.byProject, [projectId]: res.items.map(fromApi) },
        loading: false,
      }));
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Failed to load proposals' });
    }
  },
  accept: async (projectId, id) => {
    await apiRequest(`/api/v1/projects/${projectId}/learning/proposals/${id}/accept`, {
      method: 'POST',
      auth: true,
    });
    // Drop it from the pending list locally.
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: (state.byProject[projectId] || []).filter((p) => p.id !== id),
      },
    }));
  },
  dismiss: async (projectId, id) => {
    await apiRequest(`/api/v1/projects/${projectId}/learning/proposals/${id}/dismiss`, {
      method: 'POST',
      auth: true,
    });
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: (state.byProject[projectId] || []).filter((p) => p.id !== id),
      },
    }));
  },
}));
