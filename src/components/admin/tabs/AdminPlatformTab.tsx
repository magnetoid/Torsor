import React, { useEffect } from 'react';
import { Activity, Cpu, Server, BarChart3, Loader2 } from 'lucide-react';
import { useAdminStore } from '../../../stores/adminStore';

/**
 * Real platform health: loaded model providers, runtime workspace counts by status, and usage
 * token totals + per-provider breakdown. Backed by `/api/v1/admin/platform`. Per-model latency
 * and error rates are intentionally NOT shown — Torsor doesn't collect request telemetry yet
 * (see the observability roadmap); we don't fabricate them.
 */
const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}k` : String(n));

export function AdminPlatformTab() {
  const { platform, fetchPlatform } = useAdminStore();
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    void fetchPlatform().finally(() => setLoading(false));
  }, [fetchPlatform]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-secondary gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading platform stats…
      </div>
    );
  }
  if (!platform) {
    return <div className="flex items-center justify-center h-full text-secondary text-sm">Platform stats unavailable.</div>;
  }

  const totalTokens = platform.usageTotals.tokensIn + platform.usageTotals.tokensOut;

  return (
    <div className="flex flex-col h-full bg-page overflow-y-auto custom-scrollbar">
      <header className="h-12 px-6 flex items-center gap-2 border-b border-default bg-surface sticky top-0 z-20 shrink-0">
        <Activity size={16} className="text-accent" />
        <h2 className="text-sm font-bold text-primary">Platform</h2>
      </header>

      <div className="p-6 space-y-6 max-w-4xl">
        {/* Top-line real stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Cpu, label: 'Model providers', value: platform.providers.length },
            { icon: Server, label: 'Workspaces', value: platform.workspaces.total },
            { icon: Server, label: 'Running', value: platform.workspaces.byStatus['running'] ?? 0 },
            { icon: BarChart3, label: 'Total tokens', value: fmt(totalTokens) },
          ].map((s) => (
            <div key={s.label} className="bg-surface border border-default rounded-xl p-4">
              <div className="flex items-center gap-2 text-secondary mb-2"><s.icon size={14} /><span className="text-xs">{s.label}</span></div>
              <div className="text-2xl font-bold text-primary">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Loaded model providers */}
        <section>
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-3">Loaded model providers</h3>
          {platform.providers.length === 0 ? (
            <p className="text-sm text-tertiary">No model provider plugins are loaded.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {platform.providers.map((p) => (
                <span key={p} className="px-3 py-1 bg-surface border border-default rounded-lg text-xs font-mono text-primary">{p}</span>
              ))}
            </div>
          )}
        </section>

        {/* Usage by provider (real) */}
        <section>
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-3">Usage by provider</h3>
          {platform.usageByProvider.length === 0 ? (
            <p className="text-sm text-tertiary">No usage recorded yet.</p>
          ) : (
            <div className="border border-default rounded-xl overflow-hidden bg-surface">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-default bg-page/50 text-xs uppercase tracking-wider text-secondary">
                    <th className="px-6 py-3 font-medium">Provider</th>
                    <th className="px-6 py-3 font-medium">Calls</th>
                    <th className="px-6 py-3 font-medium">Tokens in</th>
                    <th className="px-6 py-3 font-medium">Tokens out</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default">
                  {platform.usageByProvider.map((u) => (
                    <tr key={u.provider} className="hover:bg-page/50 transition-colors">
                      <td className="px-6 py-3 font-medium text-primary">{u.provider}</td>
                      <td className="px-6 py-3 text-secondary">{u.calls}</td>
                      <td className="px-6 py-3 text-secondary font-mono">{fmt(u.tokensIn)}</td>
                      <td className="px-6 py-3 text-secondary font-mono">{fmt(u.tokensOut)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-[11px] text-tertiary">
          Per-model latency and error rates aren&apos;t shown — request telemetry isn&apos;t collected yet.
        </p>
      </div>
    </div>
  );
}
