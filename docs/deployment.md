# Deployment Guide

## Architecture Overview

The application runs on a single Strato VPS using Docker Compose. All services run as containers behind an Nginx reverse proxy.

```
Internet → :80 → Nginx → Backend (Gunicorn)
                       ↘ Frontend (static SPA)
                       ↘ Django Admin (/admin/)

Internal only (not exposed):
  PostgreSQL :5432
  Redis      :6379
  MinIO      :9000/:9001
  Celery Worker
  Celery Beat
```

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Orchestration | Docker Compose | Server has 856MB RAM; K3s needs ~512MB baseline, leaving nothing for the app |
| Container Registry | ghcr.io | Integrated with GitHub repo, free for public/private images |
| Image Strategy | Build locally, push to ghcr.io, pull on server | Avoids RAM-intensive builds on the 1GB VPS |
| Gunicorn Workers | 1 | RAM constraint (each worker ~70MB) |
| Celery Concurrency | 1 | RAM constraint |
| Server User | `flakhal` (non-root) | Security best practice; root SSH disabled |
| Firewall | UFW: 22, 80, 443 only | DB/Redis/MinIO not exposed externally |
| Swap | 2GB swap file | Prevents OOM kills with only 856MB physical RAM |
| SSL | Deferred (no domain yet) | Will use Let's Encrypt + Certbot when domain is configured |
| Database | PostgreSQL 16 with tuned memory | `shared_buffers=64MB`, `max_connections=20` for low-memory |
| Redis | maxmemory 32MB, LRU eviction | Celery broker doesn't need much memory |

## Server Specifications

- **Provider:** Strato VPS Linux VC1-1
- **IP:** 31.70.77.124
- **OS:** Ubuntu 22.04.5 LTS
- **CPU:** 1 vCPU (AMD EPYC-Milan)
- **RAM:** 856MB + 2GB swap
- **Disk:** 10GB NVMe SSD
- **SSH:** `ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124`

## Container Memory Limits

| Service | Limit | Typical Usage |
|---------|-------|---------------|
| Backend (Gunicorn) | 256MB | ~70MB |
| Celery Worker | 192MB | ~90MB |
| Celery Beat | 96MB | ~74MB |
| PostgreSQL | 192MB | ~17MB |
| MinIO | 192MB | ~56MB |
| Redis | 48MB | ~4MB |
| Nginx | 48MB | ~2MB |
| **Total** | **1024MB** | **~313MB** |

## Staging Environment

### Architecture

Staging runs alongside production on the same VPS by **sharing stateless infrastructure** (PostgreSQL, Redis, MinIO) and only duplicating application-specific containers:

| Container | Production | Staging | Notes |
|---|:---:|:---:|---|
| `db` (PostgreSQL) | ✅ | **shared** | Staging uses a separate database (`stimmbandlaesion_staging`) |
| `redis` | ✅ | **shared** | Staging uses Redis DB 1 (production uses DB 0) |
| `minio` | ✅ | **shared** | Staging uses a separate bucket (`stimmbandlaesion-staging`) |
| `backend` | ✅ | ✅ | Separate container, tagged `:staging` |
| `celery` | ✅ | ✅ | Separate container, tagged `:staging` |
| `celery-beat` | ✅ | ❌ | Not needed in staging |
| `nginx` | ✅ | ✅ | Production nginx terminates SSL; staging nginx serves SPA |
| `dozzle` | ✅ | **shared** | Already sees all containers |

**Estimated additional RAM for staging**: ~110 MB (backend ~60 MB + celery ~50 MB)

### Networking

```
Internet → :443 → Production Nginx ─┬→ recurrsens.eu       → Production backend (:8000)
                                     └→ staging.recurrsens.eu → Staging Nginx (:8080)
                                                                   └→ Staging backend (:8000)

Production Nginx (recurrsens-nginx-1) acts as the SSL terminator for both environments.
Staging containers join the `recurrsens_default` network to access shared infra.
```

### Deploy Workflow

Staging deployments use **`workflow_dispatch`** — a manual trigger from the GitHub Actions UI:

