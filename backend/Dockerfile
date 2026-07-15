# ============================================================
# Backend Dockerfile — Multi-stage build
# ============================================================
# Stage 1: Build dependencies
FROM python:3.12-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# Stage 2: Production image
FROM python:3.12-slim AS runner

# libpq5: Postgres client library
# postgresql-client-16: pg_dump (matches the postgres:16-alpine server, used
#   by patients.tasks.backup_database_snapshot)
# gnupg: encrypts the nightly DB backup before it is uploaded to S3/MinIO
# libpango-1.0-0, libpangocairo-1.0-0, libcairo2, libgdk-pixbuf-2.0-0,
# libffi-dev, shared-mime-info, fonts-dejavu-core: WeasyPrint's native
#   rendering stack, used by patients.services.generate_patient_pdf
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 wget gnupg ca-certificates \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libgdk-pixbuf-2.0-0 \
    libffi-dev shared-mime-info fonts-dejavu-core \
    && wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system django && useradd --system --gid django django

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Create directory for static files
RUN mkdir -p /app/staticfiles && chown -R django:django /app

USER django

# Gunicorn will bind to port 8000
EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]

# Default command: run Gunicorn
CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "3", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]
