#!/bin/bash
npx wrangler d1 create inbox-orbit-emails
npx wrangler kv namespace create EMAILS_KV
npx wrangler r2 bucket create inbox-orbit-emails
echo "Copy IDs to wrangler-all-in-one.toml"
npx wrangler deploy worker-all-in-one.js --config wrangler-all-in-one.toml
