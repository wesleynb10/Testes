"""Vinculação de WhatsApp via POST /api/auth/phone (Mongo em memória)."""
from __future__ import annotations

import os

os.environ.setdefault("USE_MOCK_DB", "1")
os.environ.setdefault("JWT_SECRET", "test-secret-phone")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "finpremium_test_phone")
os.environ.setdefault("ADMIN_EMAIL", "admin@test.local")
os.environ.setdefault("ADMIN_PASSWORD", "AdminTest123!")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("REQUIRE_CPF_ON_REGISTER", "false")
os.environ.setdefault("FRONTEND_URL", "http://127.0.0.1:3000")

from fastapi.testclient import TestClient

from server import app


client = TestClient(app)


def _register(email: str, phone: str | None = None):
    payload = {
        "name": "Tester",
        "email": email,
        "password": "SenhaForte1",
    }
    if phone:
        payload["phone"] = phone
    r = client.post("/api/auth/register", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


def test_set_phone_vincula_whatsapp():
    email = "phone.a@test.local"
    _register(email)
    r = client.post("/api/auth/phone", json={"phone": "+55 85 99850-1840"})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["phone"] == "+5585998501840"
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["phone"] == "+5585998501840"


def test_set_phone_conflito_com_outra_conta():
    _register("phone.b@test.local", phone="+5585999000001")
    client.post("/api/auth/logout")
    _register("phone.c@test.local")
    r = client.post("/api/auth/phone", json={"phone": "+5585999000001"})
    assert r.status_code == 409


def test_set_phone_invalido():
    _register("phone.d@test.local")
    r = client.post("/api/auth/phone", json={"phone": "123"})
    assert r.status_code == 400
