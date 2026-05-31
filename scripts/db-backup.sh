#!/usr/bin/env bash
# ==============================================================================
# db-backup.sh — PostgreSQL backup with GPG encryption → MinIO / S3
# ==============================================================================
# Runs inside the `db-backup` Docker Compose service (postgres:16-alpine image).
# Can also be called directly on any machine that has pg_dump, gpg, and aws-cli.
#
# Required env vars (set via docker-compose / .env):
#   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
#   S3_ENDPOINT, S3_BUCKET, S3_PATH_PREFIX (default: backups)
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION
#   GPG_RECIPIENT_KEY  — the GPG key ID / fingerprint to encrypt to
#   BACKUP_ENV         — label: production | staging | local
#   BACKUP_RETENTION   — number of most-recent dumps to keep (default: 30)
#
# Optional:
#   NOTIFY_EMAIL       — if set, send success/failure email via sendmail/curl
#   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS  — for email delivery
#   ADMIN_NOTIFICATION_EMAIL — fallback for NOTIFY_EMAIL
# ==============================================================================
set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
PGHOST="${PGHOST:-db}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-stimmbandlaesion}"
PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

S3_ENDPOINT="${S3_ENDPOINT:-http://minio:9000}"
S3_BUCKET="${S3_BUCKET:-stimmbandlaesion}"
S3_PATH_PREFIX="${S3_PATH_PREFIX:-backups}"

BACKUP_ENV="${BACKUP_ENV:-production}"
BACKUP_RETENTION="${BACKUP_RETENTION:-30}"

NOTIFY_EMAIL="${NOTIFY_EMAIL:-${ADMIN_NOTIFICATION_EMAIL:-}}"
SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"

GPG_RECIPIENT_KEY="${GPG_RECIPIENT_KEY:-}"

# ── Derived paths ─────────────────────────────────────────────────────────────
TIMESTAMP="$(date -u +%Y-%m-%d_%H-%M-%S)"
DUMP_FILE="/tmp/${PGDATABASE}_${TIMESTAMP}.dump"
ENC_FILE="${DUMP_FILE}.gpg"
S3_KEY="${S3_PATH_PREFIX}/${BACKUP_ENV}/${PGDATABASE}_${TIMESTAMP}.dump.gpg"
S3_URI="s3://${S3_BUCKET}/${S3_KEY}"

START_TIME="$(date -u +%s)"

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

send_email() {
  local subject="$1"
  local body="$2"
  local recipient="${NOTIFY_EMAIL:-}"

  [[ -z "$recipient" ]] && return 0
  [[ -z "$SMTP_HOST" ]] && {
    log "SMTP_HOST not set — skipping email notification"
    return 0
  }

  log "Sending notification email to ${recipient}..."
  curl --silent --show-error \
    --url "smtp://${SMTP_HOST}:${SMTP_PORT}" \
    --ssl-reqd \
    --mail-from "${SMTP_USER}" \
    --mail-rcpt "${recipient}" \
    --user "${SMTP_USER}:${SMTP_PASS}" \
    -T <(printf "From: RecurrSens Backup <${SMTP_USER}>\r\nTo: ${recipient}\r\nSubject: ${subject}\r\nContent-Type: text/plain\r\n\r\n${body}\r\n") \
    2>&1 || log "WARNING: email delivery failed (non-fatal)"
}

cleanup() {
  rm -f "${DUMP_FILE}" "${ENC_FILE}"
}
trap cleanup EXIT

# ── 1. pg_dump ────────────────────────────────────────────────────────────────
log "=== Starting backup of '${PGDATABASE}' on ${PGHOST}:${PGPORT} (env: ${BACKUP_ENV}) ==="

if ! pg_dump \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --format=custom \
  --compress=9 \
  --no-password \
  --dbname="${PGDATABASE}" \
  --file="${DUMP_FILE}"; then
  ERR_MSG="pg_dump failed for database '${PGDATABASE}' at $(date -u)"
  log "ERROR: ${ERR_MSG}"
  send_email \
    "[RecurrSens ${BACKUP_ENV}] ❌ DB Backup FAILED" \
    "Backup failed at step: pg_dump\n\nDatabase: ${PGDATABASE}\nHost: ${PGHOST}\nEnv: ${BACKUP_ENV}\nTime: $(date -u)\n\nError: ${ERR_MSG}\n\nPlease investigate immediately."
  exit 1
fi

DUMP_SIZE="$(du -sh "${DUMP_FILE}" | cut -f1)"
log "Dump created: ${DUMP_FILE} (${DUMP_SIZE})"

