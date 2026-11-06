#!/usr/bin/env bash
# Copy buckets from the legacy MinIO (docker-compose.migrate.yml) into Garage.
# Additive only: `rclone copy`, never `sync`, nothing is deleted anywhere.
#
# Usage: scripts/migrate-minio-to-garage.sh bucket [bucket ...]
# Env:   COMPOSE (default: docker compose -f docker-compose.yml -f docker-compose.migrate.yml)
set -euo pipefail

[ "$#" -ge 1 ] || { echo "usage: $0 bucket [bucket ...]" >&2; exit 1; }
COMPOSE=${COMPOSE:-docker compose -f docker-compose.yml -f docker-compose.migrate.yml}
R() { $COMPOSE --profile tools run --rm -T rclone "$@"; }

$COMPOSE up -d minio-legacy
for _ in $(seq 1 30); do
  [ "$($COMPOSE ps --format '{{.Health}}' minio-legacy 2>/dev/null)" = "healthy" ] && break; sleep 2
done

status=0
for B in "$@"; do
  echo "== $B: copy"
  R copy "SRC:$B" "DST:$B" --transfers 4 --checksum --stats-one-line --stats 10s
  echo "== $B: verify (downloads and compares content)"
  R check "SRC:$B" "DST:$B" --download --one-way || status=1
  src=$(R size "SRC:$B" --json); dst=$(R size "DST:$B" --json)
  echo "   source: $src"
  echo "   garage: $dst"
done
[ "$status" -eq 0 ] && echo "MIGRATION VERIFIED" || { echo "MISMATCH: do not cut over" >&2; exit 1; }
