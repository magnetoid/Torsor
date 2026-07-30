import React, { useState } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Play,
  RotateCcw,
  Loader2,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  Zap,
  MinusCircle,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useChatStore } from '../../stores/chatStore';
import { useEditorStore } from '../../stores/editorStore';
import { useAppStore } from '../../useAppStore';
import { apiRequest } from '../../lib/api';

/**
 * Real security scanning. This tab used to fake a progress animation and display three
 * hardcoded findings; it now runs actual scanners inside the project's workspace via
 * POST /workspace/scan — the same secret detectors that gate publishing, plus whichever
 * OSS dependency scanners the workspace image provides. Scanners that aren't installed
 * are reported as unavailable rather than quietly skipped, so "no issues" is honest.
 */

type ScanState = 'idle' | 'scanning' | 'results' | 'error';

interface SecurityIssue {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  file: string;
  line?: number;
  description: string;
  source: string;
}

interface ScannerResult {
  name: string;
  ran: boolean;
  available: boolean;
  detail: string;
}

const SEVERITY_STYLE: Record<SecurityIssue['severity'], { icon: React.ElementType; cls: string; label: string }> = {
  critical: { icon: XCircle, cls: 'text-error bg-error/10 border-error/20', label: 'Critical' },
  warning: { icon: AlertTriangle, cls: 'text-warning bg-warning/10 border-warning/20', label: 'Warning' },
  info: { icon: Info, cls: 'text-info bg-info/10 border-info/20', label: 'Info' },
};

