# Scaling to Multiple Control-Plane Instances

The control-plane is single-instance today. Running >1 replica (for HA or load) requires
moving a few pieces of per-instance in-memory state to shared/broadcast backends. This is the
design; each item needs a real 2-replica setup to validate (it can't be exercised with one
process), so it's specified here rather than shipped blind.

## Already multi-instance-safe

- **Sessions** — validated against the Postgres `sessions` row on every request, not an
  in-memory map. Any replica accepts any token. ✅
- **Migrations** — filename-keyed + idempotent; concurrent boots don't conflict. ✅
- **Agent task queue** — `ai_tasks` reserved with `FOR UPDATE SKIP LOCKED`; multiple workers
  don't double-claim. Wake signal already goes over Redis pub/sub (`redisx.Publish`). ✅
- **`/metrics`** — per-instance counters (this PR). A Prometheus scrape of each replica (or
  federation) aggregates them; no shared state needed. ✅

## Needs work before running >1 replica

### 1. Rate limiting (per-instance → shared)
`httprate.LimitByIP` (`server.go`) keeps counters in memory, so limits are **per-replica** — a
caller could get N× the intended budget by spreading requests across replicas. **Fix:** back
httprate with Redis (`github.com/go-chi/httprate-redis`, `httprateredis.WithRedisLimitCounter`)
so the window is shared. Adds one dependency; behavior is otherwise identical. Validate: two
replicas behind the LB, confirm the limit is global.

### 2. Presence + collaboration broadcast (same-instance → cross-instance)
`handlePresenceWS` / `handleCollabWS` broadcast cursor/edit events only to WebSocket clients
connected to **the same instance**. With two replicas, users on different replicas wouldn't see
each other. **Fix:** bridge each project's presence/collab events over Redis pub/sub — the
`redisx.Client` already has `Publish`/`Subscribe` (used by the worker). On a local event,
`Publish` to `torsor:presence:<projectID>`; every instance `Subscribe`s and re-broadcasts to
its local sockets. (The Yjs collab doc-sync in `apps/torsor-collab` needs the same fan-out, or
a shared Yjs persistence backend.) Validate: two replicas, two browsers pinned to different
replicas, confirm cursors/edits sync.

### 3. Mission control state (per-instance → shared)
The coding-agent engine keeps `missionCancels` (stop signals) and the `activeMissions`
concurrency counter in memory (`server.go`), so a **Stop** issued on replica B can't cancel a
mission running on replica A, and the concurrency cap is per-replica. **Fix:** publish stop
requests over Redis pub/sub (the running instance subscribes and cancels its local context),
and move the concurrency cap to a Redis counter (or a DB row claim). Validate: start a mission,
issue Stop from the other replica.

### 4. Datastore capacity (independent of replica count)
Single Postgres with no pooler/replicas. Before real load: add **PgBouncer** (transaction
pooling — pgx opens a pool per instance, so N replicas × pool size can exhaust connections),
and consider read replicas for the heavy read paths. Add **pagination** to `ListProjects`/admin
listings (currently unbounded/`LIMIT`-capped). File storage is local disk — move to object
storage (S3-compatible) so replicas share it.

## Rollout order

1. Rate limiter → Redis (contained, low-risk).
2. PgBouncer in front of Postgres (infra).
3. Presence/collab + mission-control over Redis pub/sub (the WebSocket fan-out — validate with
   two replicas).
4. Object storage for files; read replicas if read load demands it.

Only after 1–3 is it safe to scale the control-plane `Deploy` to `replicas: 2+`.
