import PostalMime from "postal-mime";

/**
 * Cloudflare Email Routing Gateway & Inbox Worker
 * Merges logic from:
 * - cloudflare/agentic-inbox (PostalMime parsing, R2 attachments, DO isolation)
 * - superhexa/temp-mail (Hono/D1 email ingestion and storage)
 * - genisis-lab/mail (Wren Gmail-style structures)
 */
export default {
  async email(message, env, ctx) {
    const from = message.from;
    const to = message.to;
    const rawBuffer = await new Response(message.raw).arrayBuffer();
    const rawText = new TextDecoder().decode(rawBuffer);

    let parsed = {};
    try {
      const parser = new PostalMime();
      parsed = await parser.parse(rawBuffer);
    } catch (err) {
      console.error("PostalMime parse error:", err);
    }

    const subject = parsed.subject || message.headers.get("subject") || "(no subject)";
    const bodyHtml = parsed.html || null;
    const bodyText = parsed.text || null;
    const messageId = parsed.messageId || crypto.randomUUID();
    const date = parsed.date || new Date().toISOString();

    // R2 Attachments handling (cloudflare/agentic-inbox pattern)
    const attachments = [];
    if (parsed.attachments && parsed.attachments.length > 0) {
      const bucket = env.ATTACHMENTS_BUCKET || env.R2_BUCKET || env.BUCKET;
      for (const att of parsed.attachments) {
        const attId = crypto.randomUUID();
        const filename = (att.filename || "attachment").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_");
        const size = typeof att.content === "string" ? att.content.length : (att.content?.byteLength || 0);

        const attInfo = {
          id: attId,
          filename,
          mimeType: att.mimeType || "application/octet-stream",
          size,
          disposition: att.disposition || "attachment",
          contentId: att.contentId || null,
        };

        if (bucket) {
          try {
            await bucket.put(`attachments/${messageId}/${attId}/${filename}`, att.content, {
              httpMetadata: { contentType: att.mimeType || "application/octet-stream" }
            });
            attInfo.r2_key = `attachments/${messageId}/${attId}/${filename}`;
            attInfo.url = `/api/attachments/${messageId}/${attId}/${encodeURIComponent(filename)}`;
          } catch (r2Err) {
            console.warn("R2 attachment storage error:", r2Err);
          }
        }
        attachments.push(attInfo);
      }
    }

    // Task 2: Cloudflare D1 Database storage option (superhexa/temp-mail pattern)
    if (env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO emails (id, from_address, to_address, subject, received_at, html_content, text_content, raw_mime, attachments)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          messageId,
          from,
          to,
          subject,
          Date.now(),
          bodyHtml,
          bodyText,
          rawText,
          JSON.stringify(attachments)
        ).run();
      } catch (d1Err) {
        console.error("D1 database insertion error:", d1Err);
      }
    }

    // Webhook forward to Lovable Cloud App for realtime push
    if (env.LOVABLE_API_URL) {
      ctx.waitUntil(
        fetch(`${env.LOVABLE_API_URL}/api/inbound`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.WEBHOOK_TOKEN || 'free_token_123'}`
          },
          body: JSON.stringify({
            id: messageId,
            from,
            to,
            subject,
            body_html: bodyHtml,
            body_text: bodyText,
            raw: rawText,
            attachments,
            created_at: date
          })
        }).catch(err => console.warn("Lovable API push failed:", err))
      );
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Serve R2 attachments
    if (url.pathname.startsWith("/api/attachments/")) {
      const parts = url.pathname.replace("/api/attachments/", "").split("/");
      if (parts.length >= 3) {
        const [msgId, attId, ...rest] = parts;
        const filename = decodeURIComponent(rest.join("/"));
        const bucket = env.ATTACHMENTS_BUCKET || env.R2_BUCKET || env.BUCKET;
        if (bucket) {
          const obj = await bucket.get(`attachments/${msgId}/${attId}/${filename}`);
          if (obj) {
            return new Response(obj.body, {
              headers: {
                ...corsHeaders,
                "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
                "Content-Disposition": `attachment; filename="${filename}"`
              }
            });
          }
        }
        return new Response("Attachment not found", { status: 404, headers: corsHeaders });
      }
    }

    // Read emails from D1
    if (url.pathname === "/api/emails" && env.DB) {
      const toAddr = url.searchParams.get("to");
      let query = "SELECT id, from_address as from_addr, to_address as to_addr, subject, received_at, html_content as body_html, text_content as body_text, raw_mime, attachments FROM emails ORDER BY received_at DESC LIMIT 100";
      let stmt = env.DB.prepare(query);
      if (toAddr) {
        query = "SELECT id, from_address as from_addr, to_address as to_addr, subject, received_at, html_content as body_html, text_content as body_text, raw_mime, attachments FROM emails WHERE to_address = ? ORDER BY received_at DESC LIMIT 100";
        stmt = env.DB.prepare(query).bind(toAddr);
      }
      const { results } = await stmt.all();
      return Response.json(results || [], { headers: corsHeaders });
    }

    return Response.json({
      name: "free-email-gateway",
      status: "active",
      engine: env.DB ? "Cloudflare D1 + R2 (Agentic Inbox Pattern)" : "Cloudflare Worker Gateway",
      features: [
        "PostalMime RFC 822 parsing (cloudflare/agentic-inbox)",
        "D1 Database Storage (superhexa/temp-mail)",
        "R2 Attachments Isolation (genisis-lab/mail)",
        "Zero-cost Email Routing"
      ]
    }, { headers: corsHeaders });
  }
};
