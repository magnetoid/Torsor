export interface ApiErrorShape {
  error?: string;
  message?: string;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Default to empty string so callers' absolute /api/v1/... paths hit the same origin
// (which nginx proxies to the api service). Override VITE_API_URL only when the API
// is on a different origin than the frontend.
const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const AUTH_STORAGE_KEY = 'torsor-auth-token';

export function getApiBaseUrl() {
  return API_URL;
}

export function getStoredToken() {
  return localStorage.getItem(AUTH_STORAGE_KEY);
}

/** Build a ws:// or wss:// URL for a WebSocket path, carrying the auth token as a query param
 *  (browsers can't set headers on a WebSocket). Same-origin by default; derives the scheme
 *  from the page (or from VITE_API_URL when the API is cross-origin). */
export function wsUrlFor(path: string): string {
  const token = getStoredToken() ?? '';
  let base = API_URL;
  if (!base) {
    const proto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = typeof location !== 'undefined' ? location.host : '';
    base = `${proto}//${host}`;
  } else {
    base = base.replace(/^http/, 'ws');
  }
  const sep = path.includes('?') ? '&' : '?';
  return `${base}${path}${sep}access_token=${encodeURIComponent(token)}`;
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(AUTH_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

// Central session-expiry handler. When an *authenticated* request comes back 401, the
// server has expired/revoked the session — clear local auth and let the route guards send
// the user to /login. Registered by authStore so lib/api stays free of store imports (no
// cycle). Not fired for unauthenticated calls (e.g. a bad-credentials login 401).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}
function handleUnauthorized(authed: boolean, status: number) {
  if (authed && status === 401) onUnauthorized?.();
}

interface RequestOptions extends RequestInit {
  auth?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = false, headers, ...rest } = options;
  const token = getStoredToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!response.ok) {
    handleUnauthorized(auth, response.status);
    let payload: ApiErrorShape | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    throw new ApiError(payload?.message || payload?.error || `Request failed with status ${response.status}`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/** Build the live-preview proxy URL for a project's workspace. The token rides as a query
 *  param because the preview loads in an iframe, which can't set an Authorization header. */
export function previewUrlFor(projectId: string): string {
  const token = getStoredToken() ?? '';
  // Cache-bust so a fresh workspace/app isn't masked by a previously cached preview.
  const t = Date.now();
  return `${API_URL}/api/v1/projects/${encodeURIComponent(projectId)}/preview/?access_token=${encodeURIComponent(token)}&t=${t}`;
}

/** Fetch a project's workspace status and return the live-preview URL if it exposes one. */
export async function fetchPreviewUrl(projectId: string): Promise<string | null> {
  try {
    const data = await apiRequest<{ runtimeStatus?: { hasPreview?: boolean; status?: string } }>(
      `/api/v1/projects/${projectId}/workspace`,
      { auth: true }
    );
    return data.runtimeStatus?.hasPreview ? previewUrlFor(projectId) : null;
  } catch {
    return null; // no workspace / no runtime
  }
}

/** A container image from the marketplace search (Docker Hub). */
export interface RegistryImage {
  name: string;
  description: string;
  stars: number;
  pulls: number;
  official: boolean;
}

/** Search the container-image marketplace (proxied to Docker Hub by the control plane). */
export async function searchRegistryImages(query: string, limit = 25): Promise<RegistryImage[]> {
  const qs = new URLSearchParams({ q: query, limit: String(limit) });
  const data = await apiRequest<{ items: RegistryImage[] }>(`/api/v1/registry/images?${qs}`, { auth: true });
  return data.items ?? [];
}

/** Deploy an image: create a project, then provision its workspace from that image.
 *  Returns the new project id. Actual container execution requires a Docker-backed
 *  runtime; against the mock runtime this records the deploy without running it. */
export async function deployImage(image: string, name?: string): Promise<string> {
  const project = await apiRequest<{ id: string }>('/api/v1/projects', {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ name: name || image, description: `Deployed from ${image}` }),
  });
  await apiRequest(`/api/v1/projects/${project.id}/workspace`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ image }),
  });
  return project.id;
}

/** One JSON frame of a model completion stream (matches the control plane's SSE shape). */
export interface StreamChunk {
  textDelta?: string;
  done: boolean;
  model?: string;
  tokensOut?: number;
}

interface StreamOptions {
  auth?: boolean;
  signal?: AbortSignal;
  onChunk: (chunk: StreamChunk) => void;
}

