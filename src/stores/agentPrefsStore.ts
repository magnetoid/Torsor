import { create } from 'zustand';
import { apiRequest } from '../lib/api';

export interface AgentPrefs {
  defaultAutonomy: 'approve_plan' | 'autonomous';
  maxSteps: number;
  preferredModel: string;
  planningEnabled: boolean;
}
const DEFAULTS: AgentPrefs = { defaultAutonomy: 'approve_plan', maxSteps: 12, preferredModel: '', planningEnabled: true };

interface PrefsState {
  prefs: AgentPrefs;
  loading: boolean;
  fetch: () => Promise<void>;
  save: (updates: Partial<AgentPrefs>) => Promise<void>;
}

export const useAgentPrefsStore = create<PrefsState>()((set, get) => ({
  prefs: DEFAULTS,
  loading: false,
  fetch: async () => {
    set({ loading: true });
    try {
      const p = await apiRequest<AgentPrefs>('/api/v1/me/agent-prefs', { auth: true });
      set({ prefs: { ...DEFAULTS, ...p }, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  save: async (updates) => {
    const next = { ...get().prefs, ...updates };
    set({ prefs: next });
    await apiRequest('/api/v1/me/agent-prefs', { method: 'PATCH', auth: true, body: JSON.stringify(next) });
  },
}));
