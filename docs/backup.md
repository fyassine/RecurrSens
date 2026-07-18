# Backups & Data Access

Covers the nightly database backup pipeline and how to access patient
recordings and their metadata directly (as opposed to through the
dashboard).

## Database Backups

Production runs a nightly encrypted PostgreSQL backup as a Celery Beat
periodic task (`patients.tasks.backup_database_snapshot`, scheduled at 02:30
Europe/Berlin via `db-backup-nightly`). The pipeline: `pg_dump --format=custom
--compress=9` → GPG-encrypt → upload to `S3_BUCKET` under
`{BACKUP_S3_PREFIX}/{BACKUP_ENV}/` → prune backups beyond
`BACKUP_RETENTION` → email `ADMIN_NOTIFICATION_EMAIL` with the result.

Disabled by default — only enable on the production deployment server.

### Configuration

Set in the production GitHub environment (**Settings → Environments →
production**), used by `.github/workflows/deploy.yml`:

**Variables (vars):**

| Name | Value | Notes |
|---|---|---|
| `DB_BACKUP_ENABLED` | `true` | Turns the feature on |
| `BACKUP_RETENTION` | `30` (or your choice) | Number of nightly backups to keep |
| `BACKUP_S3_PREFIX` | `backups` (or your choice) | S3 key prefix |

**Secrets:**

| Name | Value |
|---|---|
| `GPG_RECIPIENT_KEY` | The key ID/email you'll encrypt to, e.g. `you@example.com` |
| `GPG_PUBLIC_KEY` | Base64-encoded ASCII-armored GPG public key |

When `DB_BACKUP_ENABLED=true`, `config.settings.production` raises
`ImproperlyConfigured` at boot unless both `GPG_RECIPIENT_KEY` and
`GPG_PUBLIC_KEY` are set — backups are never uploaded unencrypted.

### Generating the GPG key

GPG uses **asymmetric encryption**: the public key encrypts, only the
matching private key can decrypt. The server only ever needs the **public**
key (to encrypt nightly dumps) — the private key never has to exist on the
VPS at all. Generate the keypair on your own machine and keep the private
key there (or in a password manager / offline backup):

```bash
gpg --quick-generate-key "RecurrSens Backups <you@example.com>" default default never
gpg --export --armor "you@example.com" | base64 -w0
```

Paste that base64 output as the `GPG_PUBLIC_KEY` secret. **Back up the
private key somewhere safe** — without it, the backups are unrecoverable:

```bash
gpg --export-secret-keys --armor you@example.com > recurrsens-backup-key.asc
```

### Verification

```bash
# Confirm the periodic task was registered
ssh flakhal@31.70.77.124 "cd ~/recurrsens && docker compose -f docker-compose.yml -f docker-compose.prod.yml logs celery-beat --tail=50"
# Or check Django admin → Periodic Tasks → db-backup-nightly

# Trigger an on-demand backup (e.g. before a risky migration)
ssh flakhal@31.70.77.124 "cd ~/recurrsens && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec celery python manage.py backup_database"
```

A successful run uploads `{DB_NAME}_{timestamp}.dump.gpg` to MinIO/S3 and
emails `ADMIN_NOTIFICATION_EMAIL` a summary; a failure (after 2 retries)
emails a failure summary instead.

### Known incident: Redis auth drift silently broke backups (2026-07-18)

