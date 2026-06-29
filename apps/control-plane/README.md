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
PATCH  /api/v1/projects/{id}/files/{fileId} (auth)   # rename / change language
DELETE /api/v1/projects/{id}/files/{fileId} (auth)
GET    /api/v1/tasks              (auth)
POST   /api/v1/tasks              (auth)
GET    /api/v1/admin/stats        (admin)            # platform dashboard totals
GET    /api/v1/admin/users        (admin)            # paginated user list + search
PATCH  /api/v1/admin/users/{userId}/role (super_admin)
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

## WorkspaceRuntime capability (Phase 2 — the flagship)

The second capability, `WorkspaceRuntime`, owns per-user cloud workspaces (containers
today; Firecracker/K8s later). Same out-of-process gRPC plugin shape as `ModelProvider`:

```
internal/plugin/proto/runtime.proto   capability contract (lifecycle + exec stream + file ops)
internal/plugin/runtime.go            Go interface + gRPC client/server adapters + ServeRuntime
cmd/mock-runtime                      reference plugin (deterministic, in-memory, no Docker)
internal/server/runtime_handlers.go   HTTP surface under /api/v1/runtimes
cmd/docker-runtime                    real runtime: container-per-workspace via the docker CLI
```

Authoring a runtime plugin = implement `plugin.WorkspaceRuntime` and call
`plugin.ServeRuntime(impl)`. Load runtimes by pointing `TORSOR_WORKSPACE_RUNTIME_PLUGINS`
at one or more executables (CSV, same shape as `TORSOR_MODEL_PLUGINS`):

```bash
go build -o /tmp/mock-runtime ./cmd/mock-runtime
TORSOR_WORKSPACE_RUNTIME_PLUGINS=/tmp/mock-runtime TORSOR_DEFAULT_RUNTIME=mock \
DATABASE_URL=... REDIS_URL=... NODE_ENV=development go run ./cmd/server

curl -H "authorization: Bearer $TOKEN" localhost:3001/api/v1/runtimes
curl -X POST -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"image":"node:20"}' \
  localhost:3001/api/v1/projects/$PROJECT_ID/workspace
```

Workspaces are **project-scoped and ownership-checked**: every operation verifies the
caller owns the parent project, and the runtime workspace id is the project id (never a
client-supplied value), so a user can't touch another user's workspace. The row is
persisted in the `workspaces` table (`migrations/0003_workspaces.sql`); the runtime is
chosen from the request, else `TORSOR_DEFAULT_RUNTIME`, else the sole loaded runtime.

HTTP endpoints (all auth, all scoped to a project the caller owns):

```
GET    /api/v1/runtimes                                       list loaded runtime plugins (metadata only)
POST   /api/v1/projects/{projectID}/workspace                 create/ensure  {image?,runtime?}
GET    /api/v1/projects/{projectID}/workspace                 persisted row + live runtime status
POST   /api/v1/projects/{projectID}/workspace/start
POST   /api/v1/projects/{projectID}/workspace/stop            {timeoutSeconds}
POST   /api/v1/projects/{projectID}/workspace/destroy
POST   /api/v1/projects/{projectID}/workspace/exec/stream     SSE  {command:[],workingDir}
GET    /api/v1/projects/{projectID}/workspace/files?path=     list
GET    /api/v1/projects/{projectID}/workspace/file?path=      read  (content base64)
POST   /api/v1/projects/{projectID}/workspace/file            write {path,content|contentBase64,createDirs}
```

The full round-trip (host → gRPC → plugin subprocess) is covered by
`internal/plugin/runtime_host_test.go` (`go test ./internal/plugin/`).

Run with the real Docker runtime instead of the mock (requires a Docker daemon):

```bash
go build -o /tmp/docker-runtime ./cmd/docker-runtime
TORSOR_WORKSPACE_RUNTIME_PLUGINS=/tmp/docker-runtime TORSOR_DEFAULT_RUNTIME=docker \
DATABASE_URL=... REDIS_URL=... NODE_ENV=development go run ./cmd/server
# then: POST /api/v1/projects/$PROJECT_ID/workspace  {"image":"node:20"}
```

Workspace containers are bounded + hardened for untrusted code (env-configurable, with
conservative defaults): `TORSOR_WS_MEMORY` (512m), `TORSOR_WS_CPUS` (1), `TORSOR_WS_PIDS`
(256), `TORSOR_WS_NETWORK` (`bridge`; set `none` to cut egress), and `TORSOR_WS_HARDENED`
(`true` → `--cap-drop ALL --security-opt no-new-privileges`). The full lifecycle against a
live Docker daemon still needs to be exercised on a Docker host.

## Not yet ported (intentional, next steps)

- exercise the **Docker** runtime's full lifecycle against a live daemon on a Docker host
- more capability contracts: `DeployTarget`, `VCSProvider`, …
- real model plugins (Ollama local-first, Claude/OpenAI BYO-key)
- frontend contribution registry + theme-token contract
- compose/nginx switch from `apps/api` to this service (deliberate cutover)
