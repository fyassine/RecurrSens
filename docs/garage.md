# Garage object storage

Audio recordings and DB backups live in [Garage](https://garagehq.deuxfleurs.fr/),
a single-node S3-compatible store (`dxflrs/garage`, pinned in
`docker-compose.yml`). It replaced MinIO, whose free images are no longer
published. The app talks plain S3 (`boto3`, **SigV4**, path-style addressing), so
no application code depends on Garage specifically.

## Configuration

| Item | Where |
|---|---|
| Server config | `garage/garage.toml` (secrets come from env, never the file) |
| Env | `S3_ACCESS_KEY` (`GK` + 24 hex), `S3_SECRET_KEY` (64 hex), `S3_ENDPOINT=http://garage:3900`, `S3_BUCKET`, `GARAGE_RPC_SECRET`, `GARAGE_ADMIN_TOKEN` |
| GitHub (per environment) | variable `GARAGE_ACCESS_KEY`; secrets `GARAGE_SECRET_KEY`, `GARAGE_RPC_SECRET`, `GARAGE_ADMIN_TOKEN`. The workflows write them into `.env` as `S3_ACCESS_KEY` / `S3_SECRET_KEY` |
| Bootstrap | `scripts/garage-init.sh` (idempotent: layout, app key, bucket(s)) |
| Volumes | `garage_data`, `garage_meta` (legacy `minio_data` kept until migrated) |

Generate values: `openssl rand -hex 12` (key id suffix), `openssl rand -hex 32`
(secret, RPC secret, admin token).

Garage has one copy of the data (`replication_factor = 1`), like the previous
MinIO setup. Keep off-server backups (see [backup.md](backup.md)).

## Daily use

```bash
docker exec recurrsens-garage-1 /garage status
docker exec recurrsens-garage-1 /garage bucket info stimmbandlaesion
docker exec recurrsens-garage-1 /garage key info <GK...>
```

## Migrating existing MinIO data

Production path used for the first cutover: bring up Garage alone with `docker-compose.garage-only.yml`, copy from the **running** MinIO through its S3 API with `SKIP_LEGACY_START=1` (read-only for MinIO), stop writes, copy once more, verify, then deploy. The generic procedure follows.

Never run this against the live volume.

1. **Back up** (encrypted, off-server) and prove a restore works.
2. Copy the MinIO volume: `docker run --rm -v recurrsens_minio_data:/from:ro -v recurrsens_minio_copy:/to postgres:16-alpine cp -a /from/. /to/`
3. Start Garage with the new env and run `scripts/garage-init.sh <bucket> [bucket ...]`. Production MinIO holds **two buckets**: `stimmbandlaesion` and `stimmbandlaesion-staging`.
4. Set `MIGRATE_SRC_ACCESS_KEY`, `MIGRATE_SRC_SECRET_KEY`, `MIGRATE_SRC_VOLUME=recurrsens_minio_copy`, then
   `scripts/migrate-minio-to-garage.sh <bucket> [bucket ...]`. It only copies, then
   verifies by downloading both sides (`rclone check --download`). It prints
   `MIGRATION VERIFIED` or exits non-zero.
5. Cut over: stop writes (maintenance window), run the migration once more to
   catch new uploads, deploy this version, check an existing recording plays and
   a new one uploads.
6. Keep the old MinIO volume untouched for rollback until you are confident.

**Rollback:** redeploy the previous version with a MinIO image you still have
cached or rebuilt; the original `minio_data` volume was never modified.

> **Warning:** deploying this version to production **before** the data is
> copied points the app at an empty Garage. `--remove-orphans` also removes the
> old `minio` container (the volume stays). Migrate first.
