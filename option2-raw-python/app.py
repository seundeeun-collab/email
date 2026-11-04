from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import sqlite3, os, json, datetime, glob
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})
def get_db():
    os.makedirs('data', exist_ok=True)
    conn = sqlite3.connect('data/emails.db')
    conn.execute('CREATE TABLE IF NOT EXISTS emails (id INTEGER PRIMARY KEY, from_addr TEXT, to_addr TEXT, subject TEXT, created_at TEXT)')
    return conn
@app.route('/health')
def health():
    conn = get_db()
    count = conn.execute('SELECT COUNT(*) FROM emails').fetchone()[0]
    return jsonify(smtp='listening 127.0.0.1:1025', db='ok', count=count, mode='FREE - No buying')
@app.route('/api/emails')
def emails():
    conn = get_db()
    rows = conn.execute('SELECT id,from_addr,to_addr,subject,created_at FROM emails ORDER BY id DESC LIMIT 100').fetchall()
    return jsonify([{'id':r[0],'from':r[1],'to':r[2],'subject':r[3],'created_at':r[4]} for r in rows])
@app.route('/api/inbound', methods=['POST'])
def inbound():
    data = request.get_json()
    os.makedirs('data/inbox', exist_ok=True)
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')
    open(f'data/inbox/{ts}.eml','w',encoding='utf-8').write(data.get('raw',''))
    conn = get_db()
    conn.execute('INSERT INTO emails (from_addr,to_addr,subject,created_at) VALUES (?,?,?,?)',(data.get('from',''),data.get('to',''),data.get('subject',''),data.get('created_at','')))
    conn.commit()
    open('data/new_email.json','w').write(json.dumps(data))
    return jsonify(status='ok', received=True)
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
                    yield f"data: {data}\n\n"
            time.sleep(1)
    return app.response_class(gen(), mimetype='text/event-stream')
@app.route('/api/export/csv')
def export_csv():
    conn = get_db()
    rows = conn.execute('SELECT * FROM emails').fetchall()
    csv = "id,from,to,subject,date\n" + "\n".join([f"{r[0]},{r[1]},{r[2]},{r[3]},{r[4]}" for r in rows])
    return app.response_class(csv, mimetype='text/csv', headers={'Content-Disposition':'attachment; filename=emails.csv'})
@app.route('/')
def index():
    return send_from_directory('.','app.html') if os.path.exists('app.html') else jsonify(message='Email API FREE', endpoints=['/health','/api/emails','/api/stream','/api/inbound'])
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
