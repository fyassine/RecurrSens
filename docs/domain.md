# Domain & HTTPS Setup — RecurrSens.eu

## Prerequisites

- Domain: `recurrsens.eu` registered
- Server IP: `212.227.176.203` (Strato VPS)
- Docker + Docker Compose installed on server

---

## Step 1: DNS Configuration

Add the following DNS records at your domain registrar:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | `@` | `212.227.176.203` | 300 |
| A | `www` | `212.227.176.203` | 300 |

Wait for DNS propagation (can take up to 48 hours, usually 5–30 minutes):

```bash
dig +short recurrsens.eu
# Should return: 212.227.176.203
```

---

## Step 2: Initial Deployment (HTTP only)

Before obtaining SSL certificates, nginx needs to serve the ACME challenge over HTTP.

1. **SSH into the server** and clone/pull the repository.

2. **Create the `.env` file** from the example:
   ```bash
   cp .env.example .env
   # Edit .env with production values
   ```

3. **Temporarily comment out the SSL lines** in `nginx/default.conf`:
   ```nginx
   # ssl_certificate /etc/letsencrypt/live/recurrsens.eu/fullchain.pem;
   # ssl_certificate_key /etc/letsencrypt/live/recurrsens.eu/privkey.pem;
   ```
   And change `listen 443 ssl;` to `listen 443;` temporarily.

4. **Start the stack**:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

5. **Verify HTTP is working**:
   ```bash
   curl -I http://recurrsens.eu
   ```

---

## Step 3: Obtain SSL Certificate

Run Certbot in standalone mode (or use the webroot method):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot \
  certbot certonly --webroot -w /var/www/certbot \
  -d recurrsens.eu -d www.recurrsens.eu \
  --email admin@recurrsens.eu \
  --agree-tos --no-eff-email
```

If the webroot method fails (nginx not yet serving ACME), stop nginx temporarily and use standalone:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop nginx
docker run --rm -p 80:80 -v certbot_data:/etc/letsencrypt certbot/certbot \
  certonly --standalone \
  -d recurrsens.eu -d www.recurrsens.eu \
  --email admin@recurrsens.eu \
  --agree-tos --no-eff-email
```

---

## Step 4: Enable HTTPS

1. **Restore the SSL lines** in `nginx/default.conf` (undo the changes from Step 2).

2. **Restart the stack**:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

3. **Verify HTTPS**:
   ```bash
   curl -I https://recurrsens.eu
   ```

---

## Step 5: Certificate Renewal

The `certbot` service in `docker-compose.prod.yml` automatically renews certificates every 12 hours (only acts when renewal is due, ~30 days before expiry).

To manually test renewal:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot \
  certbot renew --dry-run
```

After renewal, reload nginx to pick up new certs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload
```

---

## Verification Checklist

- [ ] `dig +short recurrsens.eu` → `212.227.176.203`
- [ ] `curl -I http://recurrsens.eu` → `301` redirect to HTTPS
- [ ] `curl -I https://recurrsens.eu` → `200 OK`
- [ ] `https://recurrsens.eu/admin/` → Django admin login (no CSRF 403)
- [ ] `https://recurrsens.eu/logs/` → Dozzle login page
- [ ] `https://recurrsens.eu/` → React SPA loads
- [ ] SSL Labs test: `https://www.ssllabs.com/ssltest/analyze.html?d=recurrsens.eu`
