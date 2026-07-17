import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { 
  LayoutGrid, 
  Layers, 
  Users, 
  CreditCard, 
  Settings, 
  LogOut, 
  ChevronDown,
  Check,
  Download,
  Sparkles,
  CreditCard as CardIcon,
  Calendar,
  TrendingUp,
  Clock,
  Box,
  ArrowUpRight
} from 'lucide-react';
import * as Select from '@radix-ui/react-select';
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
import { useAuthStore } from '../stores/authStore';
import { usageMock } from '../lib/mockData';
import { cn } from '../lib/utils';
import { AccountMenu } from '../components/shared/AccountMenu';
import { apiUsageSummary, type UsageSummary } from '../lib/api';

/** Compact token formatting for the usage widgets (1.2M / 34.5k / 812). */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

const NavItem = ({ icon: Icon, label, active, onClick }: { icon: React.ElementType, label: string, active?: boolean, onClick?: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all duration-200",
      active 
        ? "bg-accent/10 text-accent border-l-2 border-accent" 
        : "text-secondary hover:text-primary hover:bg-surface"
    )}
  >
    <Icon size={18} />
    {label}
  </button>
);

const PlanCard = ({ 
  title, 
  price, 
  features, 
  isCurrent, 
  isPopular, 
  buttonText, 
  gradient,
  borderClass = "border-default"
}: { 
  title: string, 
  price: string, 
  features: string[], 
  isCurrent?: boolean, 
  isPopular?: boolean, 
  buttonText: string,
  gradient?: boolean,
  borderClass?: string
}) => (
  <div className={cn(
    "flex-1 p-6 rounded-xl border flex flex-col relative overflow-hidden",
    gradient ? "bg-gradient-to-br from-accent/10 to-transparent" : "bg-page",
    borderClass
  )}>
    {isPopular && (
      <div className="absolute top-4 right-4 bg-accent text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
        Most Popular
      </div>
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
      disabled={isCurrent}
      className={cn(
        "w-full py-2 rounded-md text-sm font-bold transition-all",
        isCurrent 
          ? "bg-surface text-secondary cursor-not-allowed border border-default" 
          : isPopular
            ? "bg-accent hover:bg-accent-hover text-white shadow-lg shadow-accent/20"
            : "bg-surface hover:bg-elevated text-primary border border-default"
      )}
    >
      {isCurrent ? 'Current Plan' : buttonText}
    </button>
  </div>
);

const StatCard = ({ label, value, max, icon: Icon }: { label: string, value: string | number, max: string | number, icon: React.ElementType }) => {
  const percentage = typeof max === 'number' ? (Number(value) / max) * 100 : 0;
  
  return (
    <div className="bg-page border border-default rounded-xl p-4">
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
    </div>
  );
};

export const BillingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

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
  const modelBreakdown = useMemo(() => {
    const rows = (usage?.byModel ?? []).map((m) => ({
      model: m.model || m.provider,
      tokens: m.tokensIn + m.tokensOut,
    }));
    rows.sort((a, b) => b.tokens - a.tokens);
    return rows.map((r) => ({ ...r, percentage: totalTokens > 0 ? Math.round((r.tokens / totalTokens) * 100) : 0 }));
  }, [usage, totalTokens]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-inset text-primary font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-page border-r border-default flex flex-col shrink-0">
        <div className="p-4">
          <Select.Root defaultValue="personal">
            <Select.Trigger className="w-full flex items-center justify-between px-3 py-2 bg-surface border border-default rounded-md text-sm font-medium outline-none hover:border-accent/50 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 bg-accent rounded flex items-center justify-center text-[10px] text-white">T</div>
                <Select.Value />
              </div>
              <Select.Icon>
                <ChevronDown size={14} className="text-secondary" />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content className="bg-surface border border-default rounded-md shadow-xl z-50 overflow-hidden">
                <Select.Viewport className="p-1">
                  <Select.Item value="personal" className="flex items-center px-3 py-2 text-sm text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                    <Select.ItemText>Personal Workspace</Select.ItemText>
                  </Select.Item>
                  <Select.Item value="team" className="flex items-center px-3 py-2 text-sm text-primary hover:bg-accent-hover rounded cursor-pointer outline-none">
                    <Select.ItemText>Acme Team</Select.ItemText>
                  </Select.Item>
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </div>

        <nav className="flex-1 mt-4">
          <NavItem icon={LayoutGrid} label="Projects" onClick={() => navigate('/projects')} />
          <NavItem icon={CreditCard} label="Billing" active />
          <NavItem icon={Settings} label="Settings" onClick={() => navigate('/settings')} />
        </nav>

        <div className="p-4 border-t border-default">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center overflow-hidden">
              <img src={user?.avatarUrl || `https://ui-avatars.com/api/?name=${user?.name}`} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-[10px] text-secondary truncate">Pro Plan</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-secondary hover:text-error hover:bg-error/5 rounded transition-all"
          >
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b border-default bg-inset flex items-center justify-between px-8 shrink-0">
          <h2 className="text-xl font-bold tracking-tight">Billing & Usage</h2>
          <AccountMenu size="md" />
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-6xl mx-auto space-y-12">
            
            {/* Plan Cards */}
            <section>
              <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-6">Subscription Plans</h3>
              <div className="flex flex-row gap-6">
                <PlanCard 
                  title="Free"
                  price="$0"
                  features={[
                    "1 workspace",
                    "3 projects",
                    "50K tokens/mo",
                    "Gemini Flash + local only",
                    "10 sandbox hrs",
                    "Public projects only"
                  ]}
                  buttonText="Downgrade"
                />
                <PlanCard 
                  title="Pro"
                  price="$25"
                  isPopular
                  isCurrent
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
                  buttonText="Current Plan"
                />
                <PlanCard 
                  title="Team"
                  price="$49"
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
                <div className="col-span-2 bg-page border border-default rounded-xl p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-sm font-bold">Token Usage (Last 30 Days)</h4>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-1.5 text-[10px] text-secondary">
                        <div className="w-2 h-2 rounded-full bg-accent" /> Tokens in
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px] text-secondary">
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
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            stroke="var(--text-tertiary)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => formatTokens(Number(value))}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
                            itemStyle={{ padding: '2px 0' }}
                          />
                          <Area type="monotone" dataKey="In" stackId="1" stroke="var(--accent)" fill="url(#colorIn)" />
                          <Area type="monotone" dataKey="Out" stackId="1" stroke="var(--info)" fill="url(#colorOut)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Cost Breakdown */}
                <div className="bg-page border border-default rounded-xl p-6">
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
                          <span className="text-[10px] text-secondary w-8 text-right">{item.percentage}%</span>
                        </div>
                      </div>
                    ))}
                    <div className="pt-4 border-t border-default flex items-center justify-between">
                      <span className="text-sm font-bold">Total</span>
                      <span className="text-sm font-bold text-accent">{formatTokens(totalTokens)} tokens</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Billing Details */}
            <section className="grid grid-cols-3 gap-8 pb-12">
              <div className="col-span-1 space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4">Payment Method</h3>
                  <div className="bg-page border border-default rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-6 bg-surface border border-default rounded flex items-center justify-center">
                        <CardIcon size={14} className="text-secondary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Visa **** 4242</p>
                        <p className="text-[10px] text-secondary">Expires 12/27</p>
                      </div>
                    </div>
                    <button className="text-xs font-bold text-accent hover:text-accent-hover">Update</button>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4">Next Billing Date</h3>
                  <div className="bg-page border border-default rounded-xl p-4 flex items-center gap-3">
                    <Calendar size={18} className="text-accent" />
                    <div>
                      <p className="text-sm font-medium">March 28, 2026</p>
                      <p className="text-[10px] text-secondary">Estimated: $28.00</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-2">
                <h3 className="text-sm font-bold text-secondary uppercase tracking-wider mb-4">Invoice History</h3>
                <div className="bg-page border border-default rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-default bg-surface/50">
                        <th className="px-6 py-3 font-medium text-secondary text-xs uppercase tracking-wider">Invoice ID</th>
                        <th className="px-6 py-3 font-medium text-secondary text-xs uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 font-medium text-secondary text-xs uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 font-medium text-secondary text-xs uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 font-medium text-secondary text-xs uppercase tracking-wider text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-default">
                      {usageMock.invoices.map((invoice) => (
                        <tr key={invoice.id} className="hover:bg-surface transition-colors">
                          <td className="px-6 py-4 font-mono text-xs">{invoice.id}</td>
                          <td className="px-6 py-4 text-secondary">{invoice.date}</td>
                          <td className="px-6 py-4 font-medium">{invoice.amount}</td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                              invoice.status === 'paid' ? "bg-success/10 text-success border border-success/20" : "bg-warning/10 text-warning border border-warning/20"
                            )}>
                              {invoice.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button className="p-1.5 text-secondary hover:text-primary transition-colors">
                              <Download size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

          </div>
        </div>
      </main>
    </div>
  );
};