1. Go to GitHub → **Actions** tab → **"Deploy to Staging"**
2. Click **"Run workflow"**
3. Select the **branch** to deploy (any `dev/*` branch, `staging`, or `main`)
4. Optionally add a **reason** note
5. Click **Run** — CI tests run, images build, and deploy to staging

Staging also auto-deploys when code is pushed to the `staging` branch.

### Docker Compose Projects

| Project | Directory | Compose files |
|---|---|---|
| `recurrsens` (production) | `~/recurrsens/` | `docker-compose.yml` + `docker-compose.prod.yml` |
| `recurrsens-staging` (staging) | `~/recurrsens-staging/` | `docker-compose.yml` + `docker-compose.staging.yml` |

### Staging Setup (one-time)

```bash
# 1. Create staging database on the shared PostgreSQL instance
docker exec -it recurrsens-db-1 psql -U postgres -c "CREATE DATABASE stimmbandlaesion_staging;"

# 2. Add DNS A record for staging.recurrsens.eu → 31.70.77.124

# 3. Obtain SSL certificate for staging subdomain
sudo certbot certonly --webroot -w /var/www/certbot -d staging.recurrsens.eu

# 4. Create GitHub "staging" environment with staging-specific vars:
#    ALLOWED_HOSTS=staging.recurrsens.eu
#    APP_URL=https://staging.recurrsens.eu
#    CORS_ALLOWED_ORIGINS=https://staging.recurrsens.eu
#    DB_NAME=stimmbandlaesion_staging
#    S3_BUCKET=stimmbandlaesion-staging
```

### Staging Commands

```bash
# Container status
ssh flakhal@31.70.77.124 "docker compose -p recurrsens-staging -f ~/recurrsens-staging/docker-compose.yml -f ~/recurrsens-staging/docker-compose.staging.yml ps"

# Logs
ssh flakhal@31.70.77.124 "docker compose -p recurrsens-staging -f ~/recurrsens-staging/docker-compose.yml -f ~/recurrsens-staging/docker-compose.staging.yml logs backend --tail=50"

# Restart
ssh flakhal@31.70.77.124 "docker compose -p recurrsens-staging -f ~/recurrsens-staging/docker-compose.yml -f ~/recurrsens-staging/docker-compose.staging.yml restart"

# Stop staging (to free resources)
ssh flakhal@31.70.77.124 "docker compose -p recurrsens-staging -f ~/recurrsens-staging/docker-compose.yml -f ~/recurrsens-staging/docker-compose.staging.yml down"

# Django management commands
ssh flakhal@31.70.77.124 "docker compose -p recurrsens-staging -f ~/recurrsens-staging/docker-compose.yml -f ~/recurrsens-staging/docker-compose.staging.yml exec backend python manage.py <command>"
```

## File Layout on Server

```
/home/flakhal/
├── recurrsens/                     # Production
│   ├── docker-compose.yml          # Base compose config
│   ├── docker-compose.prod.yml     # Production overrides
│   ├── dozzle-users.yml            # Dozzle auth config
│   └── .env                        # Production secrets (chmod 600)
│
└── recurrsens-staging/             # Staging
    ├── docker-compose.yml          # Base compose config (same file)
    ├── docker-compose.staging.yml  # Staging overrides
    └── .env                        # Staging secrets (chmod 600)
```

## Deployment Commands

### Initial Setup (already done)

```bash
# Server preparation was done via root, then root SSH was disabled.
# Docker, UFW, swap, and flakhal user are already configured.
```

### Deploy / Update

From local machine (macOS):

