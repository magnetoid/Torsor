import React, { useEffect, useState } from 'react';
import { Globe, Server, LayoutGrid, Box, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import { apiRequest } from '../../lib/api';

interface StepProps {
  data: any;
  updateData: (newData: any) => void;
  onComplete: (data: any) => void;
  onBack: () => void;
}

interface StarterTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
}

// Icons for the control plane's real starter templates; anything unknown gets a box.
const TEMPLATE_ICONS: Record<string, React.ElementType> = {
  static: Globe,
  'node-express': Server,
  'vite-react': LayoutGrid,
};

export function OnboardingStep3({ data, updateData, onComplete, onBack }: StepProps) {
  const [prompt, setPrompt] = useState(data.prompt || '');
  const [templateId, setTemplateId] = useState(data.templateId || '');
  // Real starter templates from the control plane — the same list the Home screen
  // offers — so the choice made here actually provisions the workspace.
  const [templates, setTemplates] = useState<StarterTemplate[]>([]);

  useEffect(() => {
    let active = true;
    apiRequest<{ items: StarterTemplate[] }>('/api/v1/templates', { auth: true })
      .then((res) => active && setTemplates(res.items))
      .catch(() => {
        // No templates endpoint → the prompt path still works.
      });
    return () => {
      active = false;
    };
  }, []);

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
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. A SaaS landing page for a coffee subscription service..."
              rows={3}
              className="w-full bg-page border border-default rounded-xl px-4 py-4 text-sm text-primary outline-none focus:border-accent transition-all resize-none shadow-sm"
            />
            <div className="absolute right-3 bottom-3 text-tertiary group-focus-within:text-accent transition-colors">
              <Sparkles size={18} />
            </div>
          </div>
        </div>

        {templates.length > 0 && (
          <div className="space-y-3">
            <label className="text-xs font-bold text-tertiary uppercase tracking-wider ml-1">Start from a template</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {templates.map((t) => {
                const Icon = TEMPLATE_ICONS[t.id] ?? Box;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTemplateId(templateId === t.id ? '' : t.id)}
                    title={t.description}
                    className={cn(
                      'flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-center group',
                      templateId === t.id
                        ? 'bg-accent/5 border-accent shadow-sm'
                        : 'bg-page border-default hover:border-accent/50 hover:bg-elevated/50',
                    )}
                  >
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
                        templateId === t.id ? 'bg-accent/10 text-accent' : 'bg-elevated text-tertiary group-hover:text-primary',
                      )}
                    >
                      <Icon size={16} />
                    </div>
                    <div className="text-xs font-bold text-primary">{t.name}</div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-tertiary ml-1">
              Pick a template and describe your idea — the agent builds on the template&apos;s stack.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="h-12 px-6 bg-page border border-default rounded-xl font-bold text-sm text-secondary hover:bg-elevated transition-all focus-ring"
          >
            Back
          </button>
          <button
            onClick={handleStart}
            disabled={!prompt && !templateId}
            className="flex-1 h-12 bg-accent hover:bg-accent-hover disabled:bg-elevated disabled:text-tertiary text-white rounded-xl font-bold text-sm shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2 focus-ring"
          >
            Start Building
            <ArrowRight size={18} />
          </button>
        </div>
        <button
          onClick={handleSkip}
          className="w-full text-center text-xs font-bold text-tertiary hover:text-secondary transition-colors focus-ring"
        >
          Skip — take me to the dashboard
        </button>
      </div>
    </div>
  );
}
