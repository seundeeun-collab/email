export default {
  async email(message, env, ctx) {
    const from = message.from
    const to = message.to
    const raw = await new Response(message.raw).text()
    const subject = message.headers.get("subject") || "(no subject)"
    ctx.waitUntil(
      fetch(`${env.LOVABLE_API_URL}/api/inbound`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.WEBHOOK_TOKEN}` },
        body: JSON.stringify({ from, to, subject, raw, created_at: new Date().toISOString() })
      })
    )
  }
}
