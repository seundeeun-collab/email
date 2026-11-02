"""Send local SMTP messages to demonstrate catch-all acceptance."""

import argparse
from email.message import EmailMessage
import smtplib

MESSAGES = [
    ("test@localhost", "Catch-all test message", "This message checks test@localhost."),
    ("admin@localhost", "Virtual admin inbox", "This message checks admin@localhost."),
    ("random123@localhost", "Random address accepted", "This message checks random123@localhost."),
]


def main():
    parser = argparse.ArgumentParser(description="Send catch-all SMTP test emails.")
    parser.add_argument("--port", type=int, default=1025, help="SMTP port (default: 1025)")
    parser.add_argument("--to", dest="recipients", action="append", help="Recipient address; may be comma-separated or given multiple times")
    parser.add_argument("--subject", default=None, help="Use this subject for custom recipients")
    args = parser.parse_args()

    messages = MESSAGES
    if args.recipients:
        subject = args.subject or "Production Live Test"
        expanded = []
        for r in args.recipients:
            for part in r.split(","):
                part = part.strip()
                if part:
                    expanded.append(part)
        messages = [
            (recipient, subject, f"This receive-only inbox test was sent to {recipient}.")
            for recipient in expanded
        ]

    with smtplib.SMTP("localhost", args.port, timeout=10) as smtp:
        for recipient, subject, body in messages:
            message = EmailMessage()
            message["From"] = "sender@localhost"
            message["To"] = recipient
            message["Subject"] = subject
            message.set_content(body)
            smtp.send_message(message)
            print(f"Sent test message to {recipient} via localhost:{args.port}")


if __name__ == "__main__":
    main()
