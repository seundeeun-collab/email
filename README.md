# Inbox Orbit Mail Viewer - 100% Free Virtual Email Server

A production-grade, zero-cost virtual email server and real-time mission-control inbox built on official Cloudflare open source patterns.

- **Live Lovable Cloud App**: [https://inbox-orbit-mail-viewer.lovable.app](https://inbox-orbit-mail-viewer.lovable.app)
- **Zero Cost**: No paid VPS, no open port 25 server, no credit cards required.
- **Inbound Receiving Only**: Captures, parses, and displays incoming emails to any custom virtual address in real time.

---

## Open Source Credits & Architecture

This project merges and builds upon the following official open-source projects:

1. **[Cloudflare Agentic Inbox](https://github.com/cloudflare/agentic-inbox)** (`cloudflare/agentic-inbox`)
   - Uses `postal-mime` for RFC 822 MIME parsing.
   - Durable Objects virtual mailbox isolation per address.
   - Cloudflare R2 bucket integration for email attachments.
   - Native Cloudflare Email Routing integration.

2. **[Temp-Mail Worker](https://github.com/superhexa/temp-mail)** (`superhexa/temp-mail`)
   - Cloudflare D1 SQL database schema and index optimization for fast mailbox indexing.
   - Multi-recipient and catch-all email routing handlers.

3. **[Wren Mail Client](https://github.com/genisis-lab/mail)** (`genisis-lab/mail`)
   - Gmail-inspired webmail UI with tabbed content inspection (Parsed Body, Plain Text, Raw RFC 822).
   - Attachment badges with quick-download capabilities.

---

## Features

- **PostalMime RFC 822 Parser**: Clean extraction of HTML, plaintext body, sender, recipient, and attachments.
- **Dual Database Option**:
  - **Cloudflare D1**: If Cloudflare D1 is bound (`env.DB`), messages and attachments metadata persist directly in D1 (100% free tier: 5M reads/day, 100k writes/day).
  - **Local SQLite**: Persistent SQLite fallback (`data/emails.db`) for desktop/self-hosted runs.
- **R2 Storage for Attachments**: Supports Cloudflare R2 buckets for zero-egress attachment storage and downloads.
- **Durable Objects Virtual Mailboxes**: Address manager isolates mailboxes with dedicated DO identifiers.
- **Triple-Layer Real-Time Listener**:
  - Layer 1: Supabase Realtime (`postgres_changes` on `emails` table)
  - Layer 2: Server-Sent Events (`/api/stream`)
  - Layer 3: Reconciling polling heartbeat fallback
- **Real-Time Arrival Alerts**: Web Audio API synthesized arrival chime (A5 -> D6 sine wave), desktop notifications, and instant toasts.
- **Productivity Controls**: `+ Add` virtual receiving address, one-click address copy, CSV export, and `.eml` raw download.

---

## Cloudflare Email Worker Deployment

1. **Prerequisites**: Add your custom domain to Cloudflare (Free plan) and enable **Email Routing** (Cloudflare automatically sets up the required MX records).
2. **Deploy Worker**:
   ```bash
   cd free-cloudflare-email
   npm install
   npx wrangler login
   npx wrangler deploy
   ```
3. **Configure Catch-All Routing**:
   - In Cloudflare Dashboard → Your Domain → **Email** → **Email Routing** → **Routing Rules**.
   - Create rule: Catch-all → **Send to Worker** → `free-email-gateway`.

---

## Local Development & Testing

- **Linux / macOS**: Run `./run-linux-free.sh`
- **Windows**: Run `run-windows-free.ps1`
- Starts SMTP listener on `127.0.0.1:1025` and web inbox on `http://localhost:5000`.