// apiStream POSTs a JSON body and consumes the Server-Sent Events response, invoking
// onChunk per data frame. Uses fetch + ReadableStream (not EventSource) because the
// endpoint is a POST and needs the Authorization header.
export async function apiStream(path: string, body: unknown, options: StreamOptions): Promise<void> {
  const { auth = true, signal, onChunk } = options;
  const token = getStoredToken();
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    let payload: ApiErrorShape | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    handleUnauthorized(auth, response.status);
    throw new ApiError(payload?.message || payload?.error || `Stream failed with status ${response.status}`, response.status);
  }

  await consumeSSE(response, (eventName, data) => {
    if (eventName === 'error') {
      let message = 'Model stream error';
      try {
        message = (JSON.parse(data) as { error?: string }).error || message;
      } catch {
        /* keep default */
      }
      throw new ApiError(message, 502);
    }
    try {
      onChunk(JSON.parse(data) as StreamChunk);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Ignore unparseable frames (e.g. keep-alive comments).
    }
  });
}

// consumeSSE reads a Server-Sent Events response body, invoking handle(eventName, data)
// once per event frame. Shared by the completion and agent streams.
async function consumeSSE(
  response: Response,
  handle: (eventName: string, data: string) => void
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processEvent = (rawEvent: string) => {
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of rawEvent.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return;
    handle(eventName, dataLines.join('\n'));
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        processEvent(rawEvent);
        boundary = buffer.indexOf('\n\n');
      }
    }
    if (buffer.trim()) processEvent(buffer);
  } finally {
    reader.releaseLock();
  }
}

/** One streamed chunk of workspace command output (mirrors plugin.ExecChunk). */
export interface ExecChunk {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  done: boolean;
}

interface ExecStreamOptions {
  signal?: AbortSignal;
  workingDir?: string;
  onChunk: (chunk: ExecChunk) => void;
}

// apiExecStream runs a command inside a project's workspace container and consumes the
// SSE output stream. POST /api/v1/projects/{projectId}/workspace/exec/stream.
// Ownership-enforced server-side; requires a provisioned workspace.
export async function apiExecStream(
  projectId: string,
  command: string[],
  options: ExecStreamOptions
): Promise<void> {
  const { signal, workingDir, onChunk } = options;
  const token = getStoredToken();
  const response = await fetch(
    `${API_URL}/api/v1/projects/${encodeURIComponent(projectId)}/workspace/exec/stream`,
    {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ command, workingDir }),
    }
  );

  if (!response.ok || !response.body) {
    let payload: ApiErrorShape | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    handleUnauthorized(true, response.status);
    throw new ApiError(payload?.message || payload?.error || `Exec failed with status ${response.status}`, response.status);
  }

  await consumeSSE(response, (eventName, data) => {
    if (eventName === 'error') {
      let message = 'Exec stream error';
      try {
        message = (JSON.parse(data) as { error?: string }).error || message;
      } catch {
        /* keep default */
      }
      throw new ApiError(message, 502);
    }
    try {
      onChunk(JSON.parse(data) as ExecChunk);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Ignore unparseable frames (keep-alive comments).
    }
  });
}

/** One step event from the coding agent loop (mirrors internal/agent.Event). */
export interface AgentEvent {
  kind: 'thought' | 'plan' | 'tool_call' | 'tool_result' | 'final' | 'error';
  text?: string;
  tool?: string;
  args?: Record<string, string>;
  result?: string;
  plan?: string[];
  step: number;
  /** 1-based sequence index set on persisted background-run events (used to de-dup replay
   *  vs. live tail). Unset on the synchronous /agent/stream path. */
  seq?: number;
}

interface AgentStreamOptions {
  auth?: boolean;
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
}

// apiAgentStream runs the coding agent against a project's workspace and consumes the SSE
// step stream. POST /api/v1/projects/{projectId}/agent/stream. Uses fetch + ReadableStream
// (not EventSource) because it is a POST needing the Authorization header.
export async function apiAgentStream(
  projectId: string,
  body: { task: string; provider?: string; maxSteps?: number; mode?: string; approvedPlan?: string[] },
  options: AgentStreamOptions
): Promise<void> {
  const { auth = true, signal, onEvent } = options;
  const token = getStoredToken();
  const response = await fetch(`${API_URL}/api/v1/projects/${encodeURIComponent(projectId)}/agent/stream`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    let payload: ApiErrorShape | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    handleUnauthorized(auth, response.status);
    throw new ApiError(payload?.message || payload?.error || `Agent run failed with status ${response.status}`, response.status);
  }

  await consumeSSE(response, (eventName, data) => {
    if (eventName === 'error') {
      let message = 'Agent stream error';
      try {
        message = (JSON.parse(data) as { error?: string }).error || message;
      } catch {
        /* keep default */
      }
      throw new ApiError(message, 502);
    }
    try {
      onEvent(JSON.parse(data) as AgentEvent);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Ignore unparseable frames (keep-alive comments).
    }
  });
}

