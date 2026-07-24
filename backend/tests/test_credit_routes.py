"""Integração das rotas/orquestração de crédito (Mongo em memória + provider mock).

Não gasta crédito (provider=mock) e não depende de Stripe: exercita a geração do
relatório após pagamento, a idempotência e o controle de acesso por usuário.
"""
import asyncio
import os

import pytest

os.environ.setdefault("USE_MOCK_DB", "1")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_credit")
os.environ.setdefault("CREDIT_PROVIDER", "mock")
os.environ.setdefault("JWT_SECRET", "unit-test-secret")

import server  # noqa: E402
from credit_provider import encrypt_documento, hash_documento, mask_documento  # noqa: E402
from fastapi import HTTPException  # noqa: E402

CPF = "52998224725"
USER = {"id": "user-1", "email": "user@example.com"}


def _make_order(order_id="order-1", status="paid", user_id="user-1"):
    now = "2026-07-24T00:00:00+00:00"
    return {
        "id": order_id,
        "user_id": user_id,
        "documento_masked": mask_documento(CPF),
        "documento_hash": hash_documento(CPF),
        "documento_enc": encrypt_documento(CPF),
        "tipo": "pf",
        "amount": 39.90,
        "currency": "brl",
        "payment": {"provider": "stripe", "session_id": "cs_test_1", "status": "paid"},
        "status": status,
        "report_id": None,
        "error": None,
        "created_at": now,
        "updated_at": now,
    }


async def _reset():
    await server.db.credit_orders.delete_many({})
    await server.db.credit_reports.delete_many({})


def test_generate_report_after_payment_and_scrub_documento():
    async def run():
        await _reset()
        await server.db.credit_orders.insert_one(_make_order())
        await server._generate_credit_report("order-1")

        order = await server.db.credit_orders.find_one({"id": "order-1"})
        assert order["status"] == "ready"
        assert order["report_id"]
        # Documento cifrado é apagado após gerar o relatório (LGPD).
        assert "documento_enc" not in order or order.get("documento_enc") in (None, "")

        report = await server.db.credit_reports.find_one({"id": order["report_id"]})
        assert report["payload_normalizado"]["score"] == 742
        assert report["payload_normalizado"]["rating_bacen"] == "C"
        assert report["expires_at"]

    asyncio.run(run())


def test_generate_report_is_idempotent():
    async def run():
        await _reset()
        await server.db.credit_orders.insert_one(_make_order())
        await server._generate_credit_report("order-1")
        await server._generate_credit_report("order-1")  # segunda vez não recria
        count = await server.db.credit_reports.count_documents({"order_id": "order-1"})
        assert count == 1

    asyncio.run(run())


def test_get_report_requires_ownership():
    async def run():
        await _reset()
        await server.db.credit_orders.insert_one(_make_order())
        await server._generate_credit_report("order-1")

        # Dono correto consegue ler.
        result = await server.get_credit_report("order-1", USER)
        assert result["report"]["score"] == 742

        # Outro usuário recebe 404.
        with pytest.raises(HTTPException) as exc:
            await server.get_credit_report("order-1", {"id": "outro", "email": "x@x.com"})
        assert exc.value.status_code == 404

    asyncio.run(run())


def test_get_report_conflict_when_not_ready():
    async def run():
        await _reset()
        await server.db.credit_orders.insert_one(_make_order(status="pending"))
        with pytest.raises(HTTPException) as exc:
            await server.get_credit_report("order-1", USER)
        assert exc.value.status_code == 409

    asyncio.run(run())


def test_process_credit_session_triggers_generation():
    async def run():
        await _reset()
        await server.db.credit_orders.insert_one(_make_order(status="pending"))
        await server._process_credit_session("cs_test_1", paid=True)
        order = await server.db.credit_orders.find_one({"id": "order-1"})
        assert order["status"] == "ready"
        assert order["report_id"]

    asyncio.run(run())


def test_credit_price_route_reflects_env():
    async def run():
        result = await server.get_credit_price()
        assert result["currency"] == "brl"
        assert result["price"] == server.CREDIT_REPORT_PRICE_BRL

    asyncio.run(run())
