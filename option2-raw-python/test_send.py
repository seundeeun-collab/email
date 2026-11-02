"""Send three local SMTP messages to demonstrate catch-all acceptance."""

import smtplib
from email.message import EmailMessage


MESSAGES = [
    ("test@localhost", "Catch-all test message", "This message checks test@localhost."),
    ("admin@localhost", "Virtual admin inbox", "This message checks admin@localhost."),
    ("random123@localhost", "Random address accepted", "This message checks random123@localhost."),
]


def main():
    with smtplib.SMTP("localhost", 1025, timeout=10) as smtp:
        for recipient, subject, body in MESSAGES:
            message = EmailMessage()
            message["From"] = "sender@localhost"
            message["To"] = recipient
            message["Subject"] = subject
            message.set_content(body)
            smtp.send_message(message)
            print(f"Sent test message to {recipient}")


if __name__ == "__main__":
    main()
