import React, { useState } from 'react';
import { Check, Sword, Zap, Clock, Database, DollarSign } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModelComparisonProps {
  models: {
    name: string;
    dotColor: string;
    content: string;
    metrics: { time: string; tokens: string; cost: string };
  }[];
  onSelect?: (modelName: string) => void;
}

export const ModelComparison: React.FC<ModelComparisonProps> = ({ models, onSelect }) => {
  const [winner, setWinner] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const handleSelect = (name: string) => {
    setWinner(name);
    onSelect?.(name);
  };

  const toggleExpand = (name: string) => {
    setExpanded(prev => ({ ...prev, [name]: !prev[name] }));
  };

  return (
    <div className="my-4 bg-page rounded-xl border border-default overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-default bg-surface">
        <Sword size={16} className="text-accent" />
        <span className="text-sm font-bold text-primary">Model Comparison</span>
      </div>
      
      <div className="flex overflow-x-auto scrollbar-hide">
        {models.map((model) => (
          <div 
            key={model.name}
            className={cn(
              "min-w-[280px] flex-1 border-r border-default last:border-r-0 transition-all duration-300",
              winner === model.name ? "bg-accent-muted ring-2 ring-inset ring-accent/50" : ""
            )}
          >
            {/* Header */}
            <div className="p-3 border-b border-default flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", model.dotColor)} />
                <span className="text-xs font-bold text-primary">{model.name}</span>
              </div>
              {winner === model.name && (
                <div className="bg-accent text-white p-0.5 rounded-full">
                  <Check size={12} />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-4 relative">
              <div className={cn(
                "text-xs text-primary font-mono leading-relaxed overflow-hidden transition-all duration-300",
                expanded[model.name] ? "max-h-[800px]" : "max-h-[200px]"
              )}>
                {model.content}
                {!expanded[model.name] && (
                  <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-page to-transparent" />
                )}
              </div>
              <button 
                onClick={() => toggleExpand(model.name)}
                className="mt-2 text-[10px] font-bold text-accent hover:text-accent-hover uppercase tracking-wider"
              >
                {expanded[model.name] ? 'Show Less' : 'Show More'}
              </button>
            </div>

            {/* Metrics */}
            <div className="px-4 py-3 bg-inset/50 border-t border-default space-y-2">
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1 text-secondary">
                  <Clock size={10} />
                  <span>Time</span>
                </div>
                <span className="text-primary">{model.metrics.time}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1 text-secondary">
                  <Database size={10} />
                  <span>Tokens</span>
                </div>
                <span className="text-primary">{model.metrics.tokens}</span>
              </div>
              <div className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1 text-secondary">
                  <DollarSign size={10} />
                  <span>Cost</span>
                </div>
                <span className="text-primary">{model.metrics.cost}</span>
              </div>
            </div>

            {/* Action */}
            <div className="p-3">
              <button
                onClick={() => handleSelect(model.name)}
                disabled={winner !== null}
                className={cn(
                  "w-full py-2 rounded-lg text-xs font-bold transition-all",
                  winner === model.name 
                    ? "bg-accent text-white" 
                    : winner !== null 
                      ? "bg-surface text-secondary cursor-not-allowed"
                      : "bg-surface text-primary hover:bg-elevated"
                )}
              >
                {winner === model.name ? 'Selected' : 'Use This'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
