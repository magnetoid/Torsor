import React from 'react';
import { Input } from '../../components/shared/Input';

interface StepProps {
  data: any;
  updateData: (newData: any) => void;
  onNext: () => void;
}

export function OnboardingStep1({ data, updateData, onNext }: StepProps) {
  const [name, setName] = React.useState(data.name || '');
  const [workspaceName, setWorkspaceName] = React.useState(data.workspaceName || '');

  const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  const handleNext = () => {
    updateData({ name, workspaceName });
    onNext();
  };

  return (
    <div className="space-y-8 flex flex-col h-full">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-primary tracking-tight">Welcome to Torsor</h1>
        <p className="text-secondary text-sm">Let's get your workspace set up.</p>
      </div>

      <div className="space-y-6 flex-1">
        <div className="space-y-2">
          <label className="text-xs font-bold text-tertiary uppercase tracking-wider ml-1">What should we call you?</label>
          <Input 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            placeholder="Your name"
            className="h-12 bg-page border-default rounded-xl px-4 text-primary focus:border-accent transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold text-tertiary uppercase tracking-wider ml-1">Name your workspace</label>
          <Input 
            value={workspaceName} 
            onChange={(e) => setWorkspaceName(e.target.value)} 
            placeholder="e.g. Acme Studio"
            className="h-12 bg-page border-default rounded-xl px-4 text-primary focus:border-accent transition-all"
          />
          {workspaceName && (
            <p className="text-xs text-tertiary ml-1 font-mono">
              torsor.app/<span className="text-accent">{slug || '...'}</span>
            </p>
          )}
        </div>

        <p className="text-xs text-tertiary leading-relaxed">
          This is where your projects, team, and agent live. You can always change these later in settings.
        </p>
      </div>

      <button 
        onClick={handleNext} 
        disabled={!name || !workspaceName}
        className="w-full h-12 bg-accent hover:bg-accent-hover disabled:bg-elevated disabled:text-tertiary text-white rounded-xl font-bold text-sm shadow-lg shadow-accent/20 transition-all"
      >
        Continue
      </button>
    </div>
  );
}
