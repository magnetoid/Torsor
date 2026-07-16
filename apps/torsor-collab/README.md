# torsor-collab — Yjs co-editing sidecar

Real-time collaborative editing for Torsor, built on **Yjs** (the mainstream CRDT) and its
reference **y-websocket** server. This process only runs CRDT sync + awareness; the Torsor
control plane fronts it and enforces auth.

## Architecture

```
browser (y-monaco + WebsocketProvider)
        │  wss://app.torsor.dev/api/v1/projects/{id}/collab/ws
        ▼
control-plane  handleCollabWS  ── authenticates (access_token) + checks project ownership
        │  ws://torsor-collab:1234/{projectId}     (proxied, room = project id)
        ▼
torsor-collab (this sidecar)  ── Yjs document sync + awareness, per room
```

- **Auth lives in Go, not here.** The sidecar is internal-only (`expose`, no host port). The
  only way in is the control-plane proxy, which rejects anyone who doesn't own the project.
  So the sidecar never needs to know about users or tokens.
- **Room = project id.** The proxy sets the upstream path to the project id, which
  `setupWSConnection` uses as the Yjs document name — isolating each project's document.
- **Why a Node sidecar, not Go core.** Go CRDT libraries are immature; y-websocket is
  battle-tested (~900k weekly downloads). Per ADR 0010 we integrate the OSS server and keep
  it swappable behind the proxy, rather than reimplement CRDT sync.

## Run it

```bash
# alongside the base stack
docker compose -f docker-compose.yml -f docker-compose.collab.yml up --build
# then set on the control-plane service:
TORSOR_COLLAB_URL=ws://torsor-collab:1234
```

With `TORSOR_COLLAB_URL` unset, `/collab/ws` returns 503 and Torsor runs single-user (the
existing debounced `saveFile` path). Nothing else changes.

## Frontend integration (the final wiring — validate with two live browsers)

The control-plane proxy + this sidecar are in place. The remaining step is the editor binding,
which is deliberately **not yet added to the frontend** because it needs two real browsers on
the deployed server to validate convergence (and it pulls `yjs` / `y-websocket` / `y-monaco`
into the bundle). The plan:

1. Add deps: `npm i yjs y-websocket y-monaco`.
2. In [CodeEditorTab](../../src/components/tabs/CodeEditorTab.tsx), when a project is open and
   co-editing is enabled, bind Monaco to a shared Yjs document:

   ```ts
   import * as Y from 'yjs';
   import { WebsocketProvider } from 'y-websocket';
   import { MonacoBinding } from 'y-monaco';
   import { wsUrlFor } from '../../lib/api';

   const doc = new Y.Doc();
   // wsUrlFor already appends ?access_token=…; WebsocketProvider takes (base, room, doc).
   const provider = new WebsocketProvider(
     wsUrlFor(`/api/v1/projects/${projectId}/collab`), // proxy base
     'ws',                                             // room segment (path completes to /collab/ws)
     doc,
     { params: {} }
   );
   const type = doc.getText('monaco');
   const binding = new MonacoBinding(type, editor.getModel(), new Set([editor]), provider.awareness);
   // awareness → remote cursors/selections; set { name, color } as the local state.
   ```

3. While ≥2 clients are connected, the Yjs doc is the write source; flush debounced to the
   existing `saveFile` path (B1) so persistence stays single-sourced. On disconnect, fall back
   to the normal editor.
4. Awareness cursors reuse the same identity the presence layer already broadcasts.

Until then, **presence-lite** (live avatars + which-tab, already shipped) is the visible
multiplayer layer; co-editing turns on when this sidecar is deployed and the binding above is
wired and verified on the server.
