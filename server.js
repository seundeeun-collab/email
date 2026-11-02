import http from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
try {
  const env = await readFile(path.join(root, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch {}
const dataDir = path.join(root, '.data');
const dbFile = path.join(dataDir, 'inbox.json');
const port = Number(process.env.PORT || 3000);
const domain = (process.env.MAIL_DOMAIN || '').trim().toLowerCase();
let db = { mailboxes: [], messages: [] };
try { db = JSON.parse(await readFile(dbFile, 'utf8')); } catch {}
const eventClients = new Set();
function publish(event, data) {
  const packet = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of eventClients) client.write(packet);
}
const save = async () => { await mkdir(dataDir, { recursive: true }); await writeFile(dbFile, JSON.stringify(db, null, 2)); };
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)); };
const readBody = async (req) => { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1_000_000) throw new Error('Request too large'); } return body; };
function authorized(req) {
  const password = process.env.APP_PASSWORD;
  if (!password) return true;
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('letterbox_session='))?.slice('letterbox_session='.length);
  if (!token) return false;
  const expected = createHmac('sha256', password).update('letterbox').digest('hex');
  try { return timingSafeEqual(Buffer.from(token), Buffer.from(expected)); } catch { return false; }
}
function validWebhook(raw, headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = headers['svix-id']; const timestamp = headers['svix-timestamp']; const signatures = headers['svix-signature'];
  if (!id || !timestamp || !signatures || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64');
  return signatures.split(' ').some(part => { const [version, signature] = part.split(','); if (version !== 'v1' || !signature) return false; const a = Buffer.from(expected); const b = Buffer.from(signature); return a.length === b.length && timingSafeEqual(a, b); });
}
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/login' && req.method === 'POST') {
      const { password = '' } = JSON.parse(await readBody(req));
      if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) return json(res, 401, { error: 'Password does not match.' });
      const token = createHmac('sha256', process.env.APP_PASSWORD).update('letterbox').digest('hex');
      res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `letterbox_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`, 'cache-control': 'no-store' }); return res.end('{"ok":true}');
    }
    if (url.pathname === '/api/logout' && req.method === 'POST') { res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'letterbox_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); return res.end('{"ok":true}'); }
    if (url.pathname === '/api/webhooks/resend' && req.method === 'POST') {
      const raw = await readBody(req);
      if (!validWebhook(raw, req.headers)) return json(res, 401, { error: 'Invalid webhook signature.' });
      const event = JSON.parse(raw);
      if (event.type !== 'email.received') return json(res, 200, { ok: true });
      const data = event.data || {};
      if (!data.email_id || db.messages.some(m => m.id === data.email_id)) return json(res, 200, { ok: true });
      let content = {};
      if (process.env.RESEND_API_KEY) {
        const r = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(data.email_id)}`, { headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}` } });
        if (r.ok) content = await r.json();
      }
      const recipients = Array.isArray(data.to) ? data.to : [data.to].filter(Boolean);
      db.messages.unshift({ id: data.email_id, from: data.from || 'Unknown sender', to: recipients, subject: data.subject || '(no subject)', text: content.text || '', html: content.html || '', receivedAt: data.created_at || new Date().toISOString(), unread: true, attachments: data.attachments || [] });
      await save(); publish('message.received', db.messages[0]); return json(res, 200, { ok: true });
    }
    if (url.pathname.startsWith('/api/')) {
      if (!authorized(req)) return json(res, 401, { error: 'Sign in to continue.' });
      if (url.pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`);
        eventClients.add(res);
        const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 20000);
        req.on('close', () => { clearInterval(heartbeat); eventClients.delete(res); });
        return;
      }
      if (url.pathname === '/api/config' && req.method === 'GET') return json(res, 200, { domain, locked: Boolean(process.env.APP_PASSWORD), configured: Boolean(domain && process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET) });
      if (url.pathname === '/api/mailboxes' && req.method === 'GET') return json(res, 200, db.mailboxes);
      if (url.pathname === '/api/mailboxes' && req.method === 'POST') {
        if (!domain) return json(res, 400, { error: 'Set MAIL_DOMAIN in your .env file first.' });
        const { name } = JSON.parse(await readBody(req)); const local = String(name || '').trim().toLowerCase().replace(/[^a-z0-9._+-]/g, '').slice(0, 40);
        if (!local || !/^[a-z0-9][a-z0-9._+-]*$/.test(local)) return json(res, 400, { error: 'Enter a valid address name.' });
        const address = `${local}@${domain}`;
        if (db.mailboxes.some(m => m.address === address)) return json(res, 409, { error: 'That address already exists.' });
        const mailbox = { id: crypto.randomUUID(), address, createdAt: new Date().toISOString() }; db.mailboxes.push(mailbox); await save(); return json(res, 201, mailbox);
      }
      const messageMatch = url.pathname.match(/^\/api\/messages\/([^/]+)$/);
      if (messageMatch && req.method === 'PATCH') { const m = db.messages.find(x => x.id === decodeURIComponent(messageMatch[1])); if (!m) return json(res, 404, { error: 'Message not found.' }); const { unread } = JSON.parse(await readBody(req)); m.unread = Boolean(unread); await save(); return json(res, 200, m); }
      if (url.pathname === '/api/messages' && req.method === 'GET') return json(res, 200, db.messages);
      return json(res, 404, { error: 'Not found.' });
    }
    const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const file = path.resolve(root, 'public', `.${requested}`);
    if (!file.startsWith(path.resolve(root, 'public') + path.sep)) return json(res, 404, { error: 'Not found.' });
    const content = await readFile(file); res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(content);
  } catch (error) { json(res, 500, { error: error.message || 'Server error.' }); }
});
server.listen(port, () => console.log(`Letterbox is running at http://localhost:${port}`));
