#!/usr/bin/env bash
# Torsor — Postgres backup (production DR).
#
# Dumps the torsor_dev database from the running Postgres container to a gzipped,
# timestamped file and prunes backups older than RETENTION_DAYS. Designed to run
# from cron/systemd-timer on the host (see docs/PRODUCTION-HARDENING.md).
#
# The host runs many Postgres containers, so the torsor DB is selected by the app
# uuid prefix, NOT `head -1` (which would grab another app's DB).
#
# Env:
#   TORSOR_APP_UUID   app uuid prefix of the torsor postgres container (default below)
#   PGDATABASE        database name (default torsor_dev)
#   PGUSER            db user (default postgres)
#   BACKUP_DIR        output dir (default /var/backups/torsor)
#   RETENTION_DAYS    prune older than N days (default 14)
#
# Restore (documented, not run here):
#   gunzip -c <file>.sql.gz | docker exec -i <pg-container> psql -U postgres -d torsor_dev
set -euo pipefail

APP_UUID="${TORSOR_APP_UUID:-mxm9n07xnqiefzyc83shysiq}"
PGDATABASE="${PGDATABASE:-torsor_dev}"
PGUSER="${PGUSER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/torsor}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

PGC="$(docker ps --format '{{.Names}}' | grep "^postgres-${APP_UUID}" | head -1 || true)"
if [ -z "$PGC" ]; then
  echo "ERROR: torsor postgres container (prefix postgres-${APP_UUID}) not found" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${BACKUP_DIR}/torsor_${STAMP}.sql.gz"

echo "Backing up ${PGDATABASE} from ${PGC} -> ${OUT}"
# pg_dump inside the container; stream out and gzip on the host. Fail the whole
# pipeline (pipefail) if pg_dump errors, so a truncated dump is never kept.
if ! docker exec "$PGC" pg_dump -U "$PGUSER" --no-owner --no-privileges "$PGDATABASE" | gzip > "$OUT"; then
  echo "ERROR: pg_dump failed; removing partial file" >&2
  rm -f "$OUT"
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"
echo "OK: ${OUT} (${SIZE})"

# Prune old backups.
find "$BACKUP_DIR" -name 'torsor_*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -print -delete
echo "Pruned backups older than ${RETENTION_DAYS} days."
