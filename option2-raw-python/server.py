"""Receive SMTP mail for any address and save every message locally."""

from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
import argparse
from pathlib import Path
import sqlite3
import time
import uuid

from aiosmtpd.controller import Controller


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
INBOX_DIR = DATA_DIR / "inbox"
DB_PATH = DATA_DIR / "emails.db"


def initialize_database():
    INBOX_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as db:
        db.execute(
            """CREATE TABLE IF NOT EXISTS emails (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                to_addr TEXT NOT NULL,
                from_addr TEXT NOT NULL,
                subject TEXT NOT NULL,
                body TEXT NOT NULL,
                raw TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        db.execute("CREATE INDEX IF NOT EXISTS idx_emails_to_addr ON emails(to_addr)")


def extract_body(message):
    """Return readable text, preferring text/plain for multipart mail."""
    if message.is_multipart():
        plain_parts = []
        html_parts = []
        for part in message.walk():
            if part.is_multipart() or part.get_content_disposition() == "attachment":
                continue
            content_type = part.get_content_type()
            if content_type not in ("text/plain", "text/html"):
                continue
            try:
                content = part.get_content()
            except (LookupError, UnicodeError):
                content = part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", errors="replace")
            (plain_parts if content_type == "text/plain" else html_parts).append(str(content))
        return "\n\n".join(plain_parts or html_parts)

    try:
        content = message.get_content()
        return str(content) if isinstance(content, str) else str(content)
    except (LookupError, UnicodeError):
        payload = message.get_payload(decode=True) or b""
        return payload.decode(message.get_content_charset() or "utf-8", errors="replace")


class CatchAllHandler:
    """SMTP callbacks: every RCPT TO is accepted, then DATA is stored."""

    async def handle_RCPT(self, server, session, envelope, address, rcpt_options):
        # Virtual inbox logic: accept every recipient, without requiring a real account.
        envelope.rcpt_tos.append(address)
        return "250 OK"

    async def handle_DATA(self, server, session, envelope):
        raw_bytes = envelope.content
        message = BytesParser(policy=policy.default).parsebytes(raw_bytes)
        raw_text = raw_bytes.decode("utf-8", errors="replace")
        from_addr = envelope.mail_from or str(message.get("From", ""))
        to_addr = ", ".join(envelope.rcpt_tos) or str(message.get("To", ""))
        subject = str(message.get("Subject", "(no subject)"))
        body = extract_body(message)
        created_at = datetime.now(timezone.utc).isoformat()

        with sqlite3.connect(DB_PATH) as db:
            cursor = db.execute(
                "INSERT INTO emails (to_addr, from_addr, subject, body, raw, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (to_addr, from_addr, subject, body, raw_text, created_at),
            )
            email_id = cursor.lastrowid

        eml_name = f"{email_id}-{uuid.uuid4().hex[:8]}.eml"
        (INBOX_DIR / eml_name).write_bytes(raw_bytes)
        print(
            f"[received] id={email_id} from={from_addr!r} "
            f"to={to_addr!r} subject={subject!r}",
            flush=True,
        )
        return "250 OK"


def main():
    parser = argparse.ArgumentParser(description="Run the receive-only catch-all SMTP server.")
    parser.add_argument("--port", type=int, default=1025, help="SMTP listening port (default: 1025)")
    parser.add_argument("--host", default="0.0.0.0", help="SMTP listening host (default: 0.0.0.0)")
    args = parser.parse_args()
    initialize_database()
    # Port 1025 runs without elevated privileges. For a public mail server,
    # route external SMTP port 25 to this listener (for example, Docker 25:1025).
    controller = Controller(CatchAllHandler(), hostname=args.host, port=args.port)
    controller.start()
    print(f"Catch-all SMTP listener ready on {args.host}:{args.port}", flush=True)
    print(f"SQLite database: {DB_PATH}", flush=True)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("Stopping SMTP listener…", flush=True)
    finally:
        controller.stop()


if __name__ == "__main__":
    main()