`docker-compose.prod.yml` overrode redis's `command:` entirely
(`redis-server --maxmemory 32mb --maxmemory-policy allkeys-lru`), which
dropped the `--requirepass ${REDIS_PASSWORD}` flag set in the base
`docker-compose.yml` — Compose command overrides *replace*, they don't
merge. Redis ran unauthenticated in production for weeks while
`REDIS_PASSWORD` was still used to build the Celery broker URL, so
celery/celery-beat crash-looped on `AUTH <password> called without any
password configured` and `db-backup-nightly` never completed a run. Last
successful backup before the fix was 2026-06-11 — over 5 weeks stale.
Fixed in PR #35 (`fix(redis): restore --requirepass in prod compose
override`). If nightly backups go stale again, check `docker inspect
--format='{{.RestartCount}}' recurrsens-celery-beat-1` and the container
logs for `AUTH` errors first.

### Where Backups Land

Backups are uploaded to the `S3_BUCKET` (same bucket as patient audio),
under:

```
{BACKUP_S3_PREFIX}/{BACKUP_ENV}/{DB_NAME}_{YYYY-MM-DD_HH-MM-SS}.dump.gpg
```

e.g. `backups/production/stimmbandlaesion_2026-06-12_02-30-00.dump.gpg`.

MinIO's ports are intentionally **not published** to the host in
production (`ports: !reset []` in `docker-compose.prod.yml`) — there's no
browser-accessible console URL, and an SSH tunnel to 9001 has nothing to
connect to. Use one of the methods below instead.

**Via `mc` (bundled in the MinIO image, no port exposure needed):**

```bash
ssh flakhal@31.70.77.124
docker exec -it recurrsens-minio-1 sh
mc alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
mc ls --recursive local/stimmbandlaesion/backups/production/
```

The alias persists in the container's config, so subsequent shells can
skip straight to `mc ls`/`mc cp`/`mc cat`.

**Via Django shell / boto3:**

```bash
docker compose exec celery python manage.py shell -c "
import boto3
from django.conf import settings
c = boto3.client('s3', endpoint_url=settings.S3_ENDPOINT, aws_access_key_id=settings.S3_ACCESS_KEY, aws_secret_access_key=settings.S3_SECRET_KEY, region_name=settings.S3_REGION)
for o in c.list_objects_v2(Bucket=settings.S3_BUCKET, Prefix='backups/production/').get('Contents', []):
    print(o['Key'], o['Size'], o['LastModified'])
"
```

### Restoring a Backup

Download the `.dump.gpg` object, then decrypt with the private key (on the
machine that holds it, **not** the VPS) and restore with `pg_restore`:

```bash
gpg --decrypt stimmbandlaesion_2026-06-12_02-30-00.dump.gpg > db.dump
pg_restore --host <db-host> --username postgres --dbname stimmbandlaesion --clean db.dump
```

## Accessing Patient Recordings & Metadata

**Prefer the app's export feature over touching storage directly.** Manual
`mc`/DB access bypasses audit logging — use it only for debugging/ops, not
routine data pulls, since this is patient medical data.

### Recommended: `/api/export/`

- `GET /api/export/` — requires a JWT for a user with the `SUPER_ADMIN`
  role (`backend/patients/views.py` `ExportView`, `backend/patients/urls.py`).
- Optional `?ids=<uuid,uuid,...>` to export specific patients; omit for all
  non-deleted patients.
- Returns a ZIP containing:
  - `metadata.csv` — one row per patient: `PatientenID, Status,
    PraeOP_Datum, PostOP_Datum, Anzahl_PraeOP_Aufnahmen,
    Anzahl_PostOP_Aufnahmen, Erstellt_am`
  - Audio per patient at `{patient_id}/prae_op/{exercise_id}.{ext}` and
    `{patient_id}/post_op_{session_number}/{exercise_id}.{ext}`
- Each export writes a `PatientAuditLog` entry and sets
  `last_exported_at` on each patient (gates data-retention auto-deletion).

```bash
curl -H "Authorization: Bearer <access_token>" https://<your-domain>/api/export/ -o export.zip
```

### Raw storage access (debugging only)

Real (non-recovery) recordings are stored per-patient, keyed by the
patient's **UUID** (`Patient.id`), not the human-readable `patient_id`
pseudonym (e.g. `0025`):

```
{patient_uuid}/pre_{session_number}/{exercise_id}.{ext}
{patient_uuid}/post_{session_number}/{exercise_id}.{ext}
```

Look up the UUID first if you only know the pseudonym:

```bash
docker compose exec backend python manage.py shell -c "
from patients.models import Patient
p = Patient.objects.filter(patient_id='0025').first()
print(p.id, p.patient_id, p.status)
"
```

Then browse/pull with `mc` (same alias as the DB-backup section above):

```bash
mc ls --recursive local/stimmbandlaesion/<patient-uuid>/
mc cp local/stimmbandlaesion/<patient-uuid>/post_2/a_h.webm ./
```

Per-recording metadata (exercise ID, phase, session, AI prediction
results) lives in Postgres, not S3 — query the `AudioFile` and `Patient`
models via Django shell/admin, not `mc`.

Note: the bucket also has a `_recovery_backups/` prefix (e.g. under a real
patient UUID) with audio files from 2026-06-11. No code in this repo
writes to that prefix — it predates or bypasses the current codebase.
Treat it as untrusted/unexplained data, not an official recording
location, until its origin is confirmed.
