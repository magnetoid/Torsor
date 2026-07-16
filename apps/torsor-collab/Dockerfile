# torsor-collab: Yjs co-editing sidecar. Internal-only (fronted by the control-plane collab
# proxy for auth) — expose it on the internal network, never bind a host port.
FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

EXPOSE 1234
CMD ["node", "server.js"]
