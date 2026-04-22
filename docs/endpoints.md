# Endpoint Access Map

This document shows where each service can be accessed in development and production.

## Source of Truth

- [docker-compose.yml](../docker-compose.yml)
- [docker-compose.dev.yml](../docker-compose.dev.yml)
- [docker-compose.prod.yml](../docker-compose.prod.yml)
- [nginx/default.conf](../nginx/default.conf)
- [backend/config/urls.py](../backend/config/urls.py)
- [backend/patients/urls.py](../backend/patients/urls.py)
- [docs/architecture.md](architecture.md)
- [docs/server.md](server.md)

## Service Access in Browser

| Service | Dev URL | Prod URL | Notes |
|---|---|---|---|
| Frontend (React) | http://localhost:5173 | https://recurrsens.eu/ | Vite dev server in dev, nginx-served SPA in prod. See [frontend/vite.config.ts](../frontend/vite.config.ts) and [nginx/default.conf](../nginx/default.conf). |
| Backend API (Django/DRF) | http://localhost:8000/api/ and via frontend /api proxy | https://recurrsens.eu/api/ | Proxy rules in [nginx/default.conf](../nginx/default.conf). Dev port mapping in [docker-compose.dev.yml](../docker-compose.dev.yml). |
| Django Admin | http://localhost:8000/admin/ | https://recurrsens.eu/admin/ | Route in [backend/config/urls.py](../backend/config/urls.py), proxy in [nginx/default.conf](../nginx/default.conf). |
| Dozzle (container logs) | Not enabled in dev override | https://recurrsens.eu/logs/ | Service in [docker-compose.prod.yml](../docker-compose.prod.yml), routed in [nginx/default.conf](../nginx/default.conf). |
| MinIO Console | http://localhost:9001 | Not exposed externally in prod | Base ports in [docker-compose.yml](../docker-compose.yml), removed in prod by [docker-compose.prod.yml](../docker-compose.prod.yml). |
| MinIO S3 API | http://localhost:9000 | Not exposed externally in prod | API endpoint, not a typical UI. Same port rules as above. |
| PostgreSQL | No browser UI | No browser UI | TCP only. Base mapping in [docker-compose.yml](../docker-compose.yml), removed in prod by [docker-compose.prod.yml](../docker-compose.prod.yml). |
| Redis | No browser UI | No browser UI | TCP only. Base mapping in [docker-compose.yml](../docker-compose.yml), removed in prod by [docker-compose.prod.yml](../docker-compose.prod.yml). |
| Celery worker | No HTTP endpoint | No HTTP endpoint | Background worker only. See [docker-compose.yml](../docker-compose.yml). |
| Celery beat | No HTTP endpoint | No HTTP endpoint | Scheduler only. See [docker-compose.yml](../docker-compose.yml). |

## Notes

- In production, PostgreSQL, Redis, and MinIO are internal-only services by design. See [docs/server.md](server.md).
- If you add Swagger/ReDoc later, include those URLs in this table as additional rows.
