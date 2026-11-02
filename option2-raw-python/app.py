"""100% Free Production-Grade Web Inbox, JSON API, SSE stream, Cloudflare Inbound & Health Monitoring."""

import csv
from datetime import datetime, timezone
import email
from email import policy
from functools import wraps
import io
import json
import os
from pathlib import Path
import queue
import socket
import time
import uuid

from flask import (
    Flask,
    Response,
    abort,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

# CORS support (free access from any frontend/Lovable Cloud app)
try:
    from flask_cors import CORS
    CORS_AVAILABLE = True
except ImportError:
    CORS_AVAILABLE = False

# Rate limiter support (optional for free mode)
try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    LIMITER_AVAILABLE = True
except ImportError:
    LIMITER_AVAILABLE = False

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from db import (
    DATA_DIR,
    INBOX_DIR,
    check_db_health,
    get_distinct_recipients,
    get_email_by_id,
    get_stats,
    initialize_database,
    insert_email,
    rows_for,
)

BASE_DIR = Path(__file__).resolve().parent
START_TIME = time.time()

app = Flask(__name__, template_folder=str(BASE_DIR / "templates"))
app.secret_key = os.getenv("SECRET_KEY", "virtual-email-inbox-free-secret-key-928374")

if CORS_AVAILABLE:
    CORS(app, resources={r"/*": {"origins": "*"}})

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "").strip()
API_KEY = os.getenv("API_KEY", "").strip()
SMTP_HOST = os.getenv("SMTP_HOST", "127.0.0.1").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "1025"))
WEB_PORT = int(os.getenv("WEB_PORT", "5000"))
MAX_EMAIL_SIZE_MB = int(os.getenv("MAX_EMAIL_SIZE_MB", "10"))
MAX_EMAIL_SIZE_BYTES = MAX_EMAIL_SIZE_MB * 1024 * 1024

if LIMITER_AVAILABLE:
    limiter = Limiter(
        get_remote_address,
        app=app,
        default_limits=["120 per minute"],
        storage_uri="memory://",
    )
else:
    class _DummyLimiter:
        def limit(self, *args, **kwargs):
            def decorator(f):
                return f
            return decorator
    limiter = _DummyLimiter()

# SSE Pub/Sub Broker
sse_subscribers = []


def is_authenticated():
    if not ADMIN_PASSWORD:
        return True
    return session.get("logged_in") is True


def check_api_auth():
    # In 100% Free mode without ADMIN_PASSWORD or API_KEY, allow open API access
    if not API_KEY and not ADMIN_PASSWORD:
        return True
    client_key = request.headers.get("X-API-Key", "").strip()
    if API_KEY and client_key == API_KEY:
        return True
    if session.get("logged_in"):
        return True
    return False


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not is_authenticated():
            return redirect(url_for("login", next=request.path))
        return f(*args, **kwargs)
    return decorated_function


def api_auth_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not check_api_auth():
            return jsonify({"error": "Unauthorized", "message": "Valid X-API-Key header required"}), 401
        return f(*args, **kwargs)
    return decorated_function


@app.after_request
def set_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# --- Authentication Routes ---

@app.route("/login", methods=["GET", "POST"])
def login():
    if not ADMIN_PASSWORD or is_authenticated():
        return redirect("/")

    error = None
    if request.method == "POST":
        password = request.form.get("password", "")
        if password == ADMIN_PASSWORD:
            session["logged_in"] = True
            next_url = request.args.get("next") or "/"
            return redirect(next_url)
        error = "Invalid administrator password"

    return render_template("login.html", error=error)


@app.get("/logout")
def logout():
    session.clear()
    return redirect("/login")


# --- Main Web UI ---

@app.get("/")
@login_required
def index():
    recipient = request.args.get("to", "").strip()
    emails = rows_for(recipient or None, limit=500)
    stats = get_stats()
    distinct_recipients = get_distinct_recipients()

    return render_template(
        "index.html",
        emails=emails,
        emails_json=json.dumps(emails),
        active_recipient=recipient,
        stats=stats,
        distinct_recipients=distinct_recipients,
        smtp_port=SMTP_PORT,
        auth_enabled=bool(ADMIN_PASSWORD),
    )


