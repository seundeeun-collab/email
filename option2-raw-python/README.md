# Option 2: Raw Python catch-all inbox

A small, receive-only SMTP server and Flask inbox viewer. The only installed Python packages are `aiosmtpd` and `flask`; SQLite and `smtplib` are included with Python.

## Run it locally

Install Python 3.10 or newer, then open three terminals in this folder.

```sh
pip install -r requirements.txt
```

Terminal 1, start the catch-all SMTP listener:

```sh
python server.py
```

Terminal 2, start the inbox website:

```sh
python app.py
```

Terminal 3, send three test messages:

```sh
python test_send.py
```

Open <http://localhost:5000>. The messages go to `test@localhost`, `admin@localhost`, and `random123@localhost`. Since `handle_RCPT` accepts every recipient, none needs to be created first.

## Stored data

- SQLite database: `data/emails.db`
- Raw message files: `data/inbox/*.eml`
- SMTP listener: `0.0.0.0:1025`
- Inbox and JSON API: <http://localhost:5000>

The listener uses port 1025 so it can run without elevated privileges. For internet SMTP delivery, a server normally needs to accept port 25 and a domain's MX record must point to that server. The root Docker Compose file maps host port 25 to this listener. Local testing needs no domain, API key, or external mail service.

## HTTP routes

- `GET /` — show all messages; add `?to=test@localhost` to filter.
- `GET /inbox/<to_addr>` — show a recipient-specific inbox.
- `GET /api/emails` — all messages as JSON; add `?to=<recipient>` to filter.
- `GET /api/emails/<to_addr>` — messages for a recipient.
- `GET /api/emails/<id>` — one message including body and full raw source.

Messages are personal data. Keep the web port private or add authentication before exposing it to a network you do not trust.
