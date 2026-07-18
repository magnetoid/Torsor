import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  MoreVertical, 
  Eye, 
  UserPlus, 
  Trash2, 
  ShieldAlert, 
  ChevronRight,
  Building2,
  Users,
  LayoutGrid,
  Zap,
  ExternalLink,
  ChevronLeft
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '../../../lib/utils';
import { toast } from 'sonner';

const MOCK_WORKSPACES = [
  { id: 'ws-1', name: 'Marko Workspace', owner: 'Marko Tiosavljevic', plan: 'pro', members: 3, projects: 12, tokens: '450k', created: '2025-01-15' },
  { id: 'ws-2', name: 'Torsor Team', owner: 'Jane Doe', plan: 'team', members: 15, projects: 45, tokens: '2.5M', created: '2025-02-01' },
  { id: 'ws-3', name: 'Irving Studio', owner: 'Bob Smith', plan: 'free', members: 1, projects: 2, tokens: '12k', created: '2025-03-10' },
  { id: 'ws-4', name: 'Dev Ops', owner: 'Alice', plan: 'enterprise', members: 120, projects: 340, tokens: '15.2M', created: '2024-11-20' },
];

export function AdminWorkspacesTab() {
  const [selectedWorkspace, setSelectedWorkspace] = useState<typeof MOCK_WORKSPACES[0] | null>(null);

  const handleImpersonate = (name: string) => {
    toast.success(`Impersonating ${name}...`);
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[300px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" size={16} />
            <input 
              type="text" 
              placeholder="Search workspaces by name, owner, or slug..."
              className="w-full bg-surface border border-default rounded-xl pl-10 pr-4 py-2.5 text-sm text-primary outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        <button className="flex items-center gap-2 px-4 py-2.5 bg-surface border border-default rounded-xl text-xs font-bold text-primary hover:border-accent transition-colors">
          <Filter size={16} className="text-tertiary" />
          Filter
        </button>

        <button className="px-4 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold text-xs shadow-lg shadow-accent/20 transition-all">
          Export CSV
        </button>
      </div>

      <div className="flex gap-6">
        {/* Table */}
        <div className={cn(
          "bg-surface border border-default rounded-xl overflow-hidden transition-all duration-300",
          selectedWorkspace ? "flex-1" : "w-full"
        )}>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-default bg-elevated/50">
                <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">Workspace</th>
                <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">Owner</th>
                <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">Plan</th>
                <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider text-center">Members</th>
                <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider text-center">Projects</th>
                <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">Tokens</th>
                <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">Created</th>
                <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {MOCK_WORKSPACES.map((ws) => (
                <tr 
                  key={ws.id} 
                  onClick={() => setSelectedWorkspace(ws)}
                  className={cn(
                    "group hover:bg-elevated/30 transition-colors cursor-pointer",
                    selectedWorkspace?.id === ws.id && "bg-accent/5"
                  )}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                        <Building2 size={16} />
                      </div>
                      <span className="text-sm font-bold text-primary">{ws.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-secondary">{ws.owner}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={cn(
                      "px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider w-fit",
                      ws.plan === 'pro' ? "bg-accent/10 text-accent" :
                      ws.plan === 'team' ? "bg-info/10 text-info" :
                      ws.plan === 'enterprise' ? "bg-success/10 text-success" :
                      "bg-elevated text-tertiary"
                    )}>
                      {ws.plan}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-sm text-secondary">{ws.members}</span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="text-sm text-secondary">{ws.projects}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-secondary">{ws.tokens}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-tertiary">{ws.created}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild onClick={(e) => e.stopPropagation()}>
                        <button className="p-2 hover:bg-elevated rounded-lg text-tertiary hover:text-primary transition-colors">
                          <MoreVertical size={16} />
                        </button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-[100] min-w-[160px] animate-in fade-in zoom-in-95 duration-100">
                          <DropdownMenu.Item 
                            onClick={() => setSelectedWorkspace(ws)}
                            className="flex items-center gap-2 px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-accent/10 rounded-lg outline-none cursor-pointer"
                          >
                            <Eye size={14} />
                            View Details
                          </DropdownMenu.Item>
                          <DropdownMenu.Item 
                            onClick={() => handleImpersonate(ws.name)}
                            className="flex items-center gap-2 px-3 py-2 text-xs text-secondary hover:text-accent hover:bg-accent/10 rounded-lg outline-none cursor-pointer"
                          >
                            <UserPlus size={14} />
                            Impersonate
                          </DropdownMenu.Item>
                          <DropdownMenu.Separator className="h-px bg-default my-1" />
                          <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-error hover:bg-error/10 rounded-lg outline-none cursor-pointer">
                            <ShieldAlert size={14} />
                            Suspend
                          </DropdownMenu.Item>
                          <DropdownMenu.Item className="flex items-center gap-2 px-3 py-2 text-xs text-error hover:bg-error/10 rounded-lg outline-none cursor-pointer">
                            <Trash2 size={14} />
                            Delete
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detail Panel */}
        {selectedWorkspace && (
          <div className="w-[400px] bg-surface border border-default rounded-xl p-6 space-y-8 animate-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-primary">Workspace Details</h3>
              <button 
                onClick={() => setSelectedWorkspace(null)}
                className="p-2 hover:bg-elevated rounded-lg text-tertiary hover:text-primary transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                  <Building2 size={32} />
                </div>
                <div>
                  <div className="text-xl font-bold text-primary">{selectedWorkspace.name}</div>
                  <div className="text-sm text-secondary">ID: {selectedWorkspace.id}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-elevated/50 border border-default rounded-xl space-y-1">
                  <div className="text-xs font-bold text-tertiary uppercase tracking-wider">Owner</div>
                  <div className="text-sm font-medium text-primary">{selectedWorkspace.owner}</div>
                </div>
                <div className="p-4 bg-elevated/50 border border-default rounded-xl space-y-1">
                  <div className="text-xs font-bold text-tertiary uppercase tracking-wider">Plan</div>
                  <div className="text-sm font-medium text-accent capitalize">{selectedWorkspace.plan}</div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-secondary uppercase tracking-wider">Usage Overview</h4>
                  <button className="text-xs font-bold text-accent uppercase tracking-wider hover:underline">View Detailed Stats</button>
                </div>
                <div className="space-y-3">
                  {[
                    { label: 'Members', value: selectedWorkspace.members, max: 50, icon: Users },
                    { label: 'Projects', value: selectedWorkspace.projects, max: 100, icon: LayoutGrid },
                    { label: 'Storage', value: '8.5 GB', max: '50 GB', icon: Zap },
                  ].map((stat, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <div className="flex items-center gap-2 text-secondary">
                          <stat.icon size={12} />
                          {stat.label}
                        </div>
                        <span className="text-primary font-medium">{stat.value} / {stat.max}</span>
                      </div>
                      <div className="h-1.5 w-full bg-elevated rounded-full overflow-hidden">
                        <div className="h-full bg-accent w-[45%]" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-6 border-t border-default flex flex-col gap-3">
                <button 
                  onClick={() => handleImpersonate(selectedWorkspace.name)}
                  className="w-full py-3 bg-accent hover:bg-accent-hover text-white rounded-xl font-bold text-sm shadow-lg shadow-accent/20 transition-all flex items-center justify-center gap-2"
                >
                  <UserPlus size={18} />
                  Impersonate Admin
                </button>
                <div className="flex gap-3">
                  <button className="flex-1 py-2.5 bg-elevated border border-default rounded-xl text-xs font-bold text-primary hover:bg-surface transition-all">
                    View Billing
                  </button>
                  <button className="flex-1 py-2.5 bg-elevated border border-default rounded-xl text-xs font-bold text-primary hover:bg-surface transition-all">
                    Audit Logs
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-xs text-secondary">
          Showing <span className="font-bold text-primary">1-4</span> of <span className="font-bold text-primary">1,247</span> workspaces
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-elevated rounded-lg text-tertiary hover:text-primary transition-colors disabled:opacity-30" disabled>
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-1">
            {[1, 2, 3, '...', 63].map((page, i) => (
              <button 
                key={i}
                className={cn(
                  "w-8 h-8 rounded-lg text-xs font-bold transition-all",
                  page === 1 ? "bg-accent text-white" : "text-secondary hover:bg-elevated"
                )}
              >
                {page}
              </button>
            ))}
          </div>
          <button className="p-2 hover:bg-elevated rounded-lg text-tertiary hover:text-primary transition-colors">
            <ChevronLeft size={18} className="rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
}