// --- Background agent runs (Phase 4) -----------------------------------------------------

/** An ai_tasks row: a first-class, observable agent run. Fields are snake_case to match the
 *  control plane's task JSON shape. */
export interface TaskSummary {
  id: string;
  project_id: string;
  task_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  prompt: string;
  result: string | null;
  error: string | null;
  steps: number;
  model: string;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
  updated_at: string;
}

/** A single run with its persisted step transcript (the events jsonb column). */
export interface TaskDetail extends TaskSummary {
  events: AgentEvent[];
}

/** Enqueue a background coding-agent run; returns immediately with the created task. */
export async function apiCreateAgentTask(projectId: string, task: string): Promise<TaskSummary> {
  return apiRequest<TaskSummary>(`/api/v1/projects/${encodeURIComponent(projectId)}/agent/tasks`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ task }),
  });
}

/** List the caller's recent agent runs (all projects), newest first. */
export async function apiListTasks(): Promise<TaskSummary[]> {
  const data = await apiRequest<{ items: TaskSummary[] }>('/api/v1/tasks', { auth: true });
  return data.items ?? [];
}

/** Fetch one run including its full step transcript. */
export async function apiGetTask(taskId: string): Promise<TaskDetail> {
  return apiRequest<TaskDetail>(`/api/v1/tasks/${encodeURIComponent(taskId)}`, { auth: true });
}

/** Request cancellation of a pending or running task. */
export async function apiCancelTask(taskId: string): Promise<void> {
  await apiRequest(`/api/v1/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST', auth: true });
}

interface TaskEventsStreamOptions {
  signal?: AbortSignal;
  onEvent: (event: AgentEvent) => void;
  onDone?: () => void;
}

// apiTaskEventsStream attaches to a background run's step stream (GET SSE). It replays the
// persisted transcript then live-tails until the run finishes (an `event: done` frame) or the
// caller aborts. Uses fetch + ReadableStream so the Authorization header can be set.
export async function apiTaskEventsStream(taskId: string, options: TaskEventsStreamOptions): Promise<void> {
  const { signal, onEvent, onDone } = options;
  const token = getStoredToken();
  const response = await fetch(`${API_URL}/api/v1/tasks/${encodeURIComponent(taskId)}/events/stream`, {
    method: 'GET',
    signal,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });

  if (!response.ok || !response.body) {
    handleUnauthorized(true, response.status);
    throw new ApiError(`Task stream failed with status ${response.status}`, response.status);
  }

  await consumeSSE(response, (eventName, data) => {
    if (eventName === 'done') {
      onDone?.();
      return;
    }
    if (eventName === 'error') {
      let message = 'Task stream error';
      try {
        message = (JSON.parse(data) as { error?: string }).error || message;
      } catch {
        /* keep default */
      }
      throw new ApiError(message, 502);
    }
    try {
      onEvent(JSON.parse(data) as AgentEvent);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Ignore unparseable frames (keep-alive comments).
    }
  });
}

// --- Usage (Phase 4) ---------------------------------------------------------------------

export interface UsageSummary {
  totals: { tokensIn: number; tokensOut: number; events: number };
  byDay: { day: string; tokensIn: number; tokensOut: number; events: number }[];
  byModel: { model: string; provider: string; tokensIn: number; tokensOut: number; events: number }[];
}

/** Per-user token/cost aggregation read back from usage_events. */
export async function apiUsageSummary(): Promise<UsageSummary> {
  return apiRequest<UsageSummary>('/api/v1/usage/summary', { auth: true });
}

// --- MCP servers (Phase 5) ---------------------------------------------------------------

export interface MCPServer {
  id: string;
  name: string;
  url: string;
  transport: string;
  hasAuth: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MCPTestResult {
  ok: boolean;
  error?: string;
  tools?: string[];
  toolCount?: number;
}

export async function apiListMCPServers(): Promise<MCPServer[]> {
  const data = await apiRequest<{ items: MCPServer[] }>('/api/v1/mcp/servers', { auth: true });
  return data.items ?? [];
}

export async function apiCreateMCPServer(input: {
  name: string;
  url: string;
  transport?: string;
  authHeader?: string;
}): Promise<MCPServer> {
  return apiRequest<MCPServer>('/api/v1/mcp/servers', {
    method: 'POST',
    auth: true,
    body: JSON.stringify(input),
  });
}

export async function apiUpdateMCPServer(
  id: string,
  patch: { url?: string; transport?: string; enabled?: boolean; authHeader?: string }
): Promise<void> {
  await apiRequest(`/api/v1/mcp/servers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    auth: true,
    body: JSON.stringify(patch),
  });
}

