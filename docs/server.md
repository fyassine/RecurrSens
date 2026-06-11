# Deployment Guide — RecurrSens

## Architecture Overview

The application runs on a single Strato VPS using Docker Compose. All services run as containers behind an Nginx reverse proxy.

```
Internet → :80/:443 → Nginx → Backend (Gunicorn)
                            ↘ Frontend (static React SPA)
                            ↘ Django Admin   (/admin/)
                            ↘ Dozzle logs    (/logs/)

Internal only (not exposed):
  PostgreSQL :5432
  Redis      :6379
  MinIO      :9000/:9001
  Celery Worker
  Celery Beat
```

### Design Decisions

*(The choices below were made under the original 1 vCore / 1GB RAM plan. The server has since been upgraded — see Server Specifications — but the architecture and limits were kept as-is since they work well within the new headroom.)*

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Orchestration | Docker Compose | 1GB RAM — K3s needs ~512MB baseline, leaving nothing for the app |
| Image Strategy | Build on server via `git pull` + `--build` | Avoids cross-compilation complexity; build runs once, images are cached |
| Gunicorn Workers | 1 | RAM constraint (each worker ~70MB) |
| Celery Concurrency | 1 | RAM constraint |
| Server User | `flakhal` (non-root) | Security best practice; root SSH disabled |
| Firewall | UFW: 22, 80, 443 only | DB/Redis/MinIO not exposed externally |
| Swap | 2GB swap file | Prevents OOM kills during image builds |
| SSL | Let's Encrypt via Certbot | Pending DNS setup for `recurrsens.eu` |
| Log viewer | Dozzle at `/logs/` | Password-protected via `dozzle-users.yml` (SHA-256) |
| Database | PostgreSQL 16 with tuned memory | `shared_buffers=64MB`, `max_connections=20` |
| Redis | maxmemory 32MB, LRU eviction | Celery broker only |

---

## Server Specifications

*(Verified 2026-06-11 — server was upgraded from the original VC1-1 plan; figures below are current.)*

| | |
|---|---|
| **Provider** | Strato VPS |
| **CPU** | 2 vCPU (AMD EPYC-Milan) |
| **RAM** | 3868 MB (~3.8 GB) |
| **Disk** | 116 GB (6.5 GB used) |
| **IP** | `31.70.77.124` |
| **OS** | Ubuntu 24.04.4 LTS |
| **Swap** | 2047 MB (~2 GB) |
| **SSH** | `ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124` |

## Container Memory Limits

