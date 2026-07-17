import React from 'react';
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
  Lock as LockIcon
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { ChatMessageData, useChatStore } from '../../stores/chatStore';
import { useProjectStore } from '../../stores/projectStore';
import { useDeployStore } from '../../stores/deployStore';

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
    return (
      <div className="bg-surface border border-default rounded-xl p-3 mb-4 overflow-hidden">
        <div className="flex items-center gap-2 mb-2">
          <ClipboardList size={14} className="text-accent" />
          <span className="text-xs font-bold text-primary">Proposed Plan</span>
        </div>
        <div className="space-y-2">
          {message.metadata?.steps?.map((step: any, idx: number) => (
            <div key={idx} className="flex gap-2 text-xs text-secondary">
              <span className="text-accent font-mono">{idx + 1}.</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              const pid = useProjectStore.getState().activeProjectId;
              if (pid) {
                void useChatStore.getState().approvePlan(
                  pid,
                  message.metadata?.planTask ?? '',
                  message.metadata?.steps ?? []
                );
              }
            }}
            className="flex-1 bg-accent hover:bg-accent-hover text-white py-1 rounded-md text-[10px] font-bold transition-colors"
          >
            Approve & Execute
          </button>
          <button
            onClick={() => useChatStore.getState().dismissPlans()}
            className="px-3 border border-default text-secondary hover:text-primary py-1 rounded-md text-[10px] font-bold transition-colors"
          >
            Modify
          </button>
        </div>
      </div>
    );
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
    return (
      <div className="bg-error/10 border border-error/20 rounded-xl p-3 mb-4 flex gap-3">
        <AlertCircle size={16} className="text-error shrink-0" />
        <div className="space-y-1">
          <p className="text-xs font-bold text-error">Error encountered</p>
          <p className="text-xs text-error/80 leading-relaxed">{message.content}</p>
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
        <span className="text-[10px] text-tertiary px-1">
          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
