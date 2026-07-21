# Production Hardening & Operations (Phase B)

Operational runbook for the production-readiness gaps from the gap analysis: **workspace
persistence**, **backups/DR**, and **Docker-socket hardening**. Two of these are infra applied
on the host (not auto-deployed app code); one (persistence) carries a design decision that
must be validated against a real Docker engine, so it is specified here for a server-validated
rollout rather than shipped blind.

## Already covered (no action needed)

- **Workspace resource quotas.** `cmd/docker-runtime` already applies sane defaults on every
  container: `--memory 1g`, `--cpus 1`, `--pids-limit 256`, `--network bridge`,
  `--security-opt no-new-privileges`, and `--cap-drop ALL` for dev workspaces
  (`TORSOR_WS_MEMORY|CPUS|PIDS|HARDENED` override per host budget). A runaway workspace can't
  exhaust the host.
- **Workspace containers survive restarts.** Containers are created with
  `--restart unless-stopped` and are NOT part of Coolify's compose, so a control-plane
  redeploy or host reboot leaves them running with their filesystem intact. The persistence
  gap below is specifically about surviving an explicit `docker rm` / host disk loss.

---

## 1. Workspace persistence (design — validate on server before rollout)

**Gap.** A workspace's files live in the container's writable layer. They survive stop/start
and reboot, but a `docker rm` (manual, prune, or host migration) loses them. Best practice is
a persistent named volume per workspace.

**The catch — snapshots.** `SnapshotWorkspace` captures state via `docker commit`, which does
**not** include named-volume contents. Naively mounting `/workspace` as a volume would make
Checkpoints/snapshots silently capture *nothing* of the user's code. So persistence and the
commit-based snapshot must be reconciled together.

**Recommended approach (server-validated):**
1. In `buildCreateArgsForImage`, mount a per-workspace named volume at the working dir and
   default the working dir to `/workspace`:
   ```
   workDir := spec.WorkingDir; if workDir == "" { workDir = "/workspace" }
   args = append(args, "-w", workDir, "-v", "torsor-ws-"+spec.ID+":"+workDir)
   ```
   Do this for the **live** create path only — NOT the snapshot restore/fork path
   (`buildCreateArgsForImage` is shared; gate the `-v` on a flag so restore/fork from a commit
   image are not shadowed by an empty volume).
2. Make snapshots volume-aware: after `docker commit`, also `tar` the volume
   (`docker run --rm --volumes-from <c> -v $PWD:/b alpine tar czf /b/ws.tgz -C /workspace .`)
   and store it alongside the image id; `RestoreWorkspace`/`ForkWorkspace` restore both the
   image and untar the volume into the fresh volume.
3. On `DestroyWorkspace`, also `docker volume rm torsor-ws-<id>` (intentional teardown).

**Why not shipped in this PR:** it changes container lifecycle + snapshot semantics and can't
be validated against Docker on the macOS dev host. Roll out on the server with: create a
templated project, add a file, `docker rm` its container, re-provision, confirm the file
survives; then Checkpoint → Restore and confirm the code is captured.

**Interim mitigation:** rely on Checkpoints (commit snapshots) + the git integration for
user-initiated durability, and the Postgres backups below for metadata.

---

## 2. Backups / DR (ready to apply)

**Script:** `scripts/backup-postgres.sh` — `pg_dump`s `torsor_dev` from the torsor Postgres
container (selected by the app-uuid prefix, never `head -1` on this multi-Postgres host),
gzips to a timestamped file, prunes older than `RETENTION_DAYS`.

**Schedule (host cron):**
```
# daily at 03:15 UTC, keep 14 days
15 3 * * *  BACKUP_DIR=/var/backups/torsor RETENTION_DAYS=14 /path/to/torsor/scripts/backup-postgres.sh >> /var/log/torsor-backup.log 2>&1
```
Coolify also offers scheduled DB backups per-resource — either is fine; use one.

**Restore:**
```
gunzip -c torsor_YYYYMMDDT...Z.sql.gz | docker exec -i "$(docker ps --format '{{.Names}}' | grep '^postgres-mxm9n07xnqiefzyc83shysiq' | head -1)" psql -U postgres -d torsor_dev
```

**Off-host copies:** sync `/var/backups/torsor` to object storage (S3/B2) for real DR — a
backup on the same host doesn't survive host loss. (`rclone`/`aws s3 sync` in the same cron.)

**Workspace data:** once §1 ships, add the volume tarballs to the same off-host sync.

---

## 3. Docker-socket hardening (ready to apply)

**Gap.** The control-plane mounts the raw host Docker socket to drive workspace containers —
full control of the host / container-escape surface, and it makes the node single-tenant/trusted.

**Fix:** `docker-compose.hardening.yml` fronts the socket with `tecnativa/docker-socket-proxy`,
exposing only the API endpoints the runtime uses (POST, CONTAINERS, EXEC, IMAGES, COMMIT, INFO,
VERSION, PING — everything else denied), and points the control-plane at it via
`DOCKER_HOST=tcp://docker-socket-proxy:2375`. The `docker` CLI the runtime shells out to honors
`DOCKER_HOST`, so no code change is needed.

**Apply:**
```
docker compose -f docker-compose.yml -f docker-compose.hardening.yml up -d
```
and **remove the raw `/var/run/docker.sock` bind from the control-plane** in the base compose
(the proxy holds it read-only instead). Validate: provision a workspace, run the agent, open a
PTY, take a Checkpoint — all should still work through the proxy. The proxy port (2375) must
stay internal (never published).

