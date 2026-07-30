import React, { useState } from 'react';
import * as Select from '@radix-ui/react-select';
import {
  ChevronDown,
  Check,
  Download,
  Search,
  Filter,
  User,
  Terminal
} from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { AuditLogEntry } from '../../types/workspace';
import { EmptyState } from '../shared/EmptyState';
import { MemberRowSkeleton } from '../shared/Skeleton';
import { Button } from '../shared/Button';
import { History as HistoryIcon } from 'lucide-react';

export function AuditLogTab() {
  const { auditLog, fetchAuditLog } = useWorkspaceStore();
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // The rows are real server-written events; filters operate on the loaded set.
  const userOptions = React.useMemo(
    () => ['all', ...Array.from(new Set(auditLog.map((l) => l.userName).filter(Boolean)))],
    [auditLog],
  );
  const filteredLog = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return auditLog.filter((log) => {
      if (filterAction !== 'all' && !log.action.startsWith(filterAction)) return false;
      if (filterUser !== 'all' && log.userName !== filterUser) return false;
      if (q) {
        const hay = `${log.userName} ${log.action} ${log.resource} ${log.details ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [auditLog, filterAction, filterUser, search]);

  // Load the real audit log (server-written events) for the current user.
  React.useEffect(() => {
    let active = true;
    void fetchAuditLog().finally(() => {
      if (active) setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [fetchAuditLog]);

  const getActionColor = (action: AuditLogEntry['action']) => {
    switch (action) {
      case 'login': return 'bg-info/10 text-info';
      case 'project_create': return 'bg-success/10 text-success';
      case 'project_delete': return 'bg-error/10 text-error';
      case 'member_invite': return 'bg-accent/10 text-accent';
      case 'deploy': return 'bg-success/10 text-success';
      case 'settings_update': return 'bg-warning/10 text-warning';
      case 'secret_create': return 'bg-warning/10 text-warning';
      default: return 'bg-elevated text-tertiary';
    }
  };

  // Real CSV export of the currently filtered rows (client-side; the data is already real).
  const handleExport = () => {
    if (filteredLog.length === 0) {
      toast.info('No audit events to export');
      return;
    }
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['timestamp', 'user', 'action', 'resource', 'details', 'ip'].join(','),
      ...filteredLog.map((l) =>
        [l.timestamp, l.userName, l.action, l.resource, l.details ?? '', l.ipAddress ?? ''].map(esc).join(','),
      ),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `torsor-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredLog.length} events`);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" size={16} />
            <input
              type="text"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-surface border border-default rounded-xl pl-10 pr-4 py-2 text-sm text-primary outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        <Select.Root value={filterAction} onValueChange={setFilterAction}>
          <Select.Trigger className="flex items-center gap-2 px-3 py-2 bg-surface border border-default rounded-xl text-xs font-medium text-primary hover:border-accent transition-colors outline-none">
            <Filter size={14} className="text-tertiary" />
            <Select.Value placeholder="Action Type" />
            <Select.Icon>
              <ChevronDown size={14} className="text-tertiary" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-100">
              <Select.Viewport>
                {['all', 'login', 'project', 'member', 'deploy', 'settings', 'security'].map((item) => (
                  <Select.Item 
                    key={item} 
                    value={item}
                    className="flex items-center justify-between px-3 py-1.5 text-xs text-secondary data-[highlighted]:text-primary data-[highlighted]:bg-accent/10 rounded-lg outline-none cursor-pointer capitalize"
                  >
                    <Select.ItemText>{item}</Select.ItemText>
                    <Select.ItemIndicator>
                      <Check size={12} className="text-accent" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <Select.Root value={filterUser} onValueChange={setFilterUser}>
          <Select.Trigger className="flex items-center gap-2 px-3 py-2 bg-surface border border-default rounded-xl text-xs font-medium text-primary hover:border-accent transition-colors outline-none">
            <User size={14} className="text-tertiary" />
            <Select.Value placeholder="User" />
            <Select.Icon>
              <ChevronDown size={14} className="text-tertiary" />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="bg-elevated border border-default rounded-xl p-1 shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-100">
              <Select.Viewport>
                {userOptions.map((item) => (
                  <Select.Item 
                    key={item} 
                    value={item}
                    className="flex items-center justify-between px-3 py-1.5 text-xs text-secondary data-[highlighted]:text-primary data-[highlighted]:bg-accent/10 rounded-lg outline-none cursor-pointer"
                  >
                    <Select.ItemText>{item}</Select.ItemText>
                    <Select.ItemIndicator>
                      <Check size={12} className="text-accent" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        <Button
          onClick={handleExport}
          variant="secondary"
          size="sm"
          className="ml-auto flex items-center gap-2"
        >
          <Download size={16} />
          Export CSV
        </Button>
      </div>

      {/* Log Table */}
      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-default bg-elevated/50">
              <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">Timestamp</th>
              <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">User</th>
              <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">Action</th>
              <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">Resource</th>
              <th className="px-6 py-4 text-xs font-bold text-secondary uppercase tracking-wider">IP Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-default">
            {isLoading ? (
              <>
                <MemberRowSkeleton />
                <MemberRowSkeleton />
                <MemberRowSkeleton />
                <MemberRowSkeleton />
                <MemberRowSkeleton />
              </>
            ) : filteredLog.length > 0 ? (
              filteredLog.map((log) => (
                <React.Fragment key={log.id}>
                  <tr 
                    onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                    className={cn(
                      "group hover:bg-elevated/30 transition-colors cursor-pointer",
                      expandedRow === log.id && "bg-accent/5"
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="text-xs text-secondary font-mono">
                        {new Date(log.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold">
                          {log.userName.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-primary">{log.userName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={cn(
                        "px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider w-fit",
                        getActionColor(log.action)
                      )}>
                        {log.action.replace('_', ' ')}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-primary">{log.resource}</div>
                      <div className="text-xs text-tertiary mt-0.5">{log.details}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-tertiary font-mono">{log.ipAddress}</div>
                    </td>
                  </tr>
                  {expandedRow === log.id && (
                    <tr>
                      <td colSpan={5} className="px-6 py-4 bg-inset border-y border-default">
                        <div className="space-y-3 animate-in slide-in-from-top-2 duration-200">
                          <div className="flex items-center gap-2 text-xs font-bold text-secondary uppercase tracking-wider">
                            <Terminal size={12} />
                            Event Details (JSON)
                          </div>
                          <pre className="p-4 bg-page border border-default rounded-xl text-xs text-primary font-mono overflow-x-auto">
                            {JSON.stringify(log, null, 2)}
                          </pre>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="py-12">
                  <EmptyState 
                    icon={HistoryIcon}
                    title="No activity yet"
                    description="Audit logs will appear here as your team interacts with the workspace."
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Honest footer: real counts for the loaded set (server pagination comes later) */}
      <div className="px-2 text-xs text-secondary">
        Showing <span className="font-bold text-primary">{filteredLog.length}</span> of{' '}
        <span className="font-bold text-primary">{auditLog.length}</span> events
      </div>
    </div>
  );
}
