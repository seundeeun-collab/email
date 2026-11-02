# 100% Free Public Virtual Email Server (Zero Port 25 / Zero Paid VPS)

Receive incoming emails from anywhere on the global internet without paying for a VPS, without unblocking port 25, and without paid API keys.

---

## How It Works

```
Global Sender (Gmail, Outlook, etc.)
               │
               ▼ (Port 25 - handled free by Cloudflare)
Cloudflare Free Email Routing
               │
               ▼ (Calls Cloudflare Email Worker)
Cloudflare Worker (worker.js)
               │
               ▼ (Standard HTTPS POST /api/inbound)
Lovable Live Web Inbox (or local backend via tunnel)
```

1. Cloudflare provides **free Email Routing** with built-in MX records on the free tier.
2. Cloudflare's **Catch-All Email Worker** captures any inbound email for any virtual address (`*@yourdomain.com`).
3. The Worker extracts the sender, recipient, subject, and raw MIME payload, then forwards it via a standard HTTPS POST to your Lovable app's `/api/inbound` endpoint.
4. Your inbox receives the payload, saves it, and pushes it instantly to the web dashboard in real time over SSE (Server-Sent Events).

---

## Setup Instructions (100% Free, Under 5 Minutes)

### Step 1: Add Your Domain to Cloudflare (Free Plan)
1. Sign up for a free account at [cloudflare.com](https://www.cloudflare.com) if you haven't already.
2. Add your domain and select the **Free** plan.
3. Update your domain's nameservers at your registrar to Cloudflare's assigned nameservers.

### Step 2: Enable Cloudflare Email Routing
1. In the Cloudflare dashboard, go to your domain -> **Email** -> **Email Routing**.
2. Click **Get Started** / **Enable Email Routing**.
3. Cloudflare will prompt you to add the required DNS MX and SPF records with 1 click. Click **Add records automatically**.

### Step 3: Deploy the Free Email Worker
1. Install [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (free CLI) or use the Cloudflare Dashboard:
   ```bash
   cd free-cloudflare-email
   npx wrangler login
   ```
2. Edit `wrangler.toml` and set `LOVABLE_API_URL` to your published Lovable inbox URL (e.g. `https://your-inbox.lovable.app`).
3. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```

### Step 4: Configure Catch-All Routing to Your Worker
1. In the Cloudflare dashboard, navigate to **Email** -> **Email Routing** -> **Routing Rules**.
2. Under **Catch-all rule**:
   - Action: **Send to a Worker**
   - Destination Worker: Select **free-email-forwarder**
   - Status: **Active**
3. Save the rule.

---

## Testing Real-Time Inbound Delivery

Send an email from your personal Gmail or Outlook to any address on your domain, e.g.:
- `support@yourdomain.com`
- `billing@yourdomain.com`
- `anything123@yourdomain.com`

Within seconds, the email is received by Cloudflare, forwarded via HTTPS to `/api/inbound`, saved, and streamed live to your Lovable dashboard!
