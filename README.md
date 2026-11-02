# Virtual Email Server (Production Grade)

A self-hosted, catch-all virtual email server and real-time live inbox web dashboard. It accepts all incoming email without user provisioning, captures raw RFC 822 MIME source in SQLite or PostgreSQL, streams incoming messages instantly via Server-Sent Events (SSE), and provides a secured REST API.

---

## Architecture & Features

- **SMTP Engine (`server.py`)**: Asynchronous SMTP listener (`aiosmtpd`), catch-all mailbox logic, sender validation, message size caps (default 10 MB), structured JSON logging to `logs/smtp.log`.
- **Web Dashboard & Real-Time Inbox (`app.py`)**: Modern dark Tailwind UI with responsive 3-column layout, virtual address filtering, search, export to CSV / raw `.eml`, and instant SSE streaming (`/api/stream`) with desktop-style toast notifications.
- **Security & Access Control**:
  - Web UI password protection via `ADMIN_PASSWORD` (session cookie).
  - REST API authentication via `X-API-Key` header (`API_KEY`).
  - Rate limiting via Flask-Limiter.
  - Security headers (`nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin`).
- **Persistence & Retention**:
  - Auto-selects SQLite (`emails.db`) or PostgreSQL if `DATABASE_URL` is set.
  - Automatic retention cleanup (configurable via `RETENTION_DAYS`, default 30 days).
  - Automated backup utility (`backup.py`).
- **Monitoring & Health**:
  - `GET /health` — health check for container orchestrators.
  - `GET /api/stats` — total received, today count, top virtual recipients.
  - `GET /metrics` — Prometheus metrics export.
- **Testing & CI/CD**: Complete unit and integration test suite with `pytest`, GitHub Actions workflow (`.github/workflows/test.yml`).

---

## Quick Start (Local Development)

### Linux / macOS
```bash
# 1. Install dependencies
pip install -r option2-raw-python/requirements.txt

# 2. Configure environment
cp .env.example .env

# 3. Start the services
./run-linux.sh
```

### Windows (PowerShell)
```powershell
.\run-windows.ps1
```

Open `http://localhost:5000` to access the live dashboard.

---

## Production Deployment Guide

### 1. VPS / Dedicated Server with Docker Compose

Deploy on any Linux cloud host (Ubuntu 22.04 / 24.04 recommended):

```bash
git clone https://github.com/seundeeun-collab/email.git
cd email
cp .env.example .env

# Edit .env with your strong passwords and keys
nano .env

# Build and start services in background
docker compose -f docker-compose.prod.yml up --build -d
```

### 2. DNS & MX Records Setup

To receive public internet mail for your custom domain (e.g. `yourdomain.com`):

1. **Create an `A` record** for your mail host:
   ```text
   Type: A
   Host: mail.yourdomain.com
   Value: <YOUR_SERVER_PUBLIC_IP>
   TTL: 300
   ```

2. **Create an `MX` record** pointing to your mail hostname:
   ```text
   Type: MX
   Host: @ (or yourdomain.com)
   Value: mail.yourdomain.com
   Priority: 10
   TTL: 300
   ```

*(Optional SPF record to indicate inbound-only mail server: `v=spf1 -all`)*

### 3. Firewall & Opening Port 25

Inbound internet mail arrives over standard SMTP TCP port 25:

```bash
# Ubuntu UFW
sudo ufw allow 25/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 5000/tcp
sudo ufw reload
```

> **Cloud Provider Note**: Major cloud providers (AWS EC2, DigitalOcean, GCP, Hetzner, Linode) often block outbound port 25 by default to combat spam. Inbound port 25 is typically open, but if your host blocks inbound port 25, request unblocking in your provider's networking console or support ticket.

### 4. HTTPS & Domain Setup with Let's Encrypt / Nginx

To expose your web inbox securely behind HTTPS (`https://inbox.yourdomain.com`):

```bash
# Install Nginx and Certbot
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

# Configure Nginx reverse proxy (/etc/nginx/sites-available/email-inbox)
server {
    server_name inbox.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE stream configuration
        proxy_set_header Connection '';
        proxy_http_version 1.1;
        chunked_transfer_encoding off;
        proxy_buffering off;
        proxy_cache off;
    }
}

sudo ln -s /etc/nginx/sites-available/email-inbox /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Issue free SSL certificate
sudo certbot --nginx -d inbox.yourdomain.com
```

### 5. Cloud Platforms (Railway, Render, Lovable Cloud)

For web dashboard and API hosting without local SMTP, configure `DATABASE_URL` to connect to hosted PostgreSQL:
- Set environment variables (`ADMIN_PASSWORD`, `API_KEY`, `SECRET_KEY`, `DATABASE_URL`).
- The project includes `lovable.json` and `vercel.json` configurations.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ADMIN_PASSWORD` | *(empty)* | Web UI password. If unset, dashboard login is open. |
| `API_KEY` | *(empty)* | Secret key for `X-API-Key` header on `/api/*` endpoints. |
| `SECRET_KEY` | `virtual-inbox-key` | Flask session cookie encryption key. |
| `SMTP_HOST` | `0.0.0.0` | SMTP bind address. |
| `SMTP_PORT` | `1025` / `25` | SMTP port (`25` for prod internet mail, `1025` for local). |
| `MAX_EMAIL_SIZE_MB` | `10` | Rejects emails larger than this threshold with code 552. |
| `WEB_PORT` | `5000` | Port for the web interface and REST API. |
| `DATABASE_URL` | *(empty)* | Optional PostgreSQL connection string. Defaults to SQLite. |
| `RETENTION_DAYS` | `30` | Auto-deletes messages older than N days on startup. |

---

## API Reference

### Health Check
```bash
curl http://localhost:5000/health
```
Response:
```json
{
  "status": "healthy",
  "smtp": "listening",
  "db": "ok",
  "db_engine": "sqlite",
  "inbox_count": 6,
  "uptime_seconds": 128.4
}
```

### List Emails
```bash
curl -H "X-API-Key: YOUR_API_KEY" "http://localhost:5000/api/emails?limit=50&to=support@yourdomain.com"
```

### Stats
```bash
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:5000/api/stats
```

### Real-Time SSE Stream
```bash
curl -N http://localhost:5000/api/stream
```

### Export CSV
```bash
curl -H "X-API-Key: YOUR_API_KEY" http://localhost:5000/api/export/csv -o export.csv
```

---

## Automated Backups

Run `python backup.py` or schedule a daily cron job:
```bash
0 3 * * * cd /path/to/email && python backup.py >> /var/log/mail_backup.log 2>&1
```
Creates compressed archives in `backups/mail_backup_YYYYMMDD_HHMMSS.zip`.

---

## Running Automated Tests

```bash
# Run all unit and integration tests
pytest
```
