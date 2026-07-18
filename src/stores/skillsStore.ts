import { create } from 'zustand';

import { apiRequest } from '../lib/api';

/** A user-defined agent skill: a named instruction injected into the coding agent's system
 *  prompt (when enabled) so the project's conventions shape how the agent works. */
export interface Skill {
  id: string;
  projectId: string;
  name: string;
  description: string;
  instruction: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const fromApi = (s: any): Skill => ({
  id: s.id,
  projectId: s.projectId || s.project_id,
  name: s.name || '',
  description: s.description || '',
  instruction: s.instruction || '',
  enabled: Boolean(s.enabled),
  createdAt: s.createdAt || s.created_at,
  updatedAt: s.updatedAt || s.updated_at,
});

interface SkillsState {
  byProject: Record<string, Skill[]>;
  loading: boolean;
  error: string | null;
  fetchSkills: (projectId: string) => Promise<void>;
  addSkill: (projectId: string, input: { name: string; description?: string; instruction: string }) => Promise<void>;
  updateSkill: (
    projectId: string,
    id: string,
    updates: Partial<Pick<Skill, 'name' | 'description' | 'instruction' | 'enabled'>>,
  ) => Promise<void>;
  deleteSkill: (projectId: string, id: string) => Promise<void>;
}

export const useSkillsStore = create<SkillsState>()((set) => ({
  byProject: {},
  loading: false,
  error: null,
  fetchSkills: async (projectId) => {
    set({ loading: true, error: null });
    try {
      const res = await apiRequest<{ items: any[] }>(`/api/v1/projects/${projectId}/skills`, { auth: true });
      set((state) => ({
        byProject: { ...state.byProject, [projectId]: res.items.map(fromApi) },
        loading: false,
      }));
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Failed to load skills' });
    }
  },
  addSkill: async (projectId, input) => {
    const created = await apiRequest<any>(`/api/v1/projects/${projectId}/skills`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(input),
    });
    const skill = fromApi(created);
    set((state) => ({
      byProject: { ...state.byProject, [projectId]: [skill, ...(state.byProject[projectId] || [])] },
    }));
  },
  updateSkill: async (projectId, id, updates) => {
    const updated = await apiRequest<any>(`/api/v1/projects/${projectId}/skills/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(updates),
    });
    const skill = fromApi(updated);
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: (state.byProject[projectId] || []).map((s) => (s.id === id ? skill : s)),
      },
    }));
  },
  deleteSkill: async (projectId, id) => {
    await apiRequest(`/api/v1/projects/${projectId}/skills/${id}`, { method: 'DELETE', auth: true });
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: (state.byProject[projectId] || []).filter((s) => s.id !== id),
      },
    }));
  },
}));
