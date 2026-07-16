import { create } from 'zustand';
import { wsUrlFor } from '../lib/api';

// Live multiplayer presence (Phase 7): a WebSocket per open project joins a presence room and
// receives join/leave/cursor events fanned out by the control plane (Redis rooms). Identity is
// server-stamped; this client only reports its own active tab / cursor file. The socket lives
// outside the store (not renderable state).

interface PresenceMessage {
  type: 'join' | 'leave' | 'cursor';
  userId: string;
  username: string;
  clientId: string;
  activeTab?: string;
  cursorFile?: string;
  at?: number;
}

export interface Peer {
  clientId: string;
  userId: string;
  username: string;
  activeTab?: string;
  cursorFile?: string;
  lastSeen: number;
}

let socket: WebSocket | null = null;
let currentProjectId: string | null = null;

interface PresenceState {
  peers: Record<string, Peer>; // keyed by clientId
  connected: boolean;
  connect: (projectId: string) => void;
  disconnect: () => void;
  updateLocal: (partial: { activeTab?: string; cursorFile?: string }) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  peers: {},
  connected: false,

  connect: (projectId) => {
    if (socket && currentProjectId === projectId) return;
    // Tear down any prior connection before opening a new room.
    if (socket) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      socket = null;
    }
    currentProjectId = projectId;
    set({ peers: {}, connected: false });

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrlFor(`/api/v1/projects/${projectId}/presence/ws`));
    } catch {
      return; // presence is best-effort; a failed socket just means no avatars
    }
    socket = ws;

    ws.onopen = () => {
      if (socket === ws) set({ connected: true });
    };
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data as string) as PresenceMessage;
        set((s) => {
          const peers = { ...s.peers };
          if (m.type === 'leave') {
            delete peers[m.clientId];
          } else {
            peers[m.clientId] = {
              clientId: m.clientId,
              userId: m.userId,
              username: m.username,
              activeTab: m.activeTab,
              cursorFile: m.cursorFile,
              lastSeen: Date.now(),
            };
          }
          return { peers };
        });
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      if (socket === ws) {
        socket = null;
        set({ connected: false });
      }
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  },

  disconnect: () => {
    if (socket) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      socket = null;
    }
    currentProjectId = null;
    set({ peers: {}, connected: false });
  },

  updateLocal: (partial) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(partial));
      } catch {
        /* ignore */
      }
    }
  },
}));
