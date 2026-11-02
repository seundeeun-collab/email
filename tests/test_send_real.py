"""Integration test: sends 10 emails to arbitrary addresses and verifies API/DB reception."""

from email.message import EmailMessage
import os
from pathlib import Path
import smtplib
import sys
import time
import uuid

import pytest
from aiosmtpd.controller import Controller

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "option2-raw-python"))

from db import initialize_database, rows_for
from server import ProductionCatchAllHandler
import app as web_app

TEST_SMTP_PORT = 10225


@pytest.fixture(scope="module")
def running_smtp_server():
    initialize_database()
    handler = ProductionCatchAllHandler(max_size_mb=10, web_port=5000)
    controller = Controller(handler, hostname="127.0.0.1", port=TEST_SMTP_PORT)
    controller.start()
    time.sleep(0.5)
    yield controller
    controller.stop()


def test_send_ten_emails_and_verify_reception(running_smtp_server):
    unique_run_id = uuid.uuid4().hex[:6]
    test_addresses = [
        f"testuser_{i}_{unique_run_id}@production-test.org"
        for i in range(1, 11)
    ]

    with smtplib.SMTP("127.0.0.1", TEST_SMTP_PORT, timeout=5) as smtp:
        for idx, recipient in enumerate(test_addresses, 1):
            msg = EmailMessage()
            msg["From"] = f"automated-tester-{unique_run_id}@localhost"
            msg["To"] = recipient
            msg["Subject"] = f"Integration Test Message #{idx} - {unique_run_id}"
            msg.set_content(f"This is automated test payload {idx} delivered to {recipient}.")
            smtp.send_message(msg)

    # Allow write to complete
    time.sleep(0.5)

    # Verify each recipient was captured in the store
    for recipient in test_addresses:
        matched = rows_for(recipient=recipient)
        assert len(matched) >= 1, f"Expected to find email for {recipient}"
        assert recipient in matched[0]["to_addr"]
        assert unique_run_id in matched[0]["subject"]
