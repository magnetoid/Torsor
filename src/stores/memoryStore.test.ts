import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the API module so the store's actions drive scripted responses instead of the network.
vi.mock('../lib/api', () => ({ apiRequest: vi.fn() }));

import { useMemoryStore } from './memoryStore';
import { apiRequest } from '../lib/api';

const mockApi = apiRequest as unknown as ReturnType<typeof vi.fn>;
const PID = 'project-1';

const rawMemory = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  project_id: PID,
  kind: 'decision',
  content: 'API base is /api/v1',
  source: 'agent',
  created_at: '2026-07-19T00:00:00Z',
  updated_at: '2026-07-19T00:00:00Z',
  ...over,
});

beforeEach(() => {
  mockApi.mockReset();
  useMemoryStore.setState({ byProject: {}, loading: false, error: null });
});

describe('memoryStore.fetchMemories', () => {
  it('maps API rows into the store keyed by project', async () => {
    mockApi.mockResolvedValueOnce({ items: [rawMemory(), rawMemory({ id: 'm2', source: 'user', kind: 'note' })] });
    await useMemoryStore.getState().fetchMemories(PID);

    const list = useMemoryStore.getState().byProject[PID];
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'm1', content: 'API base is /api/v1', kind: 'decision', source: 'agent' });
    // Unknown/other source normalizes to 'user'.
    expect(list[1].source).toBe('user');
    expect(useMemoryStore.getState().loading).toBe(false);
  });

  it('appends a ?q= filter only when a query is provided', async () => {
    mockApi.mockResolvedValue({ items: [] });
    await useMemoryStore.getState().fetchMemories(PID);
    expect(mockApi.mock.calls[0][0]).toBe(`/api/v1/projects/${PID}/memories`);

    await useMemoryStore.getState().fetchMemories(PID, 'postgres');
    expect(mockApi.mock.calls[1][0]).toBe(`/api/v1/projects/${PID}/memories?q=postgres`);
  });

  it('records an error and clears loading when the request fails', async () => {
    mockApi.mockRejectedValueOnce(new Error('boom'));
    await useMemoryStore.getState().fetchMemories(PID);
    expect(useMemoryStore.getState().error).toBe('boom');
    expect(useMemoryStore.getState().loading).toBe(false);
  });
});

describe('memoryStore mutations', () => {
  it('addMemory prepends the created memory', async () => {
    useMemoryStore.setState({ byProject: { [PID]: [rawMemoryAsMemory('existing')] } });
    mockApi.mockResolvedValueOnce(rawMemory({ id: 'new', content: 'fresh' }));
    await useMemoryStore.getState().addMemory(PID, 'fresh', 'note');

    const list = useMemoryStore.getState().byProject[PID];
    expect(list[0].id).toBe('new');
    expect(list).toHaveLength(2);
    // POST body carries the content + kind.
    const body = JSON.parse(mockApi.mock.calls[0][1].body);
    expect(body).toEqual({ content: 'fresh', kind: 'note' });
  });

  it('updateMemory replaces the memory in place', async () => {
    useMemoryStore.setState({ byProject: { [PID]: [rawMemoryAsMemory('m1'), rawMemoryAsMemory('m2')] } });
    mockApi.mockResolvedValueOnce(rawMemory({ id: 'm1', content: 'edited' }));
    await useMemoryStore.getState().updateMemory(PID, 'm1', { content: 'edited' });

    const list = useMemoryStore.getState().byProject[PID];
    expect(list).toHaveLength(2);
    expect(list.find((m) => m.id === 'm1')!.content).toBe('edited');
  });

  it('deleteMemory removes the memory', async () => {
    useMemoryStore.setState({ byProject: { [PID]: [rawMemoryAsMemory('m1'), rawMemoryAsMemory('m2')] } });
    mockApi.mockResolvedValueOnce({ ok: true });
    await useMemoryStore.getState().deleteMemory(PID, 'm1');

    const list = useMemoryStore.getState().byProject[PID];
    expect(list.map((m) => m.id)).toEqual(['m2']);
  });
});

// Helper: a minimal already-mapped Memory for seeding store state.
function rawMemoryAsMemory(id: string) {
  return {
    id,
    projectId: PID,
    kind: 'note',
    content: `content ${id}`,
    source: 'user' as const,
    createdAt: '2026-07-19T00:00:00Z',
    updatedAt: '2026-07-19T00:00:00Z',
  };
}
