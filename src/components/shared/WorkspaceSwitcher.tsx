import React, { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Separator from '@radix-ui/react-separator';
import { 
  ChevronDown, 
  Check, 
  Plus, 
  Settings, 
  UserPlus, 
  Building2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  MoreVertical
} from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { InviteMembersDialog } from './InviteMembersDialog';

interface WorkspaceSwitcherProps {
  collapsed?: boolean;
}

export function WorkspaceSwitcher({ collapsed = false }: WorkspaceSwitcherProps) {
  const navigate = useNavigate();
  const { workspaces, activeWorkspaceId, switchWorkspace, getActiveWorkspace } = useWorkspaceStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  
  const activeWorkspace = getActiveWorkspace();

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <ShieldAlert size={12} className="text-error" />;
      case 'admin': return <ShieldCheck size={12} className="text-accent" />;
      case 'developer': return <Shield size={12} className="text-success" />;
      default: return <Shield size={12} className="text-secondary" />;
    }
  };

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className={cn(
            "flex items-center transition-all rounded-xl group outline-none",
            collapsed
              ? "justify-center w-full h-10 hover:bg-elevated"
              : "gap-3 px-3 py-2 hover:bg-elevated w-full"
          )}>
            <div className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center text-white text-[10px] font-bold shadow-sm shrink-0 group-hover:scale-105 transition-transform">
              {activeWorkspace?.logoUrl ? (
                <img src={activeWorkspace.logoUrl} alt={activeWorkspace.name} className="w-full h-full object-cover rounded-lg" referrerPolicy="no-referrer" />
              ) : (
                activeWorkspace?.name.charAt(0).toUpperCase()
              )}
            </div>
            {!collapsed && (
              <>
                <div className="flex flex-col min-w-0 flex-1 text-left">
                  <span className="text-sm font-bold text-primary truncate">
                    {activeWorkspace?.name}
                  </span>
                  <span className="text-[10px] text-tertiary font-bold uppercase tracking-wider">
                    {activeWorkspace?.plan}
                  </span>
                </div>
                <ChevronDown size={14} className="text-tertiary group-hover:text-primary transition-colors" />
              </>
            )}
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content 
            className="w-[280px] bg-elevated border border-default rounded-2xl p-1.5 shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-100"
            side={collapsed ? "right" : "bottom"}
            align={collapsed ? "start" : "start"}
            sideOffset={10}
          >
            <div className="px-2.5 py-2">
              <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider">Workspaces</span>
            </div>
            
            <div className="space-y-0.5 mb-2">
              {workspaces.map(ws => (
                <DropdownMenu.Item 
                  key={ws.id}
                  onClick={() => switchWorkspace(ws.id)}
                  className={cn(
                    "flex items-center gap-3 px-2.5 py-2 rounded-xl cursor-pointer outline-none transition-all",
                    ws.id === activeWorkspaceId ? "bg-accent-muted" : "hover:bg-surface"
                  )}
                >
                  <div className="w-6 h-6 rounded-lg bg-accent flex items-center justify-center text-white text-[10px] font-bold shadow-sm shrink-0">
                    {ws.logoUrl ? (
                      <img src={ws.logoUrl} alt={ws.name} className="w-full h-full object-cover rounded-lg" referrerPolicy="no-referrer" />
                    ) : (
                      ws.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-sm font-medium text-primary truncate">{ws.name}</span>
                    <div className="flex items-center gap-1.5">
                      {getRoleIcon('owner')} {/* Mock role for now */}
                      <span className="text-[10px] text-tertiary font-bold uppercase tracking-wider">Owner</span>
                    </div>
                  </div>
                  {ws.id === activeWorkspaceId && <Check size={14} className="text-accent" />}
                </DropdownMenu.Item>
              ))}
            </div>

            <Separator.Root className="h-[1px] bg-default my-1.5 mx-2" />
            
            <div className="px-2.5 py-2">
              <span className="text-[10px] font-bold text-tertiary uppercase tracking-wider">Actions</span>
            </div>

            <div className="space-y-0.5">
              <DropdownMenu.Item 
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-3 px-2.5 py-2 rounded-xl cursor-pointer outline-none hover:bg-surface text-secondary hover:text-primary transition-all"
              >
                <div className="w-6 h-6 flex items-center justify-center text-tertiary group-hover:text-primary">
                  <Plus size={16} />
                </div>
                <span className="text-sm font-medium">Create new workspace</span>
              </DropdownMenu.Item>

              <DropdownMenu.Item 
                onClick={() => navigate('/settings')}
                className="flex items-center gap-3 px-2.5 py-2 rounded-xl cursor-pointer outline-none hover:bg-surface text-secondary hover:text-primary transition-all"
              >
                <div className="w-6 h-6 flex items-center justify-center text-tertiary group-hover:text-primary">
                  <Settings size={16} />
                </div>
                <span className="text-sm font-medium">Workspace settings</span>
              </DropdownMenu.Item>

              <DropdownMenu.Item 
                onClick={() => setInviteOpen(true)}
                className="flex items-center gap-3 px-2.5 py-2 rounded-xl cursor-pointer outline-none hover:bg-surface text-secondary hover:text-primary transition-all"
              >
                <div className="w-6 h-6 flex items-center justify-center text-tertiary group-hover:text-primary">
                  <UserPlus size={16} />
                </div>
                <span className="text-sm font-medium">Invite members</span>
              </DropdownMenu.Item>
            </div>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
      <InviteMembersDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  );
}
