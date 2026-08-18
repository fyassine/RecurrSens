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

*(The choices below were made under the original 856MB RAM plan. The server has since been upgraded — see Server Specifications below — but the architecture and limits were kept as-is since they work well within the new headroom.)*

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

*(Verified 2026-08-18 — server was upgraded from the original VC1-1 spec at some point; figures below are current.)*

- **Provider:** Strato VPS
- **IP:** 31.70.77.124
- **OS:** Ubuntu 24.04.4 LTS
- **CPU:** 2 vCPU (AMD EPYC-Milan)
- **RAM:** 3868MB (~3.8GB) + 2047MB (~2GB) swap
- **Disk:** 116GB (7.7GB used, 106GB available)
- **SSH:** `ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124`

## Container Memory Limits

### Production (`recurrsens` project)

| Service | Limit | Typical Usage |
|---------|-------|---------------|
| Backend (Gunicorn) | 256MB | ~110MB |
| Celery Worker | 192MB | ~172MB |
| Celery Beat | 96MB | ~85MB |
| PostgreSQL | 192MB | ~48MB |
| MinIO | 192MB | ~144MB |
| Redis | 48MB | ~4MB |
| Nginx | 128MB | ~7MB |
| Dozzle | 32MB | ~23MB |
| **Total** | **1136MB** | **~593MB** |

### Staging (`recurrsens-staging` project)

| Service | Limit |
|---------|-------|
| Backend (Gunicorn) | 256MB |
| Celery Worker | 192MB |
| PostgreSQL | 128MB |
| MinIO | 128MB |
| Redis | 32MB |
| Nginx | 48MB |
| **Total** | **784MB** |

Combined (production + staging) reserved limit ≈ **1.9GB**, well within the 3.8GB physical RAM + 2GB swap available.

### ML Serving (`recurrsens-ml` project)

