# setup-free.ps1 - ALL IN ONE - 100% FREE - creates everything
Write-Host "Creating free public email gateway..." -F Green
New-Item -ItemType Directory -Force -Path free-cloudflare-email | Out-Null
@'
export default {
  async email(message, env, ctx) {
    const from = message.from
    const to = message.to
    const raw = await new Response(message.raw).text()
    const subject = message.headers.get("subject") || "(no subject)"
    ctx.waitUntil(
      fetch(`${env.LOVABLE_API_URL}/api/inbound`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.WEBHOOK_TOKEN}` },
        body: JSON.stringify({ from, to, subject, raw, created_at: new Date().toISOString() })
      })
    )
  }
}
'@ | Set-Content free-cloudflare-email/worker.js
@'
name = "free-email-gateway"
main = "worker.js"
compatibility_date = "2024-01-01"
[vars]
LOVABLE_API_URL = "https://inbox-orbit-mail-viewer.lovable.app"
WEBHOOK_TOKEN = "free_token_123"
'@ | Set-Content free-cloudflare-email/wrangler.toml
@'
# Real Incoming Emails - 100% FREE
Because cloud hosting cannot open raw port 25 directly, Cloudflare Email Routing acts as the free internet gateway:
1. Cloudflare Dashboard -> Add your domain (Free plan) and enable Email Routing (it adds MX automatically).
2. Deploy worker: cd free-cloudflare-email; wrangler login; wrangler deploy
3. Email Routing rules -> Catch-all -> Send to Worker -> free-email-gateway
4. Gmail -> support@yourdomain.com lands in dashboard in 1-2 seconds via SSE.
No buying, no VPS, no port 25.
'@ | Set-Content free-cloudflare-email/README.md
