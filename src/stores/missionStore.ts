import { create } from 'zustand';
import { apiRequest } from '../lib/api';

export interface MissionTask {
  id: string; ordinal: number; objective: string;
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped';
  attempts: number; result: string;
}
export interface Mission {
  id: string; projectId: string; goal: string;
  status: 'planning' | 'awaiting_approval' | 'running' | 'completed' | 'failed' | 'stopped';
  plan: string[]; summary: string;
}

interface MissionState {
  current: { mission: Mission; tasks: MissionTask[] } | null;
  loading: boolean;
  error: string | null;
  createMission: (projectId: string, goal: string) => Promise<void>;
  approveMission: (projectId: string, missionId: string, plan?: string[]) => Promise<void>;
  fetchMission: (projectId: string, missionId: string) => Promise<void>;
  stopMission: (projectId: string, missionId: string) => Promise<void>;
}

export const useMissionStore = create<MissionState>()((set, get) => ({
  current: null,
  loading: false,
  error: null,
  createMission: async (projectId, goal) => {
    set({ loading: true, error: null });
    try {
      const res = await apiRequest<{ mission: Mission; tasks: MissionTask[] }>(
        `/api/v1/projects/${projectId}/agent/missions`,
        { method: 'POST', auth: true, body: JSON.stringify({ goal }) });
      set({ current: res, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to plan mission' });
    }
  },
  approveMission: async (projectId, missionId, plan) => {
    await apiRequest(`/api/v1/projects/${projectId}/agent/missions/${missionId}/approve`,
      { method: 'POST', auth: true, body: JSON.stringify(plan ? { plan } : {}) });
    await get().fetchMission(projectId, missionId);
  },
  fetchMission: async (projectId, missionId) => {
    const res = await apiRequest<{ mission: Mission; tasks: MissionTask[] }>(
      `/api/v1/projects/${projectId}/agent/missions/${missionId}`, { auth: true });
    set({ current: res });
  },
  stopMission: async (projectId, missionId) => {
    await apiRequest(`/api/v1/projects/${projectId}/agent/missions/${missionId}/stop`,
      { method: 'POST', auth: true });
    await get().fetchMission(projectId, missionId);
  },
}));
