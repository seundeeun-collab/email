"""Database abstraction supporting both SQLite and PostgreSQL."""

from datetime import datetime, timezone, timedelta
import os
from pathlib import Path
import sqlite3

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
INBOX_DIR = DATA_DIR / "inbox"
DB_PATH = DATA_DIR / "emails.db"

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()


def is_postgres():
    return DATABASE_URL.startswith("postgres://") or DATABASE_URL.startswith("postgresql://")


def connect_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    INBOX_DIR.mkdir(parents=True, exist_ok=True)

    if is_postgres():
        try:
            import psycopg2
            import psycopg2.extras
            conn = psycopg2.connect(DATABASE_URL)
            return conn, "postgres"
        except Exception as exc:
            print(f"[db] PostgreSQL connection failed, falling back to SQLite: {exc}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn, "sqlite"


def initialize_database():
    conn, engine = connect_db()
    try:
        with conn:
            cursor = conn.cursor()
            if engine == "postgres":
                cursor.execute(
                    """CREATE TABLE IF NOT EXISTS emails (
                        id SERIAL PRIMARY KEY,
                        to_addr TEXT NOT NULL,
                        from_addr TEXT NOT NULL,
                        subject TEXT NOT NULL,
                        body TEXT NOT NULL,
                        raw TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        size_bytes INTEGER DEFAULT 0
                    )"""
                )
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_to_addr ON emails(to_addr)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at)")
            else:
                cursor.execute(
                    """CREATE TABLE IF NOT EXISTS emails (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        to_addr TEXT NOT NULL,
                        from_addr TEXT NOT NULL,
                        subject TEXT NOT NULL,
                        body TEXT NOT NULL,
                        raw TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        size_bytes INTEGER DEFAULT 0
                    )"""
                )
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_to_addr ON emails(to_addr)")
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_emails_created_at ON emails(created_at)")
    finally:
        conn.close()


def insert_email(to_addr, from_addr, subject, body, raw, created_at, size_bytes=0):
    conn, engine = connect_db()
    try:
        with conn:
            cursor = conn.cursor()
            if engine == "postgres":
                cursor.execute(
                    """INSERT INTO emails (to_addr, from_addr, subject, body, raw, created_at, size_bytes)
                       VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (to_addr, from_addr, subject, body, raw, created_at, size_bytes),
                )
                email_id = cursor.fetchone()[0]
            else:
                cursor.execute(
                    """INSERT INTO emails (to_addr, from_addr, subject, body, raw, created_at, size_bytes)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (to_addr, from_addr, subject, body, raw, created_at, size_bytes),
                )
                email_id = cursor.lastrowid
            return email_id
    finally:
        conn.close()


def rows_for(recipient=None, limit=200, offset=0):
    conn, engine = connect_db()
    try:
        cursor = conn.cursor()
        placeholder = "%s" if engine == "postgres" else "?"
        if recipient:
            sql = f"""SELECT * FROM emails WHERE LOWER(to_addr) LIKE LOWER({placeholder})
                      ORDER BY id DESC LIMIT {placeholder} OFFSET {placeholder}"""
            cursor.execute(sql, (f"%{recipient}%", limit, offset))
        else:
            sql = f"SELECT * FROM emails ORDER BY id DESC LIMIT {placeholder} OFFSET {placeholder}"
            cursor.execute(sql, (limit, offset))
        
        rows = cursor.fetchall()
        if engine == "postgres":
            columns = [desc[0] for desc in cursor.description]
            return [dict(zip(columns, row)) for row in rows]
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_email_by_id(email_id):
    conn, engine = connect_db()
    try:
        cursor = conn.cursor()
        placeholder = "%s" if engine == "postgres" else "?"
        cursor.execute(f"SELECT * FROM emails WHERE id = {placeholder}", (email_id,))
        row = cursor.fetchone()
        if row is None:
            return None
        if engine == "postgres":
            columns = [desc[0] for desc in cursor.description]
            return dict(zip(columns, row))
        return dict(row)
    finally:
        conn.close()


def get_distinct_recipients():
    conn, engine = connect_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT to_addr, COUNT(*) as count FROM emails GROUP BY to_addr ORDER BY count DESC LIMIT 50")
        rows = cursor.fetchall()
        if engine == "postgres":
            return [{"to_addr": r[0], "count": r[1]} for r in rows]
        return [{"to_addr": r["to_addr"], "count": r["count"]} for r in rows]
    finally:
        conn.close()


def get_stats():
    conn, engine = connect_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM emails")
        total = cursor.fetchone()[0]

        today_start = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        placeholder = "%s" if engine == "postgres" else "?"
        cursor.execute(f"SELECT COUNT(*) FROM emails WHERE created_at >= {placeholder}", (today_start,))
        today = cursor.fetchone()[0]

        cursor.execute("SELECT to_addr, COUNT(*) as c FROM emails GROUP BY to_addr ORDER BY c DESC LIMIT 5")
        top_rows = cursor.fetchall()
        top_recipients = (
            [{"to_addr": r[0], "count": r[1]} for r in top_rows]
            if engine == "postgres"
            else [{"to_addr": r["to_addr"], "count": r["c"]} for r in top_rows]
        )

        return {
            "total": total,
            "today": today,
            "top_recipients": top_recipients,
            "engine": engine,
        }
    finally:
        conn.close()


def delete_old_emails(retention_days):
    if not retention_days or int(retention_days) <= 0:
        return 0
    cutoff = (datetime.now(timezone.utc) - timedelta(days=int(retention_days))).isoformat()
    conn, engine = connect_db()
    try:
        with conn:
            cursor = conn.cursor()
            placeholder = "%s" if engine == "postgres" else "?"
            cursor.execute(f"DELETE FROM emails WHERE created_at < {placeholder}", (cutoff,))
            deleted = cursor.rowcount
            return deleted
    finally:
        conn.close()


def check_db_health():
    try:
        conn, engine = connect_db()
        with conn:
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            cursor.fetchone()
        conn.close()
        return True, engine
    except Exception as exc:
        return False, str(exc)
