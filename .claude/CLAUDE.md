# RecurrSens — Claude Context

## Project Overview

RecurrSens is a medical platform for vocal cord lesion (recurrent laryngeal nerve paresis) diagnosis. Clinicians create patient records via a JWT-protected dashboard, patients complete a guided recording wizard accessed via QR code UUID tokens, and an AI inference service analyses audio recordings asynchronously via Celery. Completed patient data can be exported as CSV + audio ZIP.

---

## Directory Layout

```
backend/             Django 5.1 project
  config/            Settings (base / development / production split)
  patients/          Single Django app: models, views, serializers, services, tasks
frontend/            React 19 SPA (Vite 8, TypeScript)
  src/
    api/             Axios instances (admin + public)
    components/      Shared UI components
    pages/           Route-level page components
nginx/               Nginx config + Dockerfile (production only)
docs/                Architecture, endpoints, deployment, development guides
docker-compose.yml         Production services
docker-compose.dev.yml     Dev overrides (bind mounts, Django runserver)
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite 8, TypeScript, Mantine 7, Tailwind CSS, Motion |
| Backend | Django 5.1, DRF 3.15, Python 3.12 |
| Database | PostgreSQL 16 |
| Object storage | MinIO (dev) / AWS S3 (prod) via django-storages + boto3 |
| Task queue | Celery 5 + Redis 7 |
| Auth | SimpleJWT (admins); UUID primary key as token (patients, embedded in QR) |
| Infra | Docker Compose, Nginx, Gunicorn |

---

## Key Commands

### Dev environment

```bash
# Start all backend services (DB, MinIO, Redis, Django, Celery)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# Start frontend dev server (separate terminal)
cd frontend && npm run dev        # http://localhost:5173
```

### Backend (inside Docker or venv)

```bash
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py createsuperuser
docker compose exec backend python manage.py test --verbosity=2
```

### Frontend

```bash
npm run dev       # dev server
npm run build     # production build (tsc + vite)
npm run lint      # eslint
```

### Docker

```bash
docker compose up -d                    # production stack
docker compose down
docker compose logs -f <service>        # backend | celery | nginx | db | minio | redis
```

---

## Architecture Decisions

- **JWT for admins, UUID token for patients**: Admins log in via `/api/auth/token/`; patients are identified by their UUID primary key embedded in a QR code — no account needed.
- **MinIO / S3 for audio**: Audio files are stored in object storage, never on the Django filesystem. Use pre-signed URLs for direct client-to-storage uploads to reduce server load.
- **Celery for AI inference**: After recording phases complete, `run_inference_task` calls the external inference service asynchronously (retries 3×, 30 s delay). Results are written back to the `Patient` model.
- **Nginx as reverse proxy**: `/api/*` and `/admin/*` proxy to Django; `/*` serves the React SPA with `try_files` fallback.
- **Split Django settings**: `config/settings/base.py` → `development.py` / `production.py`. The active module is selected via `DJANGO_SETTINGS_MODULE`.

---

## Conventions

### Backend

- All domain logic lives in `backend/patients/services.py` — keep views thin.
- REST endpoints follow DRF ViewSet / APIView patterns; permissions are declared per-view with custom classes (`IsAdminUser`, `IsPatientTokenValid`, `IsAdminOrPatientToken`).
- Patient workflow transitions are enforced by `advance_patient_step()` — do not mutate `Patient.status` directly.
- Run `python manage.py migrate` after any model change.

### Frontend

- API calls go through `src/api/client.ts` — use the `api` instance (JWT interceptor) for admin routes and `publicApi` for patient-facing routes.
- Pages in `src/pages/`, reusable components in `src/components/`.
- Auth state is stored in `localStorage` (`access_token`, `refresh_token`).

### General

- Never commit `.env` — use `.env.example` for defaults.
- Never store audio files in Django's media root — always use MinIO/S3.
- Never bypass JWT middleware on new admin endpoints.

---

## Further Reading

- [Architecture & data model](../docs/architecture.md)
- [API endpoint reference](../docs/endpoints.md)
- [Development guide](../docs/development.md)
- [Deployment guide](../docs/deployment.md)
