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
