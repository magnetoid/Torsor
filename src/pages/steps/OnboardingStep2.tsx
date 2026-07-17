import React from 'react';
import { User, Users, Building, GraduationCap, Check } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StepProps {
  data: any;
  updateData: (newData: any) => void;
  onNext: () => void;
  onBack: () => void;
}

const ROLES = [
  { id: 'solo', label: 'Solo builder', description: "I'm building projects on my own", icon: User },
  { id: 'team', label: 'Team lead', description: "I'm building with a team", icon: Users },
  { id: 'agency', label: 'Agency', description: "I build for clients", icon: Building },
  { id: 'student', label: 'Student', description: "I'm learning to code", icon: GraduationCap },
];

export function OnboardingStep2({ data, updateData, onNext, onBack }: StepProps) {
  const [role, setRole] = React.useState(data.role || '');

  const handleNext = () => {
    updateData({ role });
    onNext();
  };

  return (
    <div className="space-y-8 flex flex-col h-full">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-primary tracking-tight">How will you use Torsor?</h1>
        <p className="text-secondary text-sm">We'll tailor your experience based on your role.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 flex-1">
        {ROLES.map((r) => (
          <button
            key={r.id}
            onClick={() => setRole(r.id)}
            className={cn(
              "flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group",
              role === r.id 
                ? "bg-accent/5 border-accent shadow-sm" 
                : "bg-page border-default hover:border-accent/50 hover:bg-elevated/50"
            )}
          >
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
              role === r.id ? "bg-accent text-white" : "bg-elevated text-tertiary group-hover:text-primary"
            )}>
              <r.icon size={20} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-primary">{r.label}</div>
              <div className="text-xs text-secondary mt-0.5">{r.description}</div>
            </div>
            {role === r.id && (
              <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-white">
                <Check size={14} />
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <button 
          onClick={onBack} 
          className="h-12 px-6 bg-page border border-default rounded-xl font-bold text-sm text-secondary hover:bg-elevated transition-all"
        >
          Back
        </button>
        <button 
          onClick={handleNext} 
          disabled={!role}
          className="flex-1 h-12 bg-accent hover:bg-accent-hover disabled:bg-elevated disabled:text-tertiary text-white rounded-xl font-bold text-sm shadow-lg shadow-accent/20 transition-all"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
