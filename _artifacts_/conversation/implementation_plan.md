# Production Hardening & Domain Setup — Final Plan

Addressing 6 issues to make the application fully operational on `RecurrSens.eu` with HTTPS.

---

## Decisions Summary

| # | Issue | Decision |
|---|---|---|
| 1 | CSRF 403 | Add `CSRF_TRUSTED_ORIGINS`, use HTTPS from the start |
| 2 | Admin password | **Approach A** — env-variable in `entrypoint.sh` |
| 3 | Log viewer | Dozzle with password auth via `.env` |
| 4 | UI improvements | Full-width layout + rebrand to **RecurrSens** everywhere |
| 5 | Domain | HTTPS via Certbot, DNS instructions in `domain.md` |
| 6 | Microphone | HTTPS fixes it + better error messages in AudioRecorder |

---

## Proposed Changes

### Task 1: CSRF 403 Fix + HTTPS-Ready Settings

> [!NOTE]
> Patient-facing pages (`/p/{token}`) use UUID-based auth with `authentication_classes = []` — they don't use CSRF cookies. `CSRF_TRUSTED_ORIGINS` only matters for the Django admin panel and session-based auth.

#### [MODIFY] [base.py](file:///Users/flakhal/Developer/stimmbandlaesion/backend/config/settings/base.py)

Add `CSRF_TRUSTED_ORIGINS` (env-configurable) after the CORS block:

```python
CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS',
    default='http://localhost:5173,http://localhost:3000,http://localhost',
    cast=Csv(),
)
```

#### [MODIFY] [production.py](file:///Users/flakhal/Developer/stimmbandlaesion/backend/config/settings/production.py)

Keep `CSRF_COOKIE_SECURE = True` and `SESSION_COOKIE_SECURE = True` as-is (HTTPS will be configured immediately). No conditional needed since we're going straight to HTTPS.

---

### Task 2: Admin Password via Environment Variable

#### [MODIFY] [entrypoint.sh](file:///Users/flakhal/Developer/stimmbandlaesion/backend/entrypoint.sh)

Read credentials from environment variables instead of hardcoding `admin`/`admin`:

```bash
echo "=== Creating superuser if not exists ==="
python manage.py shell -c "
from django.contrib.auth import get_user_model
import os
User = get_user_model()
username = os.environ.get('DJANGO_SUPERUSER_USERNAME', 'admin')
email = os.environ.get('DJANGO_SUPERUSER_EMAIL', 'admin@example.com')
password = os.environ.get('DJANGO_SUPERUSER_PASSWORD', 'admin')
if not User.objects.filter(username=username).exists():
    User.objects.create_superuser(username, email, password)
    print(f'Superuser created: {username}')
else:
    print('Superuser already exists')
"
```

#### [MODIFY] [.env.example](file:///Users/flakhal/Developer/stimmbandlaesion/.env.example)

Add superuser env vars.

#### Server `.env`

```
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_PASSWORD=<your-secure-password>
```

> [!NOTE]
> Since the admin user already exists on the server, to apply the new password you'll need to run:
> `docker compose exec backend python manage.py changepassword admin`
> The env-var approach ensures future fresh deployments use the correct password.

---

### Task 3: Dozzle Log Viewer (Password-Protected)

#### [MODIFY] [docker-compose.prod.yml](file:///Users/flakhal/Developer/stimmbandlaesion/docker-compose.prod.yml)

Add Dozzle service with simple file-based auth:

```yaml
  dozzle:
    image: amir20/dozzle:latest
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./dozzle-users.yml:/data/users.yml:ro
    environment:
      DOZZLE_AUTH_PROVIDER: simple
      DOZZLE_BASE: /logs
    deploy:
      resources:
        limits:
          memory: 32M
```

#### [NEW] [dozzle-users.yml](file:///Users/flakhal/Developer/stimmbandlaesion/dozzle-users.yml)

Dozzle uses a `users.yml` with SHA-256 hashed passwords. The file format:

```yaml
users:
  admin:
    password: "<sha256-hash>"
    name: "Admin"
    email: "admin@recurrsens.eu"
```

Password hash is generated with: `echo -n "yourpassword" | shasum -a 256 | awk '{print $1}'`

#### [MODIFY] [default.conf](file:///Users/flakhal/Developer/stimmbandlaesion/nginx/default.conf)

Add `/logs/` proxy route to the HTTPS server block:

```nginx
location /logs/ {
    proxy_pass http://dozzle:8080/logs/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Connection "upgrade";
    proxy_set_header Upgrade $http_upgrade;
    proxy_http_version 1.1;
}
```

---

### Task 4: UI — Full-Width Layout + RecurrSens Branding

#### [MODIFY] [DashboardPage.tsx](file:///Users/flakhal/Developer/stimmbandlaesion/frontend/src/pages/DashboardPage.tsx)

- Reduce padding: `px: 5` → `px: { xs: 2, md: 3 }`
- Rename AppBar: "Stimmbandläsion — Dashboard" → "RecurrSens — Dashboard"

#### [MODIFY] [LoginPage.tsx](file:///Users/flakhal/Developer/stimmbandlaesion/frontend/src/pages/LoginPage.tsx)

- Rename title: "Stimmbandläsion" → "RecurrSens"

