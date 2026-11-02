# Letterbox

A personal, receive-only inbox for creating custom email addresses, reading received mail, and getting browser notifications. Incoming messages are pushed to open inboxes immediately with Server-Sent Events. The app includes a Resend inbound webhook, a lightweight JSON store, and an optional password gate.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set `MAIL_DOMAIN`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, and a strong `APP_PASSWORD`.
3. Run `npm start` and open `http://localhost:3000`.

The app uses only Node's built in modules. Mailbox and message data are stored in `.data/inbox.json` (ignored by Git).

## Receive real email

1. Configure an inbound domain with Resend, including the DNS records it provides.
2. Set the domain as `MAIL_DOMAIN`. Any local part created in Letterbox will be an address on that domain; configure your provider's receiving rules to route those addresses to inbound processing.
3. Set `RESEND_API_KEY` and the webhook signing secret from the Resend dashboard.
4. Register a public webhook at `https://YOUR_HOST/api/webhooks/resend` for the `email.received` event.
5. Set `APP_PASSWORD` before exposing the site publicly. The webhook verifies Resend's Svix signature; the inbox API is password gated.

Resend sends message metadata in its webhook. Letterbox uses the Resend receiving email API to retrieve message contents. The provider account, domain, DNS, and public hosting are yours to configure; this repository does not include credentials or provision a domain.

## Notes

- Browser notifications require HTTPS (or localhost) and permission from the browser.
- The built in JSON store suits a personal low traffic deployment. Use persistent disk storage on your hosting platform so `.data/inbox.json` survives restarts.
- Keep `.env` private. Never commit API keys or webhook secrets.
