# Service Endpoints

Quick reference for every service in the stack — browser URLs in dev and prod, plus internal-only services that have no public UI.

**Sources:** `docker-compose.yml`, `docker-compose.dev.yml`, `docker-compose.prod.yml`, `nginx/default.conf`, `backend/config/urls.py`, `backend/patients/urls.py`

---

## Browser-Accessible Services

| Service | Dev URL | Prod URL | Notes |
|---|---|---|---|
| Frontend (React SPA) | http://localhost:5173 | https://recurrsens.eu/ | Vite dev server in dev; nginx serves the built SPA in prod (`/usr/share/nginx/html`). |
| Backend API (Django/DRF) | http://localhost:8000/api/ | https://recurrsens.eu/api/ | Direct port in dev; nginx proxies `/api/` → `backend:8000` in prod. |
| Django Admin | http://localhost:8000/admin/ | https://recurrsens.eu/admin/ | Direct port in dev; nginx proxies `/admin/` → `backend:8000` in prod. |
| Dozzle (container logs) | Not enabled in dev | https://recurrsens.eu/logs/ | Only in `docker-compose.prod.yml`; nginx proxies `/logs/` → `dozzle:8080`. |
| MinIO Console (UI) | http://localhost:9001 | SSH tunnel → http://localhost:9001 | Prod: bound to `127.0.0.1:9001` only in `docker-compose.prod.yml`. Access via SSH tunnel: `ssh -L 9001:localhost:9001 -i ~/.ssh/id_ed25519 flakhal@212.227.176.203`, then open http://localhost:9001. |
| MinIO S3 API | http://localhost:9000 | SSH tunnel → http://localhost:9000 | Prod: bound to `127.0.0.1:9000` only in `docker-compose.prod.yml`. Same SSH tunnel: add `-L 9000:localhost:9000` to the command above. |

---

## Internal-Only Services (no browser UI)

| Service | Internal address | Notes |
|---|---|---|
| PostgreSQL | `db:5432` | TCP only. Port exposed to host in dev; removed in prod override. |
| Redis | `redis:6379` | TCP only. Port exposed to host in dev; removed in prod override. |
| Celery worker | — | Background task worker; no HTTP interface. |
| Celery beat | — | Scheduler; no HTTP interface. |

---

## API Endpoint Reference

All routes are relative to the API base (`/api/`).

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/token/` | None | Obtain JWT access + refresh tokens |
| `POST` | `/api/auth/token/refresh/` | None | Refresh JWT access token |

### Admin (JWT required)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/patients/` | JWT | List all patients |
| `POST` | `/api/patients/` | JWT | Create patient |
| `GET` | `/api/patients/{id}/` | JWT | Retrieve patient |
| `PUT/PATCH` | `/api/patients/{id}/` | JWT | Update patient |
| `DELETE` | `/api/patients/{id}/` | JWT | Delete patient |
| `GET` | `/api/export/` | JWT | Export data |

### Patient-Facing (UUID token)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/p/{token}/` | UUID token | Patient public view |
| `POST` | `/api/p/{token}/advance/` | UUID token | Advance patient session step |
| `POST` | `/api/p/{token}/audio/upload/` | UUID token | Direct audio upload |
| `POST` | `/api/p/{token}/audio/presign/` | UUID token | Get presigned upload URL (MinIO) |
| `POST` | `/api/p/{token}/audio/confirm/` | UUID token | Confirm presigned upload complete |

### Public

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/exercises/` | None | List available exercises |
| `GET` | `/api/audio/{file_id}/` | None | Stream audio file |
| `GET` | `/api/audio/{file_id}/url/` | None | Get audio download URL |

---

## Nginx Routing Summary (prod)

```
https://recurrsens.eu/          → nginx serves React SPA (static files)
https://recurrsens.eu/api/      → proxy → backend:8000
https://recurrsens.eu/admin/    → proxy → backend:8000
https://recurrsens.eu/static/   → alias /app/staticfiles/ (Django admin assets)
https://recurrsens.eu/logs/     → proxy → dozzle:8080/logs/
http://recurrsens.eu/           → 301 redirect → https://recurrsens.eu/
```
