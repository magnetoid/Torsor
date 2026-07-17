import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as Switch from '@radix-ui/react-switch';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Popover from '@radix-ui/react-popover';
import {
  Plus,
  ArrowUp,
  Square,
  X,
  Zap,
  Cpu,
  Paperclip,
  Code2,
  Layout
} from 'lucide-react';
import TextareaAutosize from 'react-textarea-autosize';
import { cn } from '../../lib/utils';
import { useChatStore } from '../../stores/chatStore';
import { useProjectStore } from '../../stores/projectStore';
import { useAppStore } from '../../useAppStore';

export function ChatInput() {
  const [input, setInput] = useState('');
  const {
    sendMessage,
    runAgent,
    stopAgent,
    isAgentWorking,
    selectedContext,
    addContext,
    removeContext,
    planning,
    setPlanning,
    providers,
    selectedProvider,
    setProvider,
    loadProviders
  } = useChatStore();
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  // Workspace files for the "+" attach-context picker (flat list; id === workspace path).
  const files = useAppStore((s) => s.files);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fileFilter, setFileFilter] = useState('');
  const attachableFiles = useMemo(() => files.filter((f) => f.type === 'file'), [files]);
  const matches = useMemo(() => {
    const q = fileFilter.trim().toLowerCase();
    const pool = q ? attachableFiles.filter((f) => f.id.toLowerCase().includes(q)) : attachableFiles;
    return pool.slice(0, 50);
  }, [attachableFiles, fileFilter]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Populate the model dropdown from the control plane's loaded provider plugins.
  useEffect(() => {
    loadProviders().catch(() => {
      /* backend without providers (or apps/api) — dropdown shows the empty state */
    });
  }, [loadProviders]);

  const activeProvider = providers.find((p) => p.name === selectedProvider);

  const handleSend = () => {
    if (isAgentWorking) {
      stopAgent();
      return;
    }
    if (input.trim()) {
      // Inside a project → run the coding agent against its workspace; elsewhere → plain chat.
      if (activeProjectId) {
        runAgent(activeProjectId, input);
      } else {
        sendMessage(input);
      }
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Enter sends only when idle. During a run the field stays editable so the user can
    // draft the next message; Enter just inserts a newline (Stop is the send button).
    if (e.key === 'Enter' && !e.shiftKey && !isAgentWorking) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="sticky bottom-0 bg-page pt-2 px-3 pb-3 space-y-2 z-10">
      {/* CONTEXT BAR */}
      {selectedContext.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedContext.map((item) => (
            <div 
              key={item.id}
              className="flex items-center gap-1.5 bg-accent/10 border border-accent/20 rounded-md px-2 py-0.5 text-[10px] font-bold text-accent"
            >
              {item.type === 'file' && <Paperclip size={10} />}
              {item.type === 'code' && <Code2 size={10} />}
              {item.type === 'canvas' && <Layout size={10} />}
              <span>{item.name}</span>
              <button 
                onClick={() => removeContext(item.id)}
                className="hover:text-accent-hover transition-colors"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* INPUT CONTAINER */}
      <div className="bg-surface border border-default rounded-2xl p-2 focus-within:border-tertiary transition-colors">
        <TextareaAutosize
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isAgentWorking ? "Agent is working — draft your next message…" : "Make, test, iterate..."}
          className="w-full bg-transparent text-sm text-primary placeholder-tertiary resize-none outline-none min-h-[36px] max-h-[120px] px-1 py-1"
        />

        <div className="flex items-center justify-between mt-1 px-1">
          <div className="flex items-center gap-1">
            <Popover.Root open={pickerOpen} onOpenChange={(open) => { setPickerOpen(open); if (!open) setFileFilter(''); }}>
              <Popover.Trigger asChild>
                <button
                  aria-label="Attach a workspace file as context"
                  className="p-1.5 text-secondary hover:text-primary hover:bg-elevated rounded-md transition-all"
                >
                  <Plus size={16} />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="top"
                  align="start"
                  sideOffset={8}
                  className="bg-elevated border border-default rounded-lg p-1.5 shadow-2xl z-[100] w-72"
                >
                  <input
                    autoFocus
                    value={fileFilter}
                    onChange={(e) => setFileFilter(e.target.value)}
                    placeholder="Attach a file as context…"
                    className="w-full bg-inset border border-default rounded-md px-2 py-1.5 text-xs text-primary placeholder-tertiary outline-none focus:border-accent/50"
                  />
                  <div className="max-h-48 overflow-y-auto mt-1.5 space-y-0.5">
                    {attachableFiles.length === 0 && (
                      <div className="px-2 py-2 text-[11px] text-secondary">
                        No workspace files yet — open a project with a running workspace.
                      </div>
                    )}
                    {attachableFiles.length > 0 && matches.length === 0 && (
                      <div className="px-2 py-2 text-[11px] text-secondary">No files match “{fileFilter}”.</div>
                    )}
                    {matches.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => {
                          addContext({ id: f.id, type: 'file', name: f.name });
                          setPickerOpen(false);
                          setFileFilter('');
                        }}
                        className="w-full text-left px-2 py-1 text-[11px] font-mono text-secondary hover:text-primary hover:bg-surface rounded truncate transition-colors"
                        title={f.id}
                      >
                        {f.id}
                      </button>
                    ))}
                  </div>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            
            <div className="flex items-center gap-2 ml-2">
              <span className="text-[10px] font-bold text-secondary uppercase tracking-wider">Plan</span>
              <Switch.Root 
                checked={planning}
                onCheckedChange={setPlanning}
                className="w-7 h-4 bg-elevated rounded-full relative data-[state=checked]:bg-accent transition-colors outline-none cursor-pointer"
              >
                <Switch.Thumb className="block w-2.5 h-2.5 bg-white rounded-full transition-transform duration-100 translate-x-0.5 will-change-transform data-[state=checked]:translate-x-3.5" />
              </Switch.Root>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  aria-label="Select model provider"
                  className="flex items-center gap-1 px-1.5 py-1 text-[10px] font-bold text-secondary hover:text-primary hover:bg-elevated rounded transition-all"
                >
                  <Zap size={12} className="text-accent" />
                  <span className="max-w-[120px] truncate">
                    {activeProvider?.displayName ?? selectedProvider ?? 'No model'}
                  </span>
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content className="bg-elevated border border-default rounded-md p-1 shadow-xl z-[100] min-w-[160px]">
                  {providers.length === 0 && (
                    <div className="px-2 py-1.5 text-[10px] text-secondary">
                      No model providers loaded
                    </div>
                  )}
                  {providers.map((provider) => (
                    <DropdownMenu.Item
                      key={provider.name}
                      onSelect={() => setProvider(provider.name)}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold rounded cursor-pointer outline-none hover:bg-accent',
                        provider.name === selectedProvider ? 'text-accent hover:text-white' : 'text-primary'
                      )}
                    >
                      <Cpu size={12} className="shrink-0" />
                      <span className="truncate">{provider.displayName}</span>
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            <button
              onClick={handleSend}
              aria-label={isAgentWorking ? 'Stop agent' : 'Send message'}
              disabled={!input.trim() && !isAgentWorking}
              className={cn(
                "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                isAgentWorking 
                  ? "bg-error/10 text-error hover:bg-error/20" 
                  : input.trim() 
                    ? "bg-accent text-white hover:bg-accent-hover shadow-lg shadow-accent/20" 
                    : "bg-elevated text-tertiary"
              )}
            >
              {isAgentWorking ? <Square size={12} fill="currentColor" /> : <ArrowUp size={14} strokeWidth={3} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
