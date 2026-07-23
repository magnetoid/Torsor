import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from './authStore';

describe('loginWithGitHub', () => {
  beforeEach(() => {
    // jsdom: make location.href assignable and observable
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  });

  it('redirects the browser to the backend GitHub start endpoint', async () => {
    await useAuthStore.getState().loginWithGitHub();
    expect(window.location.href).toContain('/api/v1/auth/github');
  });
});
