import asyncio
from aiosmtpd.controller import Controller
import os, datetime, sqlite3, email
from email import policy
from email.parser import BytesParser
class CatchAllHandler:
    async def handle_RCPT(self, server, session, envelope, address, rcpt_options):
        envelope.rcpt_tos.append(address)
        return '250 OK'
    async def handle_DATA(self, server, session, envelope):
        os.makedirs('data/inbox', exist_ok=True)
        os.makedirs('data', exist_ok=True)
        raw = envelope.original_content
        msg = BytesParser(policy=policy.default).parsebytes(raw)
        from_addr = str(msg['from'] or envelope.mail_from)
        to_addr = ', '.join(envelope.rcpt_tos)
        subject = str(msg['subject'] or '')
        # save eml
        ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        open(f'data/inbox/{ts}.eml','wb').write(raw)
        # save db
        conn = sqlite3.connect('data/emails.db')
        conn.execute('CREATE TABLE IF NOT EXISTS emails (id INTEGER PRIMARY KEY, from_addr TEXT, to_addr TEXT, subject TEXT, created_at TEXT)')
        conn.execute('INSERT INTO emails (from_addr,to_addr,subject,created_at) VALUES (?,?,?,?)',(from_addr,to_addr,subject,datetime.datetime.now().isoformat()))
        conn.commit()
        conn.close()
        # notify SSE via file
        open('data/new_email.json','w').write('{"new":1}')
        return '250 OK'
if __name__ == '__main__':
    import argparse
    p=argparse.ArgumentParser()
    p.add_argument('--host',default='127.0.0.1')
    p.add_argument('--port',type=int,default=1025)
    a=p.parse_args()
    c=Controller(CatchAllHandler(), hostname=a.host, port=a.port)
    c.start()
    print(f"SMTP listening on {a.host}:{a.port} - 100% FREE")
    try:
        asyncio.get_event_loop().run_forever()
    except KeyboardInterrupt:
        pass
    finally:
        c.stop()
