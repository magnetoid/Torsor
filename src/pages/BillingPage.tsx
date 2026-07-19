import React, { useState, useEffect, useMemo } from 'react';
import {
  CreditCard,
  Check,
  Users,
  Sparkles,
  CreditCard as CardIcon,
  Calendar,
  TrendingUp,
  Clock,
  Box,
  ArrowUpRight
} from 'lucide-react';
import * as Progress from '@radix-ui/react-progress';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { cn } from '../lib/utils';
import { HomeLayout } from '../components/shell/HomeLayout';
import { Card } from '../components/shared/Card';
import { Badge } from '../components/shared/Badge';
import { apiUsageSummary, type UsageSummary } from '../lib/api';
import { useActiveWorkspace, useWorkspaceStore } from '../stores/workspaceStore';
import type { WorkspacePlan } from '../types/workspace';
import { toast } from 'sonner';

/** Compact token formatting for the usage widgets (1.2M / 34.5k / 812). */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

const PlanCard = ({
  title,
  price,
  features,
  isCurrent,
  isPopular,
  buttonText,
  gradient,
  borderClass = "border-default",
  onSelect,
  isBusy,
}: {
  title: string,
  price: string,
  features: string[],
  isCurrent?: boolean,
  isPopular?: boolean,
  buttonText: string,
  gradient?: boolean,
  borderClass?: string,
  onSelect?: () => void,
  isBusy?: boolean,
}) => (
  <Card className={cn(
    "flex-1 flex flex-col relative overflow-hidden",
    gradient ? "bg-gradient-to-br from-accent/10 to-transparent" : "bg-page",
    borderClass
  )}>
    {isPopular && (
      <Badge variant="accent" className="absolute top-4 right-4 uppercase tracking-wider">
        Most Popular
      </Badge>
    )}
    <h3 className="text-lg font-bold mb-1">{title}</h3>
    <div className="flex items-baseline gap-1 mb-6">
      <span className="text-2xl font-bold">{price}</span>
      {price !== 'Custom' && <span className="text-xs text-secondary">/mo</span>}
    </div>
    
    <ul className="space-y-3 mb-8 flex-1">
      {features.map((feature, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-primary">
          <Check size={14} className="text-success shrink-0 mt-0.5" />
          {feature}
        </li>
      ))}
    </ul>

    <button
      disabled={isCurrent || isBusy}
      onClick={onSelect}
      className={cn(
        "w-full py-2 rounded-md text-sm font-bold transition-all focus-ring disabled:opacity-60",
        isCurrent
          ? "bg-surface text-secondary cursor-not-allowed border border-default"
          : isPopular
            ? "bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/20"
            : "bg-surface hover:bg-elevated text-primary border border-default"
      )}
    >
      {isCurrent ? 'Current Plan' : isBusy ? 'Working…' : buttonText}
    </button>
  </Card>
);

const StatCard = ({ label, value, max, icon: Icon }: { label: string, value: string | number, max: string | number, icon: React.ElementType }) => {
  const percentage = typeof max === 'number' ? (Number(value) / max) * 100 : 0;
  
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-secondary">{label}</span>
        <Icon size={14} className="text-secondary" />
      </div>
      <div className="text-lg font-bold mb-2">
        {value} <span className="text-xs font-normal text-secondary">/ {max}</span>
      </div>
      {typeof max === 'number' && (
        <Progress.Root className="h-1.5 w-full bg-inset rounded-full overflow-hidden">
          <Progress.Indicator 
            className="h-full bg-accent transition-transform duration-500"
            style={{ transform: `translateX(-${100 - percentage}%)` }}
          />
        </Progress.Root>
      )}
    </Card>
  );
};

