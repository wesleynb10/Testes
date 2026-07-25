"""Integração das rotas/orquestração de crédito (Mongo em memória + provider mock).

Não gasta crédito (provider=mock) e não depende de Stripe: exercita a geração do
relatório após pagamento, a idempotência e o controle de acesso por usuário.
"""
import asyncio
import os
from datetime import datetime, timedelta, timezone

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
        assert report["payload_normalizado"]["rating_bacen"] == "B"
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


def test_report_grava_expiracao_como_date_para_o_ttl():
    async def run():
        await _reset()
        await server.db.credit_orders.insert_one(_make_order())
        await server._generate_credit_report("order-1")

        order = await server.db.credit_orders.find_one({"id": "order-1"})
        report = await server.db.credit_reports.find_one({"id": order["report_id"]})
        # O índice TTL só age sobre BSON Date; a string ISO é só para a API.
        assert isinstance(report["expires_at_dt"], datetime)
        assert isinstance(report["expires_at"], str)
        # BSON não guarda timezone (driver devolve naive em UTC) e trunca em
        # milissegundos — daí o arredondamento em vez de comparar .days.
        criado = datetime.fromisoformat(report["created_at"]).replace(tzinfo=None)
        dias = (report["expires_at_dt"] - criado).total_seconds() / 86400
        assert round(dias) == server.CREDIT_REPORT_RETENTION_DAYS

    asyncio.run(run())


def test_get_report_410_quando_expirou():
    async def run():
        await _reset()
        await server.db.credit_orders.insert_one(_make_order())
        await server._generate_credit_report("order-1")
        order = await server.db.credit_orders.find_one({"id": "order-1"})

        # Simula o TTL do Mongo: o pedido segue "ready" e o relatório sumiu.
        await server.db.credit_reports.delete_many({"id": order["report_id"]})

        with pytest.raises(HTTPException) as exc:
            await server.get_credit_report("order-1", USER)
        # 410 (e não 404) para o front diferenciar expirado de erro.
        assert exc.value.status_code == 410
        assert "expirou" in exc.value.detail

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


def _iso_horas_atras(horas: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(hours=horas)).isoformat()


def test_purga_apaga_documento_de_pedido_abandonado():
    async def run():
        await _reset()
        antigo = _make_order("velho", status="pending")
        antigo["created_at"] = _iso_horas_atras(server.CREDIT_ORDER_DOC_TTL_HOURS + 1)
        await server.db.credit_orders.insert_one(antigo)

        assert await server.purge_abandoned_credit_documents() == 1

        order = await server.db.credit_orders.find_one({"id": "velho"})
        assert "documento_enc" not in order
        assert order["documento_purgado_em"]
        # Status intacto: mexer nele quebraria um pagamento atrasado.
        assert order["status"] == "pending"
        # Trilha de auditoria preservada.
        assert order["documento_hash"] and order["documento_masked"]

    asyncio.run(run())


def test_purga_preserva_pedido_recente_e_pedido_pago():
    async def run():
        await _reset()
        recente = _make_order("recente", status="pending")
        recente["created_at"] = _iso_horas_atras(1)
        pago_antigo = _make_order("pago", status="paid")
        pago_antigo["created_at"] = _iso_horas_atras(server.CREDIT_ORDER_DOC_TTL_HOURS + 10)
        await server.db.credit_orders.insert_many([recente, pago_antigo])

        assert await server.purge_abandoned_credit_documents() == 0

        for oid in ("recente", "pago"):
            order = await server.db.credit_orders.find_one({"id": oid})
            assert order["documento_enc"], f"{oid} não deveria ter sido purgado"

    asyncio.run(run())


def test_pagamento_apos_purga_falha_com_erro_explicito():
    async def run():
        await _reset()
        order = _make_order("tardio", status="pending")
        order["created_at"] = _iso_horas_atras(server.CREDIT_ORDER_DOC_TTL_HOURS + 1)
        await server.db.credit_orders.insert_one(order)
        await server.purge_abandoned_credit_documents()

        # Pagamento chega depois da purga: não pode gerar relatório silenciosamente.
        await server._process_credit_session("cs_test_1", paid=True)

        atualizado = await server.db.credit_orders.find_one({"id": "tardio"})
        assert atualizado["status"] == "error"
        assert "expirou" in atualizado["error"]
        assert await server.db.credit_reports.count_documents({"order_id": "tardio"}) == 0

    asyncio.run(run())


def test_credit_price_route_reflects_env():
    async def run():
        result = await server.get_credit_price()
        assert result["currency"] == "brl"
        assert result["price"] == server.CREDIT_REPORT_PRICE_BRL

    asyncio.run(run())
