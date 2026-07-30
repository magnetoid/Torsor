import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { getStoredToken, wsOrigin } from './api';

/**
 * Yjs co-editing client (Phase 7 / Track A).
 *
 * The backend half already existed and was unused: `GET /projects/{id}/collab/ws` is an
 * ownership-checked proxy in the control plane that pipes to the `torsor-collab`
 * y-websocket sidecar, with the room name fixed to the project id server-side. This
 * module is the missing client.
 *
 * One Y.Doc + one socket per project (files share the connection); each file is a
 * separate Y.Text keyed by its workspace path, so opening a second file costs nothing.
 * Connections are refcounted and torn down when the last subscriber leaves.
 */

export interface CollabSession {
  doc: Y.Doc;
  provider: WebsocketProvider;
}

interface Entry extends CollabSession {
  refs: number;
}

const sessions = new Map<string, Entry>();

/** Stable per-user cursor colour, so a collaborator keeps the same colour across files. */
export function collabColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  const hues = [265, 210, 145, 35, 0, 305, 180];
  return `hsl(${hues[Math.abs(hash) % hues.length]}, 70%, 60%)`;
}

/**
 * Join (or reuse) the co-editing session for a project. The provider builds
 * `<origin>/api/v1/projects/{id}/collab/ws?access_token=…` — y-websocket appends the
 * room name to the server URL, so "ws" is the last path segment, not a room id. The
 * real room is chosen by the proxy (always the project id), so a client cannot join
 * another project's document by renaming its room.
 */
export function joinCollab(projectId: string): CollabSession {
  const existing = sessions.get(projectId);
  if (existing) {
    existing.refs += 1;
    return existing;
  }

  const doc = new Y.Doc();
  const provider = new WebsocketProvider(
    `${wsOrigin()}/api/v1/projects/${encodeURIComponent(projectId)}/collab`,
    'ws',
    doc,
    { connect: true, params: { access_token: getStoredToken() ?? '' } },
  );

  const entry: Entry = { doc, provider, refs: 1 };
  sessions.set(projectId, entry);
  return entry;
}

/** Release one reference; the socket and document are destroyed at zero. */
export function leaveCollab(projectId: string): void {
  const entry = sessions.get(projectId);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  sessions.delete(projectId);
  try {
    entry.provider.destroy();
  } catch {
    // destroy() throws if the socket already closed — nothing to clean up then.
  }
  entry.doc.destroy();
}

/**
 * The shared text for one file. Seeding is the subtle part of CRDT + REST: the
 * document starts empty for the first peer, so it must be filled from the file the
 * server gave us — but only once, and only by whoever gets there first. A shared
 * `seeded` map is the flag; later peers take the CRDT state as truth and must not
 * re-insert their own copy (that is what produces duplicated file contents).
 */
export function fileText(doc: Y.Doc, path: string, initial: string): Y.Text {
  const text = doc.getText(`file:${path}`);
  const seeded = doc.getMap<boolean>('seeded');
  if (!seeded.get(path) && text.length === 0 && initial) {
    doc.transact(() => {
      text.insert(0, initial);
      seeded.set(path, true);
    });
  } else if (!seeded.get(path) && text.length > 0) {
    seeded.set(path, true);
  }
  return text;
}
