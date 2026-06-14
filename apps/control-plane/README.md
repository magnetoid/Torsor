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

## Layout

```
cmd/server          entrypoint: config, startup retries, graceful shutdown
internal/config     env-driven configuration
internal/db         pgx pool + health
internal/redisx     redis client (job signaling, readiness)
internal/migrations embedded SQL + idempotent runner
internal/auth       bcrypt, JWT, session validation, middleware
internal/server     chi router + handlers (auth, projects, files, tasks)
```

## Not yet ported (intentional, next steps)

- WebSocket/SSE gateway (Phase 1 remainder)
- gRPC plugin host + capability interfaces (`WorkspaceRuntime`, `ModelProvider`, …)
- compose/nginx switch from `apps/api` to this service (deliberate cutover)
