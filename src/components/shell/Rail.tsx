import React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MessageSquare, MoreHorizontal, Moon, Sun, Settings, FlaskConical } from 'lucide-react';
import { cn } from '../../lib/utils';
import { tooltipMotion, popoverMotion } from '../../lib/motion';
import { useLayoutStore, TabType } from '../../stores/layoutStore';
import { useThemeStore } from '../../lib/theme';
import { useRunsStore } from '../../stores/runsStore';
import { contributions, type IconComponent } from '../../kernel/contributions';

interface RailIconProps {
  icon: IconComponent;
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

const RailIcon = ({ icon: Icon, label, active, onClick, className }: RailIconProps) => (
  <Tooltip.Provider delayDuration={200}>
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          onClick={onClick}
          aria-label={label}
          className={cn(
            'w-7 h-7 rounded-md flex items-center justify-center transition-colors duration-fast ease-standard group',
            active ? 'bg-accent-muted text-accent' : 'text-secondary hover:text-primary hover:bg-elevated',
            className
          )}
        >
          <Icon size={16} className={cn('transition-transform', active ? 'scale-110' : 'group-hover:scale-110')} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className={cn('bg-elevated text-primary text-[10px] px-2 py-1 rounded border border-default shadow-xl z-[100]', tooltipMotion)}
          side="right"
          sideOffset={8}
        >
          {label}
          <Tooltip.Arrow className="fill-default" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  </Tooltip.Provider>
);

export function Rail({ className }: { className?: string }) {
  const { leftPanelOpen, toggleLeftPanel, openTab, centerTabs, activeTabId } = useLayoutStore();
  const { theme, toggleTheme } = useThemeStore();

  // Presence of background work: a subtle pulse on the Runs launcher while any run is
  // processing. One cheap list fetch on mount keeps it honest across reloads.
  const runningCount = useRunsStore((s) => s.runs.filter((r) => r.status === 'processing').length);
  const loadRuns = useRunsStore((s) => s.loadRuns);
  React.useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const activeTab = centerTabs.find((t) => t.id === activeTabId);

  // Rail launchers come straight from the tab registry (ADR 0008): pinned tabs show
  // inline; everything else lives behind "More…", sectioned by the same groups the
  // "+" menu and ⌘K use. Plugin rail items (non-tab launchers) append after the groups.
  const pinned = contributions.tabs().filter((t) => t.pinned && t.type !== 'settings');
  const groups = contributions
    .tabsByGroup()
    .map(({ group, tabs }) => ({ group, tabs: tabs.filter((t) => !t.pinned && t.type !== 'settings') }))
    .filter(({ tabs }) => tabs.length > 0);
  const pluginItems = contributions.railItems();

  return (
    <aside className={cn('w-9 bg-surface border-r border-default flex flex-col items-center py-2 gap-1 shrink-0 z-40', className)}>
      <RailIcon icon={MessageSquare} label="Torsor Agent" active={leftPanelOpen} onClick={toggleLeftPanel} />

      <div className="w-5 h-[1px] bg-default my-1" />

      {pinned.map((tab) =>
        tab.icon ? (
          <div key={tab.type} className="relative">
            <RailIcon
              icon={tab.icon}
              label={tab.type === 'runs' && runningCount > 0 ? `${tab.label} — ${runningCount} running` : tab.label}
              active={activeTab?.type === tab.type}
              onClick={() => openTab(tab.type as TabType)}
            />
            {tab.type === 'runs' && runningCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-accent animate-pulse-accent pointer-events-none" />
            )}
          </div>
        ) : null
      )}

      {groups.length > 0 && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              aria-label="More tools"
              className="w-7 h-7 rounded-md flex items-center justify-center text-secondary hover:text-primary hover:bg-elevated transition-colors duration-fast ease-standard"
            >
              <MoreHorizontal size={16} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="right"
              sideOffset={8}
              className={cn('bg-elevated border border-default rounded-lg p-1 shadow-xl z-[100] min-w-[190px] max-h-[70vh] overflow-y-auto', popoverMotion)}
            >
              {groups.map(({ group, tabs }, gi) => (
                <React.Fragment key={group.id}>
                  {gi > 0 && <DropdownMenu.Separator className="h-[1px] bg-border-subtle my-1" />}
                  <DropdownMenu.Label className="px-2 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-tertiary">
                    {group.label}
                  </DropdownMenu.Label>
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <DropdownMenu.Item
                        key={tab.type}
                        onSelect={() => openTab(tab.type as TabType)}
                        className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent hover:text-white rounded-md cursor-pointer outline-none group"
                      >
                        {Icon && <Icon size={14} />}
                        <span className="flex-1">{tab.label}</span>
                        {tab.maturity === 'preview' && (
                          <FlaskConical size={11} className="text-tertiary group-hover:text-white/70" aria-label="Preview mockup" />
                        )}
                      </DropdownMenu.Item>
                    );
                  })}
                </React.Fragment>
              ))}
              {pluginItems.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenu.Item
                    key={item.id}
                    onSelect={() => item.opensTab && openTab(item.opensTab as TabType)}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent hover:text-white rounded-md cursor-pointer outline-none"
                  >
                    {Icon && <Icon size={14} />}
                    {item.label}
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}

      <div className="mt-auto flex flex-col items-center gap-1">
        <RailIcon
          icon={theme === 'dark' ? Sun : Moon}
          label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          onClick={toggleTheme}
        />
        <RailIcon icon={Settings} label="Settings" active={activeTab?.type === 'settings'} onClick={() => openTab('settings')} />
      </div>
    </aside>
  );
}
