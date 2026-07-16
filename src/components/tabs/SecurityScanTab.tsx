import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  Play, 
  RotateCcw, 
  Loader2, 
  ChevronRight, 
  ExternalLink, 
  AlertTriangle, 
  Info, 
  CheckCircle2,
  XCircle,
  Zap
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useChatStore } from '../../stores/chatStore';
import { useProjectStore } from '../../stores/projectStore';
import { useEditorStore } from '../../stores/editorStore';

type ScanState = 'idle' | 'scanning' | 'results';

interface ScanCheck {
  id: string;
  label: string;
  status: 'pending' | 'checking' | 'pass' | 'fail';
}

interface SecurityIssue {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  file: string;
  line: number;
  description: string;
}

const INITIAL_CHECKS: ScanCheck[] = [
  { id: 'deps', label: 'Checking dependencies for known vulnerabilities...', status: 'pending' },
  { id: 'secrets', label: 'Scanning for exposed secrets...', status: 'pending' },
  { id: 'auth', label: 'Analyzing auth implementation...', status: 'pending' },
  { id: 'injection', label: 'Checking API routes for injection risks...', status: 'pending' },
  { id: 'errors', label: 'Reviewing error handling...', status: 'pending' },
];

const MOCK_ISSUES: SecurityIssue[] = [
  {
    id: 'issue-1',
    severity: 'critical',
    title: 'Exposed API key in client-side code',
    file: 'src/lib/api.ts',
    line: 12,
    description: 'A hardcoded Stripe secret key was found in a client-side file. This key should be moved to environment variables and accessed only from the server.'
  },
  {
    id: 'issue-2',
    severity: 'warning',
    title: 'Missing CSRF protection',
    file: 'server.ts',
    line: 45,
    description: 'The Express server does not appear to have CSRF protection middleware enabled for POST/PUT/DELETE routes.'
  },
  {
    id: 'issue-3',
    severity: 'info',
    title: 'Insecure cookie configuration',
    file: 'src/stores/authStore.ts',
    line: 88,
    description: 'Cookies are being set without the "Secure" attribute. This is acceptable for development but should be enabled in production.'
  }
];