export const BillingPage: React.FC = () => {
  // Real per-user usage from the control plane (usage_events aggregation) — replaces the
  // previous mock chart data. Null → not loaded / no backend; widgets show an empty state.
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  useEffect(() => {
    apiUsageSummary().then(setUsage).catch(() => setUsage(null));
  }, []);
  const chartData = useMemo(
    () => (usage?.byDay ?? []).map((d) => ({ date: d.day.slice(5), In: d.tokensIn, Out: d.tokensOut })),
    [usage],
  );
  const totalTokens = (usage?.totals.tokensIn ?? 0) + (usage?.totals.tokensOut ?? 0);

  // Plan changes persist via PATCH /api/v1/teams/{id} (same path BillingModal and
  // UpgradeDialog use). Payment (Stripe) isn't wired yet — the plan field is the
  // source of truth and limits are derived from it.
  const activeWorkspace = useActiveWorkspace();
  const updateWorkspace = useWorkspaceStore((s) => s.updateWorkspace);
  const currentPlan = activeWorkspace?.plan;
  const [changingPlan, setChangingPlan] = useState<WorkspacePlan | null>(null);

  const handleChangePlan = async (plan: WorkspacePlan) => {
    if (!activeWorkspace) {
      toast.error('No active workspace to change the plan for');
      return;
    }
    if (activeWorkspace.plan === plan) return;
    if (plan === 'enterprise') {
      window.location.href = 'mailto:sales@torsor.dev?subject=Enterprise%20plan%20enquiry';
      return;
    }
    setChangingPlan(plan);
    try {
      await updateWorkspace(activeWorkspace.id, { plan });
      toast.success(`Switched to the ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change plan');
    } finally {
      setChangingPlan(null);
    }
  };

  const modelBreakdown = useMemo(() => {
    const rows = (usage?.byModel ?? []).map((m) => ({
      model: m.model || m.provider,
      tokens: m.tokensIn + m.tokensOut,
    }));
    rows.sort((a, b) => b.tokens - a.tokens);
    return rows.map((r) => ({ ...r, percentage: totalTokens > 0 ? Math.round((r.tokens / totalTokens) * 100) : 0 }));
  }, [usage, totalTokens]);

  return (
    // Standard page shell (HomeLayout) — this page used to carry its own third navigation
    // system (fake workspace picker, private nav, its own user footer).
    <HomeLayout title="Billing & Usage" mainClassName="flex-1 min-w-0 flex flex-col overflow-y-auto">
        <div className="flex-1 p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-12">
            
            {/* Plan Cards */}
            <section>
              <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-6">Subscription Plans</h3>
              <div className="flex flex-row gap-6">
                <PlanCard
                  title="Free"
                  price="$0"
                  isCurrent={currentPlan === 'free'}
                  isBusy={changingPlan === 'free'}
                  onSelect={() => handleChangePlan('free')}
                  features={[
                    "1 workspace",
                    "3 projects",
                    "50K tokens/mo",
                    "Gemini Flash + local only",
                    "10 sandbox hrs",
                    "Public projects only"
                  ]}
                  buttonText="Switch to Free"
                />
                <PlanCard
                  title="Pro"
                  price="$25"
                  isPopular
                  isCurrent={currentPlan === 'pro'}
                  isBusy={changingPlan === 'pro'}
                  onSelect={() => handleChangePlan('pro')}
                  borderClass="border-accent"
                  features={[
                    "Unlimited workspaces",
                    "25 projects",
                    "2M tokens/mo",
                    "All 6 agent models",
                    "100 sandbox hrs",
                    "Private projects",
                    "Custom domains"
                  ]}
                  buttonText="Upgrade to Pro"
                />
                <PlanCard
                  title="Team"
                  price="$49"
                  isCurrent={currentPlan === 'team'}
                  isBusy={changingPlan === 'team'}
                  onSelect={() => handleChangePlan('team')}
                  features={[
                    "Everything in Pro",
                    "Unlimited projects",
                    "10M tokens/mo",
                    "500 sandbox hrs",
                    "BYOK (Bring Your Own Key)",
                    "SSO / SAML",
                    "Audit logs & SLA"
                  ]}
                  buttonText="Upgrade to Team"
                />
                <PlanCard
                  title="Enterprise"
                  price="Custom"
                  gradient
                  isCurrent={currentPlan === 'enterprise'}
                  onSelect={() => handleChangePlan('enterprise')}
                  features={[
                    "Self-hosted option",
                    "Dedicated infrastructure",
                    "Model fine-tuning",
                    "Air-gapped deployment",
                    "24/7 Priority support"
                  ]}
                  buttonText="Contact Sales"
                />
              </div>
            </section>

            {/* Usage Dashboard */}
            <section>
              <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-6">Usage Overview</h3>
              <div className="grid grid-cols-4 gap-4 mb-8">
                <StatCard label="Tokens Used" value={formatTokens(totalTokens)} max="2M" icon={TrendingUp} />
                <StatCard label="Sandbox Hours" value="42" max="100" icon={Clock} />
                <StatCard label="Projects" value="8" max="25" icon={Box} />
                <StatCard label="Team Members" value="3" max="unlimited" icon={Users} />
              </div>

              <div className="grid grid-cols-3 gap-8">
                {/* Chart */}
                <Card className="col-span-2 space-y-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold">Token Usage (Last 30 Days)</h4>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-1.5 text-xs text-secondary">
                        <div className="w-2 h-2 rounded-full bg-accent" /> Tokens in
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-secondary">
                        <div className="w-2 h-2 rounded-full bg-info" /> Tokens out
                      </div>
                    </div>
                  </div>
                  <div className="h-[300px] w-full">
                    {chartData.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-secondary">
                        No usage recorded yet — run the agent to see tokens here.
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorOut" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--info)" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="var(--info)" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="date"
                            stroke="var(--text-tertiary)"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            stroke="var(--text-tertiary)"
                            fontSize={12}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => formatTokens(Number(value))}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', fontSize: '12px' }}
                            itemStyle={{ padding: '2px 0' }}
                          />
                          <Area type="monotone" dataKey="In" stackId="1" stroke="var(--accent)" fill="url(#colorIn)" />
                          <Area type="monotone" dataKey="Out" stackId="1" stroke="var(--info)" fill="url(#colorOut)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </Card>

                {/* Cost Breakdown */}
                <Card className="p-6">
                  <h4 className="text-sm font-bold mb-6">Model Breakdown</h4>
                  <div className="space-y-4">
                    {modelBreakdown.length === 0 && (
                      <p className="text-xs text-secondary">No model usage yet.</p>
                    )}
                    {modelBreakdown.map((item) => (
                      <div key={item.model} className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-primary truncate">{item.model}</span>
                          <span className="text-secondary shrink-0">{formatTokens(item.tokens)}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-inset rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent/50"
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-secondary w-8 text-right">{item.percentage}%</span>
                        </div>
                      </div>
                    ))}
                    <div className="pt-4 border-t border-default flex items-center justify-between">
                      <span className="text-sm font-bold">Total</span>
                      <span className="text-sm font-bold text-accent">{formatTokens(totalTokens)} tokens</span>
                    </div>
                  </div>
                </Card>
              </div>
            </section>

            {/* Billing Details */}
            <section className="grid grid-cols-3 gap-8 pb-12">
              <div className="col-span-1 space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4">Payment Method</h3>
                  <Card className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-6 bg-surface border border-default rounded flex items-center justify-center">
                        <CardIcon size={14} className="text-secondary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Visa **** 4242</p>
                        <p className="text-xs text-secondary">Expires 12/27</p>
                      </div>
                    </div>
                    <button className="text-xs font-bold text-accent hover:text-accent-hover focus-ring">Update</button>
                  </Card>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4">Next Billing Date</h3>
                  <Card className="flex items-center gap-3">
                    <Calendar size={18} className="text-accent" />
                    <div>
                      <p className="text-sm font-medium">March 28, 2026</p>
                      <p className="text-xs text-secondary">Estimated: $28.00</p>
                    </div>
                  </Card>
                </div>
              </div>

              <div className="col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-bold text-secondary uppercase tracking-wider">Invoice History</h3>
                </div>
                {/* No billing backend is connected — show an honest empty state rather than
                    fabricated invoices. Torsor is free and self-hostable by default. */}
                <Card className="p-8 text-center">
                  <p className="text-sm text-secondary">No invoices yet</p>
                  <p className="text-xs text-tertiary mt-1">
                    Billing isn&apos;t connected on this instance — Torsor is free and self-hostable by default.
                  </p>
                </Card>
              </div>
            </section>

          </div>
        </div>
    </HomeLayout>
  );
};
