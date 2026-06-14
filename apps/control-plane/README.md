# Torsor Control Plane (Go)

A single-binary Go service that is a **1:1 port of the legacy `apps/api`** Express
service — same routes, same JSON shapes, same Postgres schema and JWT/session model —
intended to replace it as the platform control plane (see `docs/ROADMAP.md`, Phase 1).

It is currently shipped **in parallel** with `apps/api`; nothing is wired to depend on
it yet, so adopting it is a deliberate, reversible switch.

## Why Go

- single static binary ("install a small server")
- strong concurrent WebSocket/SSE story for the streaming features coming next
  (terminals, logs, agent tokens)
- idiomatic gRPC for the backend plugin host (workspace runtime, model providers)

## Endpoints (identical to apps/api)

```
GET    /health
GET    /ready
GET    /api/v1
GET    /api/v1/config
POST   /api/v1/auth/signup
POST   /api/v1/auth/login
POST   /api/v1/auth/logout        (auth)
GET    /api/v1/auth/me            (auth)
GET    /api/v1/projects           (auth)
POST   /api/v1/projects           (auth)
GET    /api/v1/projects/{id}      (auth)
PATCH  /api/v1/projects/{id}      (auth)
DELETE /api/v1/projects/{id}      (auth)
GET    /api/v1/projects/{id}/files (auth)
POST   /api/v1/projects/{id}/files (auth)
GET    /api/v1/tasks              (auth)
POST   /api/v1/tasks              (auth)
GET    /api/v1/providers/models                          (auth)  # list loaded model plugins
POST   /api/v1/providers/models/{name}/complete          (auth)  # invoke (one-shot)
POST   /api/v1/providers/models/{name}/complete/stream   (auth)  # stream via SSE
GET    /api/v1/providers/models/{name}/complete/ws       (?access_token)  # stream via WebSocket
```

## Configuration

Reads the same environment variables as `apps/api`: `DATABASE_URL`, `REDIS_URL`,
`JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`, `PORT`/`API_PORT`, `APP_URL`,
`SUPER_ADMIN_EMAILS`, `DEV_SEED_EMAIL`, `DEV_SEED_PASSWORD`, `AUTH_RATE_LIMIT`,
`API_RATE_LIMIT`, `DATABASE_POOL_MAX`, `LOG_LEVEL`, `NODE_ENV`.

Migrations are embedded and applied on boot using the same `schema_migrations`
bookkeeping table and filenames as `apps/api`, so either service can run them against a
shared database without conflict (the SQL is idempotent).

## Run locally

```bash
# infra from the repo root
docker compose up postgres redis

cd apps/control-plane
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/torsor_dev \
REDIS_URL=redis://localhost:6379 \
NODE_ENV=development \
go run ./cmd/server
```

```bash
go build ./...   # compile
go vet ./...     # static checks
```

## Plugins (kernel + contributions)

Backend capabilities run **out-of-process over gRPC** via hashicorp/go-plugin — the
control-plane binary stays small and a crashing plugin can't take it down. The first
capability is `ModelProvider`; `WorkspaceRuntime`, `DeployTarget`, `VCSProvider`, etc.
follow the same shape.

```
internal/plugin/proto/model.proto   capability contract (gRPC)
internal/plugin/model.go            Go interface + gRPC client/server adapters + handshake
internal/plugin/host.go             host: launch/track plugins; Serve() helper for plugins
cmd/mock-model                      reference ModelProvider plugin (deterministic, no deps)
```

The capability supports both one-shot (`Complete`) and streaming (`CompleteStream`, gRPC
server-streaming) completions. Streaming is surfaced over **SSE** (Bearer header, suits
the fetch-based frontend) and **WebSocket** (token via `access_token` query, since
browsers can't set headers on a WebSocket). Both emit the same JSON chunk frames:
`{"textDelta":"...","done":false,"model":"..."}` ending with `{"done":true,...}`.

Authoring a model provider plugin = implement `plugin.ModelProvider` and call
`plugin.Serve(impl)`. Real providers (Ollama, Claude, OpenAI) follow `cmd/mock-model`.

Load plugins by pointing `TORSOR_MODEL_PLUGINS` at one or more executables:

```bash
go build -o /tmp/mock-model ./cmd/mock-model
TORSOR_MODEL_PLUGINS=/tmp/mock-model \
DATABASE_URL=... REDIS_URL=... NODE_ENV=development go run ./cmd/server

curl -H "authorization: Bearer $TOKEN" localhost:3001/api/v1/providers/models
curl -X POST -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"prompt":"build a hero section"}' \
  localhost:3001/api/v1/providers/models/mock/complete
```

Regenerate gRPC stubs after editing the proto:

```bash
protoc -I . --go_out=. --go_opt=module=github.com/magnetoid/torsor/control-plane \
  --go-grpc_out=. --go-grpc_opt=module=github.com/magnetoid/torsor/control-plane \
  internal/plugin/proto/model.proto
```

## Layout

```
cmd/server          entrypoint: config, startup retries, plugin load, graceful shutdown
cmd/mock-model      reference ModelProvider plugin
internal/config     env-driven configuration
internal/db         pgx pool + health
internal/redisx     redis client (job signaling, readiness)
internal/migrations embedded SQL + idempotent runner
internal/auth       bcrypt, JWT, session validation, middleware
internal/plugin     gRPC capability contracts + go-plugin host
internal/server     chi router + handlers (auth, projects, files, tasks, providers)
```

## Not yet ported (intentional, next steps)

- more capability contracts: `WorkspaceRuntime` (unblocks Phase 2), `DeployTarget`, …
- real model plugins (Ollama local-first, Claude/OpenAI BYO-key)
- frontend contribution registry + theme-token contract
- compose/nginx switch from `apps/api` to this service (deliberate cutover)