export async function apiDeleteMCPServer(id: string): Promise<void> {
  await apiRequest(`/api/v1/mcp/servers/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true });
}

/** Connect to a stored MCP server and list its tools (reachability check). */
export async function apiTestMCPServer(id: string): Promise<MCPTestResult> {
  return apiRequest<MCPTestResult>(`/api/v1/mcp/servers/${encodeURIComponent(id)}/test`, {
    method: 'POST',
    auth: true,
  });
}

// --- Model catalog (Phase 3/5) -----------------------------------------------------------

export interface ModelCatalog {
  supported: boolean;
  reachable?: boolean;
  items: { name: string; size: number }[];
  recommended: string[];
  error?: string;
}

/** List a provider's installed models (only 'ollama' is supported today). Best-effort hint. */
export async function apiModelCatalog(provider: string): Promise<ModelCatalog> {
  return apiRequest<ModelCatalog>(`/api/v1/providers/models/${encodeURIComponent(provider)}/catalog`, {
    auth: true,
  });
}

/** Test a model provider end-to-end with the caller's BYO key: the server runs a tiny real
 *  completion and returns {ok, model}, or an error with the provider's own message. */
export async function apiTestModelProvider(name: string): Promise<{ ok: boolean; model: string }> {
  return apiRequest<{ ok: boolean; model: string }>(
    `/api/v1/providers/models/${encodeURIComponent(name)}/test`,
    { method: 'POST', auth: true }
  );
}

// --- Workspace snapshots / fork (Phase 6) ------------------------------------------------

export interface WorkspaceSnapshot {
  id: string;
  snapshotId: string;
  runtime: string;
  label: string;
  createdAt: string;
}

export async function apiListWorkspaceSnapshots(projectId: string): Promise<WorkspaceSnapshot[]> {
  const data = await apiRequest<{ items: WorkspaceSnapshot[] }>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/workspace/snapshots`,
    { auth: true }
  );
  return data.items ?? [];
}

/** Capture a runtime-native snapshot of the project's workspace. Throws ApiError 501 if the
 *  workspace runtime doesn't support snapshots. */
export async function apiSnapshotWorkspace(projectId: string, label: string): Promise<WorkspaceSnapshot> {
  return apiRequest<WorkspaceSnapshot>(`/api/v1/projects/${encodeURIComponent(projectId)}/workspace/snapshot`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ label }),
  });
}

/** Restore a workspace in place to a stored snapshot (by snapshot row id). */
export async function apiRestoreWorkspace(projectId: string, snapshotRowId: string): Promise<void> {
  await apiRequest(`/api/v1/projects/${encodeURIComponent(projectId)}/workspace/restore`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ snapshotId: snapshotRowId }),
  });
}

/** Fork a new project+workspace from a source workspace (optionally from a snapshot). Returns
 *  the new project id. */
export async function apiForkWorkspace(
  projectId: string,
  opts: { snapshotId?: string; name?: string } = {}
): Promise<{ projectId: string }> {
  return apiRequest<{ projectId: string }>(`/api/v1/projects/${encodeURIComponent(projectId)}/workspace/fork`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify(opts),
  });
}

// ---- Git (real `git` in the project workspace, via the control plane) ----

export interface ApiGitFile {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  staged: boolean;
  additions: number;
  deletions: number;
}

export interface ApiGitStatus {
  initialized: boolean;
  branch: string;
  ahead: number;
  behind: number;
  changes: ApiGitFile[];
  remoteUrl: string;
}

export interface ApiGitCommit {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
}

const gitBase = (projectId: string) => `/api/v1/projects/${encodeURIComponent(projectId)}/git`;

export function apiGitStatus(projectId: string): Promise<ApiGitStatus> {
  return apiRequest<ApiGitStatus>(`${gitBase(projectId)}/status`, { auth: true });
}

export async function apiGitLog(projectId: string): Promise<ApiGitCommit[]> {
  const data = await apiRequest<{ items: ApiGitCommit[] }>(`${gitBase(projectId)}/log`, { auth: true });
  return data.items ?? [];
}

export async function apiGitBranches(projectId: string): Promise<string[]> {
  const data = await apiRequest<{ items: string[] }>(`${gitBase(projectId)}/branches`, { auth: true });
  return data.items ?? [];
}

export function apiGitInit(projectId: string): Promise<{ ok: boolean }> {
  return apiRequest(`${gitBase(projectId)}/init`, { method: 'POST', auth: true });
}

