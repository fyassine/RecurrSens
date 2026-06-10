# Staging Environment Guide

The staging environment is deployed at **[https://staging.recurrsens.eu](https://staging.recurrsens.eu)**. It runs alongside the production environment on the same Strato VPS.

---

## Architecture and Data Isolation

To conserve the limited system memory (856MB RAM), staging shares the stateless backing infrastructure (PostgreSQL, Redis, and MinIO) with production, but operates on completely isolated data namespaces and dedicated application containers:

| Resource | Production | Staging | Port / DB / Bucket |
|---|---|---|---|
| **Database** (PostgreSQL) | `stimmbandlaesion` | `stimmbandlaesion_staging` | Port 5432 (Shared container `recurrsens-db-1`) |
| **Broker/Cache** (Redis) | DB 0 | DB 1 | Port 6379 (Shared container `recurrsens-redis-1`) |
| **Object Storage** (MinIO) | `stimmbandlaesion` | `stimmbandlaesion-staging` | Port 9000 (Shared container `recurrsens-minio-1`) |
| **Backend API** (Django) | `recurrsens-backend-1` | `recurrsens-staging-backend-1` | Port 8000 (Gunicorn) |
| **Background Tasks** (Celery) | `recurrsens-celery-1` | `recurrsens-staging-celery-1` | Dedicated celery staging worker |
| **Reverse Proxy** (Nginx) | `recurrsens-nginx-1` | `recurrsens-staging-nginx-1` | Staging Nginx handles client static files and routes |

*Note: The production Nginx container (`recurrsens-nginx-1`) handles TLS termination for both domains and reverse proxies traffic for `staging.recurrsens.eu` to `recurrsens-staging-nginx-1` over the `recurrsens_default` Docker network.*

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

## Deployment Instructions

Staging can be deployed directly from the local development environment using the helper script. This builds local Docker images targeted at `linux/amd64`, compresses them, transfers them over SSH to the VPS, writes the environment files, runs migrations, and reloads Nginx:

```bash
# Execute local deployment script from project root
python3 /Users/flakhal/.gemini/antigravity-ide/brain/00cf377d-d160-40f8-9b9a-8a308fcc2d3d/scratch/deploy_staging.py
```

---

## Staging Operations & Troubleshooting

To manage staging services, SSH into the Strato VPS (`ssh -i ~/.ssh/id_ed25519 flakhal@31.70.77.124`) and run the following commands inside `~/recurrsens-staging/`:

### 1. View Service Status
Check the status of staging containers:
```bash
docker compose -p recurrsens-staging -f docker-compose.staging.yml ps
```

### 2. View Service Logs
Tail staging logs (e.g., backend, celery, nginx):
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

### 5. Tear Down / Stop Staging
If memory constraints are causing issues on the server, staging can be shut down completely to free resources:
```bash
docker compose -p recurrsens-staging -f docker-compose.staging.yml down
```
