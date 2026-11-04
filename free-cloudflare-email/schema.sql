-- Cloudflare D1 Database Schema
-- Run: npx wrangler d1 execute inbox-orbit-db --file=./schema.sql

CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  raw_mime TEXT,
  attachments TEXT,
  received_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_emails_to_addr ON emails(to_addr, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails(received_at DESC);
