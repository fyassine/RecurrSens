# Domain & HTTPS Setup — RecurrSens.eu

## Prerequisites

- Domain: `recurrsens.eu` registered
- Server IP: `31.70.77.124` (Strato VPS)
- Docker + Docker Compose installed on server
- Host certbot installed (`sudo apt install certbot`)

---

## Step 1: DNS Configuration

Add the following DNS records at your domain registrar:

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | `@` | `31.70.77.124` | 300 |
| A | `www` | `31.70.77.124` | 300 |

Wait for DNS propagation (can take up to 48 hours, usually 5–30 minutes):

```bash
dig +short recurrsens.eu
# Should return: 31.70.77.124
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

## Step 3: Obtain SSL Certificate (host certbot)

Use certbot directly on the VPS (host-managed SSL):

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
   -d recurrsens.eu -d www.recurrsens.eu \
   --email admin@recurrsens.eu \
   --agree-tos --no-eff-email
```

If your existing renewal profile still references Apache from a prior `--apache` issuance, re-issue once with the webroot command above so future renewals are independent from Apache.

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

Renewal is handled by host certbot's systemd timer.

To manually test renewal:

```bash
sudo certbot renew --dry-run
```

After renewal, reload nginx in the running container so it picks up new cert files:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T nginx nginx -s reload
```

---

## Verification Checklist

- [ ] `dig +short recurrsens.eu` → `31.70.77.124`
- [ ] `curl -I http://recurrsens.eu` → `301` redirect to HTTPS
- [ ] `curl -I https://recurrsens.eu` → `200 OK`
- [ ] `https://recurrsens.eu/admin/` → Django admin login (no CSRF 403)
- [ ] `https://recurrsens.eu/logs/` → Dozzle login page
- [ ] `https://recurrsens.eu/` → React SPA loads
- [ ] SSL Labs test: `https://www.ssllabs.com/ssltest/analyze.html?d=recurrsens.eu`
