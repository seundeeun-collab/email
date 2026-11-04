# Real Incoming Emails - 100% FREE (Cloudflare Open Source)

Catch incoming mail on your custom domain at zero cost using Cloudflare Email Routing.

## Open-Source Architecture
- **MIME Parsing**: Uses `postal-mime` (from [cloudflare/agentic-inbox](https://github.com/cloudflare/agentic-inbox)) for robust RFC 822 decoding.
- **Storage Options**:
  - **Cloudflare D1**: Zero-cost distributed SQL database (from [superhexa/temp-mail](https://github.com/superhexa/temp-mail)).
  - **SQLite / Postgres**: Default zero-configuration fallback.
- **Attachment Storage**: Stored in Cloudflare R2 bucket with direct download endpoints.
- **Real-Time Delivery**: Pushes parsed messages to Lovable Cloud (`/api/inbound`) for instant SSE + Supabase Realtime updates.

## Quick Setup
1. **Cloudflare Dashboard**: Add your domain (Free tier) and enable **Email Routing** (MX records are added automatically).
2. **Install & Deploy Worker**:
   ```bash
   cd free-cloudflare-email
   npm install
   npx wrangler login
   npx wrangler deploy
   ```
3. **Optional Free D1 Setup**:
   ```bash
   npx wrangler d1 create inbox-orbit-db
   npx wrangler d1 execute inbox-orbit-db --file=./schema.sql
   # Uncomment [[d1_databases]] in wrangler.toml and add your database_id
   npx wrangler deploy
   ```
4. **Email Routing Rule**:
   - Go to Cloudflare Dashboard -> Your Domain -> Email Routing -> Routing rules.
   - Add Catch-all rule: Action = **Send to Worker** -> **free-email-gateway**.
5. Emails sent to `anything@yourdomain.com` appear in your live mission-control dashboard in 1-2 seconds!
