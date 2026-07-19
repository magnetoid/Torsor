import React, { useEffect, useRef, useState } from 'react';
import { FlaskConical, Play, Square, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { apiExecStream, ApiError } from '../../lib/api';
import { useProjectStore } from '../../stores/projectStore';

/**
 * App Testing — a real test runner. It runs the project's test command inside its workspace
 * container (via the workspace exec stream) and shows the live output + pass/fail from the
 * process exit code. No simulation: what you see is the actual command running in the sandbox.
 */
const DEFAULT_COMMAND = 'npm test';

export default function AppTestingTab() {
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const [command, setCommand] = useState(DEFAULT_COMMAND);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState('');
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const outRef = useRef<HTMLPreElement | null>(null);

  // Keep the console pinned to the latest output.
  useEffect(() => {
    if (outRef.current) outRef.current.scrollTop = outRef.current.scrollHeight;
  }, [output]);

  // Abort any in-flight run when the tab unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = async () => {
    if (!activeProjectId || !command.trim() || running) return;
    setRunning(true);
    setOutput('');
    setExitCode(null);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await apiExecStream(activeProjectId, ['sh', '-c', command.trim()], {
        signal: controller.signal,
        workingDir: '/workspace',
        onChunk: (chunk) => {
          if (chunk.stdout) setOutput((o) => o + chunk.stdout);
          if (chunk.stderr) setOutput((o) => o + chunk.stderr);
          if (chunk.done && typeof chunk.exitCode === 'number') setExitCode(chunk.exitCode);
        },
      });
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to run the command');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-secondary text-sm">
        Open a project to run its tests.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-page">
      <header className="h-12 px-4 flex items-center justify-between border-b border-default bg-surface shrink-0">
        <div className="flex items-center gap-2">
          <FlaskConical size={16} className="text-accent" />
          <span className="text-xs font-bold text-primary">App Testing</span>
        </div>
        {exitCode !== null && (
          <span
            className={
              'flex items-center gap-1.5 text-xs font-bold ' + (exitCode === 0 ? 'text-success' : 'text-error')
            }
          >
            {exitCode === 0 ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            {exitCode === 0 ? 'Passed' : `Failed (exit ${exitCode})`}
          </span>
        )}
      </header>

      <div className="p-4 shrink-0 space-y-2">
        <p className="text-[11px] text-tertiary">
          Runs the command in this project&apos;s workspace container. Requires a provisioned workspace (Run the project first).
        </p>
        <div className="flex gap-2">
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void run();
            }}
            placeholder="e.g. npm test"
            spellCheck={false}
            className="flex-1 bg-page border border-default rounded-lg px-3 py-2 text-sm font-mono text-primary outline-none focus:border-accent/50 placeholder:text-tertiary"
          />
          {running ? (
            <button
              onClick={stop}
              className="flex items-center gap-2 px-4 py-2 border border-default text-primary text-sm font-bold rounded-lg hover:bg-elevated transition-all shrink-0"
            >
              <Square size={15} /> Stop
            </button>
          ) : (
            <button
              onClick={() => void run()}
              disabled={!command.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-bold rounded-lg transition-all shrink-0"
            >
              <Play size={15} /> Run
            </button>
          )}
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>

      <div className="flex-1 min-h-0 px-4 pb-4">
        <pre
          ref={outRef}
          className="h-full w-full overflow-auto custom-scrollbar bg-inset border border-default rounded-lg p-3 text-xs font-mono text-secondary whitespace-pre-wrap"
        >
          {output || (running ? '' : 'Output will appear here.')}
          {running && (
            <span className="inline-flex items-center gap-1.5 text-tertiary">
              <Loader2 size={12} className="animate-spin" /> running…
            </span>
          )}
        </pre>
      </div>
    </div>
  );
}
