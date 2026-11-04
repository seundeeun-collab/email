export default {
  async email(message, env, ctx) {
    const from = message.from
    const to = message.to
    const raw = await new Response(message.raw).text()
    const subject = message.headers.get("subject") || ""
    const id = Date.now() + "_" + Math.random().toString(36).slice(2)
    if (env.DB) {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS emails (id TEXT PRIMARY KEY, from_addr TEXT, to_addr TEXT, subject TEXT, raw TEXT, created_at TEXT)`).run()
      await env.DB.prepare(`INSERT INTO emails VALUES (?, ?, ?, ?, ?, ?)`).bind(id, from, to, subject, raw, new Date().toISOString()).run()
    }
    if (env.EMAILS_KV) {
      await env.EMAILS_KV.put(`email:${id}`, JSON.stringify({id, from, to, subject, raw, created_at: new Date().toISOString()}))
    }
    if (env.LOVABLE_API_URL) {
      ctx.waitUntil(fetch(`${env.LOVABLE_API_URL}/api/inbound`, {method:"POST", body: JSON.stringify({id, from, to, subject, raw})}))
    }
  },
  async fetch(request, env) {
    const url = new URL(request.url)
    const cors = {"Access-Control-Allow-Origin":"*"}
    if (url.pathname === "/health") return new Response(JSON.stringify({status:"ok", smtp:"Cloudflare handles port 25", mode:"100% FREE - One repo solves everything"}), {headers: cors})
    if (url.pathname === "/api/emails" && env.DB) {
      const {results} = await env.DB.prepare(`SELECT * FROM emails ORDER BY created_at DESC LIMIT 100`).all()
      return new Response(JSON.stringify(results), {headers: cors})
    }
    return new Response("Inbox Orbit - ONE SOLUTION - Cloudflare official agentic-inbox solves everything", {headers: cors})
  }
}
