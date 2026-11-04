# 100% Free Virtual Email Server & Live Mission-Control Inbox

A production-grade, zero-cost virtual email server and real-time mission-control inbox built on official Cloudflare open-source architecture.

- **Live Lovable Cloud App**: [https://inbox-orbit-mail-viewer.lovable.app](https://inbox-orbit-mail-viewer.lovable.app)
- **Zero Cost**: 100% Free, no API keys, no paid VPS, no credit cards required.
- **Inbound Receiving Only**: Captures, parses, and displays incoming emails to any custom virtual address.

---

## Cloudflare Open Source Credits & Architecture

This project incorporates and merges logic from three official Cloudflare and community open-source foundations:

1. **[cloudflare/agentic-inbox](https://github.com/cloudflare/agentic-inbox)** (Official Cloudflare Open Source)
   - Robust MIME parsing via `postal-mime` for complete RFC 822 decoding (text, HTML, headers, and attachments).
   - Durable Objects isolation pattern: each receiving email address functions as an isolated mailbox container.
   - Cloudflare R2 bucket integration for storing and serving email attachments without size limits.

2. **[superhexa/temp-mail](https://github.com/superhexa/temp-mail)** (Cloudflare Workers + Hono + D1)
   - Cloudflare D1 distributed SQL database option for persisting incoming email records with zero running cost (5M reads/day, 100k writes/day free).
   - Fast, resilient email schema with indexed queries on recipients and timestamps.

3. **[genisis-lab/mail](https://github.com/genisis-lab/mail)** (Wren Gmail-style Cloudflare Webmail)
   - Clean Gmail-inspired mission control interface.
   - Deterministic sender initial avatars, status badges, attachment drawers, and instant view toggles.

---

## Architecture & Options

### 1. Public Internet (Zero-Cost via Cloudflare Email Routing + Worker)
- Receive real emails on your custom domain (e.g. `anything@yourdomain.com`) without a port 25 VPS.
- Cloudflare Email Routing (Free) catches incoming mail and routes to `free-cloudflare-email/worker.js`.
- The worker decodes MIME with `postal-mime`, stores attachments in R2 (if configured), inserts records into Cloudflare D1 (if available), and forwards to your live inbox:
  `https://inbox-orbit-mail-viewer.lovable.app/api/public/inbound`
- New messages appear instantly on the live dashboard via Supabase Realtime & Server-Sent Events (SSE).

### 2. Local Desktop / Development (Zero-Cost Local Python SMTP)
- **Windows**: Run `run-windows-free.ps1`
- **Linux/macOS**: Run `./run-linux-free.sh`
- Starts SMTP server on `127.0.0.1:1025` and web inbox on `http://localhost:5000`.
- Automatically sends test emails across catch-all addresses to confirm delivery.

---

## Production Features

- **Custom Receiving Address Creator**: Create any email address with your custom domain (e.g. `support@yourdomain.com`, `me@yourdomain.com`), filter inbox per address, and copy with one click.
- **Mailbox Isolation**: Dedicated Durable Object style isolation per virtual address with individual message counts and stats.
- **R2 Attachment Drawer**: View and download email attachments directly from Cloudflare R2 object storage.
- **Triple-Layer Real-Time Listener**: Supabase Realtime (`postgres_changes` on `emails`) + Server-Sent Events (`/api/stream`) + periodic polling fallback.
- **Arrival Alerts**: Web Audio synthesized chime on new email arrival, desktop browser notifications, and instant toasts.
- **Message Inspection**: Toggle between Clean Parsed View, HTML Preview, and Raw RFC 822 MIME source, plus Download `.eml` and Export CSV.
