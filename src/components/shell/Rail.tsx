import React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MessageSquare, MoreHorizontal, Moon, Sun, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import { tooltipMotion, popoverMotion } from '../../lib/motion';
import { useLayoutStore, TabType } from '../../stores/layoutStore';
import { useThemeStore } from '../../lib/theme';
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

  const activeTab = centerTabs.find((t) => t.id === activeTabId);

  // Rail launchers come from the contribution registry (ADR 0008). Pinned items show
  // inline; the rest live behind "More…" so the rail stays calm instead of a wall of icons.
  const railItems = contributions.railItems();
  const pinned = railItems.filter((r) => r.pinned);
  const more = railItems.filter((r) => !r.pinned);

  return (
    <aside className={cn('w-9 bg-surface border-r border-default flex flex-col items-center py-2 gap-1 shrink-0 z-40', className)}>
      <RailIcon icon={MessageSquare} label="Torsor Agent" active={leftPanelOpen} onClick={toggleLeftPanel} />

      <div className="w-5 h-[1px] bg-default my-1" />

      {pinned.map((item) =>
        item.icon ? (
          <RailIcon
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeTab?.type === item.opensTab}
            onClick={() => item.opensTab && openTab(item.opensTab as TabType)}
          />
        ) : null
      )}

      {more.length > 0 && (
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
              className={cn('bg-elevated border border-default rounded-lg p-1 shadow-xl z-[100] min-w-[180px]', popoverMotion)}
            >
              {more.map((item) => {
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
