# 100% Free Public Inbound Email via Cloudflare Email Routing

Receive real emails on your custom domain (e.g., `@yourdomain.com`) without a paid VPS or raw port 25 opening.

---

## 3-Step Setup

### Step 1: Add Your Domain to Cloudflare (Free)
1. In Cloudflare Dashboard, add your domain using the **Free plan**.
2. Go to **Email Routing** -> **Enable Email Routing**. Cloudflare will automatically add the required MX and SPF records to your DNS with one click.

### Step 2: Deploy the Email Worker
1. In Cloudflare Dashboard, navigate to **Compute (Workers) -> Create Worker**.
2. Name it `email-forwarder` and paste the contents of `worker.js`.
3. In **Settings -> Variables and Secrets**:
   - Add Environment Variable `LOVABLE_API_URL` = `https://inbox-orbit-mail-viewer.lovable.app`
   - Add Secret `INBOUND_TOKEN` = *(Your secret token configured in your app)*
4. Click **Deploy**.

Alternatively, deploy via Wrangler CLI:
```bash
npx wrangler deploy
npx wrangler secret put INBOUND_TOKEN
```

### Step 3: Route Inbound Emails to the Worker
1. Return to **Email Routing -> Routing Rules**.
2. Under **Catch-all rule** (or custom address rule for a specific email like `support@yourdomain.com`):
   - Set **Action** to: **Send to Worker**
   - Select your worker: `email-forwarder`
3. Save.

---

## Testing Real Inbound Delivery
Send an email from Gmail, Outlook, or any mail client to any address on your domain (e.g. `test@yourdomain.com`). Within 1–2 seconds:
- Cloudflare receives the email.
- The worker executes and POSTs the raw RFC 822 email to `https://inbox-orbit-mail-viewer.lovable.app/api/public/inbound`.
- Your live dashboard detects the new arrival in real time via Supabase Realtime / SSE and plays an alert chime.
