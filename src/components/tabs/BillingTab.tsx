import React, { useState } from 'react';
import { 
  CreditCard, 
  Sparkles, 
  Zap, 
  Grid, 
  Database, 
  Users, 
  TrendingUp, 
  Download, 
  Check, 
  ChevronRight,
  ArrowUpRight,
  DollarSign,
  Plus
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import { useActiveWorkspace } from '../../stores/workspaceStore';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';
import { UpgradeDialog } from '../shared/UpgradeDialog';

const MOCK_CHART_DATA = [
  { date: 'Mar 01', claude: 45000, gpt: 32000, deepseek: 12000, gemini: 8000 },
  { date: 'Mar 05', claude: 52000, gpt: 28000, deepseek: 15000, gemini: 12000 },
  { date: 'Mar 10', claude: 48000, gpt: 35000, deepseek: 18000, gemini: 15000 },
  { date: 'Mar 15', claude: 65000, gpt: 42000, deepseek: 25000, gemini: 22000 },
  { date: 'Mar 20', claude: 58000, gpt: 38000, deepseek: 22000, gemini: 18000 },
  { date: 'Mar 21', claude: 72000, gpt: 45000, deepseek: 30000, gemini: 25000 },
];

const MOCK_INVOICES = [
  { id: 'inv-1', date: 'Mar 01, 2026', amount: '$20.00', status: 'paid' },
  { id: 'inv-2', date: 'Feb 01, 2026', amount: '$20.00', status: 'paid' },
  { id: 'inv-3', date: 'Jan 01, 2026', amount: '$20.00', status: 'paid' },
];

export function BillingTab() {
  const activeWorkspace = useActiveWorkspace();
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const usage = [
    { label: 'Tokens', icon: Zap, current: '1.2M', limit: '2M', percentage: 60, color: 'bg-accent' },
    { label: 'Projects', icon: Grid, current: '8', limit: '25', percentage: 32, color: 'bg-success' },
    { label: 'Storage', icon: Database, current: '340MB', limit: '5GB', percentage: 7, color: 'bg-success' },
    { label: 'Members', icon: Users, current: '4', limit: '5', percentage: 80, color: 'bg-warning' },
  ];

  const handleBuyTokens = (amount: string) => {
    toast.success(`${amount} tokens added to your balance!`);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Current Plan Card */}
      <div className="p-6 bg-gradient-to-br from-accent to-indigo-600 rounded-3xl text-white relative overflow-hidden shadow-xl shadow-accent/20">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-wider border border-white/30">
                {activeWorkspace?.plan} Plan
              </div>
              <div className="text-2xl font-bold">$20/mo</div>
            </div>
            <div>
              <h2 className="text-3xl font-bold">Pro Workspace</h2>
              <p className="text-sm mt-2 opacity-90 max-w-md">
                Next billing date: <span className="font-bold">April 1, 2026</span> via Visa •••• 4242
              </p>
            </div>
          </div>
          <button 
            onClick={() => setUpgradeOpen(true)}
            className="bg-white text-accent px-6 py-3 rounded-2xl font-bold text-sm hover:bg-opacity-90 transition-all shadow-lg flex items-center gap-2 w-fit"
          >
            Change Plan
            <ChevronRight size={18} />
          </button>
        </div>
        <Sparkles className="absolute right-[-20px] bottom-[-20px] w-64 h-64 opacity-10 rotate-12" />
      </div>

      {/* Usage Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {usage.map((item) => (
          <div key={item.label} className="p-4 bg-surface border border-default rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-elevated flex items-center justify-center text-secondary">
                <item.icon size={18} />
              </div>
              <span className="text-xs font-bold text-secondary uppercase tracking-wider">{item.label}</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <div className="text-lg font-bold text-primary">{item.current}</div>
                <div className="text-[10px] text-tertiary font-bold uppercase">/ {item.limit}</div>
              </div>
              <div className="h-1.5 w-full bg-elevated rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-500",
                    item.percentage > 85 ? "bg-error" : item.percentage > 60 ? "bg-warning" : "bg-success"
                  )} 
                  style={{ width: `${item.percentage}%` }} 
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Token Usage Chart */}
      <div className="p-6 bg-surface border border-default rounded-3xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-accent" size={20} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Token Usage (30 Days)</h3>
            {/* Honest label: this chart + the invoices below are not backend-driven yet
                (real usage lives in the Usage tab / Billing page summary). */}
            <span className="text-[10px] font-medium text-tertiary border border-default rounded px-1.5 py-0.5 uppercase tracking-wider">Sample data</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-accent" />
              <span className="text-[10px] font-bold text-secondary uppercase">Claude</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-info" />
              <span className="text-[10px] font-bold text-secondary uppercase">GPT</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-warning" />
              <span className="text-[10px] font-bold text-secondary uppercase">DeepSeek</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-[10px] font-bold text-secondary uppercase">Gemini</span>
            </div>
          </div>
        </div>

        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={MOCK_CHART_DATA}>
              <defs>
                <linearGradient id="colorClaude" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} 
              />
              <RechartsTooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--bg-elevated)', 
                  borderColor: 'var(--border-default)',
                  borderRadius: '12px',
                  fontSize: '12px'
                }}
              />
              <Area type="monotone" dataKey="claude" stackId="1" stroke="var(--accent)" fill="url(#colorClaude)" />
              <Area type="monotone" dataKey="gpt" stackId="1" stroke="var(--info)" fill="var(--info)" fillOpacity={0.1} />
              <Area type="monotone" dataKey="deepseek" stackId="1" stroke="var(--warning)" fill="var(--warning)" fillOpacity={0.1} />
              <Area type="monotone" dataKey="gemini" stackId="1" stroke="var(--success)" fill="var(--success)" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost Breakdown & Buy Tokens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 bg-surface border border-default rounded-3xl space-y-4">
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">Cost Breakdown</h3>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] font-bold text-tertiary uppercase tracking-wider border-b border-default">
                <th className="pb-3">Model</th>
                <th className="pb-3">Tokens Used</th>
                <th className="pb-3">Cost</th>
                <th className="pb-3 text-right">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {[
                { model: 'Claude 3.5 Sonnet', tokens: '640K', cost: '$9.60', percent: 48 },
                { model: 'GPT-4o', tokens: '320K', cost: '$4.80', percent: 24 },
                { model: 'DeepSeek V3', tokens: '180K', cost: '$1.20', percent: 6 },
                { model: 'Gemini 1.5 Pro', tokens: '60K', cost: '$0.90', percent: 4.5 },
              ].map((row) => (
                <tr key={row.model} className="text-sm">
                  <td className="py-3 font-medium text-primary">{row.model}</td>
                  <td className="py-3 text-secondary">{row.tokens}</td>
                  <td className="py-3 text-primary font-bold">{row.cost}</td>
                  <td className="py-3 text-right text-tertiary">{row.percent}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-sm font-bold border-t border-default">
                <td className="pt-3 text-primary">Total</td>
                <td className="pt-3 text-secondary">1.2M</td>
                <td className="pt-3 text-accent">$16.50</td>
                <td className="pt-3 text-right text-tertiary">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="p-6 bg-accent/5 border border-accent/10 rounded-3xl space-y-6">
          <div className="flex items-center gap-2">
            <DollarSign className="text-accent" size={20} />
            <h3 className="text-sm font-bold uppercase tracking-wider">Buy More Tokens</h3>
          </div>
          <p className="text-xs text-secondary leading-relaxed">
            Running low? Purchase additional token credits to keep your agent running without interruption.
          </p>
          <div className="space-y-3">
            {[
              { amount: '100K', price: '$5' },
              { amount: '500K', price: '$20' },
              { amount: '1M', price: '$35' },
            ].map((pkg) => (
              <button 
                key={pkg.amount}
                onClick={() => handleBuyTokens(pkg.amount)}
                className="w-full flex items-center justify-between p-3 bg-surface border border-default rounded-xl hover:border-accent hover:bg-accent/5 transition-all group"
              >
                <div className="flex flex-col items-start">
                  <span className="text-sm font-bold text-primary">{pkg.amount} Tokens</span>
                  <span className="text-[10px] text-tertiary uppercase font-bold tracking-wider">{pkg.price} One-time</span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all">
                  <Plus size={16} />
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Invoice History */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">Invoice History</h3>
          <span className="text-[10px] font-medium text-tertiary border border-default rounded px-1.5 py-0.5 uppercase tracking-wider">Sample data</span>
        </div>
        <div className="bg-surface border border-default rounded-2xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-default bg-elevated/50">
                <th className="px-6 py-3 text-[10px] font-bold text-secondary uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-[10px] font-bold text-secondary uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-[10px] font-bold text-secondary uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-[10px] font-bold text-secondary uppercase tracking-wider text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {MOCK_INVOICES.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-elevated/30 transition-colors">
                  <td className="px-6 py-3 text-sm text-primary">{invoice.date}</td>
                  <td className="px-6 py-3 text-sm font-bold text-primary">{invoice.amount}</td>
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-success/10 text-success text-[10px] font-bold uppercase w-fit">
                      <Check size={10} />
                      {invoice.status}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button className="p-2 hover:bg-elevated rounded-lg text-tertiary hover:text-accent transition-colors">
                      <Download size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}
