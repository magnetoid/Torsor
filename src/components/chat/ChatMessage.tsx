import React, { useState } from 'react';
import {
  User,
  Bot,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Rocket,
  ClipboardList,
  ChevronRight,
  Lock as LockIcon,
  X,
  Plus,
  ShieldCheck,
  RotateCcw
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ChatMessageData, useChatStore } from '../../stores/chatStore';
import { useProjectStore } from '../../stores/projectStore';
import { useDeployStore } from '../../stores/deployStore';
import { useLayoutStore } from '../../stores/layoutStore';

interface ChatMessageProps {
  message: ChatMessageData;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const deployUrl = useDeployStore((s) => s.currentDeployment?.url);
  const isUser = message.type === 'user';
  const isAgent = message.type === 'agent';
  const isWork = message.type === 'work';
  const isPlan = message.type === 'plan';
  const isTerminal = message.type === 'terminal';
  const isError = message.type === 'error';
  const isDeploy = message.type === 'deploy';

  if (isWork) {
    const done = message.metadata?.done;
    return (
      <div className="flex items-center gap-2 py-1.5 px-2 bg-surface/50 rounded-lg border border-default mb-2">
        {done
          ? <CheckCircle2 size={12} className="text-success shrink-0" />
          : <Loader2 size={12} className="text-accent animate-spin shrink-0" />}
        <span className="text-[11px] text-secondary font-medium">{message.content}</span>
      </div>
    );
  }

  if (isPlan) {
    return <PlanCard message={message} />;
  }

  if (isTerminal) {
    const failed = message.metadata?.failed;
    return (
      <div className="bg-page border border-default rounded-lg mb-4 overflow-hidden">
        <div className="bg-surface px-2 py-1 border-b border-default flex items-center gap-2">
          <Terminal size={10} className={failed ? 'text-error' : 'text-secondary'} />
          <span className="text-[10px] font-mono text-secondary">terminal</span>
          {failed && <span className="text-[10px] font-mono font-bold text-error ml-auto">failed</span>}
        </div>
        <pre className={cn('p-2 text-[11px] font-mono overflow-x-auto', failed ? 'text-error' : 'text-success')}>
          <code>{message.content}</code>
        </pre>
      </div>
    );
  }

