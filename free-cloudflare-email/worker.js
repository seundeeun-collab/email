/**
 * Cloudflare Email Worker for Relay 1025 / Inbox Orbit Mail Viewer
 *
 * Captures incoming emails from Cloudflare Email Routing on your domain
 * and forwards them to your live web inbox via HTTPS POST without requiring a port 25 VPS.
 */
export default {
  async email(message, env, ctx) {
    const raw = await new Response(message.raw).text();
    const targetBase = (env.LOVABLE_API_URL || "https://inbox-orbit-mail-viewer.lovable.app").replace(/\/+$/, "");
    
    // Auto-detect endpoint based on target URL
    const endpoint = targetBase.includes("lovable.app")
      ? `${targetBase}/api/public/inbound`
      : `${targetBase}/api/inbound`;

    const headers = {
      "content-type": "message/rfc822",
      "x-inbox-to": message.to,
      "x-inbox-from": message.from,
    };

    if (env.INBOUND_TOKEN) {
      headers["x-inbound-token"] = env.INBOUND_TOKEN;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: raw,
    });

    if (!response.ok) {
      console.error(`Failed to forward email: ${response.status} ${response.statusText}`);
    }
  },
};
