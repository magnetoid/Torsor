import { create } from 'zustand';
import { apiRequest } from '../lib/api';

/**
 * User-facing platform info: About (build/version identity), the What's New changelog
 * (published by super admins via the central update system), and the feedback channel.
 * All real endpoints — /api/v1/about, /api/v1/updates, /api/v1/feedback.
 */

export interface PlatformAbout {
  name: string;
  description: string;
  build: string;
  uptimeSeconds: number;
  latestUpdate: string;
  repository: string;
}

export interface PlatformUpdate {
  id: string;
  version: string;
  title: string;
  body: string;
  publishedAt: string;
}

interface PlatformState {
  about: PlatformAbout | null;
  updates: PlatformUpdate[];
  loading: boolean;
  error: string | null;

  fetchAbout: () => Promise<void>;
  fetchUpdates: () => Promise<void>;
  sendFeedback: (category: 'bug' | 'idea' | 'other', message: string, page: string) => Promise<void>;
}

export const usePlatformStore = create<PlatformState>()((set) => ({
  about: null,
  updates: [],
  loading: false,
  error: null,

  fetchAbout: async () => {
    set({ loading: true, error: null });
    try {
      const about = await apiRequest<PlatformAbout>('/api/v1/about', { auth: true });
      set({ about, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load', loading: false });
    }
  },

  fetchUpdates: async () => {
    set({ loading: true, error: null });
    try {
      const res = await apiRequest<{ items: PlatformUpdate[] }>('/api/v1/updates', { auth: true });
      set({ updates: res.items, loading: false });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to load', loading: false });
    }
  },

  sendFeedback: async (category, message, page) => {
    await apiRequest('/api/v1/feedback', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ category, message, page }),
    });
  },
}));
