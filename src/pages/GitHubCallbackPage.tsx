import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

const ERROR_MESSAGES: Record<string, string> = {
  github_unavailable: 'GitHub sign-in is not available right now.',
  state: 'Your sign-in session expired. Please try again.',
  email_unverified: 'Your GitHub account has no verified primary email.',
  signups_disabled: 'New sign-ups via GitHub are currently disabled.',
  exchange_failed: 'Could not complete GitHub sign-in. Please try again.',
  server_error: 'Something went wrong during GitHub sign-in. Please try again.',
};

export function GitHubCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const completeGitHubLogin = useAuthStore((s) => s.completeGitHubLogin);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const errParam = params.get('error');
    if (errParam) {
      setError(ERROR_MESSAGES[errParam] ?? 'GitHub sign-in failed.');
      return;
    }
    const code = params.get('code');
    if (!code) {
      setError('Missing sign-in code.');
      return;
    }
    completeGitHubLogin(code)
      .then(() => navigate('/', { replace: true }))
      .catch(() => setError('Could not complete GitHub sign-in. Please try again.'));
  }, [params, completeGitHubLogin, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      {error ? (
        <div className="w-full max-w-sm bg-surface border border-default rounded-xl p-8 text-center space-y-4">
          <p className="text-sm text-error">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="w-full h-11 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold text-sm transition-all"
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-secondary">
          <Loader2 size={18} className="animate-spin" /> Signing you in…
        </div>
      )}
    </div>
  );
}