export function apiGitStage(projectId: string, paths?: string[]): Promise<{ ok: boolean }> {
  return apiRequest(`${gitBase(projectId)}/stage`, { method: 'POST', auth: true, body: JSON.stringify({ paths }) });
}

export function apiGitUnstage(projectId: string, paths?: string[]): Promise<{ ok: boolean }> {
  return apiRequest(`${gitBase(projectId)}/unstage`, { method: 'POST', auth: true, body: JSON.stringify({ paths }) });
}

export function apiGitCommit(projectId: string, message: string, opts?: { paths?: string[]; amend?: boolean }): Promise<{ ok: boolean }> {
  return apiRequest(`${gitBase(projectId)}/commit`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify({ message, paths: opts?.paths, amend: opts?.amend }),
  });
}

export function apiGitCreateBranch(projectId: string, name: string): Promise<{ ok: boolean }> {
  return apiRequest(`${gitBase(projectId)}/branch`, { method: 'POST', auth: true, body: JSON.stringify({ name }) });
}

export function apiGitCheckout(projectId: string, branch: string): Promise<{ ok: boolean }> {
  return apiRequest(`${gitBase(projectId)}/checkout`, { method: 'POST', auth: true, body: JSON.stringify({ branch }) });
}

export function apiGitRevert(projectId: string, hash: string): Promise<{ ok: boolean }> {
  return apiRequest(`${gitBase(projectId)}/revert`, { method: 'POST', auth: true, body: JSON.stringify({ hash }) });
}

export function apiGitPush(projectId: string): Promise<{ ok: boolean; output: string }> {
  return apiRequest(`${gitBase(projectId)}/push`, { method: 'POST', auth: true });
}

export function apiGitPull(projectId: string): Promise<{ ok: boolean; output: string }> {
  return apiRequest(`${gitBase(projectId)}/pull`, { method: 'POST', auth: true });
}

export async function apiGitDiff(projectId: string, path?: string, staged?: boolean): Promise<string> {
  const params = new URLSearchParams();
  if (path) params.set('path', path);
  if (staged) params.set('staged', 'true');
  const q = params.toString();
  const data = await apiRequest<{ diff: string }>(`${gitBase(projectId)}/diff${q ? `?${q}` : ''}`, { auth: true });
  return data.diff ?? '';
}

// ---- App Storage (real per-project asset storage over the workspace fs) ----

export interface ApiStorageFile {
  id: string;
  name: string;
  type: 'image' | 'video' | 'document' | 'other';
  size: number;
  uploadedAt: number;
  path: string;
}

const storageBase = (projectId: string) => `/api/v1/projects/${encodeURIComponent(projectId)}/storage`;

export async function apiStorageList(projectId: string): Promise<ApiStorageFile[]> {
  const data = await apiRequest<{ items: ApiStorageFile[] }>(`${storageBase(projectId)}/files`, { auth: true });
  return data.items ?? [];
}

export function apiStorageUpload(
  projectId: string,
  file: { name: string; path: string; contentBase64: string },
): Promise<ApiStorageFile> {
  return apiRequest<ApiStorageFile>(`${storageBase(projectId)}/upload`, {
    method: 'POST',
    auth: true,
    body: JSON.stringify(file),
  });
}

export function apiStorageDelete(projectId: string, path: string): Promise<{ ok: boolean }> {
  return apiRequest(`${storageBase(projectId)}/file?path=${encodeURIComponent(path)}`, { method: 'DELETE', auth: true });
}

export async function apiStorageDownload(
  projectId: string,
  path: string,
): Promise<{ name: string; type: string; size: number; contentBase64: string }> {
  return apiRequest(`${storageBase(projectId)}/file?path=${encodeURIComponent(path)}`, { auth: true });
}

// ---- Exec collect: run a command in the workspace and gather its full output ----
// A synchronous wrapper over the streaming exec endpoint, for features (DB
// explorer, tooling) that need a command's complete result rather than a live tail.

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function apiExecCollect(
  projectId: string,
  command: string[],
  opts: { signal?: AbortSignal; workingDir?: string } = {},
): Promise<ExecResult> {
  let stdout = '';
  let stderr = '';
  let exitCode = 0;
  await apiExecStream(projectId, command, {
    signal: opts.signal,
    workingDir: opts.workingDir,
    onChunk: (c) => {
      if (c.stdout) stdout += c.stdout;
      if (c.stderr) stderr += c.stderr;
      if (c.done && typeof c.exitCode === 'number') exitCode = c.exitCode;
    },
  });
  return { stdout, stderr, exitCode };
}