**Stronger isolation (future):** move container ops to a dedicated worker host, or rootless
Docker, or the Firecracker/K8s `WorkspaceRuntime` — see the roadmap.

---

## 4. Workspace egress control (ready to apply)

Assume the coding agent WILL eventually be prompt-injected (industry consensus: injection is
an architectural property of LLMs, not a patchable bug) — so bound what a hijacked workspace
can reach. Two steps on the host:

1. **Dedicated workspace network.** Set `TORSOR_WS_NETWORK=torsor-ws` on the docker-runtime
   (compose env). The plugin auto-creates the bridge network on boot; every workspace lands
   on its own subnet, separable from the control-plane/postgres/redis network.
2. **Firewall that subnet**: run [scripts/harden-workspace-egress.sh](../scripts/harden-workspace-egress.sh)
   (as root). It installs `DOCKER-USER` iptables rules for the workspace subnet:
   - **blocks** `169.254.0.0/16` (cloud metadata SSRF), `10/8`, `172.16/12`, `192.168/16`
     (internal pivots)
   - **allows** DNS, established/related return traffic, same-subnet (preview), public internet
     (npm installs keep working).
   Persist the rules with `iptables-persistent` (Debian: `netfilter-persistent save`).

Validate from inside a workspace: `curl -m 3 http://169.254.169.254/` must fail;
`curl -m 5 https://registry.npmjs.org/` must succeed.

Related in-code guards (shipped with this phase, no host action needed): the agent's
destructive-command policy, secret placeholder expansion + observation scrubbing, the
hidden-Unicode sanitizer on skills/memories, and the pre-publish secret scan on deploys
(disable with `TORSOR_DEPLOY_SCAN=off`).

**gVisor (recommended production default):** install gVisor on the host
([gvisor.dev/docs/user_guide/install](https://gvisor.dev/docs/user_guide/install/)), register
`runsc` in `/etc/docker/daemon.json`, and set `TORSOR_WS_DOCKER_RUNTIME=runsc` — every
workspace then runs under a userspace kernel, upgrading the container trust boundary without
any other change. Validate: provision a workspace from each template and confirm dev servers
boot under runsc.

---

## 5. Deployed-app domain isolation (DNS/infra task)

User-deployed apps currently share the platform origin (`/d/{id}` on the API host, or
subdomains of the app domain). For real multi-tenant hardening:

1. Serve deployed apps from a **separate registrable domain** than the control plane (e.g.
   apps on `*.torsorapps.dev`, IDE/API on `app.torsor.dev`) so a malicious deployed app can
   never be same-site with platform session cookies.
2. Submit that apps domain to the **Public Suffix List** (publicsuffix.org — the reason
   `github.io` / `vercel.app` / `herokuapp.com` are listed): browsers then treat each
   `user.torsorapps.dev` as its own site — no cross-tenant cookies, no cookie claim over the
   parent domain.
3. Wildcard TLS for the apps domain via ACME **DNS-01** (the only challenge that issues
   wildcards).
4. Add an abuse-report path + admin takedown for phishing on user subdomains (rampant on
   Vercel/Netlify per 2025-26 incident reports) before opening signups broadly.

---

## 6. Wildcard preview domain (infra task; unlocks Vite/HMR previews)

Path-mode previews (`/api/v1/projects/{id}/preview/*`) can only serve apps whose asset URLs
are relative — anything emitting root-absolute URLs (a Vite dev server's `/src/main.jsx`,
`/@vite/client`) escapes the path prefix and breaks. Host mode gives every project its own
origin, where everything (assets, module imports, the HMR WebSocket, first-party auth
cookie) just works:

1. **DNS**: wildcard record `*.preview.<your-domain>` → this host.
2. **TLS**: wildcard cert for `*.preview.<your-domain>` via ACME **DNS-01** (the only
   challenge type that issues wildcards — certbot/Traefik/Caddy with your DNS provider API).
3. **Reverse proxy**: an nginx/Traefik server block for `*.preview.<your-domain>` proxying
   to the frontend container's control-plane upstream (same upstream as `/api/`), with
   WebSocket upgrade headers (`Upgrade`/`Connection`) passed through.
4. **Env**: set `TORSOR_PREVIEW_DOMAIN=preview.<your-domain>` on the control plane and
   redeploy. The IDE switches preview iframes to `https://<projectID>.preview.<domain>/`
   automatically (via `/api/v1/config`).

Auth: first load carries `?access_token` (the IDE adds it); the control plane sets an
HttpOnly first-party cookie on the preview origin so every sub-request and the HMR
WebSocket authenticate. Ownership is enforced per request (subdomain = project id, must be
owned by the caller). Keep this domain separate from any *deployed-app* domain (§5) — the
preview origin carries an authed cookie; deployed apps must never share a registrable
domain with it.

---

## Status

| Item | State |
|---|---|
| Resource quotas | ✅ already enforced in-code |
| Postgres backups + restore | ✅ script + runbook (apply cron on host) |
| Off-host backup copies | ⚠️ add object-storage sync |
| Docker-socket proxy | ✅ overlay + runbook (apply on host, drop raw socket) |
| Workspace persistent volumes | 📋 designed; server-validated rollout (snapshot-aware) |
| Workspace egress firewall | ✅ script + runbook (apply on host: network + iptables) |
| gVisor workspace runtime | ✅ code flag (`TORSOR_WS_DOCKER_RUNTIME=runsc`); install on host |
| Agent blast-radius guards | ✅ in-code (command policy, secret scrubbing, unicode sanitizer, deploy scan) |
| Apps domain + PSL isolation | 📋 DNS/infra task (separate domain, PSL submission) |
