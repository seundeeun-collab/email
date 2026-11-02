# Virtual Email Server

A free, self-hosted, **receive-only** virtual inbox. The main implementation accepts SMTP mail for any recipient, stores every message in local SQLite and as a raw `.eml` file, and displays messages in a Flask inbox. It does not send email and does not use API keys or external email providers.

## Choose an option

### Option 1: Ready-made open-source inbox

See [option1-opensource-clone/setup.md](option1-opensource-clone/setup.md). Inbucket provides SMTP, POP3, a REST API, and its own web inbox. It accepts arbitrary recipients and creates their mailboxes when mail arrives. The folder also contains `clone.sh` for the requested Inbucket, disposable-mailbox, and Stalwart repositories.

### Option 2: Custom Python server — main implementation

See [option2-raw-python/README.md](option2-raw-python/README.md). This version uses `aiosmtpd` for the catch-all SMTP listener and Flask for the inbox viewer/API. `handle_RCPT` appends and accepts every recipient; `handle_DATA` logs the received message, writes it to SQLite, and saves its raw `.eml` file.

Run the full Python option with Docker Compose from this root:

```sh
docker compose up --build
```

Open <http://localhost:5000>. SMTP accepts mail on host port 25. For local testing without Docker or port-25 privileges, follow the Option 2 README and use port 1025. `python option2-raw-python/test_send.py` sends three sample messages when the local SMTP listener is running on port 1025.

## Local and internet use

Local SMTP testing does not need a domain, provider account, API key, or connection to an external mail service. After the open-source dependencies are installed, the test script sends to `test@localhost`, `admin@localhost`, and `random123@localhost` to demonstrate catch-all delivery.

To receive messages from the public internet, you need a domain whose MX record points to a server you control and that can accept inbound SMTP on port 25. The software is free; a domain or suitable hosting may have a separate cost. Do not expose the inbox website publicly without adding authentication and HTTPS.

## Storage

The Docker Compose setup shares a persistent volume mounted at `option2-raw-python/data/` in both services. It contains `emails.db` and `inbox/*.eml`. Without Docker, both files are created next to the Python source under `option2-raw-python/data/`.

## License

The custom Python implementation is MIT licensed (see [LICENSE](LICENSE)). Inbucket is MIT licensed, the archived `synox/disposable-mailbox` project is GPL-3.0, and Stalwart Community is AGPL-3.0. Their licenses apply to their respective upstream code if you clone or redistribute it.
