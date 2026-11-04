-- Cloudflare D1 Database Schema
-- Inspired by superhexa/temp-mail and cloudflare/agentic-inbox
CREATE TABLE IF NOT EXISTS emails (
    id TEXT PRIMARY KEY,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    subject TEXT,
    received_at INTEGER NOT NULL,
    html_content TEXT,
    text_content TEXT,
    raw_mime TEXT,
    attachments TEXT DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_emails_to_address ON emails (to_address);
CREATE INDEX IF NOT EXISTS idx_emails_received_at ON emails (received_at DESC);
