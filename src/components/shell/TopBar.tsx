import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import * as Separator from '@radix-ui/react-separator';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Play,
  Search,
  MessageSquare,
  Share2,
  MoreHorizontal,
  ChevronRight,
  ChevronDown,
  Plus,
  Settings,
  Shield,
  Zap,
  Lock,
  User as UserIcon,
  LogOut
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { popoverMotion } from '../../lib/motion';
import { useLayoutStore } from '../../stores/layoutStore';
import { useAuthStore } from '../../stores/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { WorkspaceSwitcher } from '../shared/WorkspaceSwitcher';
import { usePlanGate } from '../../hooks/usePlanGate';
import { UpgradeDialog } from '../shared/UpgradeDialog';

export function TopBar() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const { toggleLeftPanel } = useLayoutStore();

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/login');
    }
  };
  const { getActiveWorkspace } = useWorkspaceStore();
  const activeWorkspace = getActiveWorkspace();
  
  const { checkFeature } = usePlanGate();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  
  const [projectName, setProjectName] = useState('Torsor-Project-Alpha');
  const [isEditing, setIsEditing] = useState(false);
  const [economyMode, setEconomyMode] = useState<'turbo' | 'balanced' | 'max'>('balanced');

  const handleProjectNameBlur = () => {
    setIsEditing(false);
  };

  const handleModeChange = (mode: 'turbo' | 'balanced' | 'max') => {
    if (mode === 'max') {
      const gate = checkFeature('max_power_mode');
      if (!gate.allowed) {
        setUpgradeOpen(true);
        return;
      }
    }
    setEconomyMode(mode);
  };

  return (
    <header className="h-10 bg-surface border-b border-default flex items-center px-2 gap-2 shrink-0 z-50">
      {/* LEFT SECTION */}
      <div className="flex items-center gap-2">
        <button 
          onClick={() => navigate('/')}
          className="w-5 h-5 bg-accent rounded flex items-center justify-center text-white hover:bg-accent-hover transition-colors shadow-sm"
        >
          <div className="w-2.5 h-2.5 bg-white rounded-sm" />
        </button>
        
        {/* Workspace Switcher */}
        <WorkspaceSwitcher collapsed={true} />

        <Separator.Root className="w-[1px] h-4 bg-default mx-1" />

        <div className="flex items-center gap-1">
          {isEditing ? (
            <input
              autoFocus
              className="bg-elevated border border-accent/50 rounded px-1 text-sm font-medium text-primary outline-none"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onBlur={handleProjectNameBlur}
              onKeyDown={(e) => e.key === 'Enter' && handleProjectNameBlur()}
            />
          ) : (
            <span 
              className="text-sm font-medium text-primary cursor-text px-1 hover:bg-elevated rounded transition-colors"
              onDoubleClick={() => setIsEditing(true)}
            >
              {projectName}
            </span>
          )}
        </div>

        <Tooltip.Provider delayDuration={200}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button className="w-6 h-6 rounded-md bg-success/10 text-success flex items-center justify-center hover:bg-success/20 transition-all">
                <Play size={12} fill="currentColor" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="bg-elevated text-primary text-[10px] px-2 py-1 rounded border border-default shadow-xl" sideOffset={5}>
                Run Project
                <Tooltip.Arrow className="fill-default" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>

        <button 
          onClick={toggleLeftPanel}
          className="flex items-center gap-1.5 px-2 py-0.5 bg-elevated hover:bg-surface rounded-full border border-default transition-all group"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-accent" />
          <span className="text-[10px] font-bold text-primary">Agent · 4</span>
        </button>
      </div>

      {/* CENTER SECTION */}
      <div className="flex-1 flex justify-center">
        <div className="flex items-center gap-1 text-[10px] text-secondary font-medium">
          <span>Preview</span>
          <ChevronRight size={10} />
          <span className="text-primary">localhost:3000</span>
        </div>
      </div>

      {/* RIGHT SECTION */}
      <div className="flex items-center gap-2">
        <div className="flex bg-page rounded-full p-0.5 border border-default">
          {[
            { id: 'turbo', label: '⚡ Turbo' },
            { id: 'balanced', label: '⚖ Balance' },
            { id: 'max', label: '⚡⚡ Max', gated: true }
          ].map((mode) => {
            const isGated = mode.gated && !checkFeature('max_power_mode').allowed;
            return (
              <button
                key={mode.id}
                onClick={() => handleModeChange(mode.id as any)}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-bold rounded-full transition-all flex items-center gap-1",
                  economyMode === mode.id 
                    ? "bg-accent text-white shadow-sm" 
                    : "text-secondary hover:text-primary",
                  isGated && "opacity-70"
                )}
              >
                {mode.label}
                {isGated && <Lock size={8} className="text-tertiary" />}
              </button>
            );
          })}
        </div>

        <Separator.Root className="w-[1px] h-4 bg-default" />

        <button className="text-xs font-medium text-secondary hover:text-primary transition-colors">
          Invite
        </button>

        <button className="bg-accent-gradient hover:opacity-90 text-white px-3 py-1 rounded-md text-xs font-bold transition-all shadow-lg shadow-accent/20">
          Publish
        </button>

        <button className="p-1.5 text-secondary hover:text-primary transition-colors">
          <Search size={16} />
        </button>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="w-6 h-6 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center overflow-hidden cursor-pointer outline-none transition-all hover:border-accent focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface data-[state=open]:ring-2 data-[state=open]:ring-accent/60"
              aria-label="User menu"
            >
              <img
                src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}`}
                alt=""
                className="w-full h-full object-cover"
              />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className={cn(
                "bg-elevated border border-default rounded-lg p-1 shadow-2xl z-[100] min-w-[220px]",
                popoverMotion
              )}
            >
              {/* Identity header */}
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center overflow-hidden shrink-0">
                  <img
                    src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-primary truncate">{user?.name || 'User'}</p>
                    {isAdmin && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-accent bg-accent-muted px-1.5 py-0.5 rounded">
                        {user?.role === 'super_admin' ? 'Super' : 'Admin'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-secondary truncate">{user?.email}</p>
                </div>
              </div>

              <DropdownMenu.Separator className="h-[1px] bg-default my-1" />

              <DropdownMenu.Item
                onSelect={() => navigate('/settings')}
                className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm text-secondary hover:text-primary rounded-md cursor-pointer outline-none transition-colors data-[highlighted]:bg-elevated data-[highlighted]:text-primary"
              >
                <UserIcon size={15} className="shrink-0" />
                Account
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => navigate('/settings')}
                className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm text-secondary hover:text-primary rounded-md cursor-pointer outline-none transition-colors data-[highlighted]:bg-elevated data-[highlighted]:text-primary"
              >
                <Settings size={15} className="shrink-0" />
                Settings
              </DropdownMenu.Item>

              {isAdmin && (
                <>
                  <DropdownMenu.Separator className="h-[1px] bg-default my-1" />
                  <DropdownMenu.Item
                    onSelect={() => navigate('/admin')}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm text-accent rounded-md cursor-pointer outline-none transition-colors data-[highlighted]:bg-accent-muted"
                  >
                    <Shield size={15} className="shrink-0" />
                    Admin Panel
                  </DropdownMenu.Item>
                </>
              )}

              <DropdownMenu.Separator className="h-[1px] bg-default my-1" />
              <DropdownMenu.Item
                onSelect={handleLogout}
                className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm text-secondary hover:text-error rounded-md cursor-pointer outline-none transition-colors data-[highlighted]:bg-error/10 data-[highlighted]:text-error"
              >
                <LogOut size={15} className="shrink-0" />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </header>
  );
}
