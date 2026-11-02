# Option 1: Inbucket as a virtual inbox

Inbucket is a self-hosted SMTP mailbox service. It accepts mail for arbitrary recipients, creates mailboxes as messages arrive, and shows the stored messages in its web interface. No account provisioning, API key, paid email provider, or outbound-mail service is needed.

## Start Inbucket

From this folder:

```sh
docker compose up -d
```

Open <http://localhost:9000>. SMTP listens on `localhost:2500`; POP3 listens on `localhost:1100`. Send mail to any address routed to that SMTP listener, such as `hello@example.test`; Inbucket creates the mailbox when the message arrives.

The Compose file enables catch-all acceptance and stores mail on a persistent Docker volume. The default retention is seven days. To stop it, run `docker compose down`. The named volume remains until explicitly removed.

## Internet mail

For messages from public mail providers, use a domain you control and set its MX record to a hostname on a server that accepts inbound SMTP on port 25. The sample maps local port 2500 for SMTP testing. You can change its mapping to `25:2500` on a public server. Local testing requires no domain.

Inbucket's web interface has no authentication by default. Keep port 9000 private unless you put it behind an authenticated reverse proxy. Inbucket is intended for development and testing, so do not use it for important or confidential mail.

## Clone the upstream options

Run `./clone.sh` (or `sh clone.sh`) to clone Inbucket, the archived PHP disposable-mailbox project, and Stalwart into this directory. These upstream projects have separate licenses and setup instructions. The `synox/disposable-mailbox` repository is archived; review upstream maintenance and license terms before using or modifying it.
