import React, { useState } from 'react';
import { 
  Globe, 
  Database, 
  LayoutGrid, 
  Smartphone, 
  Gamepad2, 
  Github,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface StepProps {
  data: any;
  updateData: (newData: any) => void;
  onComplete: (data: any) => void;
  onBack: () => void;
}

const TEMPLATES = [
  { id: 'website', label: 'Website', icon: Globe, color: 'text-accent', bg: 'bg-accent/10' },
  { id: 'api', label: 'API', icon: Database, color: 'text-info', bg: 'bg-info/10' },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid, color: 'text-success', bg: 'bg-success/10' },
  { id: 'mobile', label: 'Mobile', icon: Smartphone, color: 'text-warning', bg: 'bg-warning/10' },
  { id: 'game', label: 'Game', icon: Gamepad2, color: 'text-error', bg: 'bg-error/10' },
  { id: 'github', label: 'Import', icon: Github, color: 'text-primary', bg: 'bg-elevated' },
];

export function OnboardingStep4({ data, updateData, onComplete, onBack }: StepProps) {
  const [prompt, setPrompt] = useState(data.prompt || '');
  const [templateId, setTemplateId] = useState(data.templateId || '');

  const handleStart = () => {
    onComplete({ ...data, prompt, templateId });
  };

  const handleSkip = () => {
    onComplete({ ...data, prompt: '', templateId: '' });
  };

  return (
    <div className="space-y-8 flex flex-col h-full">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-primary tracking-tight">Create your first project</h1>
        <p className="text-secondary text-sm">Describe what you want to build or start from a template.</p>
      </div>

      <div className="space-y-6 flex-1 overflow-y-auto pr-2 custom-scrollbar">
        <div className="space-y-3">
          <label className="text-xs font-bold text-tertiary uppercase tracking-wider ml-1">Describe what you want to build</label>
          <div className="relative group">
            <textarea 
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setTemplateId('');
              }}
              placeholder="e.g. A SaaS landing page for a coffee subscription service..."
              rows={3}
              className="w-full bg-page border border-default rounded-xl px-4 py-4 text-sm text-primary outline-none focus:border-accent transition-all resize-none shadow-sm"
            />
            <div className="absolute right-3 bottom-3 text-tertiary group-focus-within:text-accent transition-colors">
              <Sparkles size={18} />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-bold text-tertiary uppercase tracking-wider ml-1">Or start from a template</label>
          <div className="grid grid-cols-3 gap-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTemplateId(t.id);
                  setPrompt('');
                }}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-center group",
                  templateId === t.id 
                    ? "bg-accent/5 border-accent shadow-sm" 
                    : "bg-page border-default hover:border-accent/50 hover:bg-elevated/50"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                  templateId === t.id ? t.bg + " " + t.color : "bg-elevated text-tertiary group-hover:text-primary"
                )}>
                  <t.icon size={16} />
                </div>
                <div className="text-xs font-bold text-primary">{t.label}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-3">
          <button 
            onClick={onBack} 
            className="h-12 px-6 bg-page border border-default rounded-xl font-bold text-sm text-secondary hover:bg-elevated transition-all"
          >
            Back
          </button>
          <button 
            onClick={handleStart} 
            disabled={!prompt && !templateId}
            className="flex-1 h-12 bg-accent hover:bg-accent-hover disabled:bg-elevated disabled:text-tertiary text-white rounded-xl font-bold text-sm shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2"
          >
            Start Building
            <ArrowRight size={18} />
          </button>
        </div>
        <button 
          onClick={handleSkip}
          className="w-full text-center text-xs font-bold text-tertiary hover:text-secondary transition-colors"
        >
          Skip — take me to the dashboard
        </button>
      </div>
    </div>
  );
}