@app.get("/inbox/<path:to_addr>")
@login_required
def recipient_inbox(to_addr):
    emails = rows_for(to_addr, limit=500)
    stats = get_stats()
    distinct_recipients = get_distinct_recipients()

    return render_template(
        "index.html",
        emails=emails,
        emails_json=json.dumps(emails),
        active_recipient=to_addr,
        stats=stats,
        distinct_recipients=distinct_recipients,
        smtp_port=SMTP_PORT,
        auth_enabled=bool(ADMIN_PASSWORD),
    )


# --- REST APIs ---

@app.get("/api/emails")
@limiter.limit("120 per minute")
@api_auth_required
def api_emails():
    recipient = request.args.get("to", "").strip()
    limit = min(int(request.args.get("limit", 200)), 1000)
    offset = int(request.args.get("offset", 0))
    emails = rows_for(recipient or None, limit=limit, offset=offset)
    return jsonify(emails)


@app.get("/api/emails/<int:email_id>")
@api_auth_required
def api_email_detail(email_id):
    row = get_email_by_id(email_id)
    if row is None:
        abort(404, description="Email not found")
    return jsonify(row)


@app.get("/api/stats")
@api_auth_required
def api_stats():
    return jsonify(get_stats())


# --- Cloudflare Free Inbound Webhook (Zero Port 25 / Zero VPS) ---

@app.post("/api/inbound")
def api_inbound():
    """Receives email payloads forwarded from Cloudflare Email Worker for 100% free internet reception."""
    data = request.get_json(force=True, silent=True) or {}
    from_addr = (data.get("from") or data.get("from_addr") or "").strip()
    to_addr = (data.get("to") or data.get("to_addr") or "").strip()
    subject = (data.get("subject") or "(no subject)").strip()
    raw = data.get("raw") or ""
    created_at = data.get("created_at") or datetime.now(timezone.utc).isoformat()

    if not from_addr:
        from_addr = "unknown@external.com"
    if not to_addr:
        to_addr = "catchall@yourdomain.com"

    # Enforce size check
    raw_bytes = raw.encode("utf-8") if isinstance(raw, str) else b""
    if len(raw_bytes) > MAX_EMAIL_SIZE_BYTES:
        return jsonify({"error": "Payload Too Large", "message": f"Exceeds max {MAX_EMAIL_SIZE_MB}MB"}), 413

    # Parse body from raw MIME if body was not directly provided
    body = data.get("body")
    if not body:
        if raw:
            try:
                msg = email.message_from_string(raw, policy=policy.default)
                if msg.is_multipart():
                    parts = []
                    for part in msg.walk():
                        if part.is_multipart() or part.get_content_disposition() == "attachment":
                            continue
                        if part.get_content_type() in ("text/plain", "text/html"):
                            try:
                                parts.append(str(part.get_content()))
                            except Exception:
                                pass
                    body = "\n\n".join(parts) or raw
                else:
                    try:
                        body = str(msg.get_content())
                    except Exception:
                        body = raw
            except Exception:
                body = raw
        else:
            body = subject

    size_bytes = len(raw_bytes) if raw_bytes else len(body.encode("utf-8"))

    # Save to SQLite / Postgres database
    email_id = insert_email(
        to_addr=to_addr,
        from_addr=from_addr,
        subject=subject,
        body=body,
        raw=raw if raw else f"From: {from_addr}\nTo: {to_addr}\nSubject: {subject}\n\n{body}",
        created_at=created_at,
        size_bytes=size_bytes,
    )

    # Save .eml file to disk
    try:
        INBOX_DIR.mkdir(parents=True, exist_ok=True)
        eml_name = f"{email_id}-{uuid.uuid4().hex[:8]}.eml"
        eml_path = INBOX_DIR / eml_name
        if raw_bytes:
            eml_path.write_bytes(raw_bytes)
        else:
            eml_path.write_text(f"From: {from_addr}\nTo: {to_addr}\nSubject: {subject}\n\n{body}", encoding="utf-8")
    except Exception:
        pass

    event_payload = {
        "id": email_id,
        "to_addr": to_addr,
        "from_addr": from_addr,
        "subject": subject,
        "body": body,
        "created_at": created_at,
        "size_bytes": size_bytes,
        "source": "cloudflare-worker",
    }

    # Broadcast to SSE clients instantly
    for sub in list(sse_subscribers):
        try:
            sub.put_nowait(event_payload)
        except Exception:
            pass

    return jsonify({"status": "received", "id": email_id, "to": to_addr}), 201


