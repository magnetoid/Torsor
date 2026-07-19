import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../lib/api', () => ({ apiRequest: vi.fn() }));

import { useProjectStore } from './projectStore';
import { apiRequest } from '../lib/api';

const mockApi = apiRequest as unknown as ReturnType<typeof vi.fn>;

const rawProject = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  name: 'My App',
  description: 'a project',
  vibe: 'builder',
  is_public: true,
  template: 'vite-react',
  created_at: '2026-07-19T00:00:00Z',
  updated_at: '2026-07-19T00:00:00Z',
  ...over,
});

beforeEach(() => {
  mockApi.mockReset();
  useProjectStore.setState({ projects: [], currentProject: null, isLoading: false, error: null });
});

describe('projectStore.fetchProjects', () => {
  it('maps API rows into Project shape', async () => {
    mockApi.mockResolvedValueOnce({ items: [rawProject(), rawProject({ id: 'p2', is_public: false, template: null })] });
    await useProjectStore.getState().fetchProjects();

    const projects = useProjectStore.getState().projects;
    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({
      id: 'p1',
      name: 'My App',
      workspaceId: 'server-default',
      isPublished: true,
      template: 'vite-react',
    });
    // Null template normalizes to undefined; is_public=false → isPublished false.
    expect(projects[1].template).toBeUndefined();
    expect(projects[1].isPublished).toBe(false);
    expect(useProjectStore.getState().isLoading).toBe(false);
  });

  it('sets error and rethrows on failure', async () => {
    mockApi.mockRejectedValueOnce(new Error('down'));
    await expect(useProjectStore.getState().fetchProjects()).rejects.toThrow('down');
    expect(useProjectStore.getState().error).toBe('down');
    expect(useProjectStore.getState().isLoading).toBe(false);
  });
});

describe('projectStore.createProject', () => {
  it('forwards the template only when provided and prepends the created project', async () => {
    mockApi.mockResolvedValueOnce(rawProject({ id: 'new' }));
    const id = await useProjectStore.getState().createProject(
      { name: 'Fresh', template: 'vite-react' },
      'ws-1',
    );

    expect(id).toBe('new');
    const state = useProjectStore.getState();
    expect(state.projects[0].id).toBe('new');
    expect(state.projects[0].workspaceId).toBe('ws-1');
    expect(state.currentProject?.id).toBe('new');
    const body = JSON.parse(mockApi.mock.calls[0][1].body);
    expect(body.template).toBe('vite-react');
    expect(body.name).toBe('Fresh');
  });

  it('omits the template key when none is given', async () => {
    mockApi.mockResolvedValueOnce(rawProject({ id: 'blank', template: null }));
    await useProjectStore.getState().createProject({ name: 'Blank' }, 'ws-1');
    const body = JSON.parse(mockApi.mock.calls[0][1].body);
    expect('template' in body).toBe(false);
  });
});

describe('projectStore.updateProject / deleteProject', () => {
  it('updateProject merges the normalized result into the list', async () => {
    useProjectStore.setState({
      projects: [{ ...toProject('p1'), name: 'old' }],
    });
    mockApi.mockResolvedValueOnce(rawProject({ id: 'p1', name: 'renamed' }));
    await useProjectStore.getState().updateProject('p1', { name: 'renamed' });

    expect(useProjectStore.getState().projects.find((p) => p.id === 'p1')!.name).toBe('renamed');
  });

  it('deleteProject removes the project', async () => {
    useProjectStore.setState({ projects: [toProject('p1'), toProject('p2')] });
    mockApi.mockResolvedValueOnce({ ok: true });
    await useProjectStore.getState().deleteProject('p1');
    expect(useProjectStore.getState().projects.map((p) => p.id)).toEqual(['p2']);
  });
});

// A minimal already-mapped Project for seeding store state.
function toProject(id: string) {
  return {
    id,
    workspaceId: 'server-default',
    name: `project ${id}`,
    description: '',
    lastEdited: '7/19/2026',
    type: 'website' as const,
    isPublished: false,
    isArchived: false,
    teamAvatars: [],
    teamMembers: [],
    techStack: [],
    mode: 'builder' as const,
  };
}