# ── 2. GPG encrypt ────────────────────────────────────────────────────────────
if [[ -z "${GPG_RECIPIENT_KEY}" ]]; then
  log "WARNING: GPG_RECIPIENT_KEY is not set — storing dump UNENCRYPTED."
  log "         Set GPG_RECIPIENT_KEY in your .env for encrypted backups."
  ENC_FILE="${DUMP_FILE}"
  S3_KEY="${S3_PATH_PREFIX}/${BACKUP_ENV}/${PGDATABASE}_${TIMESTAMP}.dump"
  S3_URI="s3://${S3_BUCKET}/${S3_KEY}"
else
  log "Encrypting dump with GPG key: ${GPG_RECIPIENT_KEY}..."
  # Import the public key from env var GPG_PUBLIC_KEY if provided
  if [[ -n "${GPG_PUBLIC_KEY:-}" ]]; then
    echo "${GPG_PUBLIC_KEY}" | gpg --batch --import 2>/dev/null || true
  fi

  if ! gpg \
    --batch \
    --yes \
    --trust-model always \
    --encrypt \
    --recipient "${GPG_RECIPIENT_KEY}" \
    --output "${ENC_FILE}" \
    "${DUMP_FILE}"; then
    ERR_MSG="GPG encryption failed for dump '${DUMP_FILE}'"
    log "ERROR: ${ERR_MSG}"
    send_email \
      "[RecurrSens ${BACKUP_ENV}] ❌ DB Backup FAILED" \
      "Backup failed at step: GPG encryption\n\nDatabase: ${PGDATABASE}\nEnv: ${BACKUP_ENV}\nTime: $(date -u)\n\nError: ${ERR_MSG}\n\nPlease check GPG_RECIPIENT_KEY and GPG_PUBLIC_KEY."
    exit 1
  fi
  rm -f "${DUMP_FILE}"
  log "Encrypted: ${ENC_FILE}"
fi

# ── 3. Upload to MinIO / S3 ───────────────────────────────────────────────────
log "Uploading to ${S3_URI} ..."

if ! aws s3 cp \
  "${ENC_FILE}" \
  "${S3_URI}" \
  --endpoint-url "${S3_ENDPOINT}" \
  --no-progress; then
  ERR_MSG="S3 upload failed for key '${S3_KEY}'"
  log "ERROR: ${ERR_MSG}"
  send_email \
    "[RecurrSens ${BACKUP_ENV}] ❌ DB Backup FAILED" \
    "Backup failed at step: S3 upload\n\nDatabase: ${PGDATABASE}\nEnv: ${BACKUP_ENV}\nTarget: ${S3_URI}\nTime: $(date -u)\n\nError: ${ERR_MSG}\n\nCheck MinIO connectivity and credentials."
  exit 1
fi

log "Upload complete: ${S3_URI}"

# ── 4. Prune old backups ──────────────────────────────────────────────────────
log "Pruning old backups (keeping last ${BACKUP_RETENTION})..."

BACKUP_PREFIX="${S3_PATH_PREFIX}/${BACKUP_ENV}/"

# List all objects in env prefix, sorted oldest-first
ALL_KEYS="$(aws s3 ls \
  "s3://${S3_BUCKET}/${BACKUP_PREFIX}" \
  --endpoint-url "${S3_ENDPOINT}" \
  | awk '{print $4}' \
  | sort)"

TOTAL="$(echo "${ALL_KEYS}" | grep -c '.' || true)"
DELETE_COUNT=$(( TOTAL - BACKUP_RETENTION ))

if (( DELETE_COUNT > 0 )); then
  log "Removing ${DELETE_COUNT} old backup(s) (total: ${TOTAL})..."
  echo "${ALL_KEYS}" | head -n "${DELETE_COUNT}" | while read -r key; do
    log "  Deleting: s3://${S3_BUCKET}/${BACKUP_PREFIX}${key}"
    aws s3 rm \
      "s3://${S3_BUCKET}/${BACKUP_PREFIX}${key}" \
      --endpoint-url "${S3_ENDPOINT}" --quiet
  done
else
  log "No old backups to prune (total: ${TOTAL}, retention: ${BACKUP_RETENTION})"
fi

# ── 5. Summary & notification ─────────────────────────────────────────────────
END_TIME="$(date -u +%s)"
ELAPSED=$(( END_TIME - START_TIME ))

log "=== Backup completed successfully in ${ELAPSED}s ==="
log "    Database : ${PGDATABASE}"
log "    Env      : ${BACKUP_ENV}"
log "    File size: ${DUMP_SIZE}"
log "    S3 path  : ${S3_URI}"

send_email \
  "[RecurrSens ${BACKUP_ENV}] ✅ DB Backup Succeeded" \
  "Database backup completed successfully.\n\nDatabase : ${PGDATABASE}\nEnv      : ${BACKUP_ENV}\nDump size: ${DUMP_SIZE}\nS3 path  : ${S3_URI}\nDuration : ${ELAPSED}s\nTime     : $(date -u)\n\nOldest backups pruned to keep last ${BACKUP_RETENTION}."
