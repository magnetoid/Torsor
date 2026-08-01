import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollText, RefreshCw, Search, Trash2, AlertTriangle, XCircle, Info,
  ChevronRight, ChevronDown, Server, Monitor, Loader2, Copy, Check,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { apiRequest } from '../../../lib/api';
import { toast } from 'sonner';

/**
 * The log console: one queryable view of every notable event from both the Go control plane
 * and the browser, correlated by request id.
 *
 * Two design rules here. Backend and frontend events share one stream — splitting them would
 * hide exactly the correlation that makes an incident legible. And the console reports what
 * the collector *lost* (dropped/failed counts) rather than presenting a truncated view as
 * complete; a diagnostic tool that quietly omits data is worse than none.
 */

interface LogRow {
  id: string;
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: 'backend' | 'frontend';
  message: string;
  logger: string;
  requestId: string;
  userId: string | null;
  userEmail: string | null;
  projectId: string | null;
  method: string;
  route: string;
  status: number | null;
  durationMs: number | null;
  error: string;
  stack: string;
  fields: Record<string, unknown>;
  release: string;
  ip: string;
  userAgent: string;
}

interface LogsResponse {
  items: LogRow[];
  limit: number;
  dropped: number;
  failed: number;
}

interface StatsResponse {
  counts: Record<string, number>;
  topErrorRoutes: { route: string; count: number }[];
  total: number;
  windowSeconds: number;
}

const LEVEL_STYLE: Record<string, { icon: React.ElementType; cls: string }> = {
  error: { icon: XCircle, cls: 'text-error bg-error/10 border-error/20' },
  warn: { icon: AlertTriangle, cls: 'text-warning bg-warning/10 border-warning/20' },
  info: { icon: Info, cls: 'text-info bg-info/10 border-info/20' },
  debug: { icon: Info, cls: 'text-tertiary bg-elevated border-default' },
};

const WINDOWS = [
  { label: 'Last hour', value: '1h' },
  { label: 'Last 24h', value: '24h' },
  { label: 'Last 7 days', value: '168h' },
  { label: 'All time', value: '' },
];

