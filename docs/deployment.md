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
- **IP:** 212.227.176.203
- **OS:** Ubuntu 22.04.5 LTS
- **CPU:** 1 vCPU (AMD EPYC-Milan)
- **RAM:** 856MB + 2GB swap
- **Disk:** 10GB NVMe SSD
- **SSH:** `ssh -i ~/.ssh/id_ed25519 flakhal@212.227.176.203`

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

## File Layout on Server

```
/home/flakhal/stimmbandlaesion/
├── docker-compose.yml          # Base compose config
├── docker-compose.prod.yml     # Production overrides (image refs, memory limits, ports)
└── .env                        # Production secrets (chmod 600)
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
scp -i ~/.ssh/id_ed25519 docker-compose.yml docker-compose.prod.yml flakhal@212.227.176.203:~/stimmbandlaesion/

# 4. Pull and restart on server
ssh -i ~/.ssh/id_ed25519 flakhal@212.227.176.203 \
  "cd ~/stimmbandlaesion && docker compose -f docker-compose.yml -f docker-compose.prod.yml pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
```

### Monitoring

```bash
# Container status
ssh flakhal@212.227.176.203 "cd ~/stimmbandlaesion && docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"

# Memory usage
ssh flakhal@212.227.176.203 "cd ~/stimmbandlaesion && docker stats --no-stream"

# Logs (all services)
ssh flakhal@212.227.176.203 "cd ~/stimmbandlaesion && docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=50"

# Logs (specific service)
ssh flakhal@212.227.176.203 "cd ~/stimmbandlaesion && docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend --tail=50"

# System resources
ssh flakhal@212.227.176.203 "free -h && df -h /"
```

### Restart Services

```bash
ssh flakhal@212.227.176.203 "cd ~/stimmbandlaesion && docker compose -f docker-compose.yml -f docker-compose.prod.yml restart"
```

### Run Django Management Commands

```bash
ssh flakhal@212.227.176.203 "cd ~/stimmbandlaesion && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py <command>"
```

## Security

- **SSH:** Key-based only, root login disabled, password authentication disabled
- **Firewall (UFW):** Only ports 22 (SSH), 80 (HTTP), 443 (HTTPS) open
- **Internal services:** PostgreSQL, Redis, MinIO have no external port bindings
- **Secrets:** Production `.env` has `chmod 600`, not in version control
- **Admin password:** Default `admin/admin` — change immediately via Django admin
- **Docker credentials:** ghcr.io token stored in `~/.docker/config.json` on server

## SSL Setup (when domain is purchased)

1. Point domain A record to `212.227.176.203` in Strato DNS panel
2. Install Certbot: `sudo apt install certbot`
3. Get certificate: `sudo certbot certonly --standalone -d yourdomain.de`
4. Update `nginx/default.conf` with SSL server block (443 + HTTP→HTTPS redirect)
5. Update `.env`: `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `APP_URL` with domain
6. Rebuild and redeploy nginx image
7. Add auto-renewal: `sudo certbot renew --dry-run`
