from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3, os, json, datetime, urllib.request

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

CLOUDFLARE_ACCOUNT_ID = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
CLOUDFLARE_D1_DATABASE_ID = os.environ.get('CLOUDFLARE_D1_DATABASE_ID')
CLOUDFLARE_API_TOKEN = os.environ.get('CLOUDFLARE_API_TOKEN')

def has_d1():
    return bool(CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_D1_DATABASE_ID and CLOUDFLARE_API_TOKEN)

def query_d1(sql, params=None):
    if not has_d1():
        return None
    url = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/d1/database/{CLOUDFLARE_D1_DATABASE_ID}/query"
    payload = json.dumps({"sql": sql, "params": params or []}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}",
        "Content-Type": "application/json"
    })
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            if data.get("success") and data.get("result"):
                return data["result"][0].get("results", [])
    except Exception as e:
        print(f"D1 Query Error: {e}")
    return None

def get_db():
    os.makedirs('data', exist_ok=True)
    conn = sqlite3.connect('data/emails.db')
    conn.execute('''
        CREATE TABLE IF NOT EXISTS emails (
            id TEXT PRIMARY KEY,
            from_addr TEXT,
            to_addr TEXT,
            subject TEXT,
            created_at TEXT,
            body_html TEXT,
            body_text TEXT,
            raw_mime TEXT,
            attachments TEXT DEFAULT '[]'
        )
    ''')
    return conn

@app.route('/health')
def health():
    d1_active = has_d1()
    conn = get_db()
    count = conn.execute('SELECT COUNT(*) FROM emails').fetchone()[0]
    return jsonify(
        smtp='listening 127.0.0.1:1025',
        db='Cloudflare D1' if d1_active else 'SQLite (data/emails.db)',
        count=count,
        mode='FREE - No buying',
        agentic_inbox_enabled=True,
        r2_attachments=True
    )

@app.route('/api/emails')
def emails():
    to_addr = request.args.get('to')
    if has_d1():
        sql = "SELECT id, from_address as from_addr, to_address as to_addr, subject, received_at as created_at, html_content as body_html, text_content as body_text, raw_mime, attachments FROM emails ORDER BY received_at DESC LIMIT 100"
        params = []
        if to_addr:
            sql = "SELECT id, from_address as from_addr, to_address as to_addr, subject, received_at as created_at, html_content as body_html, text_content as body_text, raw_mime, attachments FROM emails WHERE to_address = ? ORDER BY received_at DESC LIMIT 100"
            params = [to_addr]
        results = query_d1(sql, params)
        if results is not None:
            return jsonify(results)

    conn = get_db()
    if to_addr:
        rows = conn.execute('SELECT id,from_addr,to_addr,subject,created_at,body_html,body_text,raw_mime,attachments FROM emails WHERE to_addr = ? ORDER BY rowid DESC LIMIT 100', (to_addr,)).fetchall()
    else:
        rows = conn.execute('SELECT id,from_addr,to_addr,subject,created_at,body_html,body_text,raw_mime,attachments FROM emails ORDER BY rowid DESC LIMIT 100').fetchall()
    
    return jsonify([{
        'id': r[0],
        'from_addr': r[1],
        'to_addr': r[2],
        'subject': r[3],
        'created_at': r[4],
        'body_html': r[5],
        'body_text': r[6],
        'raw_mime': r[7],
        'attachments': json.loads(r[8] or '[]') if isinstance(r[8], str) else (r[8] or [])
    } for r in rows])

@app.route('/api/inbound', methods=['POST'])
def inbound():
    data = request.get_json() or {}
    email_id = str(data.get('id') or datetime.datetime.now().strftime('%Y%m%d%H%M%S%f'))
    from_addr = data.get('from', '')
    to_addr = data.get('to', '')
    subject = data.get('subject', '(no subject)')
    created_at = data.get('created_at') or datetime.datetime.now().isoformat()
    body_html = data.get('body_html')
    body_text = data.get('body_text')
    raw_mime = data.get('raw', '')
    attachments = json.dumps(data.get('attachments', []))

    # Optional Cloudflare D1 insertion
    if has_d1():
        query_d1(
            "INSERT INTO emails (id, from_address, to_address, subject, received_at, html_content, text_content, raw_mime, attachments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [email_id, from_addr, to_addr, subject, int(datetime.datetime.now().timestamp() * 1000), body_html, body_text, raw_mime, attachments]
        )

    # Local SQLite persistent backup
    os.makedirs('data/inbox', exist_ok=True)
    open(f'data/inbox/{email_id}.eml', 'w', encoding='utf-8').write(raw_mime)

    conn = get_db()
    conn.execute(
        'INSERT OR REPLACE INTO emails (id, from_addr, to_addr, subject, created_at, body_html, body_text, raw_mime, attachments) VALUES (?,?,?,?,?,?,?,?,?)',
        (email_id, from_addr, to_addr, subject, created_at, body_html, body_text, raw_mime, attachments)
    )
    conn.commit()

    broadcast_data = {
        'id': email_id,
        'from_addr': from_addr,
        'to_addr': to_addr,
        'subject': subject,
        'created_at': created_at,
        'body_html': body_html,
        'body_text': body_text,
        'raw_mime': raw_mime,
        'attachments': data.get('attachments', [])
    }
    open('data/new_email.json', 'w').write(json.dumps(broadcast_data))
    return jsonify(status='ok', received=True, id=email_id)

@app.route('/api/stream')
def stream():
    def gen():
        import time
        last = 0
        while True:
            if os.path.exists('data/new_email.json'):
                mtime = os.path.getmtime('data/new_email.json')
                if mtime > last:
                    last = mtime
                    data = open('data/new_email.json').read()
                    yield f"event: new_email\ndata: {data}\n\n"
            time.sleep(1)
    return app.response_class(gen(), mimetype='text/event-stream')

@app.route('/api/export/csv')
def export_csv():
    conn = get_db()
    rows = conn.execute('SELECT id,from_addr,to_addr,subject,created_at,body_text FROM emails ORDER BY rowid DESC').fetchall()
    csv = "id,from,to,subject,date,body\n" + "\n".join([f'"{r[0]}","{r[1]}","{r[2]}","{r[3]}","{r[4]}","{(r[5] or "")[:300]}"' for r in rows])
    return app.response_class(csv, mimetype='text/csv', headers={'Content-Disposition':'attachment; filename=emails.csv'})

@app.route('/')
def index():
    return send_from_directory('.','app.html') if os.path.exists('app.html') else jsonify(
        message='Inbox Orbit Mail API FREE',
        architecture='Cloudflare Agentic Inbox + Temp-Mail open source',
        endpoints=['/health','/api/emails','/api/stream','/api/inbound','/api/export/csv']
    )

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