export default function AdminLogsTab() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState({ dropped: 0, failed: 0 });

  const [level, setLevel] = useState('warn');
  const [source, setSource] = useState('all');
  const [since, setSince] = useState('24h');
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (level !== 'all') p.set('level', level);
    if (source !== 'all') p.set('source', source);
    if (since) p.set('since', since);
    if (applied) p.set('q', applied);
    p.set('limit', '200');
    return p.toString();
  }, [level, source, since, applied]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [logs, st] = await Promise.all([
        apiRequest<LogsResponse>(`/api/v1/admin/logs?${params}`, { auth: true }),
        apiRequest<StatsResponse>(`/api/v1/admin/logs/stats?since=${since || '720h'}`, { auth: true }),
      ]);
      setRows(logs.items ?? []);
      setDropped({ dropped: logs.dropped ?? 0, failed: logs.failed ?? 0 });
      setStats(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load logs');
    } finally {
      setLoading(false);
    }
  }, [params, since]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => void load(), 5000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const purge = async (olderThan?: string) => {
    const what = olderThan ? 'logs older than 30 days' : 'ALL logs';
    if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return;
    try {
      const res = await apiRequest<{ deleted: number }>(
        `/api/v1/admin/logs${olderThan ? `?olderThan=${olderThan}` : ''}`,
        { method: 'DELETE', auth: true },
      );
      toast.success(`Deleted ${res.deleted} log ${res.deleted === 1 ? 'row' : 'rows'}`);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Purge failed');
    }
  };

  const copyRow = async (row: LogRow) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(row, null, 2));
      setCopied(row.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };

  const counts = stats?.counts ?? {};

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <ScrollText size={20} className="text-accent" />
            Logs
          </h1>
          <p className="text-sm text-secondary mt-1">
            Errors and warnings from the control plane and the browser, in one stream.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-[var(--color-accent)]"
            />
            Auto-refresh
          </label>
          <button
            onClick={() => void load()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-default text-xs font-bold text-secondary hover:text-primary hover:border-accent transition-colors focus-ring"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Errors', value: counts.error ?? 0, cls: 'text-error' },
          { label: 'Warnings', value: counts.warn ?? 0, cls: 'text-warning' },
          { label: 'From backend', value: (counts['backend:error'] ?? 0) + (counts['backend:warn'] ?? 0), cls: 'text-primary' },
          { label: 'From browser', value: (counts['frontend:error'] ?? 0) + (counts['frontend:warn'] ?? 0), cls: 'text-primary' },
        ].map((c) => (
          <div key={c.label} className="bg-surface border border-default rounded-xl p-4">
            <p className="text-xs text-tertiary uppercase tracking-wider font-bold">{c.label}</p>
            <p className={cn('text-2xl font-bold mt-1', c.cls)}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* The collector admits to gaps rather than pretending the view is complete. */}
      {(dropped.dropped > 0 || dropped.failed > 0) && (
        <div className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-xs text-warning">
          This view is incomplete: {dropped.dropped} record(s) were dropped because the log queue
          filled, and {dropped.failed} could not be written. Logging never blocks a request, so
          under heavy error volume some events are discarded by design.
        </div>
      )}

      {stats && stats.topErrorRoutes.length > 0 && (
        <div className="bg-surface border border-default rounded-xl p-4">
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">Noisiest routes</h3>
          <div className="space-y-1">
            {stats.topErrorRoutes.map((t) => (
              <button
                key={t.route}
                onClick={() => { setQuery(t.route); setApplied(t.route); }}
                className="w-full flex items-center justify-between text-xs hover:bg-elevated rounded px-2 py-1 transition-colors focus-ring text-left"
              >
                <span className="font-mono text-secondary truncate">{t.route}</span>
                <span className="text-error font-bold shrink-0 ml-2">{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-surface border border-default rounded-xl p-4 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => { e.preventDefault(); setApplied(query.trim()); }}
          className="flex-1 min-w-[200px] relative"
        >
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-tertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search message, error, or route…"
            className="w-full bg-page border border-default rounded-lg pl-9 pr-3 py-2 text-xs text-primary focus:border-accent outline-none"
          />
        </form>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary focus:border-accent outline-none"
          aria-label="Minimum level"
        >
          <option value="error">Errors only</option>
          <option value="warn">Warnings and errors</option>
          <option value="info">Info and above</option>
          <option value="all">All levels</option>
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary focus:border-accent outline-none"
          aria-label="Source"
        >
          <option value="all">Both sources</option>
          <option value="backend">Backend</option>
          <option value="frontend">Browser</option>
        </select>
        <select
          value={since}
          onChange={(e) => setSince(e.target.value)}
          className="bg-page border border-default rounded-lg px-3 py-2 text-xs text-primary focus:border-accent outline-none"
          aria-label="Time window"
        >
          {WINDOWS.map((wdw) => <option key={wdw.label} value={wdw.value}>{wdw.label}</option>)}
        </select>
        <button
          onClick={() => void purge('720h')}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-default text-xs font-bold text-secondary hover:text-primary hover:border-accent transition-colors focus-ring"
        >
          <Trash2 size={13} />
          Purge &gt;30d
        </button>
        <button
          onClick={() => void purge()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-error/30 text-xs font-bold text-error hover:bg-error/10 transition-colors focus-ring"
        >
          <Trash2 size={13} />
          Purge all
        </button>
      </div>

      {/* Stream */}
      <div className="bg-surface border border-default rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex items-center justify-center gap-2 text-sm text-secondary">
            <Loader2 size={16} className="animate-spin" /> Loading logs…
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-error">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center">
            <ScrollText size={28} className="text-tertiary opacity-40 mx-auto mb-3" />
            <p className="text-sm text-primary font-semibold">Nothing logged in this window</p>
            <p className="text-xs text-tertiary mt-1 max-w-md mx-auto">
              Only warnings and above are persisted by default, so an empty list here means the
              platform has been quiet. Set <code className="font-mono">LOG_DB_LEVEL=info</code> to
              widen capture while investigating.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-default)]">
            {rows.map((row) => {
              const style = LEVEL_STYLE[row.level] ?? LEVEL_STYLE.info;
              const Icon = style.icon;
              const open = expanded === row.id;
              return (
                <div key={row.id}>
                  <button
                    onClick={() => setExpanded(open ? null : row.id)}
                    className="w-full px-4 py-2.5 flex items-start gap-3 hover:bg-elevated transition-colors text-left focus-ring"
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown size={14} className="text-tertiary mt-0.5 shrink-0" />
                          : <ChevronRight size={14} className="text-tertiary mt-0.5 shrink-0" />}
                    <span className={cn('px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider shrink-0 flex items-center gap-1', style.cls)}>
                      <Icon size={10} />
                      {row.level}
                    </span>
                    <span
                      className="shrink-0 text-tertiary mt-0.5"
                      title={row.source === 'backend' ? 'Control plane' : 'Browser'}
                    >
                      {row.source === 'backend' ? <Server size={12} /> : <Monitor size={12} />}
                    </span>
                    <span className="text-xs text-primary min-w-0 flex-1 truncate">{row.message}</span>
                    {row.route && (
                      <span className="text-[11px] font-mono text-tertiary shrink-0 hidden md:inline truncate max-w-[240px]">
                        {row.method} {row.route}
                      </span>
                    )}
                    {row.status !== null && (
                      <span className={cn('text-[11px] font-mono shrink-0', row.status >= 500 ? 'text-error' : 'text-tertiary')}>
                        {row.status}
                      </span>
                    )}
                    <span className="text-[11px] text-tertiary shrink-0 tabular-nums">
                      {new Date(row.ts).toLocaleTimeString()}
                    </span>
                  </button>

                  {open && (
                    <div className="px-4 pb-4 pl-11 space-y-3 bg-page/50">
                      <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                        {[
                          ['Time', new Date(row.ts).toLocaleString()],
                          ['Logger', row.logger],
                          ['Request id', row.requestId],
                          ['User', row.userEmail ?? row.userId ?? ''],
                          ['Project', row.projectId ?? ''],
                          ['Duration', row.durationMs !== null ? `${row.durationMs} ms` : ''],
                          ['Release', row.release],
                          ['IP', row.ip],
                        ].filter(([, v]) => v).map(([k, v]) => (
                          <div key={k} className="min-w-0">
                            <dt className="text-tertiary uppercase tracking-wider font-bold">{k}</dt>
                            <dd className="text-secondary font-mono truncate" title={String(v)}>{v}</dd>
                          </div>
                        ))}
                      </dl>

                      {row.error && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider font-bold text-tertiary mb-1">Error</p>
                          <p className="text-xs font-mono text-error break-all">{row.error}</p>
                        </div>
                      )}
                      {row.stack && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider font-bold text-tertiary mb-1">Stack</p>
                          <pre className="text-[11px] font-mono bg-elevated border border-default rounded-md p-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-secondary">
                            {row.stack}
                          </pre>
                        </div>
                      )}
                      {row.fields && Object.keys(row.fields).length > 0 && (
                        <div>
                          <p className="text-[10px] uppercase tracking-wider font-bold text-tertiary mb-1">Fields</p>
                          <pre className="text-[11px] font-mono bg-elevated border border-default rounded-md p-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-secondary">
                            {JSON.stringify(row.fields, null, 2)}
                          </pre>
                        </div>
                      )}
                      {row.userAgent && (
                        <p className="text-[10px] text-tertiary font-mono break-all">{row.userAgent}</p>
                      )}

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => void copyRow(row)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-default text-[11px] font-bold text-secondary hover:text-primary hover:border-accent transition-colors focus-ring"
                        >
                          {copied === row.id ? <Check size={11} className="text-success" /> : <Copy size={11} />}
                          {copied === row.id ? 'Copied' : 'Copy JSON'}
                        </button>
                        {/* The correlation move: one click to see everything — backend and
                            browser — that happened during this request. */}
                        {row.requestId && (
                          <button
                            onClick={() => { setQuery(''); setApplied(''); setLevel('all'); setSource('all'); setExpanded(null); void findByRequest(row.requestId, setRows, setError); }}
                            className="px-2.5 py-1 rounded-lg border border-default text-[11px] font-bold text-secondary hover:text-primary hover:border-accent transition-colors focus-ring"
                          >
                            Trace this request
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Pull every record sharing a request id — the backend 500 and the browser error it caused. */
async function findByRequest(
  requestId: string,
  setRows: (r: LogRow[]) => void,
  setError: (e: string | null) => void,
): Promise<void> {
  try {
    const res = await apiRequest<LogsResponse>(
      `/api/v1/admin/logs?requestId=${encodeURIComponent(requestId)}&level=all&limit=200`,
      { auth: true },
    );
    setRows(res.items ?? []);
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Could not trace request');
  }
}
