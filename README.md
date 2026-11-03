# 100% Free Virtual Email Server & Live Mission-Control Inbox

A production-grade, zero-cost virtual email server and real-time mission-control inbox.

- **Live Lovable Cloud App**: [https://inbox-orbit-mail-viewer.lovable.app](https://inbox-orbit-mail-viewer.lovable.app)
- **Zero Cost**: No buying, no paying, no paid VPS, no credit cards.
- **Inbound Receiving Only**: Captures, parses, and displays incoming emails to any custom virtual address.

---

## Architecture & Options

### 1. Public Internet (Zero-Cost via Cloudflare Email Routing)
- Receive real emails on your custom domain (e.g. `anything@yourdomain.com`) without a port 25 VPS.
- Cloudflare Email Routing (Free) catches mail and triggers `free-cloudflare-email/worker.js`.
- The worker forwards raw RFC 822 emails to your live inbox endpoint:
  `https://inbox-orbit-mail-viewer.lovable.app/api/public/inbound`
- New messages appear instantly on the live dashboard via Supabase Realtime & SSE.

### 2. Local Desktop / Development (Zero-Cost Local Python SMTP)
- **Windows**: Run `run-windows-free.ps1`
- **Linux/macOS**: Run `./run-linux-free.sh`
- Starts SMTP server on `127.0.0.1:1025` and web inbox on `http://localhost:5000`.
- Automatically sends test emails across catch-all addresses to confirm delivery.

---

## Production Features

- **Custom Receiving Address Creator**: Create any email address with your custom domain (e.g. `support@yourdomain.com`, `me@yourdomain.com`), filter inbox per address, and copy with one click.
- **Triple-Layer Real-Time Listener**: Supabase Realtime (`postgres_changes` on `emails`) + Server-Sent Events (`/api/stream`) + periodic polling fallback.
- **Arrival Alerts**: Web Audio synthesized chime on new email, desktop browser notifications, and instant toasts.
- **Message Inspection**: Toggle between parsed readable body and raw RFC 822 MIME source, plus Download `.eml` and Export CSV.
