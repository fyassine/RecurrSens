# Staging Environment Guide

The staging environment is deployed at **[https://staging.recurrsens.eu](https://staging.recurrsens.eu)**. It runs alongside the production environment on the same Strato VPS.

---

## Architecture and Data Isolation

Staging runs its **own dedicated `db`, `redis`, and `minio` containers**, fully isolated from production's data. This avoids schema drift between staging and production (running migrations on staging can never affect production's database) and lets staging be reset/torn down without touching production state.

| Resource | Production | Staging |
|---|---|---|
| **Database** (PostgreSQL) | `recurrsens-db-1` | `recurrsens-staging-db-1` (dedicated container + volume) |
| **Broker/Cache** (Redis) | `recurrsens-redis-1` | `recurrsens-staging-redis-1` (dedicated container) |
| **Object Storage** (MinIO) | `recurrsens-minio-1` | `recurrsens-staging-minio-1` (dedicated container + volume) |
| **Backend API** (Django) | `recurrsens-backend-1` | `recurrsens-staging-backend-1` |
| **Background Tasks** (Celery) | `recurrsens-celery-1` | `recurrsens-staging-celery-1` |
| **Reverse Proxy** (Nginx) | `recurrsens-nginx-1` | `recurrsens-staging-nginx-1` |

*Note: The production Nginx container (`recurrsens-nginx-1`) handles TLS termination for both domains and reverse proxies traffic for `staging.recurrsens.eu` to `recurrsens-staging-nginx-1` over the `recurrsens_default` Docker network. The staging `nginx` container is the only staging service attached to that network — `db`, `redis`, `minio`, `backend`, and `celery` are only reachable from within the staging project's own network.*

---

## File Layout on Server

Staging configuration files reside on the VPS at `~/recurrsens-staging/`:

```text
/home/flakhal/recurrsens-staging/
├── .env                          # Staging configuration (chmod 600)
├── docker-compose.staging.yml    # Docker Compose orchestration file
└── README.md                     # This documentation guide
```

---

## Deployment

Staging deploys automatically via GitHub Actions (`.github/workflows/deploy-staging.yml`) on every push to the `staging` branch, or via manual `workflow_dispatch`. The workflow builds and pushes `:staging` tagged images, writes `~/recurrsens-staging/.env` from the GitHub "staging" environment's vars/secrets, brings up all staging containers (including the dedicated `db`/`redis`/`minio`), and runs migrations + `collectstatic` against staging's own database.

---

## Staging Operations & Troubleshooting

To manage staging services, SSH into the Strato VPS (`ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124`) and run the following commands inside `~/recurrsens-staging/`:

### 1. View Service Status
Check the status of staging containers:
```bash
docker compose -p recurrsens-staging -f docker-compose.staging.yml ps
```

### 2. View Service Logs
Tail staging logs (e.g., backend, celery, nginx, db, minio):
```bash
# Tail all staging containers
docker compose -p recurrsens-staging -f docker-compose.staging.yml logs -f --tail=100

# Tail celery worker specifically
docker compose -p recurrsens-staging -f docker-compose.staging.yml logs -f celery
```

### 3. Restart Staging Services
Restart the backend, Celery, or Nginx containers:
```bash
docker compose -p recurrsens-staging -f docker-compose.staging.yml restart
```

### 4. Run Django Management Commands
Execute database migrations or other Django admin commands on the staging database:
```bash
# Run interactive bash shell in the backend container
docker compose -p recurrsens-staging -f docker-compose.staging.yml exec backend ash

# Run migrations
docker compose -p recurrsens-staging -f docker-compose.staging.yml exec backend python manage.py migrate

# Create staging superuser
docker compose -p recurrsens-staging -f docker-compose.staging.yml exec backend python manage.py createsuperuser
```

### 5. Reset Staging Data
Since staging now has its own dedicated `db` and `minio` volumes, staging data can be wiped completely without any risk to production:
```bash
docker compose -p recurrsens-staging -f docker-compose.staging.yml down -v   # -v also removes db/minio volumes
docker compose -p recurrsens-staging -f docker-compose.staging.yml up -d
```

### 6. Tear Down / Stop Staging
If memory constraints are causing issues on the server, staging can be shut down completely to free resources (data is preserved in volumes):
```bash
docker compose -p recurrsens-staging -f docker-compose.staging.yml down
```

---

## Current VPS Resources

*(Verified 2026-08-18)*

| | |
|---|---|
| **Provider** | Strato VPS |
| **CPU** | 2 vCPU (AMD EPYC-Milan) |
| **RAM** | 3868 MB (~3.8 GB) |
| **Swap** | 2047 MB (~2 GB) |
| **Disk** | 116 GB (7.7 GB used) |
| **OS** | Ubuntu 24.04.4 LTS |

Reserved memory limits: production ~1136MB + staging ~784MB ≈ **1.9GB**, comfortably within the 3.8GB RAM + 2GB swap available. See [docs/deployment.md](docs/deployment.md#container-memory-limits) for the full per-service breakdown.
