import { create } from 'zustand';
import { ApiError, apiRequest, apiStream } from '../lib/api';
import { useSettingsStore } from './settingsStore';

export type ContextType = 'file' | 'code' | 'canvas';

export interface ContextItem {
  id: string;
  type: ContextType;
  name: string;
  content?: string;
}

export type MessageType = 'user' | 'agent' | 'work' | 'plan' | 'terminal' | 'error' | 'deploy';

export interface ChatMessageData {
  id: string;
  type: MessageType;
  content: string;
  timestamp: number;
  metadata?: any;
}

/** A model provider plugin loaded by the control plane (GET /api/v1/providers/models). */
export interface ModelProviderInfo {
  name: string;
  displayName: string;
  version: string;
  kind: string;
}

const SYSTEM_PROMPT =
  'You are Torsor Agent, the coding assistant inside the Torsor cloud IDE. ' +
  'Help the user build, debug, and ship their project. Be concise and concrete; ' +
  'prefer code and actionable steps over generalities.';

// Flatten prior chat turns into a single prompt. The ModelProvider contract is
// prompt+system (no message array yet), so multi-turn context travels as a transcript.
function buildPrompt(history: ChatMessageData[], latest: string): string {
  const turns = history
    .filter((m) => m.type === 'user' || m.type === 'agent')
    .map((m) => `${m.type === 'user' ? 'User' : 'Assistant'}: ${m.content}`);
  turns.push(`User: ${latest}`, 'Assistant:');
  return turns.join('\n\n');
}

// Kept outside the store: an AbortController is not renderable state.
let abortController: AbortController | null = null;

interface ChatState {
  messages: ChatMessageData[];
  isAgentWorking: boolean;
  currentThread: { id: string; title: string } | null;
  selectedContext: ContextItem[];
  planning: boolean;
  providers: ModelProviderInfo[];
  selectedProvider: string | null;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  stopAgent: () => void;
  loadProviders: () => Promise<void>;
  setProvider: (name: string) => void;
  clearChat: () => void;
  addContext: (item: ContextItem) => void;
  removeContext: (id: string) => void;
  setThread: (thread: { id: string; title: string } | null) => void;
  setPlanning: (planning: boolean) => void;
  setAgentWorking: (working: boolean) => void;
  reset: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isAgentWorking: false,
  currentThread: null,
  selectedContext: [],
  planning: false,
  providers: [],
  selectedProvider: null,

  reset: () => {
    abortController?.abort();
    abortController = null;
    set({
      messages: [],
      isAgentWorking: false,
      currentThread: null,
      selectedContext: [],
      planning: false,
    });
  },

  loadProviders: async () => {
    const data = await apiRequest<{ items: ModelProviderInfo[] }>('/api/v1/providers/models', { auth: true });
    const providers = data.items ?? [];
    set((state) => {
      // Keep an explicit selection when it still exists; otherwise prefer the persisted
      // default model from settings, then the first loaded provider.
      const preferred = useSettingsStore.getState().ai.defaultModel;
      const current = state.selectedProvider;
      const selected =
        (current && providers.some((p) => p.name === current) && current) ||
        (providers.some((p) => p.name === preferred) && preferred) ||
        providers[0]?.name ||
        null;
      return { providers, selectedProvider: selected };
    });
  },

  setProvider: (name) => {
    set({ selectedProvider: name });
    useSettingsStore.getState().updateAI({ defaultModel: name });
  },

  sendMessage: async (content) => {
    const trimmed = content.trim();
    if (!trimmed || get().isAgentWorking) return;

    const history = get().messages;
    const userMessage: ChatMessageData = {
      id: `msg-${Date.now()}`,
      type: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isAgentWorking: true,
      currentThread: state.currentThread || { id: `thread-${Date.now()}`, title: trimmed.slice(0, 50) },
    }));

    const appendMessage = (msg: ChatMessageData) =>
      set((state) => ({ messages: [...state.messages, msg] }));

    // Resolve a provider, loading the list on first use.
    if (get().providers.length === 0) {
      try {
        await get().loadProviders();
      } catch {
        /* handled below via the no-provider path */
      }
    }
    const provider = get().selectedProvider;
    if (!provider) {
      appendMessage({
        id: `msg-error-${Date.now()}`,
        type: 'error',
        content:
          'No model provider is available. Start the control plane with a model plugin loaded ' +
          '(e.g. TORSOR_MODEL_PLUGINS pointing at the ollama-model binary) and try again.',
        timestamp: Date.now(),
      });
      set({ isAgentWorking: false });
      return;
    }

    const agentMessageId = `msg-agent-${Date.now()}`;
    appendMessage({ id: agentMessageId, type: 'agent', content: '', timestamp: Date.now() });
    const appendDelta = (delta: string) =>
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === agentMessageId ? { ...m, content: m.content + delta } : m
        ),
      }));

    abortController = new AbortController();
    try {
      await apiStream(
        `/api/v1/providers/models/${encodeURIComponent(provider)}/complete/stream`,
        { prompt: buildPrompt(history, trimmed), system: SYSTEM_PROMPT, maxTokens: 2048 },
        {
          auth: true,
          signal: abortController.signal,
          onChunk: (chunk) => {
            if (chunk.textDelta) appendDelta(chunk.textDelta);
          },
        }
      );
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      if (aborted) {
        // Keep whatever streamed before the stop; drop the message if nothing arrived.
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== agentMessageId || m.content !== ''),
        }));
      } else {
        const detail = err instanceof ApiError || err instanceof Error ? err.message : 'Unknown error';
        set((state) => ({
          messages: [
            ...state.messages.filter((m) => m.id !== agentMessageId || m.content !== ''),
            {
              id: `msg-error-${Date.now()}`,
              type: 'error' as const,
              content: `Model request failed: ${detail}`,
              timestamp: Date.now(),
            },
          ],
        }));
      }
    } finally {
      abortController = null;
      set({ isAgentWorking: false });
    }
  },

  stopAgent: () => {
    abortController?.abort();
  },

  clearChat: () => set({ messages: [], currentThread: null, selectedContext: [] }),

  addContext: (item) => set((state) => ({
    selectedContext: [...state.selectedContext.filter(i => i.id !== item.id), item]
  })),

  removeContext: (id) => set((state) => ({
    selectedContext: state.selectedContext.filter(i => i.id !== id)
  })),

  setThread: (thread) => set({ currentThread: thread }),

  setPlanning: (planning) => set({ planning }),

  setAgentWorking: (working) => set({ isAgentWorking: working }),
}));
