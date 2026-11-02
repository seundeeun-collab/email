"""Read-only web inbox and JSON API for the local SQLite mail store."""

from pathlib import Path
import sqlite3

from flask import Flask, abort, jsonify, render_template_string, request


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "emails.db"
app = Flask(__name__)

PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Virtual Inbox</title>
  <style>
    :root{color-scheme:light;--ink:#202820;--muted:#748075;--line:#e3e9e2;--green:#426b4b;--paper:#fff;--bg:#f5f7f4}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
    header{background:#fff;border-bottom:1px solid var(--line);padding:22px max(22px,calc((100% - 1080px)/2));display:flex;align-items:center;justify-content:space-between;gap:20px}
    h1{margin:0;font-size:21px;letter-spacing:-.5px}header p{margin:4px 0 0;color:var(--muted);font-size:12px}.status{font-size:11px;color:var(--green);background:#e9f2e8;border-radius:30px;padding:6px 10px;white-space:nowrap}
    main{max-width:1080px;margin:30px auto;padding:0 20px}.toolbar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:15px}.toolbar h2{font-size:17px;margin:0}.search{display:flex;gap:8px}.search input{width:min(340px,58vw);height:38px;border:1px solid var(--line);border-radius:8px;padding:0 12px;background:white;font:inherit}.search button{border:0;border-radius:8px;background:var(--green);color:white;padding:0 14px;font-weight:600}
    .address{margin:0 0 15px;color:var(--muted);font-size:12px}.messages{display:grid;gap:10px}.card{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:16px 18px;box-shadow:0 3px 14px #263d2506}.card-top{display:flex;justify-content:space-between;gap:12px}.card h3{margin:7px 0 4px;font-size:15px}.meta{color:var(--muted);font-size:12px;overflow-wrap:anywhere}.date{color:#89938a;font-size:11px;white-space:nowrap}.preview{margin:10px 0 0;color:#586158;white-space:pre-wrap;overflow-wrap:anywhere;max-height:90px;overflow:hidden;font-size:12px}.raw-link{display:inline-block;margin-top:9px;color:var(--green);font-weight:600;font-size:12px;text-decoration:none}.empty{border:1px dashed #cdd8cd;border-radius:10px;padding:40px;text-align:center;color:var(--muted);background:#ffffff88}.empty strong{display:block;color:var(--ink);margin-bottom:4px}.footer{margin-top:25px;color:#8c958c;font-size:11px;text-align:center}
    @media(max-width:620px){header{padding:17px 16px}.status{display:none}main{margin:20px auto;padding:0 13px}.toolbar{align-items:flex-start;flex-direction:column}.search{width:100%}.search input{width:100%}.card{padding:14px}.date{font-size:10px}}
  </style>
</head>
<body>
  <header><div><h1>✉ Virtual Inbox</h1><p>Receive-only mail · all messages stored on this server</p></div><span class="status">● Catch-all listener online</span></header>
  <main>
    <div class="toolbar"><h2>{% if to_addr %}Inbox for {{ to_addr }}{% else %}All received mail{% endif %}</h2>
      <form class="search" action="/" method="get"><input name="to" value="{{ to_addr or '' }}" placeholder="Filter by recipient, e.g. test@localhost"><button type="submit">Search</button></form>
    </div>
    {% if to_addr %}<p class="address">Showing mail addressed to <strong>{{ to_addr }}</strong> · <a href="/">Show all</a></p>{% endif %}
    <section class="messages">
      {% for email in emails %}
      <article class="card"><div class="card-top"><span class="meta">To: <strong>{{ email.to_addr }}</strong></span><time class="date">{{ email.created_at }}</time></div>
        <div class="meta" style="margin-top:7px">From: <strong>{{ email.from_addr }}</strong></div><h3>{{ email.subject or '(no subject)' }}</h3>
        <div class="preview">{{ email.body[:500] }}{% if email.body|length > 500 %}…{% endif %}</div><a class="raw-link" href="/api/emails/{{ email.id }}" target="_blank">View email details and raw source →</a>
      </article>
      {% else %}<div class="empty"><strong>No messages yet</strong>Send an email to any address on this listener. Every recipient is accepted.</div>{% endfor %}
    </section><p class="footer">Messages are kept in the local SQLite database and <code>data/inbox/</code>.</p>
  </main>
</body>
</html>"""


def connect_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def initialize_database():
    with connect_db() as db:
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


def rows_for(recipient=None):
    with connect_db() as db:
        if recipient:
            rows = db.execute(
                "SELECT * FROM emails WHERE to_addr LIKE ? ORDER BY id DESC",
                (f"%{recipient}%",),
            ).fetchall()
        else:
            rows = db.execute("SELECT * FROM emails ORDER BY id DESC").fetchall()
        return [dict(row) for row in rows]


@app.get("/")
def index():
    recipient = request.args.get("to", "").strip()
    return render_template_string(PAGE, emails=rows_for(recipient or None), to_addr=recipient)


@app.get("/api/emails")
def api_emails():
    recipient = request.args.get("to", "").strip()
    return jsonify(rows_for(recipient or None))


@app.get("/api/emails/<int:email_id>")
def api_email_detail(email_id):
    with connect_db() as db:
        row = db.execute("SELECT * FROM emails WHERE id = ?", (email_id,)).fetchone()
    if row is None:
        abort(404, description="Email not found")
    return jsonify(dict(row))


@app.get("/api/emails/<path:to_addr>")
def api_emails_for_recipient(to_addr):
    return jsonify(rows_for(to_addr))


@app.get("/inbox/<path:to_addr>")
def recipient_inbox(to_addr):
    return render_template_string(PAGE, emails=rows_for(to_addr), to_addr=to_addr)


if __name__ == "__main__":
    initialize_database()
    app.run(host="0.0.0.0", port=5000, debug=False)
