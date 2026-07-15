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

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(AUTH_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
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
  kind: 'thought' | 'tool_call' | 'tool_result' | 'final' | 'error';
  text?: string;
  tool?: string;
  args?: Record<string, string>;
  result?: string;
  step: number;
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
  body: { task: string; provider?: string; maxSteps?: number },
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
