import React, { useState, useEffect, useRef } from 'react';
import * as Separator from '@radix-ui/react-separator';
import * as Tooltip from '@radix-ui/react-tooltip';
import { 
  Monitor, 
  Smartphone, 
  Tablet, 
  RotateCw, 
  ArrowLeft, 
  ArrowRight, 
  ExternalLink, 
  Copy, 
  Pencil, 
  Play,
  ChevronUp,
  ChevronDown,
  Trash2,
  Terminal
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { useAppStore } from '../../useAppStore';
import { useLayoutStore } from '../../stores/layoutStore';
import { EmptyState } from '../shared/EmptyState';
import { BootSteps } from '../shared/BootSteps';

export default function PreviewTab() {
  const { buildStatus, previewUrl, triggerBuild, bootSteps, previewNonce, refreshPreview } = useAppStore();
  const { openTab } = useLayoutStore();
  
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<{ type: 'log' | 'error' | 'warn'; text: string; timestamp: number }[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Mock console logs
  useEffect(() => {
    if (buildStatus === 'success') {
      const logs = [
        { type: 'log', text: '[vite] connecting...', timestamp: Date.now() },
        { type: 'log', text: '[vite] connected.', timestamp: Date.now() + 100 },
        { type: 'log', text: 'App initialized.', timestamp: Date.now() + 500 },
      ];
      setConsoleLogs(logs as any);
    }
  }, [buildStatus]);

  const handleRefresh = () => {
    // Bump the nonce → the iframe (keyed on it) remounts and reloads the running app.
    refreshPreview();
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(previewUrl);
    toast.success('Preview URL copied');
  };

  const renderContent = () => {
    // A live workspace preview (a running container's published port, proxied by the
    // control-plane) is shown as soon as its URL is available, regardless of build state.
    if (buildStatus === 'idle' && !previewUrl) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <EmptyState
            icon={Monitor}
            title="Your app is not running"
            description="Run your application to see the live preview."
            actionLabel="Run"
            onAction={triggerBuild}
          />
        </div>
      );
    }

    if (buildStatus === 'building') {
      return (
        <BootSteps
          steps={bootSteps}
          onRetry={triggerBuild}
          onOpenTerminal={() => openTab('terminal')}
        />
      );
    }

    return (
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <div 
          className={cn(
            "bg-white rounded-lg shadow-2xl overflow-hidden transition-all duration-300 ease-in-out",
            viewport === 'desktop' ? "w-full h-full" : 
            viewport === 'tablet' ? "w-[768px] h-[1024px] max-h-full" : 
            "w-[375px] h-[667px] max-h-full"
          )}
        >
          <iframe
            key={previewNonce}
            ref={iframeRef}
            src={previewUrl}
            className="w-full h-full border-none"
            title="App Preview"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-page overflow-hidden">
      {/* TOOLBAR */}
      <header className="h-9 bg-surface border-b border-default flex items-center px-2 gap-1 shrink-0 z-10">
        <div className="bg-elevated rounded-md px-2 py-0.5 text-[10px] font-bold text-tertiary uppercase tracking-wider cursor-not-allowed opacity-50">
          Canvas
        </div>
        
        <Separator.Root orientation="vertical" className="w-[1px] h-4 bg-default mx-1" />
        
        <div className="flex items-center gap-0.5">
          <button disabled className="p-1 text-tertiary/50 cursor-not-allowed">
            <ArrowLeft size={14} />
          </button>
          <button disabled className="p-1 text-tertiary/50 cursor-not-allowed">
            <ArrowRight size={14} />
          </button>
          <button 
            onClick={handleRefresh}
            className="p-1 text-secondary hover:text-primary transition-colors"
          >
            <RotateCw size={14} />
          </button>
        </div>

        <div className="flex-1 flex items-center bg-inset rounded-lg px-3 py-1 gap-2 border border-default/50">
          <input
            type="text"
            readOnly
            value={previewUrl ? previewUrl.split('?')[0] : ''}
            placeholder="Run your app to see the live preview"
            className="bg-transparent text-[10px] text-secondary font-mono outline-none w-full"
          />
        </div>

        <Separator.Root orientation="vertical" className="w-[1px] h-4 bg-default mx-1" />

        <div className="flex items-center gap-1">
          <Tooltip.Provider delayDuration={200}>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button 
                  onClick={() => openTab('code')}
                  className="p-1.5 text-secondary hover:text-primary transition-colors"
                >
                  <Pencil size={14} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="bg-elevated text-primary text-[10px] px-2 py-1 rounded border border-default shadow-xl" sideOffset={5}>
                  Edit Page
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button 
                  onClick={handleCopyUrl}
                  className="p-1.5 text-secondary hover:text-primary transition-colors"
                >
                  <Copy size={14} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="bg-elevated text-primary text-[10px] px-2 py-1 rounded border border-default shadow-xl" sideOffset={5}>
                  Copy URL
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <a 
                  href={previewUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-1.5 text-secondary hover:text-primary transition-colors"
                >
                  <ExternalLink size={14} />
                </a>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="bg-elevated text-primary text-[10px] px-2 py-1 rounded border border-default shadow-xl" sideOffset={5}>
                  Open in New Tab
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>

        <Separator.Root orientation="vertical" className="w-[1px] h-4 bg-default mx-1" />

        <div className="flex items-center bg-inset rounded-md p-0.5 border border-default">
          <button 
            onClick={() => setViewport('desktop')}
            className={cn("p-1 rounded transition-all", viewport === 'desktop' ? "bg-accent text-white" : "text-secondary hover:text-primary")}
          >
            <Monitor size={12} />
          </button>
          <button 
            onClick={() => setViewport('tablet')}
            className={cn("p-1 rounded transition-all", viewport === 'tablet' ? "bg-accent text-white" : "text-secondary hover:text-primary")}
          >
            <Tablet size={12} />
          </button>
          <button 
            onClick={() => setViewport('mobile')}
            className={cn("p-1 rounded transition-all", viewport === 'mobile' ? "bg-accent text-white" : "text-secondary hover:text-primary")}
          >
            <Smartphone size={12} />
          </button>
        </div>
      </header>

      {/* CONTENT AREA */}
      <div className="flex-1 flex flex-col relative overflow-hidden">
        {renderContent()}
      </div>

      {/* CONSOLE DRAWER */}
      <div className={cn(
        "bg-page border-t border-default transition-all duration-300 ease-in-out flex flex-col shrink-0",
        isConsoleOpen ? "h-[120px]" : "h-6"
      )}>
        <button 
          onClick={() => setIsConsoleOpen(!isConsoleOpen)}
          className="h-6 px-3 flex items-center justify-between hover:bg-surface transition-colors group"
        >
          <div className="flex items-center gap-2">
            <Terminal size={10} className={cn("transition-colors", isConsoleOpen ? "text-accent" : "text-tertiary")} />
            <span className={cn("text-[10px] font-bold uppercase tracking-wider", isConsoleOpen ? "text-primary" : "text-tertiary")}>Console</span>
            {consoleLogs.length > 0 && !isConsoleOpen && (
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            )}
          </div>
          <div className="flex items-center gap-2">
            {isConsoleOpen && (
              <button 
                onClick={(e) => { e.stopPropagation(); setConsoleLogs([]); }}
                className="p-1 text-tertiary hover:text-error transition-colors"
              >
                <Trash2 size={10} />
              </button>
            )}
            {isConsoleOpen ? <ChevronDown size={12} className="text-tertiary" /> : <ChevronUp size={12} className="text-tertiary" />}
          </div>
        </button>
        
        {isConsoleOpen && (
          <div className="flex-1 overflow-y-auto p-2 font-mono text-[10px] space-y-1 bg-inset">
            {consoleLogs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-tertiary italic">
                No logs to display
              </div>
            ) : (
              consoleLogs.map((log, idx) => (
                <div key={idx} className="flex gap-2 border-b border-default/30 pb-1">
                  <span className="text-tertiary shrink-0">{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span className={cn(
                    log.type === 'error' ? "text-error" : log.type === 'warn' ? "text-warning" : "text-primary"
                  )}>
                    {log.text}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
