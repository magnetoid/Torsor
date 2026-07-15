import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Brain } from 'lucide-react';
import { useAppStore } from '../../useAppStore';
import { cn } from '../../lib/utils';

export const ConsensusIndicator: React.FC = () => {
  const consensusState = useAppStore(state => state.consensusState);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!consensusState || !consensusState.active) return null;

  const { status, agreement, models, diff } = consensusState;

  return (
    <div className="mb-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <div 
        className={cn(
          "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
          status === 'running' ? "bg-page border-default" :
          status === 'agreed' ? "bg-success/10 border-success/30" :
          "bg-warning/10 border-warning/30"
        )}
        onClick={() => status !== 'running' && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {status === 'running' ? (
            <Brain size={18} className="text-accent animate-pulse" />
          ) : status === 'agreed' ? (
            <CheckCircle2 size={18} className="text-success" />
          ) : (
            <AlertTriangle size={18} className="text-warning" />
          )}
          
          <div className="flex flex-col">
            <span className="text-sm font-medium text-primary">
              {status === 'running' && `Running consensus: ${models.join(' + ')}`}
              {status === 'agreed' && `Both models agree (${agreement}% confidence)`}
              {status === 'disagreed' && `Models disagree (${agreement}% confidence) — using ${models[0]} output`}
            </span>
            {status === 'running' && (
              <span className="text-[10px] text-secondary uppercase tracking-wider font-bold">
                Analyzing outputs...
              </span>
            )}
          </div>
        </div>

        {status !== 'running' && (
          <div className="text-secondary">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        )}
      </div>

      {isExpanded && diff && (
        <div className="mt-2 grid grid-cols-2 gap-2 animate-in zoom-in-95 duration-200">
          <div className="bg-inset border border-default rounded-lg p-3">
            <div className="text-[10px] font-bold text-secondary uppercase mb-2">{models[0]}</div>
            <pre className="text-xs text-success/80 font-mono whitespace-pre-wrap">
              {diff.left}
            </pre>
          </div>
          <div className="bg-inset border border-default rounded-lg p-3">
            <div className="text-[10px] font-bold text-secondary uppercase mb-2">{models[1]}</div>
            <pre className="text-xs text-warning/80 font-mono whitespace-pre-wrap">
              {diff.right}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
