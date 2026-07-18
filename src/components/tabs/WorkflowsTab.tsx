import React, { useState } from 'react';
import { 
  Workflow, 
  Play, 
  Plus, 
  Trash2, 
  ChevronDown, 
  ExternalLink, 
  Terminal, 
  Settings, 
  Cpu, 
  Box, 
  Zap, 
  Save, 
  ShieldAlert, 
  Globe, 
  Link as LinkIcon, 
  Check, 
  X, 
  RefreshCw, 
  Loader2,
  MoreVertical,
  Code
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useWorkflowStore, RunConfig, PortMapping } from '../../stores/workflowStore';
import { useLayoutStore } from '../../stores/layoutStore';
import * as Select from '@radix-ui/react-select';
import * as ScrollArea from '@radix-ui/react-scroll-area';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Separator from '@radix-ui/react-separator';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

const RunConfigCard = ({ config }: { config: RunConfig }) => {
  const { updateConfig, removeConfig, toggleRun } = useWorkflowStore();
  const [isEditing, setIsEditing] = useState(false);

  return (
    <div className="bg-surface border border-default rounded-xl p-4 mb-3 group transition-all hover:border-subtle">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-2 h-2 rounded-full",
            config.isRunning ? "bg-success shadow-[0_0_8px_rgba(52,199,89,0.5)]" : "bg-tertiary"
          )} />
          {isEditing ? (
            <input 
              autoFocus
              value={config.name}
              onChange={(e) => updateConfig(config.id, { name: e.target.value })}
              onBlur={() => setIsEditing(false)}
              className="bg-page border border-accent/50 rounded px-2 py-0.5 text-xs font-bold text-primary outline-none"
            />
          ) : (
            <h4 
              onClick={() => setIsEditing(true)}
              className="text-xs font-bold text-primary cursor-pointer hover:text-accent transition-colors"
            >
              {config.name}
            </h4>
          )}
          {config.isRunning && (
            <span className="px-2 py-0.5 bg-success/10 text-success text-xs font-bold uppercase rounded border border-success/20">
              Running
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => toggleRun(config.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all",
              config.isRunning 
                ? "bg-error/10 text-error hover:bg-error/20 border border-error/20" 
                : "bg-success hover:bg-success/90 text-white shadow-lg shadow-success/20"
            )}
          >
            {config.isRunning ? <X size={14} /> : <Play size={14} />}
            {config.isRunning ? 'Stop' : 'Run'}
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="p-1.5 text-secondary hover:text-primary hover:bg-elevated rounded-lg transition-all outline-none">
                <MoreVertical size={14} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-50 min-w-[140px]">
                <DropdownMenu.Item 
                  onSelect={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-surface rounded-lg outline-none cursor-pointer"
                >
                  <Settings size={12} /> Rename
                </DropdownMenu.Item>
                <DropdownMenu.Item 
                  onSelect={() => removeConfig(config.id)}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-error hover:bg-error/10 rounded-lg outline-none cursor-pointer"
                >
                  <Trash2 size={12} /> Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-bold text-secondary uppercase tracking-wider">Command</label>
          <div className="relative group/input">
            <Terminal size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary group-focus-within/input:text-accent transition-colors" />
            <input 
              value={config.command}
              onChange={(e) => updateConfig(config.id, { command: e.target.value })}
              className="w-full bg-page border border-default rounded-xl pl-8 pr-3 py-2 text-[11px] text-primary font-mono outline-none focus:border-accent/50 transition-all"
              placeholder="npm run dev"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-secondary uppercase tracking-wider">Description</label>
            <input 
              value={config.description}
              onChange={(e) => updateConfig(config.id, { description: e.target.value })}
              className="w-full bg-page border border-default rounded-xl px-3 py-2 text-[11px] text-primary outline-none focus:border-accent/50 transition-all"
              placeholder="Start Vite dev server"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-secondary uppercase tracking-wider">Port</label>
            <input 
              type="number"
              value={config.port || ''}
              onChange={(e) => updateConfig(config.id, { port: parseInt(e.target.value) || undefined })}
              className="w-full bg-page border border-default rounded-xl px-3 py-2 text-[11px] text-primary outline-none focus:border-accent/50 transition-all"
              placeholder="3000"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default function WorkflowsTab() {
  const { 
    configs, 
    addConfig, 
    nodeVersion, 
    setNodeVersion, 
    packageManager, 
    setPackageManager, 
    startupHooks, 
    updateHook, 
    ports, 
    addPort, 
    removePort 
  } = useWorkflowStore();
  const openTab = useLayoutStore((s) => s.openTab);

  const [newPort, setNewPort] = useState('');

  const handleAddPort = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPort) {
      addPort(parseInt(newPort));
      setNewPort('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-page">
      {/* Header */}
      <header className="h-12 px-4 flex items-center justify-between border-b border-default bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <Workflow size={16} className="text-accent" />
          <span className="text-xs font-bold text-primary">Workflows</span>
        </div>
        <button 
          onClick={addConfig}
          className="flex items-center gap-2 px-3 py-1.5 bg-elevated hover:bg-surface border border-default text-primary text-[11px] font-bold rounded-lg transition-all"
        >
          <Plus size={14} />
          Add Workflow
        </button>
      </header>

      <div className="flex-1 overflow-hidden flex">
        {/* Left: Run Configs */}
        <div className="flex-1 border-r border-default flex flex-col overflow-hidden">
          <ScrollArea.Root className="flex-1">
            <ScrollArea.Viewport className="h-full">
              <div className="p-6 max-w-3xl mx-auto space-y-8">
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Run Configurations</h3>
                    <span className="text-xs text-secondary font-medium">{configs.length} configured</span>
                  </div>
                  <div className="space-y-1">
                    {configs.map(config => (
                      <RunConfigCard key={config.id} config={config} />
                    ))}
                  </div>
                </section>

                <Separator.Root className="h-[1px] bg-default" />

                <section className="space-y-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap size={14} className="text-warning" />
                    <h3 className="text-xs font-bold text-primary uppercase tracking-wider">Startup Hooks</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider">On Start</label>
                        <span className="text-[9px] text-tertiary">Runs when workspace opens</span>
                      </div>
                      <input 
                        value={startupHooks.onStart}
                        onChange={(e) => updateHook('onStart', e.target.value)}
                        className="w-full bg-surface border border-default rounded-xl px-4 py-2 text-[11px] text-primary font-mono outline-none focus:border-accent/50 transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider">On File Change</label>
                        <span className="text-[9px] text-tertiary">Runs on save</span>
                      </div>
                      <input 
                        value={startupHooks.onFileChange}
                        onChange={(e) => updateHook('onFileChange', e.target.value)}
                        className="w-full bg-surface border border-default rounded-xl px-4 py-2 text-[11px] text-primary font-mono outline-none focus:border-accent/50 transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-secondary uppercase tracking-wider">Pre-deploy</label>
                        <span className="text-[9px] text-tertiary">Runs before publishing</span>
                      </div>
                      <input 
                        value={startupHooks.preDeploy}
                        onChange={(e) => updateHook('preDeploy', e.target.value)}
                        className="w-full bg-surface border border-default rounded-xl px-4 py-2 text-[11px] text-primary font-mono outline-none focus:border-accent/50 transition-all"
                      />
                    </div>
                  </div>
                </section>
              </div>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar orientation="vertical" className="w-1.5 bg-transparent p-0.5">
              <ScrollArea.Thumb className="bg-default rounded-full" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </div>

        {/* Right: Environment & Ports */}
        <div className="w-[320px] bg-surface flex flex-col overflow-hidden">
          <ScrollArea.Root className="flex-1">
            <ScrollArea.Viewport className="h-full">
              <div className="p-6 space-y-8">
                <section className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Cpu size={14} className="text-accent" />
                    <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">Environment</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-secondary uppercase tracking-wider">Node.js Version</label>
                      <Select.Root value={nodeVersion} onValueChange={setNodeVersion}>
                        <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 bg-page border border-default rounded-xl text-xs text-primary outline-none hover:border-subtle transition-all">
                          <Select.Value />
                          <ChevronDown size={14} className="text-secondary" />
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-50">
                            {['18', '20', '22'].map(v => (
                              <Select.Item 
                                key={v} 
                                value={v}
                                className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-accent/20 hover:text-accent rounded-lg outline-none cursor-pointer"
                              >
                                <Select.ItemText>Node.js {v}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-secondary uppercase tracking-wider">Package Manager</label>
                      <Select.Root value={packageManager} onValueChange={setPackageManager}>
                        <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 bg-page border border-default rounded-xl text-xs text-primary outline-none hover:border-subtle transition-all">
                          <Select.Value />
                          <ChevronDown size={14} className="text-secondary" />
                        </Select.Trigger>
                        <Select.Portal>
                          <Select.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-50">
                            {['npm', 'pnpm', 'yarn', 'bun'].map(m => (
                              <Select.Item 
                                key={m} 
                                value={m}
                                className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-accent/20 hover:text-accent rounded-lg outline-none cursor-pointer"
                              >
                                <Select.ItemText>{m}</Select.ItemText>
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Portal>
                      </Select.Root>
                    </div>

                    <div className="pt-2">
                      <button onClick={() => openTab('secrets')} className="w-full flex items-center justify-between px-3 py-2 bg-accent/5 hover:bg-accent/10 border border-accent/20 rounded-xl text-xs font-bold text-accent transition-all group focus-ring">
                        <div className="flex items-center gap-2">
                          <ShieldAlert size={14} />
                          Secrets & Env Vars
                        </div>
                        <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  </div>
                </section>

                <Separator.Root className="h-[1px] bg-default" />

                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe size={14} className="text-success" />
                      <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">Ports</h3>
                    </div>
                    <form onSubmit={handleAddPort} className="flex gap-1">
                      <input 
                        type="number"
                        value={newPort}
                        onChange={(e) => setNewPort(e.target.value)}
                        placeholder="Port"
                        className="w-16 bg-page border border-default rounded-lg px-2 py-1 text-xs text-primary outline-none focus:border-accent/50"
                      />
                      <button type="submit" className="p-1 bg-accent hover:bg-accent-hover text-white rounded-lg">
                        <Plus size={14} />
                      </button>
                    </form>
                  </div>

                  <div className="space-y-2">
                    {ports.map(port => (
                      <div key={port.id} className="bg-page border border-default rounded-xl p-3 space-y-2 group">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-primary">{port.internalPort}</span>
                            <span className={cn(
                              "text-[9px] font-bold uppercase",
                              port.status === 'active' ? "text-success" : "text-secondary"
                            )}>
                              {port.status}
                            </span>
                          </div>
                          <button 
                            onClick={() => removePort(port.id)}
                            className="p-1 text-secondary hover:text-error opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 bg-surface p-1.5 rounded border border-default group/link">
                          <LinkIcon size={10} className="text-tertiary group-hover/link:text-accent" />
                          <span className="text-[9px] text-secondary truncate flex-1">{port.externalUrl}</span>
                          <button className="p-1 text-secondary hover:text-primary">
                            <ExternalLink size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </ScrollArea.Viewport>
          </ScrollArea.Root>
        </div>
      </div>
    </div>
  );
}

const ArrowRight = ({ size, className }: { size?: number; className?: string }) => (
  <svg 
    width={size || 16} 
    height={size || 16} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
);
