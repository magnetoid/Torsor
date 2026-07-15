import React from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { 
  MessageSquare, 
  Code2, 
  Play, 
  Terminal, 
  Database, 
  Shield, 
  Puzzle, 
  Sparkles, 
  Plus, 
  Moon, 
  Sun, 
  Settings,
  Lock,
  HardDrive,
  UserCheck,
  Rocket,
  CheckCircle,
  GitBranch,
  Workflow,
  Frame,
  MonitorPlay,
  LucideIcon
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { tooltipMotion, popoverMotion } from '../../lib/motion';
import { useLayoutStore, TabType } from '../../stores/layoutStore';

import { useThemeStore } from '../../lib/theme';

interface RailIconProps {
  icon: LucideIcon;
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
          className={cn(
            "w-7 h-7 rounded-md flex items-center justify-center transition-all duration-200 group",
            active 
              ? "bg-accent/15 text-accent" 
              : "text-secondary hover:text-primary hover:bg-elevated",
            className
          )}
        >
          <Icon size={16} className={cn("transition-transform", active ? "scale-110" : "group-hover:scale-110")} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className={cn("bg-elevated text-primary text-[10px] px-2 py-1 rounded border border-default shadow-xl z-[100]", tooltipMotion)}
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
  const { 
    leftPanelOpen, 
    toggleLeftPanel, 
    openTab, 
    centerTabs, 
    activeTabId 
  } = useLayoutStore();
  const { theme, toggleTheme } = useThemeStore();

  const activeTab = centerTabs.find(t => t.id === activeTabId);

  const tools: { type: TabType; icon: LucideIcon; label: string }[] = [
    { type: 'code', icon: Code2, label: 'Code Editor' },
    { type: 'preview', icon: Play, label: 'Preview' },
    { type: 'terminal', icon: Terminal, label: 'Terminal' },
    { type: 'database', icon: Database, label: 'Database' },
    { type: 'security', icon: Shield, label: 'Security Scan' },
    { type: 'integrations', icon: Puzzle, label: 'Integrations' },
    { type: 'skills', icon: Sparkles, label: 'Agent Skills' },
    { type: 'secrets', icon: Lock, label: 'Secrets' },
    { type: 'storage', icon: HardDrive, label: 'App Storage' },
    { type: 'auth', icon: UserCheck, label: 'Authentication' },
    { type: 'publishing', icon: Rocket, label: 'Publishing' },
    { type: 'validation', icon: CheckCircle, label: 'Validation' },
    { type: 'git', icon: GitBranch, label: 'Git' },
    { type: 'workflow', icon: Workflow, label: 'Workflows' },
    { type: 'canvas', icon: Frame, label: 'Canvas' },
    { type: 'testing', icon: MonitorPlay, label: 'App Testing' },
  ];

  return (
    <aside className={cn("w-9 bg-surface border-r border-default flex flex-col items-center py-2 gap-1 shrink-0 z-40", className)}>
      <RailIcon 
        icon={MessageSquare} 
        label="Torsor Agent" 
        active={leftPanelOpen} 
        onClick={toggleLeftPanel} 
      />
      
      <div className="w-5 h-[1px] bg-default my-1" />

      {tools.map((tool) => (
        <RailIcon 
          key={tool.type}
          icon={tool.icon} 
          label={tool.label} 
          active={activeTab?.type === tool.type} 
          onClick={() => openTab(tool.type)} 
        />
      ))}

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="w-7 h-7 rounded-md flex items-center justify-center text-secondary hover:text-primary hover:bg-elevated transition-all">
            <Plus size={16} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className={cn("bg-elevated border border-default rounded-md p-1 shadow-xl z-50 min-w-[120px]", popoverMotion)}>
            <DropdownMenu.Item className="flex items-center gap-2 px-2 py-1.5 text-[10px] font-bold text-primary hover:bg-accent rounded cursor-pointer outline-none">
              <Plus size={12} /> Add Tool
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <div className="mt-auto flex flex-col items-center gap-1">
        <RailIcon 
          icon={theme === 'dark' ? Sun : Moon} 
          label={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`} 
          onClick={toggleTheme}
        />
        <RailIcon 
          icon={Settings} 
          label="Settings" 
          active={activeTab?.type === 'settings'} 
          onClick={() => openTab('settings')} 
        />
      </div>
    </aside>
  );
}
