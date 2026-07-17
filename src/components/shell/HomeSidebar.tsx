import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Grid,
  Settings,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
  Users,
  CreditCard,
  HelpCircle,
  Star,
  Clock,
  Lock,
  Shield,
  Box
} from 'lucide-react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils';
import { useLayoutStore } from '../../stores/layoutStore';
import { useAuthStore } from '../../stores/authStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useProjectStore } from '../../stores/projectStore';
import { UpgradeDialog } from '../shared/UpgradeDialog';
import { WorkspaceSwitcher } from '../shared/WorkspaceSwitcher';
import { NotificationBell } from '../shared/NotificationBell';
import { usePlanGate } from '../../hooks/usePlanGate';

/** Tooltip shown only while the sidebar is collapsed. */
function CollapsedTip({ label, show, children }: { label: React.ReactNode; show: boolean; children: React.ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      {show && (
        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={10}
            className="bg-elevated text-primary text-xs px-2 py-1 rounded-md border border-default shadow-xl z-[100] max-w-[220px]"
          >
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      )}
    </Tooltip.Root>
  );
}

export function HomeSidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // Plain-string active check: react-router's function-form className gets stringified
  // by Radix Slot (Tooltip.Trigger asChild), so it must not be used inside tooltips.
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  const { homeSidebarCollapsed: collapsed, toggleHomeSidebar } = useLayoutStore();
  const { getActiveWorkspace } = useWorkspaceStore();
  const { projects, createProject } = useProjectStore();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const [upgradeDialogOpen, setUpgradeDialogOpen] = useState(false);

  const { checkFeature } = usePlanGate();
  const projectGate = checkFeature('create_project');

  const activeWorkspace = getActiveWorkspace();
  const workspaceProjects = projects.filter(p => p.workspaceId === activeWorkspace?.id);

  // `soon` marks destinations that land on a ComingSoonPage — rendered with a subtle
  // "Soon" chip so placeholder targets are legible before the click (they still navigate).
  type SidebarItem = { to: string; icon: React.ElementType; label: string; soon?: boolean };
  const navItems: SidebarItem[] = [
    { to: '/', icon: Home, label: 'Home' },
    { to: '/projects', icon: Grid, label: 'Projects' },
    { to: '/marketplace', icon: Box, label: 'Marketplace' },
    { to: '/recent', icon: Clock, label: 'Recent', soon: true },
    { to: '/starred', icon: Star, label: 'Starred', soon: true },
    { to: '/shared', icon: Users, label: 'Shared with me', soon: true },
  ];

  const settingsItems: SidebarItem[] = [
    { to: '/settings', icon: Settings, label: 'Settings' },
    { to: '/billing', icon: CreditCard, label: 'Billing' },
    { to: '/help', icon: HelpCircle, label: 'Help & Support', soon: true },
  ];

  const projectLimit = activeWorkspace?.limits.maxProjects || 3;
  const projectUsage = workspaceProjects.length;
  const projectProgress = projectLimit === -1 ? 0 : (projectUsage / projectLimit) * 100;

  const tokenLimit = activeWorkspace?.limits.maxTokensPerMonth || 50000;
  const tokenUsage = activeWorkspace?.usage.tokensUsedThisMonth || 0;
  const tokenProgress = (tokenUsage / tokenLimit) * 100;

  const handleNewProject = async () => {
    if (!projectGate.allowed) {
      setUpgradeDialogOpen(true);
      return;
    }
    // Create a real project and open it, mirroring the Projects dashboard — the old
    // navigate('/projects?new=true') was a no-op (nothing read the query param).
    const projectId = await createProject(
      { name: `New Project ${workspaceProjects.length + 1}`, description: 'Created from the sidebar.', type: 'website' },
      'server-default',
    );
    navigate(`/project/${projectId}`);
  };

  // Shared row geometry: identical height in both states so nothing jumps while the
  // sidebar width animates; collapsed rows center their icon in the full row width.
  const row = cn(
    'flex items-center h-10 w-full rounded-lg transition-colors',
    collapsed ? 'justify-center' : 'gap-3 px-3'
  );

  // Section headers keep a fixed height in both states to preserve vertical rhythm.
  const sectionHeader = (label: string) => (
    <div className={cn('h-4 mb-1 flex items-center', collapsed ? 'justify-center' : 'px-3')}>
      {collapsed ? (
        <div className="w-6 border-t border-subtle" />
      ) : (
        <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider whitespace-nowrap">{label}</span>
      )}
    </div>
  );

  return (
    <Tooltip.Provider delayDuration={200}>
      <aside
        className={cn(
          'bg-surface border-r border-default h-screen flex flex-col sticky left-0 top-0 z-[60]',
          'overflow-hidden whitespace-nowrap transition-[width] duration-300 ease-in-out',
          collapsed ? 'w-[68px]' : 'w-[240px]'
        )}
      >
        {/* Workspace Switcher */}
        <div className="p-3 border-b border-default">
          <WorkspaceSwitcher collapsed={collapsed} />
        </div>

        {/* Primary action */}
        <div className="p-3">
          <CollapsedTip
            show={collapsed || !projectGate.allowed}
            label={!projectGate.allowed ? `Upgrade required: ${projectGate.reason}` : 'New Project'}
          >
            <button
              onClick={handleNewProject}
              className={cn(
                row,
                'relative group bg-accent hover:bg-accent-hover text-white',
                !collapsed && 'shadow-lg shadow-accent/20',
                !projectGate.allowed && 'opacity-80 grayscale-[0.5]'
              )}
            >
              {!projectGate.allowed && (
                <div className="absolute top-0 right-0 p-1">
                  <Lock size={10} className="text-white/60" />
                </div>
              )}
              <Plus size={18} className={cn('shrink-0', !collapsed && 'group-hover:rotate-90 transition-transform')} />
              {!collapsed && <span className="text-sm font-bold truncate">New Project</span>}
            </button>
          </CollapsedTip>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          {sectionHeader('Workspace')}
          {navItems.map((item) => (
            <CollapsedTip key={item.to} show={collapsed} label={item.label}>
              <NavLink
                to={item.to}
                className={cn(
                  row,
                  isActive(item.to)
                    ? 'bg-accent-muted text-accent'
                    : 'text-secondary hover:text-primary hover:bg-elevated'
                )}
              >
                <item.icon size={18} className="shrink-0" />
                {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
                {!collapsed && item.soon && (
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-tertiary bg-elevated border border-default rounded px-1 py-0.5 shrink-0">
                    Soon
                  </span>
                )}
              </NavLink>
            </CollapsedTip>
          ))}

          <CollapsedTip show={collapsed} label="Notifications">
            {/* py-0 (not p-0): p-0 would also cancel the row's px-3, breaking the
                left alignment against the NavLink rows above. */}
            <NotificationBell className={cn(row, 'py-0 text-secondary hover:text-primary hover:bg-elevated')}>
              {!collapsed && <span className="text-sm font-medium truncate">Notifications</span>}
            </NotificationBell>
          </CollapsedTip>

          {isAdmin && (
            <>
              <div className="pt-5">{sectionHeader('Administration')}</div>
              <CollapsedTip show={collapsed} label="Admin Panel">
                <NavLink
                  to="/admin"
                  className={cn(
                    row,
                    pathname.startsWith('/admin')
                      ? 'bg-accent-muted text-accent'
                      : 'text-secondary hover:text-primary hover:bg-elevated'
                  )}
                >
                  <Shield size={18} className="shrink-0" />
                  {!collapsed && <span className="text-sm font-medium truncate">Admin Panel</span>}
                </NavLink>
              </CollapsedTip>
            </>
          )}

          <div className="pt-5">{sectionHeader('Account')}</div>
          {settingsItems.map((item) => (
            <CollapsedTip key={item.to} show={collapsed} label={item.label}>
              <NavLink
                to={item.to}
                className={cn(
                  row,
                  isActive(item.to)
                    ? 'bg-accent-muted text-accent'
                    : 'text-secondary hover:text-primary hover:bg-elevated'
                )}
              >
                <item.icon size={18} className="shrink-0" />
                {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
                {!collapsed && item.soon && (
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-tertiary bg-elevated border border-default rounded px-1 py-0.5 shrink-0">
                    Soon
                  </span>
                )}
              </NavLink>
            </CollapsedTip>
          ))}
        </nav>

        {/* Bottom Section */}
        <div className="p-3 border-t border-default space-y-3">
          {/* Plan Usage */}
          {!collapsed && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                  <span className="text-tertiary">Projects</span>
                  <span className="text-secondary">{projectUsage} / {projectLimit === -1 ? '∞' : projectLimit}</span>
                </div>
                <div className="h-1 bg-inset rounded-full overflow-hidden">
                  <div
                    className={cn('h-full transition-all duration-500', projectProgress > 90 ? 'bg-error' : 'bg-accent')}
                    style={{ width: `${Math.min(projectProgress, 100)}%` }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                  <span className="text-tertiary">Tokens</span>
                  <span className="text-secondary">{(tokenUsage / 1000).toFixed(1)}K / {(tokenLimit / 1000).toFixed(0)}K</span>
                </div>
                <div className="h-1 bg-inset rounded-full overflow-hidden">
                  <div
                    className={cn('h-full transition-all duration-500', tokenProgress > 90 ? 'bg-error' : 'bg-accent')}
                    style={{ width: `${Math.min(tokenProgress, 100)}%` }}
                  />
                </div>
              </div>

              <button
                onClick={() => setUpgradeDialogOpen(true)}
                className="w-full py-2 bg-elevated hover:bg-inset border border-default rounded-lg text-xs font-bold text-primary transition-all flex items-center justify-center gap-2 group"
              >
                <Zap size={14} className="text-warning group-hover:scale-110 transition-transform" />
                Upgrade Plan
              </button>
            </div>
          )}
          {collapsed && (
            <CollapsedTip show label="Upgrade Plan">
              <button onClick={() => setUpgradeDialogOpen(true)} className={cn(row, 'text-warning hover:bg-elevated')}>
                <Zap size={16} />
              </button>
            </CollapsedTip>
          )}

          {/* Sidebar Toggle */}
          <CollapsedTip show={collapsed} label="Expand sidebar">
            <button
              onClick={toggleHomeSidebar}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(row, 'text-tertiary hover:text-primary hover:bg-elevated')}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              {!collapsed && <span className="text-sm font-medium">Collapse</span>}
            </button>
          </CollapsedTip>
        </div>
      </aside>

      <UpgradeDialog open={upgradeDialogOpen} onOpenChange={setUpgradeDialogOpen} />
    </Tooltip.Provider>
  );
}
