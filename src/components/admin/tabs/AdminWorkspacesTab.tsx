import React, { useEffect } from 'react';
import { Building2, Loader2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useAdminStore } from '../../../stores/adminStore';

/**
 * Real super-admin observability of runtime workspaces (one container per project) across all
 * users — owner, project, runtime, status, created. Backed by `/api/v1/admin/workspaces`.
 */
export function AdminWorkspacesTab() {
  const { workspaces, fetchWorkspaces } = useAdminStore();
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    void fetchWorkspaces().finally(() => setLoading(false));
  }, [fetchWorkspaces]);

  const statusColor = (s: string) =>
    s === 'running' ? 'text-success bg-success/10' :
    s === 'stopped' || s === 'created' ? 'text-warning bg-warning/10' :
    s === 'destroyed' ? 'text-error bg-error/10' : 'text-secondary bg-elevated';

  return (
    <div className="flex flex-col h-full bg-page overflow-y-auto custom-scrollbar">
      <header className="h-12 px-6 flex items-center gap-2 border-b border-default bg-surface sticky top-0 z-20 shrink-0">
        <Building2 size={16} className="text-accent" />
        <h2 className="text-sm font-bold text-primary">Workspaces</h2>
        <span className="text-xs text-tertiary ml-auto">{workspaces.length} runtime workspace{workspaces.length === 1 ? '' : 's'}</span>
      </header>

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-secondary gap-2">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : workspaces.length === 0 ? (
          <p className="text-sm text-secondary text-center py-20">No workspaces have been provisioned yet.</p>
        ) : (
          <div className="border border-default rounded-xl overflow-hidden bg-surface">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-default bg-page/50 text-xs uppercase tracking-wider text-secondary">
                  <th className="px-6 py-3 font-medium">Project</th>
                  <th className="px-6 py-3 font-medium">Owner</th>
                  <th className="px-6 py-3 font-medium">Runtime</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default">
                {workspaces.map((ws) => (
                  <tr key={ws.id} className="hover:bg-page/50 transition-colors">
                    <td className="px-6 py-3 font-medium text-primary">{ws.project}</td>
                    <td className="px-6 py-3 text-secondary">{ws.owner}</td>
                    <td className="px-6 py-3 text-secondary font-mono text-xs">{ws.runtime}</td>
                    <td className="px-6 py-3">
                      <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded', statusColor(ws.status))}>
                        {ws.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-tertiary">{new Date(ws.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