For up-to-date production and staging memory limits, see [docs/deployment.md § Container Memory Limits](deployment.md#container-memory-limits) — production currently reserves ~1136 MB and staging ~784 MB, well within the 3.8 GB RAM + 2 GB swap available.

Swap absorbs burst usage (e.g. during image builds or migrations).

---

## File Layout on Server

```
/home/flakhal/RecurrSens/        ← git clone of github.com/fyassine/RecurrSens
├── docker-compose.yml           # Base compose (builds, volumes, healthchecks)
├── docker-compose.prod.yml      # Production overrides (memory limits, gunicorn, dozzle)
├── dozzle-users.yml             # Dozzle auth (SHA-256 hashed password, not in git)
└── .env                         # Production secrets (chmod 600, not in git)
```

---

## CI / CD

Two GitHub Actions workflows live in `.github/workflows/`:

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | Push to `dev/**`, PR to `main` | Backend tests (~1 min) |
| `deploy.yml` | Merge / push to `main` | Backend tests → SSH deploy |

**`main` is branch-protected** — direct pushes are blocked. Every change must go through a PR with a passing CI check.

### Normal development flow

```bash
# 1. Create a feature branch
git checkout -b dev/my-feature

# 2. Work, commit, push — ci.yml runs tests automatically
git push origin dev/my-feature

# 3. Open a PR on GitHub (github.com/fyassine/RecurrSens)
#    → CI must pass before merge is allowed

# 4. Merge PR → deploy.yml runs tests again → SSHes into server
#    git pull + docker compose up -d --build
```

### GitHub secrets (repository → Settings → Environments → production)

| Secret | Value |
|---|---|
| `SSH_HOST` | `31.70.77.124` |
| `SSH_USER` | `flakhal` |
| `SSH_PRIVATE_KEY` | ED25519 deploy key (public key in `~/.ssh/authorized_keys` on server) |

### Manual deploy (bypass CI — emergencies only)

```bash
# On the server directly
ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124
cd ~/RecurrSens
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The `--build` only rebuilds images whose source files changed (Docker layer cache).
On the 1 vCore VPS a full rebuild takes ~3 minutes; updates are faster.

---

## Deployment Commands

### First-time setup on a fresh server

```bash
# 1. Clone repo
git clone git@github.com:fyassine/RecurrSens.git ~/RecurrSens
cd ~/RecurrSens

# 2. Create .env
cp .env.example .env
nano .env   # fill in secrets

# 3. Set dozzle password (SHA-256 of your chosen password)
echo -n "yourpassword" | sha256sum | awk '{print $1}'
# paste hash into dozzle-users.yml

# 4. Start
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Monitoring

```bash
# Container status
ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124 \
  "cd ~/RecurrSens && docker compose -f docker-compose.yml -f docker-compose.prod.yml ps"

# Memory usage per container
ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124 "docker stats --no-stream"

# System resources
ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124 "free -h && df -h /"

# Logs — all services
ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124 \
  "cd ~/RecurrSens && docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=50"

# Logs — specific service (backend / celery / nginx / dozzle …)
ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124 \
  "cd ~/RecurrSens && docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend --tail=50"

# Or open Dozzle in the browser:
#   http://31.70.77.124/logs/   (login: admin / <dozzle password>)
```

### Django management commands

```bash
ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124 \
  "cd ~/RecurrSens && docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py <command>"

# Examples:
#   python manage.py changepassword admin
#   python manage.py shell
#   python manage.py migrate
```

### Restart services

```bash
ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124 \
  "cd ~/RecurrSens && docker compose -f docker-compose.yml -f docker-compose.prod.yml restart"
```

---

## Security

- **SSH:** Key-based only, root login disabled, password authentication disabled
- **Firewall (UFW):** Ports 22, 80, 443 only — DB/Redis/MinIO not exposed externally
- **Secrets:** `.env` has `chmod 600`, never committed to git
- **Admin password:** Set via `DJANGO_SUPERUSER_PASSWORD` in `.env` on first boot
- **Dozzle password:** SHA-256 hashed in `dozzle-users.yml` (not in git)

---

## HTTPS Setup (when DNS is pointed to `recurrsens.eu`)

> The stack is currently running on HTTP. The nginx config already includes ACME challenge routing.
> Once DNS propagates, run the steps below — no rebuild required.

### Step 1 — Point DNS

At your domain registrar add:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | `@` | `31.70.77.124` | 300 |
| A | `www` | `31.70.77.124` | 300 |

Verify propagation:

```bash
dig +short recurrsens.eu
# Should return: 31.70.77.124
```

### Step 2 — Obtain certificate

```bash
ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124

cd ~/RecurrSens
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot \
  certbot certonly --webroot -w /var/www/certbot \
  -d recurrsens.eu -d www.recurrsens.eu \
  --email admin@recurrsens.eu \
  --agree-tos --no-eff-email
```

If the webroot method fails, use standalone (stop nginx first):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop nginx
docker run --rm -p 80:80 -v recurrsens_certbot_data:/etc/letsencrypt certbot/certbot \
  certonly --standalone \
  -d recurrsens.eu -d www.recurrsens.eu \
  --email admin@recurrsens.eu \
  --agree-tos --no-eff-email
```

### Step 3 — Switch nginx to HTTPS config

Replace `~/RecurrSens/nginx/default.conf` on the server with the HTTPS version from the repo
(already committed as `nginx/default.conf` — the current server copy is HTTP-only transitional):

```bash
git pull origin main   # pulls the HTTPS nginx/default.conf
```

Then update `.env` with the domain values:

```bash
nano ~/RecurrSens/.env
# ALLOWED_HOSTS=recurrsens.eu,www.recurrsens.eu,31.70.77.124,localhost
# APP_URL=https://recurrsens.eu
# CORS_ALLOWED_ORIGINS=https://recurrsens.eu
# CSRF_TRUSTED_ORIGINS=https://recurrsens.eu,https://www.recurrsens.eu
```

Restart the stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --force-recreate nginx backend
```

Verify:

```bash
curl -I http://recurrsens.eu    # should return 301 → HTTPS
curl -I https://recurrsens.eu   # should return 200
```

### Step 4 — Auto-renewal

The `certbot` service in `docker-compose.prod.yml` renews automatically every 12 hours.
After renewal nginx needs a reload to pick up new certs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload
```

### HTTPS verification checklist

- [ ] `dig +short recurrsens.eu` → `31.70.77.124`
- [ ] `curl -I http://recurrsens.eu` → `301` redirect to HTTPS
- [ ] `curl -I https://recurrsens.eu` → `200 OK`
- [ ] `https://recurrsens.eu/admin/login/` → Django admin (no CSRF 403)
- [ ] `https://recurrsens.eu/logs/` → Dozzle login
- [ ] `https://recurrsens.eu/` → React SPA loads
- [ ] SSL Labs: `https://www.ssllabs.com/ssltest/analyze.html?d=recurrsens.eu`
