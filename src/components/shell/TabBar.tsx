import React, { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Reorder, AnimatePresence } from 'framer-motion';
import { X, Plus, Split, Circle, FlaskConical } from 'lucide-react';
import { cn } from '../../lib/utils';
import { popoverMotion } from '../../lib/motion';
import { useLayoutStore, TabType } from '../../stores/layoutStore';
import { contributions } from '../../kernel/contributions';

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
            // Registry lookup with a fallback icon: a stale persisted tab type (e.g. from
            // an uninstalled plugin) must degrade gracefully, not crash the strip.
            const Icon = contributions.getTab(tab.type)?.icon ?? Circle;
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
          {/* The "+" menu renders the same grouped registry as the rail and ⌘K —
              membership can't drift (the old hardcoded list here was missing four tabs). */}
          <DropdownMenu.Content className={cn("bg-elevated border border-default rounded-md p-1 shadow-xl z-50 min-w-[190px] max-h-[70vh] overflow-y-auto", popoverMotion)}>
            {contributions.tabsByGroup().map(({ group, tabs }, gi) => (
              <React.Fragment key={group.id}>
                {gi > 0 && <DropdownMenu.Separator className="h-[1px] bg-border-subtle my-1" />}
                <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-xs font-medium uppercase tracking-wider text-tertiary">
                  {group.label}
                </DropdownMenu.Label>
                {tabs.map((tab) => {
                  const Icon = tab.icon ?? Circle;
                  return (
                    <DropdownMenu.Item
                      key={tab.type}
                      onClick={() => openTab(tab.type as TabType)}
                      className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent rounded cursor-pointer outline-none group"
                    >
                      <Icon size={14} />
                      <span className="flex-1">{tab.label}</span>
                      {tab.maturity === 'preview' && (
                        <FlaskConical size={11} className="text-tertiary group-hover:text-white/70" aria-label="Preview mockup" />
                      )}
                    </DropdownMenu.Item>
                  );
                })}
              </React.Fragment>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
