import { create } from 'zustand';
import {
  apiListTasks,
  apiGetTask,
  apiCreateAgentTask,
  apiCancelTask,
  apiTaskEventsStream,
  type TaskSummary,
  type TaskDetail,
  type AgentEvent,
} from '../lib/api';

// Agent Runs: background coding-agent runs as first-class, observable objects. This store
// lists runs, starts new background runs, and attaches to a run's step stream — replaying the
// persisted transcript then live-tailing until it finishes. Reattach works because the
// transcript is server-persisted (ai_tasks.events), so closing the tab never loses a run.

// The attach stream's AbortController lives outside the store (not renderable state).
let attachController: AbortController | null = null;

function isTerminal(status: TaskSummary['status']): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}

interface RunsState {
  runs: TaskSummary[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  detail: TaskDetail | null;
  /** The selected run's transcript, live-merged (stored events + live-tailed steps). */
  detailEvents: AgentEvent[];
  attaching: boolean;

  loadRuns: () => Promise<void>;
  startRun: (projectId: string, task: string) => Promise<void>;
  select: (taskId: string) => Promise<void>;
  refreshSelected: (taskId: string) => Promise<void>;
  cancel: (taskId: string) => Promise<void>;
  clearSelection: () => void;
}

export const useRunsStore = create<RunsState>((set, get) => ({
  runs: [],
  loading: false,
  error: null,
  selectedId: null,
  detail: null,
  detailEvents: [],
  attaching: false,

  loadRuns: async () => {
    set({ loading: true, error: null });
    try {
      const runs = await apiListTasks();
      set({ runs, loading: false });
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : 'Failed to load runs' });
    }
  },

  startRun: async (projectId, task) => {
    const trimmed = task.trim();
    if (!trimmed) return;
    try {
      const created = await apiCreateAgentTask(projectId, trimmed);
      set((s) => ({ runs: [created, ...s.runs] }));
      await get().select(created.id); // auto-open + start tailing
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to start run' });
    }
  },

  select: async (taskId) => {
    attachController?.abort();
    attachController = null;
    set({ selectedId: taskId, detail: null, detailEvents: [], attaching: true, error: null });

    let detail: TaskDetail;
    try {
      detail = await apiGetTask(taskId);
    } catch (e) {
      if (get().selectedId === taskId) {
        set({ attaching: false, error: e instanceof Error ? e.message : 'Failed to load run' });
      }
      return;
    }
    if (get().selectedId !== taskId) return; // selection changed while loading
    set({ detail, detailEvents: detail.events ?? [] });

    if (isTerminal(detail.status)) {
      set({ attaching: false });
      return;
    }

    // Live-tail the still-running run. Dedup against what we already have by seq.
    const controller = new AbortController();
    attachController = controller;
    const maxSeq = () => get().detailEvents.reduce((m, e) => Math.max(m, e.seq ?? 0), 0);
    try {
      await apiTaskEventsStream(taskId, {
        signal: controller.signal,
        onEvent: (e) => {
          if (get().selectedId !== taskId) return;
          const seq = e.seq ?? 0;
          if (seq !== 0 && seq <= maxSeq()) return; // already replayed
          set((s) => ({ detailEvents: [...s.detailEvents, e] }));
        },
        onDone: () => {
          void get().refreshSelected(taskId);
          void get().loadRuns();
        },
      });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      if (!aborted && get().selectedId === taskId) {
        set({ error: e instanceof Error ? e.message : 'Stream error' });
      }
    } finally {
      if (attachController === controller) attachController = null;
      if (get().selectedId === taskId) set({ attaching: false });
    }
  },

  refreshSelected: async (taskId) => {
    try {
      const detail = await apiGetTask(taskId);
      if (get().selectedId !== taskId) return;
      // The persisted transcript is authoritative once the run is finished.
      set({ detail, detailEvents: detail.events ?? get().detailEvents });
    } catch {
      /* best-effort refresh */
    }
  },

  cancel: async (taskId) => {
    try {
      await apiCancelTask(taskId);
      set((s) => ({
        runs: s.runs.map((r) => (r.id === taskId ? { ...r, status: 'cancelled' } : r)),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to cancel run' });
    }
  },

  clearSelection: () => {
    attachController?.abort();
    attachController = null;
    set({ selectedId: null, detail: null, detailEvents: [], attaching: false });
  },
}));
