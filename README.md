# Virtual Email Server (100% Free & Production Grade)

A self-hosted, catch-all virtual email server and real-time live inbox web dashboard. It accepts all incoming email without user provisioning, captures raw RFC 822 MIME source in SQLite or PostgreSQL, streams incoming messages instantly via Server-Sent Events (SSE), and provides a clean REST API.

---

## 100% FREE - No Buying (Zero Cost, No VPS, No Paid Keys)

You can run and test this virtual email server entirely for free without paying for any VPS, without paying for domain services, and without buying API keys.

### 1. 100% Free Local Mode (Windows & Linux)

Everything runs on your machine with Python and SQLite:

#### Windows:
```powershell
.\run-windows-free.ps1
```
- Automatically installs `aiosmtpd`, `flask`, `flask-cors`
- Starts SMTP on `127.0.0.1:1025`
- Starts Web Inbox on `http://localhost:5000`
- Generates 6 test emails across multiple virtual recipients
- Opens your browser to the live inbox

#### Linux / macOS:
```bash
./run-linux-free.sh
```
- Installs dependencies quietly
- Starts SMTP on `127.0.0.1:1025` and Web on `http://localhost:5000` in the background
- Fires test emails to catch-all addresses
- Verifies inbox output via `curl http://localhost:5000/api/emails`

---

### 2. 100% Free Public Internet Mode (No Port 25 VPS Needed!)

Public cloud providers (AWS, GCP, DigitalOcean, Hetzner) routinely block outbound and inbound Port 25 on cheap tiers. To receive emails publicly without paying for expensive VPS hosting or unblocking port 25:

```
Sender (e.g. Gmail) 
    ──▶ Cloudflare Free Email Routing (Port 25 MX)
    ──▶ Free Cloudflare Worker (free-cloudflare-email/worker.js)
    ──▶ Free HTTPS POST (/api/inbound)
    ──▶ Lovable Cloud / Local Web Inbox (SSE Live Real-Time)
```

1. **Cloudflare Free Email Routing**: In Cloudflare dashboard, enable Email Routing on your domain (100% free plan).
2. **Deploy Free Cloudflare Worker**:
   ```bash
   cd free-cloudflare-email
   npx wrangler deploy
   ```
3. **Catch-All Forwarding**: Set your Cloudflare Email Routing Catch-all rule to "Send to Worker" -> `free-email-forwarder`.
4. Any email sent to `*@yourdomain.com` is received by Cloudflare's free MX and forwarded via HTTP to your Lovable Cloud app or local server via `/api/inbound`.

---

## Architecture & Features

- **SMTP Engine (`server.py`)**: Asynchronous SMTP listener (`aiosmtpd`), catch-all mailbox logic, sender validation, message size caps (default 10 MB), structured JSON logging to `logs/smtp.log`. Supports `--host` and `--port` CLI flags.
- **Web Dashboard & Real-Time Inbox (`app.py`)**: Modern dark Tailwind UI with responsive 3-column layout, virtual address filtering, search, export to CSV / raw `.eml`, and instant SSE streaming (`/api/stream`) with desktop-style toast notifications.
- **Cloudflare Inbound Webhook (`/api/inbound`)**: Receives JSON payloads from Cloudflare Email Workers, extracts body/MIME, stores to database, and triggers SSE stream in real time.
- **Security & Access Control**:
  - Web UI password protection via `ADMIN_PASSWORD` (session cookie). Optional: left open for free local use if unset.
  - REST API authentication via `X-API-Key` header (`API_KEY`). Optional: left open for free local use if unset.
  - CORS enabled for cross-origin frontend apps (`flask-cors`).
  - Rate limiting via Flask-Limiter.
  - Security headers (`nosniff`, `SAMEORIGIN`, `strict-origin-when-cross-origin`).
- **Persistence & Retention**:
  - Auto-selects SQLite (`emails.db`) or PostgreSQL if `DATABASE_URL` is set.
  - Automatic retention cleanup (configurable via `RETENTION_DAYS`, default 30 days).
  - Automated backup utility (`backup.py`).
- **Monitoring & Health**:
  - `GET /health` — returns `{smtp: 'listening 127.0.0.1:1025', db: ok, count, uptime, mode: 'FREE - No buying'}`.
  - `GET /api/stats` — total received, today count, top virtual recipients.
  - `GET /metrics` — Prometheus metrics export.
- **Testing & CI/CD**: Complete unit and integration test suite with `pytest`, GitHub Actions workflow (`.github/workflows/test.yml`).

---

## Lovable Cloud Deployable Frontend (`frontend-lovable-free/`)

A standalone React + Vite + Tailwind CSS dashboard is provided in `frontend-lovable-free/`:
- Real-time EventSource connection to `/api/stream`
- Live green pulsing status indicator
- Instant toast notifications upon new email receipt
- Configured via `VITE_API_URL` environment variable

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Health status: SMTP listening, DB status, uptime, email count |
| `/api/stats` | GET | Statistics: total count, today count, top virtual recipients |
| `/api/emails` | GET | List emails with optional `?to=` and pagination (`limit`, `offset`) |
| `/api/emails/<id>` | GET | Retrieve single email with full body and metadata |
| `/api/inbound` | POST | Webhook for Cloudflare Email Worker (`from`, `to`, `subject`, `raw`) |
| `/api/stream` | GET | Real-time Server-Sent Events (SSE) stream (`event: new_email`) |
| `/api/export/csv` | GET | Export all stored emails as CSV |
| `/api/export/eml/<id>` | GET | Download raw RFC 822 `.eml` file |
