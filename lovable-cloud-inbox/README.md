# Lovable Cloud Live Inbox & Inbound Webhook

- **Live URL**: https://inbox-orbit-mail-viewer.lovable.app
- **Inbound Webhook**: https://inbox-orbit-mail-viewer.lovable.app/api/public/inbound
- **Realtime Stream**: Supabase Realtime `postgres_changes` on `emails` table + SSE fallback `/api/public/stream`

## Database Migrations
See `migrations/` for the SQL migrations running on Lovable Cloud / Supabase PostgreSQL.
- `0000_create_emails_inbox.sql`: Emails storage table and indexes.
- `0001_create_email_addresses_and_realtime.sql`: Virtual receiving address manager table with RLS and realtime publication.
