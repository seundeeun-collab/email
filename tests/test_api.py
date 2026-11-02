"""API and authentication test suite."""

import os
import sys
from pathlib import Path
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "option2-raw-python"))

# Configure test env
os.environ["ADMIN_PASSWORD"] = "testadmin123"
os.environ["API_KEY"] = "testapikey999"

import app as web_app
from db import initialize_database, insert_email


@pytest.fixture
def client():
    web_app.app.config["TESTING"] = True
    initialize_database()
    with web_app.app.test_client() as client:
        yield client


def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "healthy"
    assert data["db"] == "ok"
    assert "inbox_count" in data


def test_api_emails_requires_key_when_configured(client):
    # Without X-API-Key should return 401
    res = client.get("/api/emails")
    assert res.status_code == 401

    # With invalid key should return 401
    res = client.get("/api/emails", headers={"X-API-Key": "wrong-key"})
    assert res.status_code == 401

    # With valid key should return 200
    res = client.get("/api/emails", headers={"X-API-Key": "testapikey999"})
    assert res.status_code == 200
    assert isinstance(res.get_json(), list)


def test_web_login_flow(client):
    # Root redirects to login when ADMIN_PASSWORD is set and not logged in
    res = client.get("/")
    assert res.status_code == 302
    assert "/login" in res.headers["Location"]

    # Wrong password fails
    res = client.post("/login", data={"password": "wrongpassword"})
    assert b"Invalid administrator password" in res.data

    # Correct password logs in and redirects
    res = client.post("/login", data={"password": "testadmin123"}, follow_redirects=True)
    assert res.status_code == 200
    assert b"Virtual Email Server" in res.data


def test_api_stats(client):
    res = client.get("/api/stats", headers={"X-API-Key": "testapikey999"})
    assert res.status_code == 200
    data = res.get_json()
    assert "total" in data
    assert "today" in data
    assert "top_recipients" in data

def test_api_inbound_cloudflare_webhook(client):
    payload = {
        "from": "cf-sender@example.com",
        "to": "cf-test@domain.com",
        "subject": "Cloudflare Test Message",
        "raw": "From: cf-sender@example.com\r\nTo: cf-test@domain.com\r\nSubject: Cloudflare Test Message\r\n\r\nTest body payload.",
        "created_at": "2026-11-02T22:10:00Z"
    }
    resp = client.post("/api/inbound", json=payload)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["status"] == "received"
    assert data["to"] == "cf-test@domain.com"
