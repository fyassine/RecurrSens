# RecurrSens

Medical web platform for vocal cord lesion (recurrent laryngeal nerve paresis) diagnosis. Clinicians manage patient records and audio recordings; an AI inference service predicts outcomes asynchronously; all data can be exported for clinical research.

---

## Features

- Patient management with a linear workflow (NEW → CONSENT_GIVEN → PRE_OP_DONE → POST_OP_STARTED → POST_OP_DONE)
- Guided patient-facing recording wizard (accessible via QR code, no login required)
- Pre-operative and post-operative voice audio recordings per exercise
- Asynchronous AI inference with Grad-CAM explainability and confidence scores
- PDF + QR code generation per patient
- CSV + audio ZIP export for completed patients

---

## Architecture

A containerised microservice setup orchestrated with Docker Compose:

```
Browser → Nginx → Django (DRF) → PostgreSQL
                              → MinIO / S3  (audio files)
                              → Redis → Celery → Inference Service
```

See [docs/architecture.md](docs/architecture.md) for the full system diagram and data model.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite 8, TypeScript, Mantine 7, Tailwind CSS, Motion |
| Backend | Django 5.1, Django REST Framework, Python 3.12 |
| Database | PostgreSQL 16 |
| Object storage | MinIO (dev) / AWS S3 (prod) |
| Task queue | Celery 5 + Redis 7 |
| Auth | JWT (SimpleJWT) for admins; UUID token for patients |
| Infra | Docker Compose, Nginx, Gunicorn |

---

## Local Development Setup

**Prerequisites:** Docker & Docker Compose, Node.js 22+

### 1. Clone and configure

```bash
git clone <repo-url>
cd RecurrSens
cp .env.example .env   # fill in your values
```

### 2. Start backend services

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

This starts PostgreSQL (5432), MinIO (9000/9001), Redis (6379), Django dev server (8000), and Celery worker. Nginx is disabled in dev.

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend is available at **http://localhost:5173**

### 4. First-time setup

```bash
# Run migrations
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python manage.py migrate

# Create a superuser
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python manage.py createsuperuser
```

---

## Environment Variables

Copy `.env.example` to `.env` and set:

```env
DJANGO_SECRET_KEY=change-me-in-production
ALLOWED_HOSTS=localhost
DB_NAME=stimmbandlaesion
DB_USER=postgres
DB_PASSWORD=postgres
DB_PORT=5432
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=stimmbandlaesion
S3_REGION=us-east-1
INFERENCE_SERVICE_URL=http://inference:8001
APP_URL=http://localhost
CORS_ALLOWED_ORIGINS=http://localhost
ADMIN_NOTIFICATION_EMAIL=admin@example.com
DATA_RETENTION_DAYS=3
```

---

## Useful Commands

```bash
# View logs for a service
docker compose logs -f backend

# Run Django management commands
docker compose exec backend python manage.py <command>

# Run backend tests
docker compose exec backend python manage.py test --verbosity=2

# Frontend lint
cd frontend && npm run lint

# Production build
docker compose up -d
```

---

## Service URLs (dev)

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000/api/ |
| Django Admin | http://localhost:8000/admin/ |
| MinIO Console | http://localhost:9001 |

## Center & User Management (Admin)

Order matters: create the center before you create the UserProfile.

### Step 0 - Create the Center

Admin -> Zentren -> Zentrum hinzufuegen -> set a name (e.g. `Klinik A`) -> save.

The Zentrum dropdown in the UserProfile form only shows centers that already exist.

### Step 1 - Create the Django user

Go to `http://localhost:8000/admin/` -> Benutzer -> Benutzer hinzufuegen.

Set a username and password, save. On the next screen you do not need to assign Django permissions or superuser status; the `UserProfile` handles role access.

### Step 2 - Create the UserProfile

Still in admin -> Benutzerprofile -> Benutzerprofil hinzufuegen.

- **Benutzer**: the user you just created
- **Rolle**: `CENTER_USER`
- **Zentrum**: pick the center you created

Save.

### Step 3 - Log in as that user

Open the frontend at `http://localhost:5173`, log in with the new credentials. The backend will:

- Filter `GET /api/patients/` to only return that center's patients
- Auto-assign `center=` on `POST /api/patients/` when they create a new patient
- Block `DELETE` entirely (only `SUPER_ADMIN` can delete)

The `GET /api/me/` endpoint returns `role` and `center_name` so the frontend can determine the logged-in role.
No code changes are needed; the access control layer is already wired up.

---

## Documentation

- [Architecture](docs/architecture.md)
- [API Endpoints](docs/endpoints.md)
- [Development Guide](docs/development.md)
- [Deployment](docs/deployment.md)
- [Center & User Management](docs/center-management.md) — how to create clinics, assign users, and migrate legacy patients
