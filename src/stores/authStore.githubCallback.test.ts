import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as api from '../lib/api';
import { useAuthStore } from './authStore';

describe('completeGitHubLogin', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('exchanges the code, stores the token, and marks authenticated', async () => {
    vi.spyOn(api, 'apiGitHubExchange').mockResolvedValue({
      token: 'jwt-abc',
      user: { id: 'u1', email: 'a@b.com', username: 'a', name: 'a', role: 'user', onboarded: true, createdAt: '' },
    } as any);

    await useAuthStore.getState().completeGitHubLogin('handoff-code');

    expect(api.apiGitHubExchange).toHaveBeenCalledWith('handoff-code');
    expect(localStorage.getItem('torsor-auth-token')).toBe('jwt-abc');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe('u1');
  });
});