A single `serving` container (`recurrsens-ml-serving`) from the independent
[`recurrsens-ml`](https://github.com/fyassine/recurrsens-ml) repo — FastAPI +
ONNX Runtime, no torch, no public port. It joins the `recurrsens_default`
network so `recurrsens-backend-1` (Celery) and the demo backend can both
reach it at `http://recurrsens-ml-serving:8100`; nothing else talks to it.

| Service | Limit | Measured steady-state |
|---------|-------|---------------|
| ML Serving | 1152MB | ~816MB (see `mlops/README.md`'s Phase B entries for the benchmark this was derived from — 768MB OOM-kills, 1024MB is stable, 1152MB adds margin) |

Combined (production + staging + ML serving) reserved limit ≈ **3.1GB**,
still within the 3.8GB physical RAM (2GB swap as a cushion, not a plan to
rely on it under load — see the mlops benchmark's own note that swapping the
model graph would blow the demo's inference-latency budget).

Both `recurrsens` (Celery, `INFERENCE_SERVICE_URL=http://recurrsens-ml-serving:8100`)
and `recurrsens-demo` (backend, same var) reach it over `recurrsens_default` —
no other service needs to.

## Staging Environment

### Architecture

Staging runs alongside production on the same VPS with its **own dedicated `db`, `redis`, and `minio` containers** — fully isolated from production's data and schema. Only the staging `nginx` container talks to production's network (so production nginx can proxy `staging.recurrsens.eu` to it).

| Container | Production | Staging | Notes |
|---|:---:|:---:|---|
| `db` (PostgreSQL) | ✅ | ✅ | Separate container + volume (`recurrsens-staging-db-1`) |
| `redis` | ✅ | ✅ | Separate container (`recurrsens-staging-redis-1`) |
| `minio` | ✅ | ✅ | Separate container + volume (`recurrsens-staging-minio-1`) |
| `backend` | ✅ | ✅ | Separate container, tagged `:staging` |
| `celery` | ✅ | ✅ | Separate container, tagged `:staging` |
| `celery-beat` | ✅ | ❌ | Not needed in staging |
| `nginx` | ✅ | ✅ | Production nginx terminates SSL; staging nginx serves SPA |
| `dozzle` | ✅ | **shared** | Already sees all containers |

**Additional RAM for staging**: ~784MB reserved limit (db 128MB + redis 32MB + minio 128MB + backend 256MB + celery 192MB + nginx 48MB).

### Networking

```
Internet → :443 → Production Nginx ─┬→ recurrsens.eu       → Production backend (:8000)
                                     └→ staging.recurrsens.eu → Staging Nginx (:8080)
                                                                   └→ Staging backend (:8000)
                                                                        └→ Staging db / redis / minio

Production Nginx (recurrsens-nginx-1) acts as the SSL terminator for both environments.
Only the staging `nginx` container joins the `recurrsens_default` network (so production
nginx can resolve and proxy to it). Staging's db/redis/minio/backend/celery are isolated
on the staging project's own network.
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
| `recurrsens-staging` (staging) | `~/recurrsens-staging/` | `docker-compose.staging.yml` (self-contained) |

### Staging Setup (one-time)

```bash
# 1. Add DNS A record for staging.recurrsens.eu → 31.70.77.124

# 2. Obtain SSL certificate for staging subdomain
sudo certbot certonly --webroot -w /var/www/certbot -d staging.recurrsens.eu

# 3. Create GitHub "staging" environment with staging-specific vars/secrets, e.g.:
#    ALLOWED_HOSTS=staging.recurrsens.eu
#    APP_URL=https://staging.recurrsens.eu
#    CORS_ALLOWED_ORIGINS=https://staging.recurrsens.eu
#    CSRF_TRUSTED_ORIGINS=https://staging.recurrsens.eu
#    DB_HOST=db, DB_PORT=5432, DB_NAME=stimmbandlaesion, DB_USER=stimmbandlaesion
#    S3_ENDPOINT=http://minio:9000, S3_BUCKET=stimmbandlaesion, S3_ACCESS_KEY=stimmbandlaesion
#    CELERY_BROKER_URL=redis://redis:6379/0
# (db/redis/minio are staging's own dedicated containers — see Architecture above)
```

### Staging Commands

Run from `~/recurrsens-staging/` on the VPS (see [README.staging.md](../README.staging.md) for the full operations guide):

```bash
# Container status
ssh flakhal@31.70.77.124 "cd ~/recurrsens-staging && docker compose -p recurrsens-staging -f docker-compose.staging.yml ps"

# Logs
ssh flakhal@31.70.77.124 "cd ~/recurrsens-staging && docker compose -p recurrsens-staging -f docker-compose.staging.yml logs backend --tail=50"

# Restart
ssh flakhal@31.70.77.124 "cd ~/recurrsens-staging && docker compose -p recurrsens-staging -f docker-compose.staging.yml restart"

# Stop staging (to free resources)
ssh flakhal@31.70.77.124 "cd ~/recurrsens-staging && docker compose -p recurrsens-staging -f docker-compose.staging.yml down"

# Django management commands
ssh flakhal@31.70.77.124 "cd ~/recurrsens-staging && docker compose -p recurrsens-staging -f docker-compose.staging.yml exec backend python manage.py <command>"
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
├── recurrsens-staging/             # Staging (self-contained, isolated db/redis/minio)
│   ├── docker-compose.staging.yml  # Full staging compose config
│   └── .env                        # Staging secrets (chmod 600)
│
└── recurrsens-ml/                  # ML serving (independent repo, see mlops/README.md)
    ├── compose.vps.yml             # Single `serving` container, no port published
    └── .env                        # S3 + serving config secrets (chmod 600)
```

## Deployment Commands

### Initial Setup (already done)

```bash
# Server preparation was done via root, then root SSH was disabled.
# Docker, UFW, swap, and flakhal user are already configured.
```

### Deploy / Update

Deploys go through CI/CD (`.github/workflows/deploy.yml`) on merge to `main` — no local build/push step. See [server.md § CI/CD](server.md#ci--cd) for the full workflow, and [server.md § Deployment Commands](server.md#deployment-commands) for monitoring, restart, and Django management command reference (container/path naming there — `recurrsens-*`, `~/recurrsens/` — is current; this file previously described a stale pre-CI/CD, pre-rename manual workflow).

## Database Backups & Data Access

See [backup.md](backup.md) for the nightly DB backup pipeline
(configuration, verification, restore) and how to access patient
recordings and metadata directly.

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
