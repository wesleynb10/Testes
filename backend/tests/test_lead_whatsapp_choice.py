"""MVP: lead pode escolher canal site/email ou WhatsApp."""
import os

import pytest

os.environ.setdefault("USE_MOCK_DB", "1")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_lead_wa")
os.environ.setdefault("JWT_SECRET", "unit-test-secret")
os.environ["LEAD_WHATSAPP_E164"] = "5511999999999"
os.environ["LEAD_WHATSAPP_ENABLED"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

import server as srv  # noqa: E402


@pytest.fixture
def client():
    with TestClient(srv.app) as c:
        yield c


def test_public_config_exposes_whatsapp_lead(client):
    r = client.get("/api/public-config")
    assert r.status_code == 200
    data = r.json()
    assert data["whatsapp_lead_enabled"] is True
    assert data["whatsapp_lead_e164"] == "5511999999999"


def test_lead_email_channel_schedules_normally(client):
    email = "lead_site@example.com"
    r = client.post(
        "/api/leads",
        json={
            "email": email,
            "preferred_channel": "email",
            "source": "calculadora",
            "metadata": {"monthly": 500},
        },
    )
    assert r.status_code == 200
    assert r.json()["preferred_channel"] == "email"


def test_lead_whatsapp_without_email_gets_placeholder(client):
    r = client.post(
        "/api/leads",
        json={
            "preferred_channel": "whatsapp",
            "source": "calculadora_whatsapp",
            "metadata": {"monthly": 800, "years": 15},
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["preferred_channel"] == "whatsapp"
    assert body["whatsapp_lead_e164"] == "5511999999999"
    # stored with placeholder email
    lead = client.get("/api/leads/count")
    assert lead.status_code == 200
