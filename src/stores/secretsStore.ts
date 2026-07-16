import { create } from 'zustand';
import { apiRequest } from '../lib/api';

// Backend-backed, user-scoped secrets (BYO API keys). Values are encrypted at rest on the
// control plane and NEVER returned by the API — this store only ever holds key names, so
// there is no plaintext to persist client-side (hence no `persist` middleware).
export interface SecretMeta {
  keyName: string;
  createdAt: string;
}

interface SecretsState {
  secrets: SecretMeta[];
  /** Whether the server has TORSOR_SECRET_KEY configured (can store secrets at all). */
  enabled: boolean;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  fetchSecrets: () => Promise<void>;
  /** Create or replace a secret. Returns true on success. */
  createSecret: (keyName: string, value: string) => Promise<boolean>;
  deleteSecret: (keyName: string) => Promise<void>;
  clearError: () => void;
}

export const useSecretsStore = create<SecretsState>((set, get) => ({
  secrets: [],
  enabled: true,
  loading: false,
  loaded: false,
  error: null,

  fetchSecrets: async () => {
    set({ loading: true, error: null });
    try {
      const data = await apiRequest<{ items: SecretMeta[]; enabled: boolean }>(
        '/api/v1/secrets',
        { auth: true }
      );
      set({ secrets: data.items ?? [], enabled: data.enabled, loading: false, loaded: true });
    } catch (e) {
      set({
        loading: false,
        loaded: true,
        error: e instanceof Error ? e.message : 'Failed to load secrets',
      });
    }
  },

  createSecret: async (keyName, value) => {
    try {
      await apiRequest('/api/v1/secrets', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ keyName, value }),
      });
      await get().fetchSecrets();
      return true;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to save secret' });
      return false;
    }
  },

  deleteSecret: async (keyName) => {
    try {
      await apiRequest(`/api/v1/secrets/${encodeURIComponent(keyName)}`, {
        method: 'DELETE',
        auth: true,
      });
      set((s) => ({ secrets: s.secrets.filter((x) => x.keyName !== keyName) }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete secret' });
    }
  },

  clearError: () => set({ error: null }),
}));
