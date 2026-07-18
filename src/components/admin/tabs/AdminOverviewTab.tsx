import React, { useEffect } from 'react';
import {
  Building2,
  Users,
  CreditCard,
  Activity,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Cpu,
  ShieldCheck,
  AlertCircle,
  FileCode,
  FolderGit2
} from 'lucide-react';
import { useAdminStore } from '../../../stores/adminStore';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { cn } from '../../../lib/utils';
import { Card } from '../../shared/Card';
import { Badge } from '../../shared/Badge';

const REVENUE_DATA = [
  { date: 'Jan 1', mrr: 8500, subs: 12 },
  { date: 'Jan 15', mrr: 9200, subs: 18 },
  { date: 'Feb 1', mrr: 10100, subs: 24 },
  { date: 'Feb 15', mrr: 11500, subs: 32 },
  { date: 'Mar 1', mrr: 12450, subs: 45 },
];

const RECENT_ACTIVITY = [
  { id: 1, user: 'Marko', action: 'upgraded to Pro', workspace: 'Marko Workspace', time: '2 mins ago', avatar: 'https://picsum.photos/seed/marko/200' },
  { id: 2, user: 'Jane Doe', action: 'created workspace', workspace: 'Irving Studio', time: '15 mins ago', avatar: 'https://picsum.photos/seed/jane/200' },
  { id: 3, user: 'Bob Smith', action: 'deployed project', workspace: 'Project Alpha', time: '45 mins ago', avatar: 'https://picsum.photos/seed/bob/200' },
  { id: 4, user: 'Alice', action: 'invited member', workspace: 'Torsor Team', time: '1 hour ago', avatar: 'https://picsum.photos/seed/alice/200' },
  { id: 5, user: 'Charlie', action: 'added secret', workspace: 'Dev Ops', time: '3 hours ago', avatar: 'https://picsum.photos/seed/charlie/200' },
];

export function AdminOverviewTab() {
  const { stats, fetchStats } = useAdminStore();

  useEffect(() => {
    void fetchStats();
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
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", stat.bg, stat.color)}>
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
        {/* Revenue Chart */}
        <Card className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="text-accent" size={18} />
              <h3 className="text-sm font-bold uppercase tracking-wider">Revenue Growth (90 Days)</h3>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-accent" />
                <span className="text-xs text-secondary">MRR</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-accent/30" />
                <span className="text-xs text-secondary">New Subs</span>
              </div>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={REVENUE_DATA}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: 'var(--text-secondary)' }}
                  dx={-10}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', fontSize: '12px' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="mrr" 
                  stroke="var(--accent)" 
                  strokeWidth={3} 
                  dot={{ r: 4, fill: 'var(--accent)', strokeWidth: 2, stroke: 'var(--bg-elevated)' }}
                  activeDot={{ r: 6, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="space-y-6 flex flex-col">
          <div className="flex items-center gap-2">
            <History className="text-accent" size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Recent Activity</h3>
          </div>
          <div className="space-y-4 flex-1">
            {RECENT_ACTIVITY.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 group">
                <div className="w-8 h-8 rounded-full bg-elevated border border-default overflow-hidden flex-shrink-0">
                  <img src={activity.avatar} alt={activity.user} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-primary leading-relaxed">
                    <span className="font-bold">{activity.user}</span> {activity.action} in <span className="text-accent font-medium">{activity.workspace}</span>
                  </div>
                  <div className="text-xs text-tertiary mt-0.5">{activity.time}</div>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full py-2 text-xs font-bold text-accent hover:text-accent-hover transition-colors uppercase tracking-wider border-t border-default pt-4 focus-ring">
            View All Activity
          </button>
        </Card>
      </div>

      {/* Platform Health */}
      <Card className="space-y-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-success" size={18} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Platform Health</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="space-y-2">
            <div className="text-xs font-bold text-tertiary uppercase tracking-wider">API Latency</div>
            <div className="flex items-center gap-2">
              <div className="text-xl font-bold text-primary">42ms avg</div>
              <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(52,199,89,0.5)]" />
            </div>
            <div className="text-xs text-success font-medium">Under 100ms threshold</div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-tertiary uppercase tracking-wider">Model Array Status</div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {['Claude', 'GPT-4', 'Gemini', 'DeepSeek', 'Llama'].map((m) => (
                <div key={m} className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(52,199,89,0.5)]" title={m} />
              ))}
            </div>
            <div className="text-xs text-success font-medium mt-2">All systems operational</div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-tertiary uppercase tracking-wider">Active Sandboxes</div>
            <div className="text-xl font-bold text-primary">23 running</div>
            <div className="text-xs text-secondary font-medium">4 queued, 0 failed</div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-tertiary uppercase tracking-wider">Error Rate</div>
            <div className="flex items-center gap-2">
              <div className="text-xl font-bold text-primary">0.3%</div>
              <div className="w-2 h-2 rounded-full bg-success shadow-[0_0_8px_rgba(52,199,89,0.5)]" />
            </div>
            <div className="text-xs text-success font-medium">Healthy (threshold 1%)</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function History({ className, size }: { className?: string, size?: number }) {
  return <Activity className={className} size={size} />;
}