  if (isError) {
    // Recovery routing: a failed run offers the right doors, not just red text.
    const retry = () => {
      const { lastAgentTask, runAgent, isAgentWorking } = useChatStore.getState();
      const pid = useProjectStore.getState().activeProjectId;
      if (pid && lastAgentTask && !isAgentWorking) void runAgent(pid, lastAgentTask);
    };
    const canRetry = !!useChatStore.getState().lastAgentTask;
    return (
      <div className="bg-error/10 border border-error/20 rounded-xl p-3 mb-4 flex gap-3">
        <AlertCircle size={16} className="text-error shrink-0" />
        <div className="flex-1 space-y-1 min-w-0">
          <p className="text-xs font-bold text-error">Error encountered</p>
          <p className="text-xs text-error/80 leading-relaxed break-words">{message.content}</p>
          <div className="flex gap-2 pt-1.5">
            {canRetry && (
              <button
                onClick={retry}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-error/30 text-[10px] font-bold text-error hover:bg-error/10 transition-colors"
              >
                <RotateCcw size={10} /> Retry
              </button>
            )}
            <button
              onClick={() => {
                useLayoutStore.getState().setUiMode('ide');
                useLayoutStore.getState().openTab('terminal');
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-md border border-default text-[10px] font-bold text-secondary hover:text-primary transition-colors"
            >
              <Terminal size={10} /> Open terminal
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isDeploy) {
    return (
      <div className="bg-success/10 border border-success/20 rounded-xl p-3 mb-4 flex gap-3">
        <Rocket size={16} className="text-success shrink-0" />
        <div className="space-y-1">
          <p className="text-xs font-bold text-success">Deployment Successful</p>
          <p className="text-xs text-success/80 leading-relaxed">{message.content}</p>
          {deployUrl && (
            <a
              href={deployUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-[10px] font-bold text-success underline underline-offset-2"
            >
              View Live App
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex gap-3 mb-6",
      isUser ? "flex-row-reverse" : "flex-row"
    )}>
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center shrink-0 border",
        isUser ? "bg-accent/10 border-accent/20 text-accent" : "bg-elevated border-default text-secondary"
      )}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={cn(
        "max-w-[85%] space-y-1",
        isUser ? "items-end" : "items-start"
      )}>
        <div className={cn(
          "px-3 py-2 rounded-2xl text-sm leading-relaxed",
          isUser 
            ? "bg-accent text-white rounded-tr-none" 
            : "bg-surface text-primary border border-default rounded-tl-none"
        )}>
          {message.content}
          
          {message.metadata?.action === 'move_to_secrets' && (
            <div className="mt-3 pt-3 border-t border-default">
              <button className="w-full bg-accent hover:bg-accent-hover text-white py-1.5 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-2">
                <LockIcon size={12} />
                Move to Secrets
              </button>
            </div>
          )}
        </div>
        {/* Self-verification confidence signal (from a check_app probe during the run):
            a binary "verified / couldn't verify", never a fake certainty. */}
        {isAgent && message.metadata?.verified === 'ok' && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-success/10 border border-success/20 text-[10px] font-medium text-success">
            <ShieldCheck size={10} /> Verified — the app responds
          </span>
        )}
        {isAgent && message.metadata?.verified === 'fail' && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-warning/10 border border-warning/20 text-[10px] font-medium text-warning">
            <AlertCircle size={10} /> Couldn't verify the app responds
          </span>
        )}
        <span className="text-[10px] text-tertiary px-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

/** The plan-as-contract card: the agent's proposed steps are EDITABLE before approval —
 *  remove or rewrite steps, add your own, then "Approve & build" runs exactly that list.
 *  (Planning-visibility pattern: a clear contract between you and the agent.) */
function PlanCard({ message }: { message: ChatMessageData }) {
  const [steps, setSteps] = useState<string[]>(() => message.metadata?.steps ?? []);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const isWorking = useChatStore((s) => s.isAgentWorking);

  const updateStep = (idx: number, text: string) =>
    setSteps((prev) => prev.map((s, i) => (i === idx ? text : s)));
  const removeStep = (idx: number) => setSteps((prev) => prev.filter((_, i) => i !== idx));

  const approve = () => {
    const pid = useProjectStore.getState().activeProjectId;
    const finalSteps = steps.map((s) => s.trim()).filter(Boolean);
    if (pid && finalSteps.length) {
      void useChatStore.getState().approvePlan(pid, message.metadata?.planTask ?? '', finalSteps);
    }
  };

  return (
    <div className="bg-surface border border-default rounded-xl p-3 mb-4 overflow-hidden">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardList size={14} className="text-accent" />
        <span className="text-xs font-bold text-primary">Proposed plan</span>
      </div>
      <p className="text-[10px] text-tertiary mb-2">
        Edit or remove steps — the agent will follow exactly this list.
      </p>
      <div className="space-y-1">
        {steps.map((step, idx) => (
          <div key={idx} className="group flex items-center gap-2 text-xs text-secondary rounded-md px-1 py-0.5 hover:bg-elevated/60">
            <span className="text-accent font-mono shrink-0">{idx + 1}.</span>
            {editingIdx === idx ? (
              <input
                autoFocus
                value={step}
                onChange={(e) => updateStep(idx, e.target.value)}
                onBlur={() => setEditingIdx(null)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingIdx(null)}
                className="flex-1 bg-inset border border-accent/40 rounded px-1.5 py-0.5 text-xs text-primary outline-none"
              />
            ) : (
              <button
                onClick={() => setEditingIdx(idx)}
                title="Click to edit this step"
                className="flex-1 text-left cursor-text hover:text-primary transition-colors"
              >
                {step || <span className="italic text-tertiary">(empty — will be skipped)</span>}
              </button>
            )}
            <button
              onClick={() => removeStep(idx)}
              aria-label={`Remove step ${idx + 1}`}
              className="p-0.5 rounded text-tertiary opacity-0 group-hover:opacity-100 hover:text-error transition-all shrink-0"
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => {
          setSteps((prev) => [...prev, '']);
          setEditingIdx(steps.length);
        }}
        className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-tertiary hover:text-primary transition-colors"
      >
        <Plus size={10} /> Add step
      </button>
      <div className="mt-3 flex gap-2">
        <button
          onClick={approve}
          disabled={isWorking || steps.every((s) => !s.trim())}
          className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white py-1 rounded-md text-[10px] font-bold transition-colors"
        >
          Approve & build
        </button>
        <button
          onClick={() => useChatStore.getState().dismissPlans()}
          className="px-3 border border-default text-secondary hover:text-primary py-1 rounded-md text-[10px] font-bold transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
