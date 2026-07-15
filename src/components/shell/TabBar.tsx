import React, { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Reorder, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Plus, 
  Play, 
  Code2, 
  Terminal, 
  Database, 
  Shield, 
  Puzzle, 
  Sparkles, 
  Settings,
  Split,
  Layout,
  Lock as LockIcon,
  HardDrive,
  UserCheck,
  Rocket,
  CheckCircle,
  GitBranch,
  Workflow,
  Frame,
  MonitorPlay
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { popoverMotion } from '../../lib/motion';
import { useLayoutStore, Tab, TabType, TAB_CONFIG } from '../../stores/layoutStore';

export function TabBar() {
  const { 
    centerTabs, 
    activeTabId, 
    setActiveTab, 
    closeTab, 
    openTab, 
    reorderTabs,
    setSecondaryTab,
    setSplit,
    secondaryTabId
  } = useLayoutStore();

  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

  const handleClose = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    closeTab(id);
  };

  const handleSplit = (tabId: string, direction: 'vertical' | 'horizontal') => {
    setSecondaryTab(tabId);
    setSplit(direction);
  };

  // Embedded in the unified TopBar (the app has a single top bar): fills the bar's
  // center, inherits its height/background, and scrolls horizontally when crowded.
  return (
    <div className="h-full flex-1 min-w-0 flex items-center overflow-x-auto no-scrollbar">
      <Reorder.Group 
        axis="x" 
        values={centerTabs} 
        onReorder={reorderTabs}
        className="flex items-center h-full"
      >
        <AnimatePresence initial={false}>
          {centerTabs.map((tab) => {
            const Icon = TAB_CONFIG[tab.type].icon;
            return (
              <Reorder.Item
                key={tab.id}
                value={tab}
                id={tab.id}
                onDragStart={() => setDraggedTabId(tab.id)}
                onDragEnd={() => setDraggedTabId(null)}
                className="h-full"
              >
                <ContextMenu.Root>
                  <ContextMenu.Trigger asChild>
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "h-full px-3 flex items-center gap-2 text-xs font-medium transition-all border-r border-default relative group shrink-0 outline-none",
                        activeTabId === tab.id 
                          ? "bg-page text-primary" 
                          : "text-secondary hover:text-primary hover:bg-elevated",
                        draggedTabId === tab.id && "opacity-50 scale-95 z-50 bg-accent/10"
                      )}
                    >
                      {activeTabId === tab.id && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
                      )}
                      <Icon size={14} className={cn(activeTabId === tab.id ? "text-accent" : "text-secondary")} />
                      <span>{tab.label}</span>
                      {tab.closable && (
                        <div 
                          onClick={(e) => handleClose(e, tab.id)}
                          className="p-0.5 rounded-sm hover:bg-inset opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                        >
                          <X size={12} />
                        </div>
                      )}
                    </button>
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content className={cn("bg-elevated border border-default rounded-md p-1 shadow-xl z-50 min-w-[160px]", popoverMotion)}>
                      <ContextMenu.Item 
                        onClick={() => handleSplit(tab.id, 'vertical')}
                        className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent rounded cursor-pointer outline-none"
                      >
                        <Split size={14} className="rotate-90" />
                        Split Down
                      </ContextMenu.Item>
                      <ContextMenu.Item 
                        onClick={() => handleSplit(tab.id, 'horizontal')}
                        className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent rounded cursor-pointer outline-none"
                      >
                        <Split size={14} />
                        Split Right
                      </ContextMenu.Item>
                      <ContextMenu.Separator className="h-[1px] bg-subtle my-1" />
                      <ContextMenu.Item 
                        onClick={() => closeTab(tab.id)}
                        disabled={!tab.closable}
                        className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-error rounded cursor-pointer outline-none disabled:opacity-30"
                      >
                        <X size={14} />
                        Close Tab
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
              </Reorder.Item>
            );
          })}
        </AnimatePresence>
      </Reorder.Group>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="h-full px-3 text-secondary hover:text-primary hover:bg-elevated transition-all border-r border-default">
            <Plus size={16} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={cn("bg-elevated border border-default rounded-md p-1 shadow-xl z-50 min-w-[160px]", popoverMotion)}>
            {[
              { type: 'preview', label: 'Preview', icon: Play },
              { type: 'code', label: 'Code Editor', icon: Code2 },
              { type: 'terminal', label: 'Terminal', icon: Terminal },
              { type: 'database', label: 'Database', icon: Database },
              { type: 'security', label: 'Security Scan', icon: Shield },
              { type: 'integrations', label: 'Integrations', icon: Puzzle },
              { type: 'skills', label: 'Agent Skills', icon: Sparkles },
              { type: 'settings', label: 'Settings', icon: Settings },
              { type: 'secrets', label: 'Secrets', icon: LockIcon },
              { type: 'storage', label: 'App Storage', icon: HardDrive },
              { type: 'auth', label: 'Authentication', icon: UserCheck },
              { type: 'publishing', label: 'Publishing', icon: Rocket },
              { type: 'validation', label: 'Validation', icon: CheckCircle },
              { type: 'git', label: 'Git', icon: GitBranch },
              { type: 'workflow', label: 'Workflows', icon: Workflow },
              { type: 'canvas', label: 'Canvas', icon: Frame },
              { type: 'testing', label: 'App Testing', icon: MonitorPlay },
            ].map((item) => (
              <DropdownMenu.Item 
                key={item.type}
                onClick={() => openTab(item.type as TabType)}
                className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent rounded cursor-pointer outline-none"
              >
                {(() => {
                  const Icon = item.icon;
                  return <Icon size={14} />;
                })()}
                {item.label}
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