export default function SecurityScanTab() {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [issues, setIssues] = useState<SecurityIssue[]>([]);
  const [scanners, setScanners] = useState<ScannerResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { openFile } = useEditorStore();
  const workspaceProjectId = useAppStore((s) => s.workspaceProjectId);

  const startScan = async () => {
    if (!workspaceProjectId) return;
    setScanState('scanning');
    setError(null);
    try {
      const res = await apiRequest<{ issues: SecurityIssue[]; scanners: ScannerResult[] }>(
        `/api/v1/projects/${workspaceProjectId}/workspace/scan`,
        { method: 'POST', auth: true },
      );
      setIssues(res.issues ?? []);
      setScanners(res.scanners ?? []);
      setScanState('results');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed');
      setScanState('error');
    }
  };

  // Handing a finding to the agent is the one thing that was already real here.
  const handleFix = (issue: SecurityIssue) => {
    if (!workspaceProjectId) return;
    const where = issue.line ? `${issue.file} at line ${issue.line}` : issue.file;
    void useChatStore.getState().runAgent(
      workspaceProjectId,
      `Fix the following security issue in ${where}: ${issue.title}. ${issue.description}`,
    );
  };

  if (!workspaceProjectId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-page p-8 text-center">
        <Shield size={32} className="text-tertiary opacity-40 mb-3" />
        <p className="text-sm text-secondary">No workspace</p>
        <p className="text-xs text-tertiary mt-1 max-w-sm">
          Open a project workspace to scan its files and dependencies.
        </p>
      </div>
    );
  }

  if (scanState === 'idle' || scanState === 'error') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-page p-8 animate-in fade-in duration-500">
        <div className="w-20 h-20 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mb-6">
          <Shield size={40} className="text-accent" />
        </div>
        <h2 className="text-xl font-bold text-primary mb-2">Security Scanner</h2>
        <p className="text-sm text-secondary mb-8 text-center max-w-md">
          Scans this workspace for committed secrets (the same check that blocks publishing)
          and for known-vulnerable dependencies using the OSS scanners available in your
          workspace image.
        </p>
        {error && (
          <div className="mb-6 rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-xs text-error max-w-md">
            {error}
          </div>
        )}
        <button
          onClick={() => void startScan()}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent-hover transition-all shadow-lg shadow-accent/20 focus-ring"
        >
          <Play size={16} fill="currentColor" />
          {scanState === 'error' ? 'Try again' : 'Run scan'}
        </button>
      </div>
    );
  }

  if (scanState === 'scanning') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-page p-8">
        <Loader2 size={32} className="text-accent animate-spin mb-4" />
        <p className="text-sm font-semibold text-primary">Scanning workspace…</p>
        <p className="text-xs text-tertiary mt-2 text-center max-w-sm">
          Walking the file tree for secrets and querying dependency advisories. This runs
          inside your container and can take a moment on a large project.
        </p>
      </div>
    );
  }

  const counts = {
    critical: issues.filter((i) => i.severity === 'critical').length,
    warning: issues.filter((i) => i.severity === 'warning').length,
    info: issues.filter((i) => i.severity === 'info').length,
  };

  return (
    <div className="flex-1 flex flex-col bg-page overflow-hidden">
      {/* HEADER */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-default bg-surface shrink-0">
        <div className="flex items-center gap-2">
          {counts.critical > 0 ? (
            <ShieldAlert size={16} className="text-error" />
          ) : (
            <ShieldCheck size={16} className="text-success" />
          )}
          <h2 className="text-sm font-bold text-primary">Security scan</h2>
          <span className="text-xs text-tertiary">
            {issues.length === 0
              ? 'no issues found'
              : `${counts.critical} critical · ${counts.warning} warning · ${counts.info} info`}
          </span>
        </div>
        <button
          onClick={() => void startScan()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-default text-xs font-bold text-secondary hover:text-primary hover:border-accent transition-colors focus-ring"
        >
          <RotateCcw size={13} />
          Rescan
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* What actually ran — the honest part: a clean report means "we looked". */}
        <div className="rounded-xl border border-default bg-surface p-3">
          <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">Scanners</h3>
          <div className="space-y-1.5">
            {scanners.map((sc) => (
              <div key={sc.name} className="flex items-center gap-2 text-xs">
                {sc.available ? (
                  <CheckCircle2 size={12} className="text-success shrink-0" />
                ) : (
                  <MinusCircle size={12} className="text-tertiary shrink-0" />
                )}
                <span className={cn('font-mono', sc.available ? 'text-primary' : 'text-tertiary')}>{sc.name}</span>
                <span className="text-tertiary">— {sc.detail}</span>
              </div>
            ))}
          </div>
        </div>

        {issues.length === 0 ? (
          <div className="rounded-xl border border-default bg-surface p-10 flex flex-col items-center gap-2 text-center">
            <ShieldCheck size={28} className="text-success" />
            <p className="text-sm text-primary font-semibold">No issues found</p>
            <p className="text-xs text-tertiary max-w-sm">
              The scanners listed above reported nothing. Scanners marked unavailable did not
              run — install them in your workspace image for deeper coverage.
            </p>
          </div>
        ) : (
          issues.map((issue, i) => {
            const style = SEVERITY_STYLE[issue.severity] ?? SEVERITY_STYLE.info;
            const Icon = style.icon;
            return (
              <div key={`${issue.source}-${issue.file}-${i}`} className="rounded-xl border border-default bg-surface overflow-hidden">
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className={cn('px-2 py-0.5 rounded border text-xs font-bold uppercase tracking-wider shrink-0 flex items-center gap-1', style.cls)}>
                      <Icon size={11} />
                      {style.label}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-primary">{issue.title}</h3>
                      <button
                        onClick={() => issue.file && openFile(issue.file)}
                        className="text-xs text-accent hover:text-accent-hover font-mono focus-ring rounded"
                      >
                        {issue.file}
                        {issue.line ? `:${issue.line}` : ''}
                      </button>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-tertiary shrink-0">{issue.source}</span>
                  </div>
                  <p className="text-xs text-secondary leading-relaxed">{issue.description}</p>
                  <button
                    onClick={() => handleFix(issue)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-bold hover:bg-accent hover:text-white transition-colors focus-ring"
                  >
                    <Zap size={12} />
                    Ask the agent to fix this
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
