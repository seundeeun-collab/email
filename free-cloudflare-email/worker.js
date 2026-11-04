/**
 * Inbox Orbit Mail Viewer - Cloudflare Email Routing Worker
 * 100% Free Open-Source Architecture
 *
 * Logic merged from:
 * - cloudflare/agentic-inbox: PostalMime parsing, Durable Object mailbox isolation, R2 attachment storage
 * - superhexa/temp-mail: Hono-style inbox logic, Cloudflare D1 database insertion
 * - genisis-lab/mail: Clean email representation & attachment handling
 */

import PostalMime from 'postal-mime';

export default {
  /**
   * Cloudflare Email Routing Handler
   * Catches all incoming emails directed to this Worker
   */
  async email(message, env, ctx) {
    const from = message.from;
    const to = message.to;
    const emailId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const nowTs = Date.now();

    // 1. Read raw MIME stream into ArrayBuffer
    const rawBuffer = await new Response(message.raw).arrayBuffer();
    const rawText = new TextDecoder('utf-8').decode(rawBuffer);

    // 2. Parse MIME structure using PostalMime (from cloudflare/agentic-inbox & superhexa/temp-mail)
    let parsed;
    try {
      parsed = await new PostalMime().parse(rawBuffer);
    } catch (err) {
      console.error('PostalMime parse error:', err);
      parsed = {
        subject: message.headers.get('subject') || '(no subject)',
        text: rawText,
        html: null,
        attachments: [],
        messageId: message.headers.get('message-id') || null,
        from: { address: from },
        to: [{ address: to }]
      };
    }

    const subject = parsed.subject || message.headers.get('subject') || '(no subject)';
    const bodyText = parsed.text || '';
    const bodyHtml = parsed.html || null;
    const messageId = parsed.messageId || message.headers.get('message-id') || null;

    // 3. Handle Attachments via Cloudflare R2 (Agentic Inbox Pattern)
    const storedAttachments = [];
    if (env.BUCKET && parsed.attachments && parsed.attachments.length > 0) {
      for (const att of parsed.attachments) {
        const attId = crypto.randomUUID();
        const safeFilename = (att.filename || 'attachment').replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_');
        const r2Key = `attachments/${emailId}/${attId}/${safeFilename}`;
        try {
          await env.BUCKET.put(r2Key, att.content, {
            httpMetadata: {
              contentType: att.mimeType || 'application/octet-stream',
            },
            customMetadata: {
              originalName: att.filename || safeFilename,
              emailId: emailId,
              size: String(typeof att.content === 'string' ? att.content.length : (att.content?.byteLength || 0))
            }
          });

          storedAttachments.push({
            id: attId,
            filename: att.filename || safeFilename,
            mimeType: att.mimeType || 'application/octet-stream',
            size: typeof att.content === 'string' ? att.content.length : (att.content?.byteLength || 0),
            disposition: att.disposition || 'attachment',
            r2Key,
            url: `/api/attachments/${emailId}/${attId}/${encodeURIComponent(safeFilename)}`
          });
        } catch (r2Err) {
          console.error('Cloudflare R2 attachment storage failed:', r2Err);
        }
      }
    } else if (parsed.attachments && parsed.attachments.length > 0) {
      // If R2 is not configured, preserve metadata for UI inspection
      for (const att of parsed.attachments) {
        storedAttachments.push({
          id: crypto.randomUUID(),
          filename: att.filename || 'attachment',
          mimeType: att.mimeType || 'application/octet-stream',
          size: typeof att.content === 'string' ? att.content.length : (att.content?.byteLength || 0),
          disposition: att.disposition || 'attachment'
        });
      }
    }

    // 4. Construct Unified Email Payload
    const emailPayload = {
      id: emailId,
      message_id: messageId,
      from: from,
      from_addr: from,
      to: to,
      to_addr: to,
      subject: subject,
      body_text: bodyText,
      body_html: bodyHtml,
      raw: rawText,
      raw_mime: rawText,
      attachments: storedAttachments,
      received_at: nowIso,
      created_at: nowIso
    };

    // 5. Cloudflare D1 Database Option (from superhexa/temp-mail)
    // If Cloudflare D1 is available (env.DB bound), save email to D1 table
    if (env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO emails (id, message_id, from_addr, to_addr, subject, body_text, body_html, raw_mime, attachments, received_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          emailId,
          messageId,
          from,
          to,
          subject,
          bodyText,
          bodyHtml,
          rawText,
          JSON.stringify(storedAttachments),
          nowTs,
          nowIso
        ).run();
        console.log(`[D1] Email ${emailId} successfully persisted to Cloudflare D1 for ${to}`);
      } catch (d1Err) {
        console.error('[D1] Insert failed:', d1Err);
      }
    }

    // 6. Forward to Live Dashboard / SQLite Backend
    // Triggers real-time SSE stream & Supabase Realtime for instant UI reflection
    const targetUrl = env.LOVABLE_API_URL || 'https://inbox-orbit-mail-viewer.lovable.app';
    ctx.waitUntil(
      fetch(`${targetUrl}/api/inbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.WEBHOOK_TOKEN || 'free_token_123'}`
        },
        body: JSON.stringify(emailPayload)
      }).then(res => {
        if (!res.ok) console.warn(`Inbound forward responded with status ${res.status}`);
      }).catch(err => {
        console.error('Inbound forward error:', err);
      })
    );
  },

  /**
   * HTTP Fetch Handler
   * Allows direct API inspection of D1 database and R2 attachments
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health & System Capability Info
    if (url.pathname === '/health' || url.pathname === '/api/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        mode: '100% Free Cloudflare Open Source',
        d1_database: env.DB ? 'Active (Cloudflare D1)' : 'SQLite / Fallback',
        r2_storage: env.BUCKET ? 'Active (Cloudflare R2)' : 'Simulated / Standby',
        email_routing: 'Active',
        parser: 'postal-mime (cloudflare/agentic-inbox)'
      }, null, 2), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Direct D1 Email API
    if (url.pathname === '/api/emails' && env.DB) {
      const recipient = url.searchParams.get('to');
      const limit = parseInt(url.searchParams.get('limit') || '100', 10);
      let query = 'SELECT * FROM emails';
      const params = [];
      if (recipient) {
        query += ' WHERE LOWER(to_addr) = LOWER(?)';
        params.push(recipient);
      }
      query += ' ORDER BY received_at DESC LIMIT ?';
      params.push(limit);

      const stmt = env.DB.prepare(query);
      const { results } = await (params.length > 1 ? stmt.bind(...params) : stmt.bind(limit)).all();
      return new Response(JSON.stringify(results || []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Direct R2 Attachment Download (Agentic Inbox Pattern)
    if (url.pathname.startsWith('/api/attachments/') && env.BUCKET) {
      const parts = url.pathname.replace('/api/attachments/', '').split('/');
      if (parts.length >= 3) {
        const [emailId, attId, filename] = parts;
        const decodedName = decodeURIComponent(filename);
        const r2Key = `attachments/${emailId}/${attId}/${decodedName}`;
        const object = await env.BUCKET.get(r2Key);
        if (object) {
          const headers = new Headers(corsHeaders);
          headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
          headers.set('Content-Disposition', `attachment; filename="${decodedName}"`);
          return new Response(object.body, { headers });
        }
      }
      return new Response('Attachment not found', { status: 404, headers: corsHeaders });
    }

    return new Response(JSON.stringify({
      message: 'Inbox Orbit Mail Gateway (Cloudflare Email Routing Worker)',
      docs: 'https://github.com/seundeeun-collab/email',
      patterns: [
        'cloudflare/agentic-inbox: PostalMime parser + R2 attachments',
        'superhexa/temp-mail: Hono + Cloudflare D1 storage',
        'genisis-lab/mail: Wren UI email viewer'
      ]
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
