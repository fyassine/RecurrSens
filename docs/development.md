# Development Guide

## Prerequisites

- Docker & Docker Compose
- Node.js 22+ and npm
- Python 3.11+

---

## Running the Local Development Environment

The dev stack uses Docker Compose for backend services (PostgreSQL, MinIO, Redis, Celery) and runs the Django dev server + Vite dev server directly on the host for hot-reload.

### 1. Start backend services

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

This starts:
- **PostgreSQL** on `localhost:5432`
- **MinIO** on `localhost:9000` (S3 API) and `localhost:9001` (console UI)
- **Redis** on `localhost:6379`
- **Django dev server** on `localhost:8000`
- **Celery worker** (debug log level)

> `nginx` is disabled in dev (`profiles: [production]`). The frontend dev server is used instead.

### 2. Start the frontend dev server

In a separate terminal:

```bash
cd frontend
npm install   # first time only
npm run dev
```

Frontend is available at **http://localhost:5173**

### 3. Apply database migrations (first time / after model changes)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python manage.py migrate
```

### 4. Create a superuser (first time)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python manage.py createsuperuser
```

---

## Service URLs (dev)

| Service | URL |
|---|---|
| Frontend (Vite) | http://localhost:5173 |
| Backend API | http://localhost:8000/api/ |
| Django Admin | http://localhost:8000/admin/ |
| MinIO Console | http://localhost:9001 |
| MinIO S3 API | http://localhost:9000 |

Default MinIO credentials: `minioadmin` / `minioadmin`

---

## Running Tests

```bash
cd backend
python manage.py test --verbosity=2
```

Or inside Docker:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec backend python manage.py test --verbosity=2
```

---

## API Endpoint Reference

Base URL (dev): `http://localhost:8000`  
Base URL (prod): `https://recurrsens.eu`

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/token/` | None | Obtain JWT access + refresh tokens |
| `POST` | `/api/auth/token/refresh/` | None | Refresh JWT access token |

**Request body (`/api/auth/token/`):**
```json
{ "username": "admin", "password": "password" }
```

**Response:**
```json
{ "access": "<jwt>", "refresh": "<jwt>" }
```

Pass the access token as `Authorization: Bearer <jwt>` on subsequent requests.

---

### Patients (JWT required)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/patients/` | List all patients |
| `POST` | `/api/patients/` | Create a new patient |
| `GET` | `/api/patients/{id}/` | Retrieve a patient |
| `PUT/PATCH` | `/api/patients/{id}/` | Update a patient |
| `DELETE` | `/api/patients/{id}/` | Delete a patient |
| `GET` | `/api/export/` | Export all patient data |

---

### Patient-Facing (UUID token)

These endpoints are used by the patient-side recording UI. The `{token}` is a UUID sent to the patient via QR code or link.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/p/{token}/` | Patient public view (exercises, status) |
| `POST` | `/api/p/{token}/advance/` | Advance the patient's session step |
| `POST` | `/api/p/{token}/audio/upload/` | Direct audio upload |
| `POST` | `/api/p/{token}/audio/presign/` | Get a presigned MinIO upload URL |
| `POST` | `/api/p/{token}/audio/confirm/` | Confirm presigned upload is complete |

---

### Public

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/exercises/` | None | List available exercises |
| `GET` | `/api/audio/{file_id}/` | None | Stream an audio file |
| `GET` | `/api/audio/{file_id}/url/` | None | Get audio download URL |
