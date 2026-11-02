"""Unit tests for production SMTP handler: catch-all, spam rejection, size limit."""

import asyncio
import os
import sys
from pathlib import Path
import pytest

# Add option2-raw-python to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "option2-raw-python"))

from server import ProductionCatchAllHandler, validate_email_address


class DummyEnvelope:
    def __init__(self, content=b"", mail_from="", rcpt_tos=None):
        self.content = content
        self.mail_from = mail_from
        self.rcpt_tos = rcpt_tos or []


class DummySession:
    pass


class DummyServer:
    pass


def test_validate_email_address():
    assert validate_email_address("user@example.com") is True
    assert validate_email_address("<user.name+tag@domain.co.uk>") is True
    assert validate_email_address("admin@localhost") is True
    assert validate_email_address("") is False
    assert validate_email_address("not-an-email") is False
    assert validate_email_address(None) is False


def test_smtp_empty_from_rejected():
    handler = ProductionCatchAllHandler(max_size_mb=10, web_port=5000)
    envelope = DummyEnvelope()

    resp = asyncio.run(handler.handle_MAIL(DummyServer(), DummySession(), envelope, "", []))
    assert resp.startswith("550")


def test_smtp_invalid_from_rejected():
    handler = ProductionCatchAllHandler(max_size_mb=10, web_port=5000)
    envelope = DummyEnvelope()

    resp = asyncio.run(handler.handle_MAIL(DummyServer(), DummySession(), envelope, "invalid-sender", []))
    assert resp.startswith("501")


def test_smtp_valid_from_accepted():
    handler = ProductionCatchAllHandler(max_size_mb=10, web_port=5000)
    envelope = DummyEnvelope()

    resp = asyncio.run(handler.handle_MAIL(DummyServer(), DummySession(), envelope, "sender@example.com", []))
    assert resp == "250 OK"
    assert envelope.mail_from == "sender@example.com"


def test_smtp_catch_all_accepts_any_recipient():
    handler = ProductionCatchAllHandler(max_size_mb=10, web_port=5000)
    envelope = DummyEnvelope()

    for addr in ["custom@domain.com", "random_user_99@anything.org", "<test@sub.domain.net>"]:
        resp = asyncio.run(handler.handle_RCPT(DummyServer(), DummySession(), envelope, addr, []))
        assert resp == "250 OK"

    assert len(envelope.rcpt_tos) == 3


def test_smtp_size_limit_rejection():
    # 1MB limit for testing
    handler = ProductionCatchAllHandler(max_size_mb=1, web_port=5000)
    large_payload = b"X" * (2 * 1024 * 1024)  # 2MB
    envelope = DummyEnvelope(content=large_payload, mail_from="sender@example.com", rcpt_tos=["target@test.com"])

    resp = asyncio.run(handler.handle_DATA(DummyServer(), DummySession(), envelope))
    assert resp.startswith("552")
