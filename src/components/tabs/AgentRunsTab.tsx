import React, { useEffect, useState } from 'react';
import {
  Activity,
  Loader2,
  Play,
  RefreshCw,
  StopCircle,
  Wrench,
  CheckCircle2,
  AlertCircle,
  ClipboardList,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useRunsStore } from '../../stores/runsStore';
import { useProjectStore } from '../../stores/projectStore';
import { Badge } from '../shared/Badge';
import { IconButton } from '../shared/IconButton';
import { Button } from '../shared/Button';
import type { AgentEvent, TaskSummary } from '../../lib/api';

function statusVariant(status: TaskSummary['status']) {
  switch (status) {
    case 'processing':
      return 'accent' as const;
    case 'completed':
      return 'success' as const;
    case 'failed':
      return 'error' as const;
    case 'cancelled':
      return 'warning' as const;
    default:
      return 'muted' as const;
  }
}

function RunEventRow({ event }: { event: AgentEvent }) {
  if (event.kind === 'plan' && event.plan?.length) {
    return (
      <div className="rounded-lg border border-default bg-surface p-2">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
          <ClipboardList size={12} className="text-accent" /> Proposed plan
        </div>
        <ol className="space-y-1 pl-1">
          {event.plan.map((s, i) => (
            <li key={i} className="flex gap-2 text-[11px] text-secondary">
              <span className="font-mono text-accent">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (event.kind === 'thought' && event.text) {
    return <p className="px-1 text-[11px] italic leading-relaxed text-tertiary">{event.text}</p>;
  }
  if (event.kind === 'tool_call') {
    const args = event.args
      ? Object.entries(event.args)
          .map(([k, v]) => `${k}=${v.length > 48 ? v.slice(0, 48) + '…' : v}`)
          .join(' ')
      : '';
    const isMcp = event.tool?.startsWith('mcp:');
    return (
      <div className="flex items-center gap-1.5 px-1 font-mono text-[11px] text-secondary">
        <Wrench size={11} className="shrink-0 text-accent" />
        {isMcp && <Badge variant="accent">MCP</Badge>}
        <span className="truncate">
          {event.tool}({args})
        </span>
      </div>
    );
  }
  if (event.kind === 'tool_result') {
    return (
      <pre className="overflow-x-auto rounded-md border border-default bg-page px-2 py-1.5 text-[10.5px] leading-relaxed text-secondary">
        <code>{event.result}</code>
      </pre>
    );
  }
  if (event.kind === 'final' && event.text) {
    return (
      <div className="rounded-lg border border-default bg-surface p-2.5 text-xs leading-relaxed text-primary">
        {event.text}
      </div>
    );
  }
  if (event.kind === 'error' && event.text) {
    return (
      <div className="flex gap-2 rounded-lg border border-error/20 bg-error/10 p-2 text-[11px] text-error">
        <AlertCircle size={13} className="shrink-0" />
        <span>{event.text}</span>
      </div>
    );
  }
  return null;
}

function RunComposer() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const startRun = useRunsStore((s) => s.startRun);
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!task.trim() || !activeProjectId || busy) return;
    setBusy(true);
    try {
      await startRun(activeProjectId, task);
      setTask('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-default p-3">
      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit();
        }}
        placeholder={
          activeProjectId ? 'Describe a task to run in the background…' : 'Open a project to start a run'
        }
        disabled={!activeProjectId}
        rows={2}
        className="w-full resize-none rounded-lg border border-default bg-page px-3 py-2 text-xs text-primary placeholder:text-tertiary outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-tertiary">Runs continue even if you close this tab.</span>
        <Button size="sm" onClick={() => void submit()} disabled={!task.trim() || !activeProjectId || busy}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
          Run in background
        </Button>
      </div>
    </div>
  );
}

export default function AgentRunsTab() {
  const { runs, loading, loadRuns, select, selectedId, detail, detailEvents, attaching, cancel } =
    useRunsStore();

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const selectedTerminal =
    detail && (detail.status === 'completed' || detail.status === 'failed' || detail.status === 'cancelled');

  return (
    <div className="flex h-full min-h-0 bg-page">
      {/* Runs list */}
      <div className="flex w-[320px] shrink-0 flex-col border-r border-default">
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-default px-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <Activity size={13} className="text-accent" />
            Agent Runs
          </div>
          <IconButton size="sm" onClick={() => void loadRuns()} title="Refresh">
            <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
          </IconButton>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {runs.length === 0 && !loading ? (
            <div className="p-4 text-center text-[11px] text-tertiary">
              No runs yet. Start one below — it runs in the background.
            </div>
          ) : (
            runs.map((r) => (
              <button
                key={r.id}
                onClick={() => void select(r.id)}
                className={cn(
                  'flex w-full flex-col gap-1 border-b border-subtle px-3 py-2.5 text-left transition-colors duration-fast ease-standard hover:bg-surface',
                  selectedId === r.id && 'bg-surface'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={statusVariant(r.status)}>
                    {r.status === 'processing' && <Loader2 size={9} className="animate-spin" />}
                    {r.status}
                  </Badge>
                  <span className="text-[10px] text-tertiary">
                    {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="line-clamp-2 text-[11px] leading-snug text-secondary">{r.prompt}</p>
                {(r.steps > 0 || r.tokens_out > 0) && (
                  <div className="flex gap-2 text-[9.5px] text-tertiary">
                    {r.steps > 0 && <span>{r.steps} steps</span>}
                    {r.model && <span>· {r.model}</span>}
                    {r.tokens_out > 0 && <span>· {r.tokens_in + r.tokens_out} tok</span>}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
        <RunComposer />
      </div>

      {/* Run detail */}
      <div className="flex flex-1 flex-col min-h-0">
        {!selectedId ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-tertiary">
            <Activity size={28} strokeWidth={1.5} />
            <p className="text-xs">Select a run to view its transcript</p>
          </div>
        ) : (
          <>
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-default px-4">
              <div className="flex items-center gap-2">
                {detail && <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge>}
                {attaching && (
                  <span className="flex items-center gap-1 text-[10px] text-tertiary">
                    <Loader2 size={10} className="animate-spin" /> live
                  </span>
                )}
              </div>
              {detail && !selectedTerminal && (
                <Button size="sm" variant="ghost" onClick={() => void cancel(detail.id)}>
                  <StopCircle size={12} /> Cancel
                </Button>
              )}
            </div>
            <div className="flex-1 min-h-0 space-y-2 overflow-y-auto p-4">
              {detail && (
                <p className="rounded-lg border border-default bg-surface p-2.5 text-xs text-primary">
                  {detail.prompt}
                </p>
              )}
              {detailEvents.length === 0 && !attaching ? (
                <p className="text-[11px] text-tertiary">No steps recorded.</p>
              ) : (
                detailEvents.map((e, i) => <RunEventRow key={`${e.step}-${e.kind}-${i}`} event={e} />)
              )}
              {detail?.status === 'processing' && detailEvents.length === 0 && (
                <div className="flex items-center gap-2 text-[11px] text-tertiary">
                  <Loader2 size={12} className="animate-spin" /> Waiting for the agent to start…
                </div>
              )}
              {detail?.error && (
                <div className="flex gap-2 rounded-lg border border-error/20 bg-error/10 p-2 text-[11px] text-error">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>{detail.error}</span>
                </div>
              )}
              {selectedTerminal && detail?.status === 'completed' && (
                <div className="flex items-center gap-1.5 text-[11px] text-success">
                  <CheckCircle2 size={13} /> Run completed
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
