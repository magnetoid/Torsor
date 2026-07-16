import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { BarChart3, Loader2, RefreshCw } from 'lucide-react';
import { apiUsageSummary, type UsageSummary } from '../../lib/api';
import { Card } from '../shared/Card';
import { IconButton } from '../shared/IconButton';
import { cn } from '../../lib/utils';

function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-bold text-primary">{value}</div>
    </Card>
  );
}

export default function UsageTab() {
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await apiUsageSummary());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load usage');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-page">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-default px-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-primary">
          <BarChart3 size={13} className="text-accent" />
          Usage
        </div>
        <IconButton size="sm" onClick={() => void load()} title="Refresh">
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
        </IconButton>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {error ? (
          <div className="rounded-lg border border-error/20 bg-error/10 p-3 text-xs text-error">{error}</div>
        ) : !data ? (
          <div className="flex items-center gap-2 text-xs text-tertiary">
            <Loader2 size={14} className="animate-spin" /> Loading usage…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Tokens in" value={compact(data.totals.tokensIn)} />
              <Stat label="Tokens out" value={compact(data.totals.tokensOut)} />
              <Stat label="Model calls" value={compact(data.totals.events)} />
            </div>

            <Card className="p-4">
              <div className="mb-3 text-xs font-semibold text-primary">Tokens · last 30 days</div>
              {data.byDay.length === 0 ? (
                <p className="text-[11px] text-tertiary">No usage recorded yet.</p>
              ) : (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.byDay} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--success)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--success)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--border-subtle)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                        tickFormatter={(d: string) => d.slice(5)}
                        stroke="var(--border)"
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                        tickFormatter={(v: number) => compact(v)}
                        stroke="var(--border)"
                        width={44}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                        labelStyle={{ color: 'var(--text-secondary)' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="tokensIn"
                        name="Tokens in"
                        stroke="var(--accent)"
                        fill="url(#gIn)"
                        strokeWidth={2}
                      />
                      <Area
                        type="monotone"
                        dataKey="tokensOut"
                        name="Tokens out"
                        stroke="var(--success)"
                        fill="url(#gOut)"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-0 overflow-hidden">
              <div className="border-b border-default px-4 py-2.5 text-xs font-semibold text-primary">
                By model
              </div>
              {data.byModel.length === 0 ? (
                <p className="px-4 py-3 text-[11px] text-tertiary">No usage recorded yet.</p>
              ) : (
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="text-tertiary">
                      <th className="px-4 py-2 font-medium">Model</th>
                      <th className="px-4 py-2 font-medium">Provider</th>
                      <th className="px-4 py-2 text-right font-medium">In</th>
                      <th className="px-4 py-2 text-right font-medium">Out</th>
                      <th className="px-4 py-2 text-right font-medium">Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byModel.map((m, i) => (
                      <tr key={i} className="border-t border-subtle text-secondary">
                        <td className="px-4 py-2 font-mono text-primary">{m.model}</td>
                        <td className="px-4 py-2">{m.provider}</td>
                        <td className="px-4 py-2 text-right">{compact(m.tokensIn)}</td>
                        <td className="px-4 py-2 text-right">{compact(m.tokensOut)}</td>
                        <td className="px-4 py-2 text-right">{m.events}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
