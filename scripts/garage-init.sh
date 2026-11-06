#!/usr/bin/env bash
# Idempotent Garage bootstrap: cluster layout, app access key, bucket(s).
#
# Usage:  scripts/garage-init.sh [bucket ...]        (default: $S3_BUCKET)
# Env:    COMPOSE   compose command incl. -f files   (default: docker compose)
#         ENV_FILE  env file with S3_* values        (default: .env)
#         GARAGE_CAPACITY  layout capacity           (default: 50G)
#
# The Garage image has no shell, so this runs on the host and calls the
# `garage` binary through `compose exec`. Safe to re-run: nothing is deleted
# and existing layout / keys / buckets are left alone.
set -euo pipefail

COMPOSE=${COMPOSE:-docker compose}
ENV_FILE=${ENV_FILE:-.env}
CAPACITY=${GARAGE_CAPACITY:-50G}

get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2-; }
KEY_ID=$(get S3_ACCESS_KEY); KEY_SECRET=$(get S3_SECRET_KEY)
if [ "$#" -gt 0 ]; then BUCKETS=("$@"); else BUCKETS=("$(get S3_BUCKET)"); fi

[[ "$KEY_ID" =~ ^GK[0-9a-f]{24}$ ]] || { echo "S3_ACCESS_KEY must look like GK + 24 hex chars" >&2; exit 1; }
[[ "$KEY_SECRET" =~ ^[0-9a-f]{64}$ ]] || { echo "S3_SECRET_KEY must be 64 hex chars" >&2; exit 1; }

g() { $COMPOSE exec -T garage /garage "$@"; }

echo "waiting for garage..."
for _ in $(seq 1 30); do g status >/dev/null 2>&1 && break; sleep 2; done
g status >/dev/null

NODE=$(g status | grep -oE '^[0-9a-f]{16}' | head -1)
[ -n "$NODE" ] || { echo "could not read node id" >&2; exit 1; }

if g status | grep -E "^$NODE" | grep -q 'NO ROLE ASSIGNED'; then
  echo "assigning layout ($CAPACITY)"
  g layout assign -z dc1 -c "$CAPACITY" "$NODE"
  g layout apply --version 1
else
  echo "layout already applied"
fi

if g key info "$KEY_ID" >/dev/null 2>&1; then
  echo "key exists"
else
  echo "importing app key"
  g key import --yes -n recurrsens-app "$KEY_ID" "$KEY_SECRET"
fi
# The app calls create_bucket() when a bucket is missing.
g key allow --create-bucket "$KEY_ID" >/dev/null

for B in "${BUCKETS[@]}"; do
  if g bucket info "$B" >/dev/null 2>&1; then
    echo "bucket $B exists"
  else
    echo "creating bucket $B"
    g bucket create "$B"
  fi
  g bucket allow --read --write --owner "$B" --key "$KEY_ID"
done
echo "garage ready"
