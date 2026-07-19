import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('../lib/api', () => ({ apiRequest: vi.fn() }));

import { useSkillsStore, type Skill } from './skillsStore';
import { apiRequest } from '../lib/api';

const mockApi = apiRequest as unknown as ReturnType<typeof vi.fn>;
const PID = 'project-1';

const rawSkill = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  project_id: PID,
  name: 'Zod',
  description: 'validation',
  instruction: 'Always validate with Zod.',
  enabled: true,
  created_at: '2026-07-19T00:00:00Z',
  updated_at: '2026-07-19T00:00:00Z',
  ...over,
});

const seedSkill = (id: string, enabled = true): Skill => ({
  id,
  projectId: PID,
  name: `skill-${id}`,
  description: '',
  instruction: 'do a thing',
  enabled,
  createdAt: '2026-07-19T00:00:00Z',
  updatedAt: '2026-07-19T00:00:00Z',
});

beforeEach(() => {
  mockApi.mockReset();
  useSkillsStore.setState({ byProject: {}, loading: false, error: null });
});

describe('skillsStore.fetchSkills', () => {
  it('maps API rows, coercing enabled to a boolean', async () => {
    mockApi.mockResolvedValueOnce({ items: [rawSkill(), rawSkill({ id: 's2', enabled: 0 })] });
    await useSkillsStore.getState().fetchSkills(PID);

    const list = useSkillsStore.getState().byProject[PID];
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 's1', name: 'Zod', instruction: 'Always validate with Zod.', enabled: true });
    expect(list[1].enabled).toBe(false);
  });

  it('records an error and clears loading on failure', async () => {
    mockApi.mockRejectedValueOnce(new Error('nope'));
    await useSkillsStore.getState().fetchSkills(PID);
    expect(useSkillsStore.getState().error).toBe('nope');
    expect(useSkillsStore.getState().loading).toBe(false);
  });
});

describe('skillsStore mutations', () => {
  it('addSkill prepends the created skill and sends the input body', async () => {
    useSkillsStore.setState({ byProject: { [PID]: [seedSkill('old')] } });
    mockApi.mockResolvedValueOnce(rawSkill({ id: 'new', name: 'JSDoc' }));
    await useSkillsStore.getState().addSkill(PID, { name: 'JSDoc', instruction: 'Add JSDoc.' });

    const list = useSkillsStore.getState().byProject[PID];
    expect(list[0].id).toBe('new');
    expect(list).toHaveLength(2);
    expect(JSON.parse(mockApi.mock.calls[0][1].body)).toEqual({ name: 'JSDoc', instruction: 'Add JSDoc.' });
  });

  it('updateSkill toggling enabled replaces the skill in place', async () => {
    useSkillsStore.setState({ byProject: { [PID]: [seedSkill('s1', true), seedSkill('s2', true)] } });
    mockApi.mockResolvedValueOnce(rawSkill({ id: 's1', enabled: false }));
    await useSkillsStore.getState().updateSkill(PID, 's1', { enabled: false });

    const s1 = useSkillsStore.getState().byProject[PID].find((s) => s.id === 's1')!;
    expect(s1.enabled).toBe(false);
    expect(JSON.parse(mockApi.mock.calls[0][1].body)).toEqual({ enabled: false });
  });

  it('deleteSkill removes the skill', async () => {
    useSkillsStore.setState({ byProject: { [PID]: [seedSkill('s1'), seedSkill('s2')] } });
    mockApi.mockResolvedValueOnce({ ok: true });
    await useSkillsStore.getState().deleteSkill(PID, 's1');
    expect(useSkillsStore.getState().byProject[PID].map((s) => s.id)).toEqual(['s2']);
  });
});
