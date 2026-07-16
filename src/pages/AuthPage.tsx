import React, { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Github, ArrowRight, Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { Input } from '../components/shared/Input';
import { motion, AnimatePresence } from 'framer-motion';

export function AuthPage() {
  const location = useLocation();
  const routeMode = location.pathname === '/signup' ? 'signup' : 'login';
  // Prefill the dev-seed credentials only in the local dev build, never in a production
  // bundle (shipping real-looking creds in the login form is a bad look + a footgun).
  const isDev = import.meta.env.DEV;
  const [isLogin, setIsLogin] = useState(routeMode === 'login');
  const [email, setEmail] = useState(isDev ? 'demo@torsor.local' : '');
  const [name, setName] = useState('');
  const [password, setPassword] = useState(isDev ? 'demo12345' : '');
  const [formError, setFormError] = useState<string | null>(null);

  const { loginWithGitHub, loginWithGoogle, loginWithEmail, signup, isLoading, error } = useAuthStore();
  const navigate = useNavigate();
  const from = (location.state as any)?.from?.pathname || '/';

  React.useEffect(() => {
    setIsLogin(routeMode === 'login');
  }, [routeMode]);

  const activeError = useMemo(() => formError || error, [formError, error]);

  const handleGitHubLogin = async () => {
    try {
      setFormError(null);
      await loginWithGitHub();
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'GitHub login is unavailable');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setFormError(null);
      await loginWithGoogle();
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Google login is unavailable');
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email || !password || (!isLogin && !name.trim())) {
      setFormError('Please complete all required fields.');
      return;
    }

    try {
      if (isLogin) {
        await loginWithEmail(email, password);
        navigate(from, { replace: true });
      } else {
        await signup(name || email.split('@')[0], email, password);
        navigate('/onboarding', { replace: true });
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Authentication failed');
    }
  };

  return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center p-6">
      <div className="flex items-center gap-2 mb-8 animate-in fade-in slide-in-from-top-4 duration-500">
        <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-lg shadow-accent/20">
          <div className="w-5 h-5 border-2 border-white rounded-sm rotate-45" />
        </div>
        <span className="text-2xl font-bold text-primary tracking-tight">Torsor</span>
      </div>

      <div className="w-full max-w-sm bg-surface border border-default rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
        <AnimatePresence mode="wait">
          <motion.div
            key={isLogin ? 'login' : 'signup'}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            className="space-y-6"
          >
            <div className="text-center space-y-1">
              <h2 className="text-xl font-medium text-primary">
                {isLogin ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="text-sm text-secondary">
                {isLogin ? 'Sign in to Torsor on app.torsor.dev' : 'Start building with Torsor'}
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleGitHubLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 bg-elevated border border-default rounded-xl py-2.5 text-sm font-medium text-primary hover:bg-surface transition-all disabled:opacity-50"
              >
                <Github size={18} />
                Continue with GitHub
              </button>
              <button
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 bg-elevated border border-default rounded-xl py-2.5 text-sm font-medium text-primary hover:bg-surface transition-all disabled:opacity-50"
              >
                Continue with Google
              </button>
            </div>

            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t border-default"></div>
              <span className="flex-shrink mx-4 text-[10px] font-bold text-tertiary uppercase tracking-widest">or</span>
              <div className="flex-grow border-t border-default"></div>
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-4">
              {!isLogin && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-tertiary uppercase tracking-wider ml-1">Name</label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required={!isLogin}
                    className="h-11 bg-page border-default rounded-xl px-4 text-sm"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-tertiary uppercase tracking-wider ml-1">Email</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  required
                  className="h-11 bg-page border-default rounded-xl px-4 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-tertiary uppercase tracking-wider ml-1">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="h-11 bg-page border-default rounded-xl px-4 text-sm"
                />
              </div>
              {activeError && <p className="text-sm text-error">{activeError}</p>}
              {isLogin && isDev && (
                <p className="text-xs text-secondary">Dev seed: demo@torsor.local / demo12345</p>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-11 bg-accent hover:bg-accent-hover disabled:bg-elevated disabled:text-tertiary text-white rounded-xl font-bold text-sm shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    {isLogin ? 'Sign in' : 'Create account'}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </AnimatePresence>
      </div>

      <p className="mt-8 text-sm text-secondary animate-in fade-in duration-700">
        {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
        <button
          onClick={() => navigate(isLogin ? '/signup' : '/login')}
          className="font-bold text-accent hover:text-accent-hover transition-colors"
        >
          {isLogin ? 'Sign up' : 'Sign in'}
        </button>
      </p>
    </div>
  );
}
