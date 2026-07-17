import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { AgentEvent } from '../lib/api';

// Mock the API module so runAgent drives a scripted event stream instead of the network,
// and settingsStore so importing chatStore doesn't touch localStorage (persist) in node.
vi.mock('../lib/api', () => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }
  return {
    ApiError,
    apiRequest: vi.fn(),
    apiStream: vi.fn(),
    apiAgentStream: vi.fn(),
  };
});

vi.mock('./settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({ ai: { defaultModel: 'mock' }, updateAI: vi.fn() }),
  },
}));

// useAppStore uses persist(localStorage), which isn't available in the node test env, and
// runAgent calls its loadWorkspaceFiles (tree refresh) + refreshPreview (reload iframe) — mock them.
vi.mock('../useAppStore', () => ({
  useAppStore: {
    getState: () => ({
      loadWorkspaceFiles: vi.fn().mockResolvedValue(undefined),
      refreshPreview: vi.fn(),
    }),
  },
}));

import { useChatStore } from './chatStore';
import { apiAgentStream, ApiError } from '../lib/api';

const seedProvider = () =>
  useChatStore.setState({
    messages: [],
    isAgentWorking: false,
    providers: [{ name: 'mock', displayName: 'Mock', version: '1', kind: 'model_provider' }],
    selectedProvider: 'mock',
  });

describe('chatStore.runAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedProvider();
  });

  it('maps agent step events onto chat messages in order', async () => {
    const events: AgentEvent[] = [
      { kind: 'thought', text: 'Let me look around', step: 1 },
      { kind: 'tool_call', tool: 'write_file', args: { path: 'a.js', content: 'x' }, step: 1 },
      { kind: 'tool_result', tool: 'write_file', result: 'wrote 1 bytes to a.js', step: 1 },
      { kind: 'final', text: 'Done — created a.js', step: 2 },
    ];
    (apiAgentStream as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (_projectId: string, _body: unknown, opts: { onEvent: (e: AgentEvent) => void }) => {
        events.forEach(opts.onEvent);
      }
    );

    await useChatStore.getState().runAgent('proj-1', 'make a file');

    const msgs = useChatStore.getState().messages;
    expect(msgs.map((m) => m.type)).toEqual(['user', 'work', 'work', 'terminal', 'agent']);
    expect(msgs[0].content).toBe('make a file');
    // tool_call renders name + args
    expect(msgs[2].content).toContain('write_file');
    expect(msgs[2].content).toContain('path=a.js');
    // tool_result renders as terminal output
    expect(msgs[3].content).toBe('wrote 1 bytes to a.js');
    // final renders as the agent reply
    expect(msgs[4].content).toBe('Done — created a.js');
    expect(useChatStore.getState().isAgentWorking).toBe(false);
  });

  it('appends an error message when the agent stream fails', async () => {
    (apiAgentStream as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      throw new ApiError('workspace runtime unavailable', 503);
    });

    await useChatStore.getState().runAgent('proj-1', 'do it');

    const msgs = useChatStore.getState().messages;
    expect(msgs[0].type).toBe('user');
    const last = msgs[msgs.length - 1];
    expect(last.type).toBe('error');
    expect(last.content).toContain('workspace runtime unavailable');
    expect(useChatStore.getState().isAgentWorking).toBe(false);
  });

  it('ignores an empty task', async () => {
    await useChatStore.getState().runAgent('proj-1', '   ');
    expect(useChatStore.getState().messages).toHaveLength(0);
    expect(apiAgentStream).not.toHaveBeenCalled();
  });
});
