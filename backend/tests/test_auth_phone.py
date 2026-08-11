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
    assert "já está vinculado" in r.json()["detail"]


def test_admin_reassume_whatsapp_e_migra_lancamentos():
    """Admin pode recuperar número preso em outra conta e herda txs WhatsApp."""
    import asyncio
    import uuid

    from server import db

    other = _register("phone.stuck@test.local", phone="+5585999000099")
    client.post("/api/auth/logout")
    claimer = _register("phone.admin.claim@test.local")
    tx_id = f"tx-wa-{uuid.uuid4().hex[:8]}"

    async def _seed():
        await db.users.update_one({"id": claimer["id"]}, {"$set": {"role": "admin"}})
        await db.transactions.insert_one(
            {
                "id": tx_id,
                "user_id": other["id"],
                "user_email": other["email"],
                "phone": "+5585999000099",
                "source": "whatsapp",
                "amount": 10.0,
                "description": "Teste",
                "category": "desejos",
            }
        )

    asyncio.run(_seed())
    # Refresh session user role via re-login
    client.post("/api/auth/logout")
    r = client.post(
        "/api/auth/login",
        json={"email": "phone.admin.claim@test.local", "password": "SenhaForte1"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"

    r = client.post("/api/auth/phone", json={"phone": "+5585999000099"})
    assert r.status_code == 200, r.text
    assert r.json()["phone"] == "+5585999000099"

    txs = client.get("/api/transactions")
    assert txs.status_code == 200
    items = txs.json().get("transactions") or []
    assert any(t.get("id") == tx_id and t.get("amount") == 10.0 for t in items)


def test_set_phone_invalido():
    _register("phone.d@test.local")
    r = client.post("/api/auth/phone", json={"phone": "123"})
    assert r.status_code == 400
