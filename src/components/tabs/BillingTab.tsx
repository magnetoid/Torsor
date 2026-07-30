import React, { useEffect, useState } from 'react';
import {
  Zap,
  Users,
  Activity,
  TrendingUp,
  Receipt,
  ShieldCheck,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { useActiveWorkspace } from '../../stores/workspaceStore';
import { apiUsageSummary, type UsageSummary } from '../../lib/api';
import { cn } from '../../lib/utils';
import { UpgradeDialog } from '../shared/UpgradeDialog';

/**
 * Billing is honest on self-hosted Torsor: real token usage from usage_events,
 * a real (admin-assigned) plan, and explicit empty states for the payment surface
 * that does not exist. Nothing here fabricates invoices, cards, or costs.
 */

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

export function BillingTab() {
  const activeWorkspace = useActiveWorkspace();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiUsageSummary()
      .then((d) => active && setUsage(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load usage'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const totalTokens = (usage?.totals.tokensIn ?? 0) + (usage?.totals.tokensOut ?? 0);
  const tokenLimit = activeWorkspace?.limits?.maxTokensPerMonth ?? 0;
  const tokenPct = tokenLimit > 0 ? Math.min(100, Math.round((totalTokens / tokenLimit) * 100)) : 0;

  const stats = [
    { label: 'Tokens in', icon: Zap, value: compact(usage?.totals.tokensIn ?? 0) },
    { label: 'Tokens out', icon: TrendingUp, value: compact(usage?.totals.tokensOut ?? 0) },
    { label: 'Model calls', icon: Activity, value: compact(usage?.totals.events ?? 0) },
    { label: 'Members', icon: Users, value: String(activeWorkspace?.usage?.memberCount ?? 1) },
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Current plan — real, admin-assigned; no payment surface exists on self-hosted */}
      <div className="p-6 bg-surface border border-default rounded-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 bg-accent/10 text-accent rounded-full text-xs font-bold uppercase tracking-wider border border-accent/20">
                {activeWorkspace?.plan ?? 'free'} plan
              </div>
              <ShieldCheck size={16} className="text-success" />
            </div>
            <p className="text-sm text-secondary max-w-xl">
              This is a self-hosted Torsor instance — there is no payment processor connected.
              Plans are tiers assigned by your instance admin; limits are informational until
              quota enforcement ships.
            </p>
          </div>
          <button
            onClick={() => setUpgradeOpen(true)}
            className="bg-elevated border border-default text-primary px-5 py-2.5 rounded-xl font-bold text-sm hover:border-accent transition-all flex items-center gap-2 w-fit focus-ring"
          >
            Compare plans
            <ChevronRight size={16} />
          </button>
        </div>
        {tokenLimit > 0 && (
          <div className="mt-5 space-y-1.5">
            <div className="flex justify-between text-xs font-bold text-secondary uppercase tracking-wider">
              <span>Token usage this period</span>
              <span>
                {compact(totalTokens)} / {compact(tokenLimit)}
              </span>
            </div>
            <div className="h-1.5 w-full bg-elevated rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-500',
                  tokenPct > 85 ? 'bg-error' : tokenPct > 60 ? 'bg-warning' : 'bg-success',
                )}
                style={{ width: `${tokenPct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Real usage stats from usage_events */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((item) => (
          <div key={item.label} className="p-4 bg-surface border border-default rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-elevated flex items-center justify-center text-secondary">
                <item.icon size={18} />
              </div>
              <span className="text-xs font-bold text-secondary uppercase tracking-wider">{item.label}</span>
            </div>
            <div className="text-lg font-bold text-primary">
              {loading ? <Loader2 size={16} className="animate-spin text-tertiary" /> : item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Token usage chart — real byDay series */}
      <div className="p-6 bg-surface border border-default rounded-xl space-y-6">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-accent" size={20} />
          <h3 className="text-sm font-bold uppercase tracking-wider">Token usage (30 days)</h3>
        </div>
        {error ? (
          <div className="rounded-lg border border-error/20 bg-error/10 p-3 text-xs text-error">{error}</div>
        ) : loading ? (
          <div className="flex items-center gap-2 text-xs text-tertiary h-[200px]">
            <Loader2 size={14} className="animate-spin" /> Loading usage…
          </div>
        ) : !usage || usage.byDay.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-xs text-tertiary">
            No usage recorded yet — run the agent to see tokens here.
          </div>
        ) : (
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usage.byDay}>
                <defs>
                  <linearGradient id="billingIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="billingOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                  tickFormatter={(d: string) => d.slice(5)}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                  tickFormatter={(v: number) => compact(v)}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderColor: 'var(--border-default)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                />
                <Area type="monotone" dataKey="tokensIn" name="Tokens in" stroke="var(--accent)" fill="url(#billingIn)" />
                <Area type="monotone" dataKey="tokensOut" name="Tokens out" stroke="var(--success)" fill="url(#billingOut)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* By-model breakdown — real tokens, no fabricated dollar costs */}
      <div className="p-6 bg-surface border border-default rounded-xl space-y-4">
        <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">Usage by model</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-tertiary">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : !usage || usage.byModel.length === 0 ? (
          <p className="text-xs text-tertiary">No model usage yet.</p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs font-bold text-tertiary uppercase tracking-wider border-b border-default">
                <th className="pb-3">Model</th>
                <th className="pb-3">Provider</th>
                <th className="pb-3 text-right">Tokens in</th>
                <th className="pb-3 text-right">Tokens out</th>
                <th className="pb-3 text-right">Calls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {usage.byModel.map((m, i) => (
                <tr key={i} className="text-sm">
                  <td className="py-3 font-mono text-primary">{m.model}</td>
                  <td className="py-3 text-secondary">{m.provider}</td>
                  <td className="py-3 text-right text-secondary">{compact(m.tokensIn)}</td>
                  <td className="py-3 text-right text-secondary">{compact(m.tokensOut)}</td>
                  <td className="py-3 text-right text-tertiary">{m.events}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Invoices — honest empty state: no billing backend exists on this instance */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">Invoice history</h3>
        <div className="bg-surface border border-default rounded-xl p-10 flex flex-col items-center gap-2 text-center">
          <Receipt size={28} className="text-tertiary opacity-40" />
          <p className="text-sm text-secondary">No invoices</p>
          <p className="text-xs text-tertiary max-w-sm">
            Billing isn&apos;t connected on this instance — Torsor is free and self-hostable by
            default. Bring your own model keys in the API Keys tab.
          </p>
        </div>
      </div>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}
