import React, { useState } from 'react';
import * as Separator from '@radix-ui/react-separator';
import { Github, Mail, Chrome, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export function AuthLanding() {
  const { loginWithGitHub, loginWithGoogle, loginWithEmail, isLoading } = useAuthStore();
  const [email, setEmail] = useState('demo@torsor.local');
  const [password, setPassword] = useState('demo12345');

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim() && password.trim()) {
      void loginWithEmail(email, password);
    }
  };

  return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        {/* Logo */}
        <div className="relative w-16 h-16">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full text-accent">
            <rect x="2" y="2" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
            <rect x="8" y="8" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>

        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-primary tracking-tight">What do you want to build?</h1>
          <p className="text-secondary text-sm">Join Torsor to start building with AI agents.</p>
        </div>

        <div className="w-full space-y-3">
          <button 
            onClick={() => loginWithGitHub()}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-surface border border-default hover:border-subtle hover:bg-elevated text-primary rounded-xl px-6 py-3.5 font-medium transition-all group"
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Github size={20} className="group-hover:text-accent transition-colors" />}
            Continue with GitHub
          </button>

          <button 
            onClick={() => loginWithGoogle()}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-surface border border-default hover:border-subtle hover:bg-elevated text-primary rounded-xl px-6 py-3.5 font-medium transition-all group"
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Chrome size={20} className="group-hover:text-accent transition-colors" />}
            Continue with Google
          </button>
        </div>

        <div className="w-full flex items-center gap-4 py-2">
          <Separator.Root className="flex-1 h-[1px] bg-default" />
          <span className="text-xs font-bold text-tertiary uppercase tracking-widest">or</span>
          <Separator.Root className="flex-1 h-[1px] bg-default" />
        </div>

        <form onSubmit={handleEmailLogin} className="w-full space-y-3">
          <div className="relative group">
            <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-tertiary group-focus-within:text-accent transition-colors" />
            <input 
              type="email" 
              placeholder="Enter your email..." 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-surface border border-default focus:border-accent/50 rounded-xl pl-12 pr-4 py-3.5 text-primary outline-none transition-all placeholder:text-tertiary"
            />
          </div>
          <div className="relative group">
            <input 
              type="password" 
              placeholder="Enter your password..." 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-surface border border-default focus:border-accent/50 rounded-xl px-4 py-3.5 text-primary outline-none transition-all placeholder:text-tertiary"
            />
          </div>
          <button 
            type="submit"
            disabled={isLoading || !email || !password}
            className="w-full bg-accent hover:bg-accent-hover disabled:bg-accent/50 text-white font-bold rounded-xl px-6 py-3.5 transition-all shadow-lg shadow-accent/20"
          >
            {isLoading ? <Loader2 size={20} className="animate-spin mx-auto" /> : 'Continue'}
          </button>
          <p className="text-center text-xs text-tertiary">
            Dev seed: demo@torsor.local / demo12345
          </p>
        </form>
      </div>
    </div>
  );
}
