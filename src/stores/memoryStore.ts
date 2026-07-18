import { create } from 'zustand';

import { apiRequest } from '../lib/api';

/** A durable project memory. `source` distinguishes user-curated notes from ones the
 *  coding agent saved itself via the remember tool. */
export interface Memory {
  id: string;
  projectId: string;
  kind: string; // 'note' | 'fact' | 'decision' | 'preference'
  content: string;
  source: 'user' | 'agent';
  createdAt: string;
  updatedAt: string;
}

export const MEMORY_KINDS = ['note', 'fact', 'decision', 'preference'] as const;

const fromApi = (m: any): Memory => ({
  id: m.id,
  projectId: m.projectId || m.project_id,
  kind: m.kind || 'note',
  content: m.content || '',
  source: m.source === 'agent' ? 'agent' : 'user',
  createdAt: m.createdAt || m.created_at,
  updatedAt: m.updatedAt || m.updated_at,
});

interface MemoryState {
  byProject: Record<string, Memory[]>;
  loading: boolean;
  error: string | null;
  fetchMemories: (projectId: string, q?: string) => Promise<void>;
  addMemory: (projectId: string, content: string, kind?: string) => Promise<void>;
  updateMemory: (projectId: string, id: string, updates: { content?: string; kind?: string }) => Promise<void>;
  deleteMemory: (projectId: string, id: string) => Promise<void>;
}

export const useMemoryStore = create<MemoryState>()((set, get) => ({
  byProject: {},
  loading: false,
  error: null,
  fetchMemories: async (projectId, q) => {
    set({ loading: true, error: null });
    try {
      const qs = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const res = await apiRequest<{ items: any[] }>(`/api/v1/projects/${projectId}/memories${qs}`, { auth: true });
      set((state) => ({
        byProject: { ...state.byProject, [projectId]: res.items.map(fromApi) },
        loading: false,
      }));
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Failed to load memories' });
    }
  },
  addMemory: async (projectId, content, kind) => {
    const created = await apiRequest<any>(`/api/v1/projects/${projectId}/memories`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ content, ...(kind ? { kind } : {}) }),
    });
    const memory = fromApi(created);
    set((state) => ({
      byProject: { ...state.byProject, [projectId]: [memory, ...(state.byProject[projectId] || [])] },
    }));
  },
  updateMemory: async (projectId, id, updates) => {
    const updated = await apiRequest<any>(`/api/v1/projects/${projectId}/memories/${id}`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(updates),
    });
    const memory = fromApi(updated);
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: (state.byProject[projectId] || []).map((m) => (m.id === id ? memory : m)),
      },
    }));
  },
  deleteMemory: async (projectId, id) => {
    await apiRequest(`/api/v1/projects/${projectId}/memories/${id}`, { method: 'DELETE', auth: true });
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: (state.byProject[projectId] || []).filter((m) => m.id !== id),
      },
    }));
  },
}));
