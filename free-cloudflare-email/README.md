# Real Incoming Emails - 100% FREE
Because cloud hosting cannot open raw port 25 directly, Cloudflare Email Routing acts as the free internet gateway:
1. Cloudflare Dashboard -> Add your domain (Free plan) and enable Email Routing (it adds MX automatically).
2. Deploy worker: cd free-cloudflare-email; wrangler login; wrangler deploy
3. Email Routing rules -> Catch-all -> Send to Worker -> free-email-gateway
4. Gmail -> support@yourdomain.com lands in dashboard in 1-2 seconds via SSE.
No buying, no VPS, no port 25.
