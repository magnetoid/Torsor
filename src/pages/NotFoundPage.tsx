import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Search } from 'lucide-react';
import { Button } from '../components/shared/Button';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-700">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-12">
        <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center text-white shadow-lg shadow-accent/20">
          <div className="w-5 h-5 border-2 border-white rounded-sm rotate-45" />
        </div>
        <span className="text-2xl font-bold text-primary tracking-tight">Torsor</span>
      </div>

      <div className="relative mb-12">
        <div className="text-[180px] font-black text-elevated leading-none select-none">404</div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-24 h-24 bg-surface border border-default rounded-xl flex items-center justify-center text-accent shadow-2xl rotate-12">
            <Search size={48} strokeWidth={1.5} />
          </div>
        </div>
      </div>

      <h1 className="text-3xl font-bold text-primary mb-3 tracking-tight">
        Page not found
      </h1>
      
      <p className="text-sm text-secondary max-w-[320px] leading-relaxed mb-12">
        The page you're looking for doesn't exist or has been moved to another workspace.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-4">
        <Button 
          onClick={() => navigate(-1)}
          className="bg-elevated hover:bg-inset text-primary px-8 py-3 rounded-xl font-bold text-sm border border-default transition-all flex items-center gap-2"
        >
          <ArrowLeft size={18} />
          Go back
        </Button>
        
        <Button 
          onClick={() => navigate('/')}
          className="bg-accent hover:bg-accent-hover text-white px-8 py-3 rounded-xl font-bold text-sm shadow-lg shadow-accent/20 transition-all flex items-center gap-2"
        >
          <Home size={18} />
          Go home
        </Button>
      </div>

      <div className="mt-24 pt-8 border-t border-default w-full max-w-sm">
        <p className="text-xs font-bold text-tertiary uppercase tracking-widest mb-4">Need help?</p>
        <div className="flex justify-center gap-6">
          <a href="#" className="text-xs font-bold text-secondary hover:text-accent transition-colors">Documentation</a>
          <a href="#" className="text-xs font-bold text-secondary hover:text-accent transition-colors">Support</a>
          <a href="#" className="text-xs font-bold text-secondary hover:text-accent transition-colors">Status</a>
        </div>
      </div>
    </div>
  );
}
