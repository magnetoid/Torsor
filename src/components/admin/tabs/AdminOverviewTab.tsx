import React, { useEffect, useState } from 'react';
import {
  Users,
  Activity,
  ArrowUpRight,
  FileCode,
  FolderGit2,
  DollarSign,
  History,
  Loader2,
} from 'lucide-react';
import { useAdminStore } from '../../../stores/adminStore';
import { cn } from '../../../lib/utils';
import { Card } from '../../shared/Card';
import { Badge } from '../../shared/Badge';
import { apiRequest } from '../../../lib/api';

/**
 * Overview shows only real data: platform totals from /api/v1/admin/stats and the
 * requesting admin's own recent audit events. The previous fabricated MRR chart,
 * fake activity feed, and invented health metrics are gone — revenue has an honest
 * empty state (no payment backend), and live platform detail lives in the Platform tab.
 */

interface AuditEvent {
  id: string;
  action: string;
  resource?: string;
  details?: string;
  timestamp: string;
}

export function AdminOverviewTab() {
  const { stats, fetchStats } = useAdminStore();
  const [activity, setActivity] = useState<AuditEvent[] | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    void fetchStats();
    let active = true;
    apiRequest<{ items: AuditEvent[] }>('/api/v1/audit', { auth: true })
      .then((res) => active && setActivity(res.items.slice(0, 8)))
      .catch((e) => active && setActivityError(e instanceof Error ? e.message : 'Failed to load activity'));
    return () => {
      active = false;
    };
  }, [fetchStats]);

  const fmt = (n: number | undefined) => (n == null ? '—' : n.toLocaleString());
  const newUsers = stats?.growth.newUsers7d;
  const newProjects = stats?.growth.newProjects7d;

  return (
    <div className="space-y-8">
      {/* Stats Cards — real platform totals from /api/v1/admin/stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: fmt(stats?.totals.users), change: newUsers != null ? `+${newUsers} / 7d` : '', icon: Users, color: 'text-info', bg: 'bg-info/10' },
          { label: 'Total Projects', value: fmt(stats?.totals.projects), change: newProjects != null ? `+${newProjects} / 7d` : '', icon: FolderGit2, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'Total Files', value: fmt(stats?.totals.files), change: '', icon: FileCode, color: 'text-warning', bg: 'bg-warning/10' },
          { label: 'Active Sessions', value: fmt(stats?.totals.activeSessions), change: '', icon: Activity, color: 'text-success', bg: 'bg-success/10' },
        ].map((stat, i) => (
          <Card key={i} className="space-y-4 shadow-sm hover-lift">
            <div className="flex items-center justify-between">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', stat.bg, stat.color)}>
                <stat.icon size={20} />
              </div>
              {stat.change && (
                <Badge variant="success" className="uppercase tracking-wider">
                  <ArrowUpRight size={12} />
                  {stat.change}
                </Badge>
              )}
            </div>
            <div>
              <div className="text-xs font-bold text-tertiary uppercase tracking-wider">{stat.label}</div>
              <div className="text-2xl font-bold text-primary mt-1">{stat.value}</div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue — honest empty state: no payment backend exists on this instance */}
        <Card className="lg:col-span-2 flex flex-col items-center justify-center gap-3 text-center py-16">
          <DollarSign size={32} className="text-tertiary opacity-30" />
          <p className="text-sm text-secondary">No revenue data</p>
          <p className="text-xs text-tertiary max-w-sm">
            Billing isn&apos;t connected — Torsor is free and self-hostable by default. Wire a
            payment processor to see real subscription figures here.
          </p>
        </Card>

        {/* Recent activity — the requesting admin's real audit events */}
        <Card className="space-y-6 flex flex-col">
          <div className="flex items-center gap-2">
            <History className="text-accent" size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Your Recent Actions</h3>
          </div>
          <div className="space-y-4 flex-1">
            {activityError ? (
              <p className="text-xs text-error">{activityError}</p>
            ) : activity == null ? (
              <div className="flex items-center gap-2 text-xs text-tertiary">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            ) : activity.length === 0 ? (
              <p className="text-xs text-tertiary">
                No audit events yet. Actions like creating projects or inviting members appear
                here as they happen.
              </p>
            ) : (
              activity.map((e) => (
                <div key={e.id} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Activity size={12} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-primary leading-relaxed">
                      <span className="font-bold">{e.action.replace(/_/g, ' ')}</span>
                      {e.resource ? <span className="text-secondary"> — {e.resource}</span> : null}
                    </div>
                    <div className="text-xs text-tertiary mt-0.5">
                      {new Date(e.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
