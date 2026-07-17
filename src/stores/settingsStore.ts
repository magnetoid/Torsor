import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface RoutingRule {
  id: string;
  taskType: string;
  preferredModel: string;
  fallbackModel: string;
}

export interface AISettings {
  defaultModel: string;
  tokenBudgets: {
    projectDaily: number;
    projectMonthly: number;
    userDaily: number;
    alertThreshold: number;
  };
  allowedModels: Record<string, boolean>;
  // NOTE: BYO API keys deliberately do NOT live here. Plaintext keys in localStorage were
  // a liability with zero writers — the real path is Settings → API Keys (encrypted
  // server-side secrets, see secretsStore).
  routingRules: RoutingRule[];
}

export interface SecuritySettings {
  require2FA: boolean;
  sessionTimeout: string;
  ipAllowlist: string;
  requireAdminApproval: boolean;
  forceReauthOnModelChange: boolean;
}

export interface WorkspaceSettings {
  name: string;
  slug: string;
  logo: string | null;
  description: string;
}

interface SettingsState {
  workspace: WorkspaceSettings;
  ai: AISettings;
  security: SecuritySettings;
  integrations: {
    github: { connected: boolean; repos: string[] };
    gitlab: { connected: boolean; repos: string[] };
    supabase: { url: string; key: string };
    vercel: { connected: boolean };
    webhooks: { url: string; events: string[] }[];
  };
  updateWorkspace: (updates: Partial<WorkspaceSettings>) => void;
  updateAI: (updates: Partial<AISettings>) => void;
  updateSecurity: (updates: Partial<SecuritySettings>) => void;
  addRoutingRule: (rule: RoutingRule) => void;
  removeRoutingRule: (id: string) => void;
  toggleModel: (modelId: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      workspace: {
        name: 'Acme Corp',
        slug: 'acme-corp',
        logo: 'https://ui-avatars.com/api/?name=Acme+Corp&background=7c6ff7&color=fff',
        description: 'Building the future of AI-powered development tools.',
      },
      ai: {
        defaultModel: 'auto',
        tokenBudgets: {
          projectDaily: 100000,
          projectMonthly: 2000000,
          userDaily: 50000,
          alertThreshold: 80,
        },
        allowedModels: {
          'claude-3.5-sonnet': true,
          'gpt-4o': true,
          'deepseek-v3': true,
          'gemini-1.5-pro': true,
        },
        routingRules: [
          { id: '1', taskType: 'Code Gen', preferredModel: 'claude-3.5-sonnet', fallbackModel: 'gpt-4o' },
          { id: '2', taskType: 'Debug', preferredModel: 'deepseek-v3', fallbackModel: 'claude-3.5-sonnet' },
        ],
      },
      security: {
        require2FA: false,
        sessionTimeout: '4 hrs',
        ipAllowlist: '',
        requireAdminApproval: true,
        forceReauthOnModelChange: false,
      },
      integrations: {
        github: { connected: true, repos: ['acme-web', 'acme-api', 'tesseract-core'] },
        gitlab: { connected: false, repos: [] },
        supabase: { url: '', key: '' },
        vercel: { connected: false },
        webhooks: [],
      },
      updateWorkspace: (updates) => set((state) => ({ workspace: { ...state.workspace, ...updates } })),
      updateAI: (updates) => set((state) => ({ ai: { ...state.ai, ...updates } })),
      updateSecurity: (updates) => set((state) => ({ security: { ...state.security, ...updates } })),
      addRoutingRule: (rule) => set((state) => ({ ai: { ...state.ai, routingRules: [...state.ai.routingRules, rule] } })),
      removeRoutingRule: (id) => set((state) => ({ ai: { ...state.ai, routingRules: state.ai.routingRules.filter(r => r.id !== id) } })),
      toggleModel: (modelId) => set((state) => ({
        ai: {
          ...state.ai,
          allowedModels: {
            ...state.ai.allowedModels,
            [modelId]: !state.ai.allowedModels[modelId]
          }
        }
      })),
    }),
    {
      name: 'tesseract-settings',
      version: 1,
      migrate: (persisted, version) => {
        // v0 → v1: scrub the abandoned plaintext BYOK block from localStorage.
        if (version < 1 && persisted && typeof persisted === 'object') {
          const ai = (persisted as { ai?: Record<string, unknown> }).ai;
          if (ai && 'byok' in ai) delete ai.byok;
        }
        return persisted as SettingsState;
      },
    }
  )
);
