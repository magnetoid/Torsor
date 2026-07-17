import React, { useRef, useEffect, useState } from 'react';
import { 
  MessageSquare, 
  History, 
  Maximize2, 
  Layout, 
  Plus,
  ArrowUp,
  Square
} from 'lucide-react';
import { useChatStore } from './stores/chatStore';
import { useProjectStore } from './stores/projectStore';
import { useLayoutStore } from './stores/layoutStore';
import { ChatMessage } from './components/chat/ChatMessage';
import { ChatInput } from './components/chat/ChatInput';
import { EmptyState } from './components/shared/EmptyState';

const SUGGESTIONS = [
  "Check my app for bugs",
  "Add payment processing",
  "Connect with an AI Assistant",
  "Add SMS message sending",
  "Add a database",
  "Add authenticated user login"
];

export default function ChatPanel() {
  const { messages, currentThread, isAgentWorking, agentStep, runStartedAt, sendMessage, runAgent } = useChatStore();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const { openTab, uiMode, setUiMode } = useLayoutStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // 1s ticker while the agent works, so the indicator shows climbing elapsed time — a slow
  // local model then reads as "still going" rather than hung.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!isAgentWorking) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isAgentWorking]);
  const elapsed = isAgentWorking && runStartedAt ? Math.max(0, Math.floor((now - runStartedAt) / 1000)) : 0;
  const elapsedLabel = elapsed >= 60 ? `${Math.floor(elapsed / 60)}m ${elapsed % 60}s` : `${elapsed}s`;

  // Inside a project, a suggestion runs the coding agent; on the plain chat it completes.
  const submit = (text: string) => {
    if (activeProjectId) runAgent(activeProjectId, text);
    else sendMessage(text);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-page">
      {/* THREAD HEADER */}
      {!isEmpty && currentThread && (
        <header className="h-9 bg-surface border-b border-default px-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare size={12} className="text-accent shrink-0" />
            <span className="text-xs font-medium text-primary truncate">
              {currentThread.title}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => openTab('runs')}
              aria-label="Run history"
              title="Run history"
              className="p-1.5 text-secondary hover:text-primary transition-colors"
            >
              <History size={14} />
            </button>
            <button
              onClick={() => setUiMode(uiMode === 'focus' ? 'ide' : 'focus')}
              aria-label={uiMode === 'focus' ? 'Exit focus mode' : 'Focus on chat'}
              title={uiMode === 'focus' ? 'Exit focus mode' : 'Focus on chat'}
              className="p-1.5 text-secondary hover:text-primary transition-colors"
            >
              <Maximize2 size={14} />
            </button>
          </div>
        </header>
      )}

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {isEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <EmptyState 
              icon={MessageSquare}
              title="New chat with Torsor Agent"
              description="Torsor Agent can make changes, review its work, and debug itself automatically."
            />
            
            <div className="flex flex-wrap justify-center gap-2 mt-8">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => submit(suggestion)}
                  className="bg-surface border border-default rounded-lg px-3 py-1.5 text-xs text-secondary hover:border-tertiary hover:text-primary transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            aria-live="polite"
            aria-busy={isAgentWorking}
            className="flex-1 overflow-y-auto px-3 py-4 scrollbar-hide"
          >
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isAgentWorking && (
              <div className="flex items-center gap-2 py-2 px-1">
                <div className="flex gap-1">
                  <span className="w-1 h-1 rounded-full bg-accent animate-pulse" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 rounded-full bg-accent animate-pulse" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 rounded-full bg-accent animate-pulse" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-[10px] font-bold text-accent uppercase tracking-widest animate-pulse">
                  Torsor Agent Thinking{agentStep > 0 ? ` · step ${agentStep}` : ''}{elapsed > 2 ? ` · ${elapsedLabel}` : ''}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* INPUT BAR */}
      <ChatInput />
    </div>
  );
}