# --- Real-Time SSE Stream ---

@app.post("/internal/notify")
def internal_notify():
    data = request.get_json(silent=True) or {}
    for sub in list(sse_subscribers):
        try:
            sub.put_nowait(data)
        except Exception:
            pass
    return jsonify({"status": "broadcasted", "subscribers": len(sse_subscribers)})


@app.get("/api/stream")
def sse_stream():
    # In free mode without ADMIN_PASSWORD, stream is open to EventSource without headers
    if ADMIN_PASSWORD and not session.get("logged_in") and not check_api_auth():
        abort(401)

    def event_stream():
        q = queue.Queue(maxsize=100)
        sse_subscribers.append(q)
        yield f"event: ping\ndata: {json.dumps({'time': datetime.now(timezone.utc).isoformat()})}\n\n"
        try:
            while True:
                try:
                    data = q.get(timeout=25)
                    yield f"event: new_email\ndata: {json.dumps(data)}\n\n"
                except queue.Empty:
                    yield f": heartbeat\n\n"
        finally:
            if q in sse_subscribers:
                sse_subscribers.remove(q)

    return Response(
        event_stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


# --- Exports ---

@app.get("/api/export/csv")
@api_auth_required
def export_csv():
    emails = rows_for(limit=5000)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "to_addr", "from_addr", "subject", "created_at", "size_bytes", "body"])
    for e in emails:
        writer.writerow([
            e.get("id"),
            e.get("to_addr"),
            e.get("from_addr"),
            e.get("subject"),
            e.get("created_at"),
            e.get("size_bytes", 0),
            e.get("body", "").replace("\r\n", " ").replace("\n", " ")[:200],
        ])
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=emails_export.csv"},
    )


@app.get("/api/export/eml/<int:email_id>")
@api_auth_required
def export_eml(email_id):
    row = get_email_by_id(email_id)
    if not row:
        abort(404, description="Email not found")
    raw_content = row.get("raw", "")
    return Response(
        raw_content,
        mimetype="message/rfc822",
        headers={"Content-Disposition": f"attachment; filename=email-{email_id}.eml"},
    )


# --- Health & Monitoring ---

def probe_smtp_listening(host, port):
    try:
        with socket.create_connection((host, port), timeout=0.5):
            return f"listening {host}:{port}"
    except Exception:
        # Also try loopback if host is 0.0.0.0
        if host == "0.0.0.0":
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                    return f"listening 127.0.0.1:{port}"
            except Exception:
                pass
        return f"stopped {host}:{port}"


@app.get("/health")
def health():
    db_ok, db_engine = check_db_health()
    smtp_status = probe_smtp_listening(SMTP_HOST, SMTP_PORT)
    stats = get_stats() if db_ok else {"total": 0}
    uptime = round(time.time() - START_TIME, 2)
    inbox_count = stats.get("total", 0)

    status_code = 200 if db_ok else 503
    return jsonify({
        "status": "healthy" if db_ok else "unhealthy",
        "smtp": smtp_status,
        "db": "ok" if db_ok else "error",
        "db_engine": db_engine,
        "count": inbox_count,
        "inbox_count": inbox_count,
        "uptime": uptime,
        "uptime_seconds": uptime,
        "mode": "FREE - No buying",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }), status_code


@app.get("/metrics")
def metrics():
    stats = get_stats()
    uptime = round(time.time() - START_TIME, 2)
    lines = [
        "# HELP email_inbox_total Total emails stored",
        "# TYPE email_inbox_total gauge",
        f"email_inbox_total {stats.get('total', 0)}",
        "# HELP email_inbox_today Total emails received today",
        "# TYPE email_inbox_today gauge",
        f"email_inbox_today {stats.get('today', 0)}",
        "# HELP email_uptime_seconds Application uptime in seconds",
        "# TYPE email_uptime_seconds counter",
        f"email_uptime_seconds {uptime}",
    ]
    return Response("\n".join(lines) + "\n", mimetype="text/plain")


if __name__ == "__main__":
    initialize_database()
    app.run(host="0.0.0.0", port=WEB_PORT, debug=False, threaded=True)
