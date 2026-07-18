import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { apiRequest, getStoredToken, setStoredToken, setUnauthorizedHandler } from '../lib/api';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: 'user' | 'admin' | 'super_admin';
  onboarded: boolean;
  createdAt: string;
}

interface AuthResponse {
  token: string;
  user: User;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  initialized: boolean;
  error: string | null;
  clearError: () => void;
  initialize: () => Promise<void>;
  loginWithGitHub: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setOnboarded: (onboarded: boolean) => void;
  /** Update the current user's profile (optimistic local + best-effort PATCH /auth/me). */
  updateProfile: (updates: { name?: string }) => void;
}

const normalizeUser = (user: any): User => ({
  id: user.id,
  name: user.name || user.username,
  email: user.email,
  avatarUrl: user.avatarUrl ?? null,
  role: user.role === 'super_admin' || user.role === 'admin' ? user.role : 'user',
  onboarded: Boolean(user.onboarded),
  createdAt: user.createdAt,
});

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: getStoredToken(),
      isAuthenticated: Boolean(getStoredToken()),
      isLoading: false,
      initialized: false,
      error: null,
      clearError: () => set({ error: null }),
      initialize: async () => {
        if (get().initialized) return;

        const token = getStoredToken();
        if (!token) {
          set({ initialized: true, token: null, isAuthenticated: false, user: null });
          return;
        }

        set({ isLoading: true, error: null });
        try {
          const response = await apiRequest<{ user: User }>('/api/v1/auth/me', { auth: true });
          set({
            user: normalizeUser(response.user),
            token,
            isAuthenticated: true,
            isLoading: false,
            initialized: true,
          });
        } catch (error) {
          setStoredToken(null);
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
            initialized: true,
            error: error instanceof Error ? error.message : 'Failed to restore session',
          });
        }
      },
      loginWithGitHub: async () => {
        throw new Error('GitHub auth is not wired yet in Phase 2');
      },
      loginWithGoogle: async () => {
        throw new Error('Google auth is not wired yet in Phase 2');
      },
      loginWithEmail: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiRequest<AuthResponse>('/api/v1/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          setStoredToken(response.token);
          set({
            user: normalizeUser(response.user),
            token: response.token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Login failed' });
          throw error;
        }
      },
      signup: async (name: string, email: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await apiRequest<AuthResponse>('/api/v1/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ name, email, password }),
          });
          setStoredToken(response.token);
          set({
            user: normalizeUser(response.user),
            token: response.token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (error) {
          set({ isLoading: false, error: error instanceof Error ? error.message : 'Signup failed' });
          throw error;
        }
      },
      logout: async () => {
        // Best-effort server-side revocation; clear locally regardless of the result.
        try {
          await apiRequest('/api/v1/auth/logout', { method: 'POST', auth: true });
        } catch {
          // ignore — token may already be invalid/expired
        }
        setStoredToken(null);
        set({ user: null, token: null, isAuthenticated: false, error: null, initialized: true });
      },
      setOnboarded: (onboarded) => {
        // Optimistic local update, then persist server-side so /auth/me doesn't force the
        // onboarding flow again on the next load / another device. Best-effort: if the
        // PATCH fails the local flag still lets the user proceed this session.
        set((state) => ({ user: state.user ? { ...state.user, onboarded } : null }));
        void apiRequest('/api/v1/auth/me', {
          method: 'PATCH',
          auth: true,
          body: JSON.stringify({ onboarded }),
        }).catch(() => {
          /* keep the optimistic local state */
        });
      },
      updateProfile: (updates) => {
        // Optimistic local update, then persist server-side (best-effort, same pattern as
        // setOnboarded). Only known-safe fields (name) are sent.
        set((state) => ({ user: state.user ? { ...state.user, ...updates } : null }));
        void apiRequest('/api/v1/auth/me', {
          method: 'PATCH',
          auth: true,
          body: JSON.stringify(updates),
        }).catch(() => {
          /* keep the optimistic local state */
        });
      },
    }),
    {
      // Token is owned by localStorage ('torsor-auth-token' via lib/api); persist only
      // identity so we don't keep two competing copies of the token.
      name: 'torsor-auth',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

// When any authenticated request 401s (session expired/revoked server-side), drop local
// auth so the route guards (ProtectedRoute) redirect to /login instead of leaving the app
// wedged with a dead token and silent failures. Guarded so we don't loop while already out.
setUnauthorizedHandler(() => {
  if (!useAuthStore.getState().isAuthenticated) return;
  setStoredToken(null);
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false, error: 'Your session expired. Please sign in again.' });
});
