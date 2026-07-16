// torsor-collab — the Yjs co-editing sidecar (Phase 7).
//
// A thin wrapper around y-websocket's reference server: it runs CRDT document sync +
// awareness (cursors/selections) for a room, where the room name is the URL path. It does NOT
// authenticate — the Torsor control plane sits in front of it (GET /projects/{id}/collab/ws),
// enforces project ownership, and proxies the WebSocket through with the room = project id.
// So this process is only ever reachable via that ownership-checked proxy (bind it to the
// internal network only — `expose`, never a host port). Per ADR 0010 the CRDT + transport is
// the y-websocket OSS package; Torsor only owns the auth proxy in Go.
//
// Run: `npm install && node server.js` (PORT defaults to 1234).

const http = require('http');
const WebSocket = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils');

const port = Number(process.env.PORT || 1234);

const server = http.createServer((_req, res) => {
  // A plain health endpoint so a container healthcheck / the proxy can probe liveness.
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('torsor-collab ok');
});

const wss = new WebSocket.Server({ server });

// setupWSConnection uses the request URL as the Yjs document name by default, so each project
// (the control plane proxies with the project id as the path) is an isolated document.
wss.on('connection', (conn, req) => setupWSConnection(conn, req));

server.listen(port, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`torsor-collab (y-websocket) listening on :${port}`);
});
