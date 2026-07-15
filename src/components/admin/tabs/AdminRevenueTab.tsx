import React from 'react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { 
  TrendingUp, 
  Users, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownRight,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  DollarSign,
  UserMinus
} from 'lucide-react';
import { cn } from '../../../lib/utils';

const PLAN_DATA = [
  { name: 'Pro', value: 450, color: 'var(--accent)' },
  { name: 'Team', value: 120, color: 'var(--info)' },
  { name: 'Enterprise', value: 15, color: 'var(--success)' },
];

const MONTHLY_REVENUE = [
  { month: 'Apr', revenue: 8200 },
  { month: 'May', revenue: 8900 },
  { month: 'Jun', revenue: 9400 },
  { month: 'Jul', revenue: 10200 },
  { month: 'Aug', revenue: 11100 },
  { month: 'Sep', revenue: 12450 },
];

const MOCK_SUBSCRIPTIONS = [
  { id: 1, workspace: 'Marko Workspace', plan: 'pro', amount: '$20', status: 'active', started: '2025-01-15', next: '2026-04-15' },
  { id: 2, workspace: 'Torsor Team', plan: 'team', amount: '$150', status: 'active', started: '2025-02-01', next: '2026-04-01' },
  { id: 3, workspace: 'Dev Ops', plan: 'enterprise', amount: '$1,200', status: 'active', started: '2024-11-20', next: '2026-05-20' },
  { id: 4, workspace: 'Irving Studio', plan: 'pro', amount: '$20', status: 'cancelled', started: '2025-03-10', next: '-' },
  { id: 5, workspace: 'Design Co', plan: 'team', amount: '$150', status: 'active', started: '2025-01-05', next: '2026-04-05' },
];

export function AdminRevenueTab() {
  return (
    <div className="space-y-8">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'LTV', value: '$420', change: '+5%', icon: Users, color: 'text-accent', bg: 'bg-accent/10' },
          { label: 'ARPU', value: '$32.50', change: '+12%', icon: DollarSign, color: 'text-info', bg: 'bg-info/10' },
          { label: 'Churn Rate', value: '2.4%', change: '-0.5%', icon: UserMinus, color: 'text-error', bg: 'bg-error/10', inverse: true },
          { label: 'Net Revenue', value: '$12,450', change: '+15%', icon: CreditCard, color: 'text-success', bg: 'bg-success/10' },
        ].map((stat, i) => (
          <div key={i} className="bg-surface border border-default rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", stat.bg, stat.color)}>
                <stat.icon size={20} />
              </div>
              <div className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                stat.inverse 
                  ? (stat.change.startsWith('-') ? "bg-success/10 text-success" : "bg-error/10 text-error")
                  : (stat.change.startsWith('+') ? "bg-success/10 text-success" : "bg-error/10 text-error")
              )}>
                {stat.change.startsWith('+') ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                {stat.change}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-tertiary uppercase tracking-wider">{stat.label}</div>
              <div className="text-2xl font-bold text-primary mt-1">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* MRR Breakdown */}
        <div className="bg-surface border border-default rounded-3xl p-6 space-y-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-accent" size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">MRR Breakdown by Plan</h3>
          </div>
          <div className="h-[300px] w-full flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={PLAN_DATA}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {PLAN_DATA.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '12px' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                />
                <Legend 
                  verticalAlign="middle" 
                  align="right" 
                  layout="vertical"
                  formatter={(value, entry: any) => (
                    <span className="text-xs text-secondary font-medium ml-2">{value}: {entry.payload.value} subs</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Revenue by Month */}
        <div className="bg-surface border border-default rounded-3xl p-6 space-y-6">
          <div className="flex items-center gap-2">
            <CreditCard className="text-accent" size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Revenue by Month</h3>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MONTHLY_REVENUE}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: 'var(--text-secondary)' }}
                  dx={-10}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '12px' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                  cursor={{ fill: 'rgba(123, 106, 238, 0.05)' }}
                />
                <Bar dataKey="revenue" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Subscription Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="text-accent" size={18} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Recent Subscriptions</h3>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-elevated border border-default rounded-xl text-xs font-bold text-primary hover:bg-surface transition-all">
            <Download size={16} />
            Export CSV
          </button>
        </div>

        <div className="bg-surface border border-default rounded-2xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-default bg-elevated/50">
                <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Workspace</th>
                <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Plan</th>
                <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Amount</th>
                <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Started</th>
                <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider">Next Billing</th>
                <th className="px-6 py-4 text-[10px] font-bold text-secondary uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {MOCK_SUBSCRIPTIONS.map((sub) => (
                <tr key={sub.id} className="group hover:bg-elevated/30 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-primary">{sub.workspace}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider w-fit",
                      sub.plan === 'pro' ? "bg-accent/10 text-accent" :
                      sub.plan === 'team' ? "bg-info/10 text-info" :
                      "bg-success/10 text-success"
                    )}>
                      {sub.plan}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-bold text-primary">{sub.amount}</span>
                    <span className="text-[10px] text-tertiary ml-1">/mo</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider w-fit",
                      sub.status === 'active' ? "bg-success/10 text-success" : "bg-error/10 text-error"
                    )}>
                      {sub.status}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-tertiary">{sub.started}</td>
                  <td className="px-6 py-4 text-xs text-tertiary">{sub.next}</td>
                  <td className="px-6 py-4 text-right">
                    <button className="p-2 hover:bg-elevated rounded-lg text-tertiary hover:text-primary transition-colors">
                      <MoreVertical size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-xs text-secondary">
          Showing <span className="font-bold text-primary">1-5</span> of <span className="font-bold text-primary">585</span> active subscriptions
        </div>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-elevated rounded-lg text-tertiary hover:text-primary transition-colors disabled:opacity-30" disabled>
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-1">
            {[1, 2, 3, '...', 117].map((page, i) => (
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
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
