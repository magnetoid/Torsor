import { Loader2, Check, AlertCircle, Terminal, RotateCw, Circle } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * A single vertical checklist that updates in place as a real, multi-step operation
 * progresses — used for the Preview tab's "bring the app up" flow (provision → start dev
 * server → wait for the app → open preview). Each step's `state` is driven by a genuine
 * backend transition in `useAppStore.triggerBuild`, not a timed animation, so the list is
 * an honest reflection of what the server is actually doing.
 */

export type BootStepState = 'pending' | 'active' | 'done' | 'error' | 'info';

export interface BootStep {
  id: string;
  label: string;
  sublabel?: string;
  state: BootStepState;
}

interface BootStepsProps {
  steps: BootStep[];
  /** Re-run the boot flow (shown when a step reaches a terminal error/info state). */
  onRetry?: () => void;
  /** Open the Terminal tab (so the user can start their own dev server). */
  onOpenTerminal?: () => void;
}

export function BootSteps({ steps, onRetry, onOpenTerminal }: BootStepsProps) {
  // A terminal state (nothing left running) surfaces the action row.
  const terminal = steps.length > 0 && steps.every((s) => s.state !== 'active');

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm flex flex-col">
        {steps.map((step) => (
          <div key={step.id} className="flex items-start gap-3 py-1.5">
            <span className="mt-0.5 shrink-0">{stepIcon(step.state)}</span>
            <div className="min-w-0 flex-1">
              <div className={cn('flex items-center gap-1.5 text-sm transition-colors', labelClass(step.state))}>
                <span className="truncate">{step.label}</span>
                {step.state === 'active' && (
                  <span className="flex gap-0.5 text-accent" aria-hidden>
                    <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                  </span>
                )}
              </div>
              {step.sublabel && (
                <p className={cn('text-xs mt-0.5', step.state === 'error' ? 'text-error/80' : 'text-tertiary')}>
                  {step.sublabel}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {terminal && (onRetry || onOpenTerminal) && (
        <div className="flex items-center gap-2 mt-5">
          {onOpenTerminal && (
            <button
              onClick={onOpenTerminal}
              className="flex items-center gap-1.5 text-xs text-secondary hover:text-primary border border-default rounded-md px-3 py-1.5 transition-colors"
            >
              <Terminal size={13} /> Open terminal
            </button>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 border border-accent/30 hover:border-accent/50 rounded-md px-3 py-1.5 transition-colors"
            >
              <RotateCw size={13} /> Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function stepIcon(state: BootStepState) {
  switch (state) {
    case 'active':
      return <Loader2 size={15} className="text-accent animate-spin" />;
    case 'done':
      return <Check size={15} className="text-success" />;
    case 'error':
      return <AlertCircle size={15} className="text-error" />;
    case 'info':
      return <Terminal size={15} className="text-secondary" />;
    default:
      return <Circle size={15} className="text-subtle" />;
  }
}

function labelClass(state: BootStepState): string {
  switch (state) {
    case 'active':
      return 'text-primary font-medium';
    case 'done':
      return 'text-secondary';
    case 'error':
      return 'text-error font-medium';
    case 'info':
      return 'text-primary font-medium';
    default:
      return 'text-tertiary';
  }
}
