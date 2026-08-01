import { apiRequest, getStoredToken } from './api';

/**
 * Client-side error reporting.
 *
 * Browser failures were previously invisible to operators: a component that threw, a promise
 * that rejected, or an API call that 500'd left nothing behind once the user closed the tab.
 * This ships those events to the control plane so they land in the same `app_logs` stream as
 * backend errors, correlated by request id — a 500 and the browser error it caused line up in
 * one view.
 *
 * Three constraints shape this file:
 *  - Reporting must never break the app. Every path is wrapped; a failed report is discarded.
 *  - It must never loop. A failure while reporting is not itself reported.
 *  - It must not flood. Events are batched, deduplicated, and capped per session.
 */

export type ClientLogLevel = 'warn' | 'error';

export interface ClientLogEntry {
  level: ClientLogLevel;
  message: string;
  logger?: string;
  error?: string;
  stack?: string;
  route?: string;
  requestId?: string;
  projectId?: string;
  fields?: Record<string, unknown>;
}

const FLUSH_MS = 3000;
const MAX_BATCH = 20;
/** Cap per page load. A render loop can throw thousands of times a second; the first few tell
 *  the whole story and the rest would just be a denial-of-service against our own database. */
const MAX_PER_SESSION = 100;

let queue: ClientLogEntry[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let sent = 0;
/** Guards against the report-a-failed-report loop. */
let sending = false;
/** Signatures already reported this session, so a repeating error is recorded once. */
const seen = new Set<string>();

function signature(e: ClientLogEntry): string {
  return `${e.level}|${e.message}|${(e.stack ?? '').slice(0, 200)}`;
}

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0 || sending) return;
  // Unauthenticated users have no ingest endpoint (it requires a session), so drop rather
  // than pile up entries that can never be delivered.
  if (!getStoredToken()) {
    queue = [];
    return;
  }
  const entries = queue.slice(0, MAX_BATCH);
  queue = queue.slice(entries.length);
  sending = true;
  try {
    await apiRequest('/api/v1/logs', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ entries }),
    });
  } catch {
    // Deliberately silent. Reporting that error reporting failed is how you build an
    // infinite loop; the backend counts its own drops instead.
  } finally {
    sending = false;
  }
}

/** Queue one event. Safe to call from anywhere, including inside an error handler. */
export function reportClientLog(entry: ClientLogEntry): void {
  try {
    if (sent >= MAX_PER_SESSION || sending) return;
    const sig = signature(entry);
    if (seen.has(sig)) return;
    seen.add(sig);
    sent += 1;

    queue.push({
      ...entry,
      route: entry.route ?? window.location.pathname,
    });
    if (queue.length >= MAX_BATCH) {
      void flush();
      return;
    }
    if (!timer) timer = setTimeout(() => void flush(), FLUSH_MS);
  } catch {
    // Never let telemetry throw into application code.
  }
}

/** Convenience wrapper for a caught exception. */
export function reportError(err: unknown, logger: string, fields?: Record<string, unknown>): void {
  const e = err instanceof Error ? err : new Error(String(err));
  reportClientLog({
    level: 'error',
    message: e.message || 'Unknown error',
    logger,
    error: e.name,
    stack: e.stack,
    fields,
  });
}

let installed = false;

/**
 * Attach the global handlers. Called once at startup.
 *
 * `error` and `unhandledrejection` are where the failures nobody caught end up — precisely the
 * ones no component-level try/catch will ever see. The page-hide flush matters because the
 * common case is a user hitting an error and immediately closing the tab, which would
 * otherwise discard the batch we most wanted.
 */
export function installClientLogging(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (ev: ErrorEvent) => {
    reportClientLog({
      level: 'error',
      message: ev.message || 'Uncaught error',
      logger: 'window.onerror',
      error: ev.error instanceof Error ? ev.error.name : '',
      stack: ev.error instanceof Error ? ev.error.stack : '',
      fields: { source: ev.filename, line: ev.lineno, column: ev.colno },
    });
  });

  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    const r = ev.reason;
    reportClientLog({
      level: 'error',
      message: r instanceof Error ? r.message : String(r ?? 'Unhandled promise rejection'),
      logger: 'unhandledrejection',
      error: r instanceof Error ? r.name : '',
      stack: r instanceof Error ? r.stack : '',
    });
  });

  // Best-effort delivery when the tab goes away. sendBeacon can't carry the auth header, so
  // this is a normal flush — it usually completes, and losing it is acceptable.
  window.addEventListener('pagehide', () => void flush());
}