```bash
cd /Users/flakhal/Developer/stimmbandlaesion

# 1. Build images for linux/amd64
docker build -t ghcr.io/fyassine/stimmbandlaesion-backend:latest --platform linux/amd64 ./backend
docker build -t ghcr.io/fyassine/stimmbandlaesion-nginx:latest --platform linux/amd64 -f nginx/Dockerfile .

# 2. Push to ghcr.io
source .env
echo "$CR_PAT" | docker login ghcr.io -u fyassine --password-stdin
docker push ghcr.io/fyassine/stimmbandlaesion-backend:latest
docker push ghcr.io/fyassine/stimmbandlaesion-nginx:latest

# 3. Copy compose files (only if changed)
scp -i ~/.ssh/id_ed25519 docker-compose.yml docker-compose.prod.yml flakhal@31.70.77.124:~/stimmbandlaesion/

# 4. Pull and restart on server
ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124 \
  "cd ~/stimmbandlaesion && docker compose -f docker-compose.yml -f docker-compose.prod.yml pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
```

### Monitoring

```bash
# Container status
ssh flakhal@31.70.77.124 "cd ~/stimmbandlaesion && docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"

# Memory usage
ssh flakhal@31.70.77.124 "cd ~/stimmbandlaesion && docker stats --no-stream"

# Logs (all services)
ssh flakhal@31.70.77.124 "cd ~/stimmbandlaesion && docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=50"

# Logs (specific service)
ssh flakhal@31.70.77.124 "cd ~/stimmbandlaesion && docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend --tail=50"

# System resources
ssh flakhal@31.70.77.124 "free -h && df -h /"
```

### Restart Services

```bash
ssh flakhal@31.70.77.124 "cd ~/stimmbandlaesion && docker compose -f docker-compose.yml -f docker-compose.prod.yml restart"
```

### Run Django Management Commands

```bash
ssh flakhal@31.70.77.124 "cd ~/stimmbandlaesion && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py <command>"
```

## Database Backups

Production runs a nightly encrypted PostgreSQL backup as a Celery Beat
periodic task (`patients.tasks.backup_database_snapshot`, scheduled at 02:30
Europe/Berlin via `db-backup-nightly`). The pipeline: `pg_dump --format=custom
--compress=9` → GPG-encrypt → upload to `S3_BUCKET` under
`{BACKUP_S3_PREFIX}/{BACKUP_ENV}/` → prune backups beyond
`BACKUP_RETENTION` → email `ADMIN_NOTIFICATION_EMAIL` with the result.

Disabled by default — only enable on the production deployment server.

### Configuration

Set in the production GitHub environment (vars/secrets used by
`.github/workflows/deploy.yml`):

| Variable | Type | Description |
|---|---|---|
| `DB_BACKUP_ENABLED` | var | Set to `true` to enable the nightly task |
| `BACKUP_RETENTION` | var | Number of backups to keep (default 30) |
| `BACKUP_S3_PREFIX` | var | S3 key prefix (default `backups`) |
| `GPG_RECIPIENT_KEY` | secret | GPG key ID/email the dump is encrypted to |
| `GPG_PUBLIC_KEY` | secret | Base64-encoded ASCII-armored GPG public key — generate with `gpg --export --armor <recipient> \| base64 -w0` |

When `DB_BACKUP_ENABLED=true`, `config.settings.production` raises
`ImproperlyConfigured` at boot unless both `GPG_RECIPIENT_KEY` and
`GPG_PUBLIC_KEY` are set — backups are never uploaded unencrypted.

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

## Security

- **SSH:** Key-based only, root login disabled, password authentication disabled
- **Firewall (UFW):** Only ports 22 (SSH), 80 (HTTP), 443 (HTTPS) open
- **Internal services:** PostgreSQL, Redis, MinIO have no external port bindings
- **Secrets:** Production `.env` has `chmod 600`, not in version control
- **Admin password:** Default `admin/admin` — change immediately via Django admin
- **Docker credentials:** ghcr.io token stored in `~/.docker/config.json` on server

## SSL Setup (when domain is purchased)

1. Point domain A record to `31.70.77.124` in Strato DNS panel
2. Install Certbot: `sudo apt install certbot`
3. Get certificate: `sudo certbot certonly --standalone -d yourdomain.de`
4. Update `nginx/default.conf` with SSL server block (443 + HTTP→HTTPS redirect)
5. Update `.env`: `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `APP_URL` with domain
6. Rebuild and redeploy nginx image
7. Add auto-renewal: `sudo certbot renew --dry-run`