#### [MODIFY] [LandingScreen.tsx](file:///Users/flakhal/Developer/stimmbandlaesion/frontend/src/components/wizard/LandingScreen.tsx)

- Update card header: "Willkommen zur TUM Stimmprobenerfassung" → "Willkommen zur RecurrSens Stimmprobenerfassung"

#### [MODIFY] [theme.ts](file:///Users/flakhal/Developer/stimmbandlaesion/frontend/src/theme.ts)

- Add `Inter` as primary font (Google Fonts import in `index.html`)

#### [MODIFY] [index.html](file:///Users/flakhal/Developer/stimmbandlaesion/frontend/index.html)

- Update `<title>` to "RecurrSens"
- Add Google Fonts `Inter` link

> [!IMPORTANT]
> **Manual steps you need to do** (outside code):
> - Rename the GitHub repository from `stimmbandlaesion` to `recurrsens` (or your preference)
> - Update any CI/CD references to the repo name
> - Update Docker image names in `docker-compose.prod.yml` if the repo name changes

---

### Task 5: Domain + HTTPS Setup

#### [NEW] [domain.md](file:///Users/flakhal/Developer/stimmbandlaesion/docs/domain.md)

Step-by-step DNS + HTTPS setup instructions for `RecurrSens.eu`.

#### [MODIFY] [default.conf](file:///Users/flakhal/Developer/stimmbandlaesion/nginx/default.conf)

Full rewrite with:
1. HTTP server — only for ACME challenge + redirect to HTTPS
2. HTTPS server — main application with all existing routes + `/logs/`

```nginx
# HTTP → HTTPS redirect + ACME challenge
server {
    listen 80;
    server_name recurrsens.eu www.recurrsens.eu 212.227.176.203;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://recurrsens.eu$request_uri;
    }
}

# HTTPS — main application
server {
    listen 443 ssl;
    server_name recurrsens.eu www.recurrsens.eu;
    
    ssl_certificate /etc/letsencrypt/live/recurrsens.eu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/recurrsens.eu/privkey.pem;
    
    client_max_body_size 50M;
    
    # All existing location blocks...
    # + /logs/ for Dozzle
}
```

#### [MODIFY] [docker-compose.prod.yml](file:///Users/flakhal/Developer/stimmbandlaesion/docker-compose.prod.yml)

- Expose port 443 on nginx
- Add certbot volumes
- Add certbot renewal service
- Add certbot_data and certbot_webroot volumes

#### [MODIFY] [.env.example](file:///Users/flakhal/Developer/stimmbandlaesion/.env.example)

Update with all new variables:

```
ALLOWED_HOSTS=recurrsens.eu,www.recurrsens.eu,212.227.176.203,localhost
APP_URL=https://recurrsens.eu
CORS_ALLOWED_ORIGINS=https://recurrsens.eu
CSRF_TRUSTED_ORIGINS=https://recurrsens.eu,https://www.recurrsens.eu
```

---

### Task 6: Microphone Fix

**Primary**: HTTPS (Task 5) — resolves the root cause.

#### [MODIFY] [AudioRecorder.tsx](file:///Users/flakhal/Developer/stimmbandlaesion/frontend/src/components/AudioRecorder.tsx)

Better error handling at line 107-109 — distinguish between:
- **Insecure context (HTTP)**: Clear message that HTTPS is required
- **Permission denied**: Guide user to browser settings
- **No microphone found**: Different message

```typescript
} catch (err: any) {
  if (!window.isSecureContext) {
    alert('Mikrofon erfordert eine sichere Verbindung (HTTPS). '
        + 'Bitte verwenden Sie https://recurrsens.eu');
  } else if (err?.name === 'NotAllowedError') {
    alert('Zugriff auf das Mikrofon wurde verweigert. '
        + 'Bitte erlauben Sie den Zugriff in den Browser-Einstellungen.');
  } else {
    alert('Mikrofon konnte nicht gefunden werden. '
        + 'Bitte stellen Sie sicher, dass ein Mikrofon angeschlossen ist.');
  }
}
```

---

## File Change Summary

| Action | File |
|---|---|
| MODIFY | `backend/config/settings/base.py` |
| MODIFY | `backend/entrypoint.sh` |
| MODIFY | `docker-compose.prod.yml` |
| MODIFY | `nginx/default.conf` |
| MODIFY | `.env.example` |
| MODIFY | `frontend/src/pages/DashboardPage.tsx` |
| MODIFY | `frontend/src/pages/LoginPage.tsx` |
| MODIFY | `frontend/src/components/wizard/LandingScreen.tsx` |
| MODIFY | `frontend/src/components/AudioRecorder.tsx` |
| MODIFY | `frontend/src/theme.ts` |
| MODIFY | `frontend/index.html` |
| NEW | `docs/domain.md` |
| NEW | `dozzle-users.yml` |

---

## Verification Plan

### Automated Tests
```bash
docker compose exec backend python manage.py test
cd frontend && npx tsc --noEmit && npm run build
```

### Manual Verification
1. Navigate to `https://recurrsens.eu/admin/login/` → no CSRF 403
2. Log in with new admin credentials
3. Navigate to `https://recurrsens.eu/logs/` → Dozzle login → container logs
4. Dashboard fills full browser width
5. All UI says "RecurrSens" not "Stimmbandläsion"
6. Open `/p/:token` on iPhone Safari → microphone permission prompt appears
