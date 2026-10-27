# Coolify Deployment Guide

How to deploy Torsor on Coolify (Docker Compose build pack). The app domain is
**`app.torsor.dev`**; leave the `torsor.dev` landing site untouched.

> **Read this first — the #1 cause of a dead domain.** The Go control plane **fails
> closed**: under `NODE_ENV=production` (the compose default) it refuses to boot and
> exits unless `JWT_SECRET` is set to a strong value (≥32 chars). If it can't boot it
> never becomes healthy, and the deploy has no backend. Set the required env vars below
> **before** the first deploy.

## Architecture (what actually runs)

The default `docker-compose.yml` stack, after the `api → control-plane` cutover
(ADR 0009):

- **`frontend`** — the Vite SPA served by nginx. Its nginx **also reverse-proxies
  `/api` and `/ready` to `control-plane:3001` on the internal network**, so the API is
  same-origin. **This is the only service that needs a public domain.**
- **`control-plane`** — the Go backend (auth, projects, files, agent loop, workspace
  runtime, model providers). Internal only (`expose: 3001`); reached via the frontend's
  `/api` proxy. Applies DB migrations on startup.
- **`postgres`**, **`redis`** — internal datastores (`expose` only).
- **`ollama`** — optional local model server, behind `--profile ai`.
- **`adminer`** — optional DB UI, behind `--profile tools`.

> The legacy `apps/api` (Express) and `apps/worker` are **not** in the default stack —
> they're retained for rollback only. Ignore older docs that mention them, a separate
> `api.yourdomain.com` domain, or `GEMINI_API_KEY` (the bundled Gemini SDK was removed;
> model access is now BYO-key through the backend).

## Deployment steps

1. **Create the resource:** Coolify → **+ New** → **Public/Private Repository** →
   enter the repo + branch (`main`) → build pack **Docker Compose**.
2. **Compose location:** `/docker-compose.yml`. Coolify detects: `frontend`,
   `control-plane`, `postgres`, `redis` (plus `ollama`/`adminer` only if you enable
   their profiles).
3. **Set environment variables** (see the preflight below) in Coolify's
   **Environment Variables** tab.
4. **Assign the domain:** on the **`frontend`** service only, set Domain to
   `https://app.torsor.dev` (include `https://` so Coolify provisions Let's Encrypt).
   Leave every other service **without** a public domain — the control plane is reached
   through the frontend's `/api` proxy, not its own hostname.
5. **DNS:** point `app.torsor.dev` (A/AAAA) at the Coolify host, and make sure Coolify's
   Traefik — not another proxy — owns ports 80/443 on that host.
6. **Deploy.**

## Required env preflight

Set these **before** the first deploy. Missing `JWT_SECRET` is the classic "domain
returns nothing" cause.

| Variable | Required | Notes |
|----------|----------|-------|
| `NODE_ENV` | ✅ | `production` (the compose default; keep it). |
| `JWT_SECRET` | ✅ | **≥32 chars.** `openssl rand -hex 32`. Control plane exits without it. |
| `TORSOR_SECRET_KEY` | ✅ | 32-byte key that encrypts users' BYO API keys at rest. `openssl rand -hex 32`. |
| `POSTGRES_PASSWORD` | ✅ | Real DB password (default `postgres` is dev-only). |
| `POSTGRES_DB` / `POSTGRES_USER` | ✅ | e.g. `torsor_prod` / `torsor`. Must match what the control plane's `DATABASE_URL` is built from (compose derives it from these). |
| `APP_URL` | ✅ | `https://app.torsor.dev`. |
| `CORS_ORIGIN` | ◻️ | `https://app.torsor.dev`. Not strictly needed while the SPA calls same-origin `/api`, but set it for safety / any cross-origin client. |
| `SUPER_ADMIN_EMAILS` | ◻️ | Comma-separated; auto-promoted to `super_admin` on boot. |
| `TORSOR_DEFAULT_RUNTIME` | ⚠️ | Defaults to `docker` (mounts `/var/run/docker.sock`). **On a shared/multi-tenant host set `mock`** and remove the socket mount — the socket is root-equivalent host access. |
| `OLLAMA_HOST` / `OLLAMA_MODEL` | ◻️ | Point at your Ollama for the free local model (or enable the `ollama` profile and `ollama pull` the model). Hosted providers (Anthropic/OpenAI/Gemini/…) are BYO-key per user in Settings → API Keys — not env vars. |
| `VITE_API_URL` | ◻️ | **Leave empty.** The SPA calls same-origin `/api` (nginx proxies to the control plane). Set only for a genuinely cross-origin API. |
| `FRONTEND_HOST_PORT` | ◻️ | Only for the Plesk/host-reverse-proxy pattern (binds `127.0.0.1:<port>:80`). Pure Coolify/Traefik deploys don't need it. |

Generate secrets:
```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # TORSOR_SECRET_KEY
```

## Troubleshooting

**`app.torsor.dev` returns nothing / 404 / 502, or the deploy never goes healthy.**
Almost always the control plane can't boot, which (by design) blocks the frontend too.
Check its logs first:
```bash
docker compose logs control-plane | tail -50
```
- `JWT_SECRET must be set to a strong value (>=32 chars)` → set `JWT_SECRET` (and the
  other required vars above) and redeploy. **This is the most common cause.**
- Docker-socket / `torsor-ws` network errors (e.g. "network … has incorrect labels") →
  the host won't allow the Docker socket. Set `TORSOR_DEFAULT_RUNTIME=mock` and drop the
  `/var/run/docker.sock` mount for this deployment.
- DB connection errors → `POSTGRES_PASSWORD`/`POSTGRES_DB`/`POSTGRES_USER` don't match
  what `DATABASE_URL` is derived from.

Then confirm the ingress:
```bash
docker compose ps                      # is `frontend` running? is `control-plane` healthy?
dig +short app.torsor.dev              # resolves to the Coolify host?
ss -ltnp | grep -E ':(80|443)\b'       # Traefik owns 80/443 (no competing proxy)?
```

> As of the frontend health-gate fix, the SPA serves even while the control plane is
> unhealthy (API calls just fail until it recovers) — so a blank page with failing
> `/api` calls points at the backend/env, not the frontend.

## Rollback

Coolify redeploys previous successful builds. Keep the `postgres_data` and `redis_data`
volumes across deploys to avoid data loss. The `api → control-plane` cutover is itself
reversible (flip `nginx.conf` + `docker-compose.yml` back to `apps/api`) if ever needed.
</content>
