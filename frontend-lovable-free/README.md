# Virtual Email Inbox - Frontend (100% Free Lovable Cloud Ready)

Modern dark-mode React + Vite + Tailwind CSS dashboard with real-time SSE live updates for your virtual catch-all email server.

## Features
- **100% Free**: Zero subscriptions, zero paid API keys
- **Live Stream (SSE)**: New emails appear instantly without refreshing
- **Virtual Recipient Sidebar**: Fast filtering across virtual catch-all addresses
- **Full Email Inspection**: Rendered HTML/plain view, headers, and raw MIME view
- **Exports**: Download `.eml` files or full CSV data

## Local Development
```bash
npm install
npm run dev
```

Point to your backend by creating `.env`:
```
VITE_API_URL=http://localhost:5000
```

## How to Publish to Lovable Cloud (100% Free)
1. In Lovable, create or link this frontend project.
2. In Project Settings, set the environment variable:
   `VITE_API_URL = https://your-backend-tunnel-or-api.com` (or leave default `/` if reverse-proxied).
3. Click **Publish** to deploy globally on Lovable's free high-speed CDN.
