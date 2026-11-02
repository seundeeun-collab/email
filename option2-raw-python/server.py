"""Production-grade receive-only catch-all SMTP server."""

import argparse
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
import logging
import os
from pathlib import Path
import re
import sys
import time
import urllib.request
import json
import uuid

from aiosmtpd.controller import Controller

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from db import DATA_DIR, INBOX_DIR, initialize_database, insert_email, delete_old_emails

BASE_DIR = Path(__file__).resolve().parent
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOGS_DIR / "smtp.log"

# Setup structured logger
logger = logging.getLogger("smtp_server")
logger.setLevel(logging.INFO)

formatter = logging.Formatter(
    '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "message": %(message)s}'
)

file_handler = logging.FileHandler(LOG_FILE)
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(formatter)
logger.addHandler(stream_handler)


def log_event(event_type, **kwargs):
    payload = {"event": event_type, **kwargs}
    logger.info(json.dumps(payload))


EMAIL_REGEX = re.compile(r"^[\w\.\+\-]+@[a-zA-Z0-9\.\-]+\.[a-zA-Z0-9\-]+$")


def validate_email_address(addr):
    if not addr or not addr.strip():
        return False
    clean = addr.strip().strip("<>").strip()
    return bool(EMAIL_REGEX.match(clean) or "@localhost" in clean or clean.endswith(".local") or "@" in clean)


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


class ProductionCatchAllHandler:
    def __init__(self, max_size_mb=10, web_port=5000):
        self.max_size_bytes = int(max_size_mb) * 1024 * 1024
        self.web_port = int(web_port)

    async def handle_MAIL(self, server, session, envelope, address, mail_options):
        # Spam check 1: Reject empty from
        if not address or not address.strip():
            log_event("rejected_mail_from", reason="empty_sender", address=address)
            return "550 5.1.7 Sender address rejected: empty sender"
        # Spam check 2: Validate sender email format
        if not validate_email_address(address):
            log_event("rejected_mail_from", reason="invalid_format", address=address)
            return "501 5.1.7 Syntax error in sender address"

        envelope.mail_from = address
        return "250 OK"

    async def handle_RCPT(self, server, session, envelope, address, rcpt_options):
        # Catch-all: Accept any recipient
        clean_addr = address.strip().strip("<>").strip()
        envelope.rcpt_tos.append(clean_addr)
        return "250 OK"

    async def handle_DATA(self, server, session, envelope):
        raw_bytes = envelope.content
        size = len(raw_bytes)

        # Spam/Abuse check 3: Max size limit (default 10MB)
        if size > self.max_size_bytes:
            log_event("rejected_data", reason="size_exceeded", size=size, max=self.max_size_bytes)
            return "552 5.3.4 Message size exceeds fixed maximum limit"

        message = BytesParser(policy=policy.default).parsebytes(raw_bytes)
        raw_text = raw_bytes.decode("utf-8", errors="replace")

        from_addr = envelope.mail_from or str(message.get("From", "")).strip()
        to_addr = ", ".join(envelope.rcpt_tos) or str(message.get("To", "")).strip()
        subject = str(message.get("Subject", "(no subject)"))
        body = extract_body(message)
        created_at = datetime.now(timezone.utc).isoformat()

        email_id = insert_email(
            to_addr=to_addr,
            from_addr=from_addr,
            subject=subject,
            body=body,
            raw=raw_text,
            created_at=created_at,
            size_bytes=size,
        )

        eml_name = f"{email_id}-{uuid.uuid4().hex[:8]}.eml"
        (INBOX_DIR / eml_name).write_bytes(raw_bytes)

        log_event(
            "received_email",
            id=email_id,
            from_addr=from_addr,
            to_addr=to_addr,
            subject=subject,
            size_bytes=size,
        )

        # Notify web app for Real-Time SSE push
        self.notify_web_app({
            "id": email_id,
            "to_addr": to_addr,
            "from_addr": from_addr,
            "subject": subject,
            "body": body,
            "created_at": created_at,
            "size_bytes": size,
        })

        return "250 OK"

    def notify_web_app(self, email_data):
        try:
            req = urllib.request.Request(
                f"http://127.0.0.1:{self.web_port}/internal/notify",
                data=json.dumps(email_data).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                pass
        except Exception:
            pass


def main():
    parser = argparse.ArgumentParser(description="Run production catch-all SMTP server.")
    parser.add_argument("--port", type=int, default=None, help="SMTP port")
    parser.add_argument("--host", default=None, help="SMTP host")
    parser.add_argument("--max-size", type=int, default=None, help="Max email size in MB")
    args = parser.parse_args()

    host = args.host or os.getenv("SMTP_HOST", "0.0.0.0")
    port = args.port or int(os.getenv("SMTP_PORT", "1025"))
    max_size_mb = args.max_size or int(os.getenv("MAX_EMAIL_SIZE_MB", "10"))
    web_port = int(os.getenv("WEB_PORT", "5000"))
    retention_days = int(os.getenv("RETENTION_DAYS", "30"))

    initialize_database()

    # Clean up old emails per retention policy
    deleted = delete_old_emails(retention_days)
    if deleted > 0:
        log_event("retention_cleanup", deleted=deleted, retention_days=retention_days)

    handler = ProductionCatchAllHandler(max_size_mb=max_size_mb, web_port=web_port)
    controller = Controller(handler, hostname=host, port=port)
    controller.start()

    log_event("server_started", host=host, port=port, max_size_mb=max_size_mb)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        log_event("server_stopping")
    finally:
        controller.stop()


if __name__ == "__main__":
    main()