export default function SecurityScanTab() {
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [checks, setChecks] = useState<ScanCheck[]>(INITIAL_CHECKS);
  const [progress, setProgress] = useState(0);
  const { openFile } = useEditorStore();

  const startScan = () => {
    setScanState('scanning');
    setProgress(0);
    setChecks(INITIAL_CHECKS.map(c => ({ ...c, status: 'pending' })));
  };

  useEffect(() => {
    if (scanState !== 'scanning') return;

    let currentCheckIndex = 0;
    const interval = setInterval(() => {
      setChecks(prev => {
        const next = [...prev];
        if (currentCheckIndex < next.length) {
          // Finish previous check
          if (currentCheckIndex > 0) {
            next[currentCheckIndex - 1].status = currentCheckIndex === 1 ? 'fail' : 'pass';
          }
          // Start current check
          next[currentCheckIndex].status = 'checking';
          setProgress(((currentCheckIndex + 1) / next.length) * 100);
          currentCheckIndex++;
          return next;
        } else {
          // Finish last check
          next[next.length - 1].status = 'pass';
          clearInterval(interval);
          setTimeout(() => setScanState('results'), 500);
          return next;
        }
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [scanState]);

  const handleFix = (issue: SecurityIssue) => {
    const projectId = useProjectStore.getState().activeProjectId;
    if (!projectId) return;
    void useChatStore.getState().runAgent(
      projectId,
      `Fix the following security issue in ${issue.file} at line ${issue.line}: ${issue.title}. ${issue.description}`
    );
  };

  if (scanState === 'idle') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-page p-8 animate-in fade-in duration-500">
        <div className="w-20 h-20 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center mb-6 shadow-2xl shadow-accent/10">
          <Shield size={40} className="text-accent" />
        </div>
        <h2 className="text-xl font-bold text-primary mb-2">Security Scanner</h2>
        <p className="text-sm text-secondary mb-8 text-center max-w-md">
          Scan your project for vulnerabilities, exposed secrets, and insecure patterns using Torsor's AI security engine.
        </p>
        <button 
          onClick={startScan}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-accent text-white font-bold hover:bg-accent-hover transition-all shadow-lg shadow-accent/20"
        >
          <Play size={16} fill="currentColor" />
          Run Scan
        </button>
        <p className="mt-6 text-[10px] text-tertiary uppercase tracking-widest font-bold">
          Powered by Torsor Agent · Balanced mode
        </p>
      </div>
    );
  }

  if (scanState === 'scanning') {
    return (
      <div className="flex-1 flex flex-col bg-page p-8 max-w-2xl mx-auto w-full">
        <div className="mb-12">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-accent uppercase tracking-widest">Scanning Project...</span>
            <span className="text-xs font-mono text-secondary"> {Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 w-full bg-inset rounded-full overflow-hidden border border-default">
            <div 
              className="h-full bg-accent transition-all duration-300 ease-out shadow-[0_0_10px_rgba(123,106,238,0.5)]" 
              style={{ width: `${progress}%` }} 
            />
          </div>
        </div>

        <div className="space-y-4">
          {checks.map((check) => (
            <div key={check.id} className="flex items-center gap-3 animate-in slide-in-from-left-2 duration-300">
              {check.status === 'pending' && <div className="w-2 h-2 rounded-full bg-inset" />}
              {check.status === 'checking' && <Loader2 size={14} className="text-warning animate-spin" />}
              {check.status === 'pass' && <CheckCircle2 size={14} className="text-success" />}
              {check.status === 'fail' && <XCircle size={14} className="text-error" />}
              <span className={cn(
                "text-sm transition-colors",
                check.status === 'checking' ? "text-primary font-medium" : 
                check.status === 'pending' ? "text-tertiary" : "text-secondary"
              )}>
                {check.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-page overflow-y-auto no-scrollbar p-6">
      {/* SUMMARY HEADER */}
      <div className="flex items-start justify-between mb-8 max-w-4xl mx-auto w-full">
        <div className="flex-1 bg-surface rounded-2xl border border-default p-6 mr-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5">
            <ShieldAlert size={120} />
          </div>
          <div className="relative z-10">
            <h2 className="text-lg font-bold text-primary mb-1">Scan Results</h2>
            <p className="text-sm text-error font-medium mb-4 flex items-center gap-2">
              <AlertTriangle size={14} />
              3 issues found in your project
            </p>
            <div className="flex gap-4">
              <div className="px-3 py-1.5 rounded-lg bg-error/10 border border-error/20">
                <span className="text-[10px] font-bold text-error uppercase tracking-wider block">Critical</span>
                <span className="text-xl font-bold text-primary">1</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-warning/10 border border-warning/20">
                <span className="text-[10px] font-bold text-warning uppercase tracking-wider block">Warning</span>
                <span className="text-xl font-bold text-primary">1</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-info/10 border border-info/20">
                <span className="text-[10px] font-bold text-info uppercase tracking-wider block">Info</span>
                <span className="text-xl font-bold text-primary">1</span>
              </div>
            </div>
          </div>
        </div>

        <div className="w-48 bg-surface rounded-2xl border border-default p-6 flex flex-col items-center justify-center shrink-0">
          <div className="relative w-20 h-20 flex items-center justify-center mb-2">
            <svg className="w-full h-full -rotate-90">
              <circle 
                cx="40" cy="40" r="36" 
                className="stroke-inset fill-none" 
                strokeWidth="6" 
              />
              <circle 
                cx="40" cy="40" r="36" 
                className="stroke-warning fill-none" 
                strokeWidth="6" 
                strokeDasharray="226" 
                strokeDashoffset="45" 
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-2xl font-black text-warning">B+</span>
          </div>
          <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Security Score</span>
        </div>
      </div>

      {/* ACTION BAR */}
      <div className="flex items-center justify-between mb-4 max-w-4xl mx-auto w-full">
        <h3 className="text-xs font-bold text-secondary uppercase tracking-widest">Vulnerabilities</h3>
        <button 
          onClick={startScan}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-elevated text-primary text-xs font-medium hover:bg-surface transition-colors border border-subtle"
        >
          <RotateCcw size={14} />
          Re-scan
        </button>
      </div>

      {/* ISSUES LIST */}
      <div className="space-y-3 max-w-4xl mx-auto w-full">
        {MOCK_ISSUES.map((issue) => (
          <div 
            key={issue.id}
            className={cn(
              "bg-surface rounded-xl border border-default p-4 border-l-4 transition-all hover:bg-elevated",
              issue.severity === 'critical' ? "border-l-error" : 
              issue.severity === 'warning' ? "border-l-warning" : "border-l-info"
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                  issue.severity === 'critical' ? "bg-error/10 text-error" : 
                  issue.severity === 'warning' ? "bg-warning/10 text-warning" : "bg-info/10 text-info"
                )}>
                  {issue.severity}
                </div>
                <h4 className="text-sm font-bold text-primary">{issue.title}</h4>
              </div>
              <button 
                onClick={() => openFile(issue.file)}
                className="flex items-center gap-1.5 text-[10px] text-secondary hover:text-accent transition-colors"
              >
                <span className="font-mono">{issue.file}:{issue.line}</span>
                <ExternalLink size={10} />
              </button>
            </div>
            <p className="text-xs text-secondary leading-relaxed mb-4 max-w-2xl">
              {issue.description}
            </p>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => handleFix(issue)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-[10px] font-bold uppercase tracking-wider hover:bg-accent-hover transition-colors shadow-lg shadow-accent/10"
              >
                <Zap size={12} fill="currentColor" />
                Fix with Agent
              </button>
              <button className="text-[10px] text-tertiary hover:text-secondary font-bold uppercase tracking-widest transition-colors">
                Ignore
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
