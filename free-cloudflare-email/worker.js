export default {
  async email(message, env, ctx) {
    const from = message.from
    const to = message.to
    const subject = message.headers.get('subject')
    const raw = await message.raw.text()
    // Forward to free Lovable API via HTTP - no port 25 needed
    await fetch(`${env.LOVABLE_API_URL}/api/inbound`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({from, to, subject, raw, created_at: new Date().toISOString()})
    })
  }
}
