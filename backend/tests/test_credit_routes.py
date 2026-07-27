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
from credit_provider import (  # noqa: E402
    decrypt_documento,
    encrypt_documento,
    hash_documento,
    mask_documento,
)
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
        await server.db.users.delete_many({})
        await server.db.users.insert_one({
            "id": "user-1", "email": "user@example.com", "credit_reports_remaining": 2,
        })
        result = await server.get_credit_price(USER)
        assert result["currency"] == "brl"
        assert result["price"] == server.CREDIT_REPORT_PRICE_BRL
        assert result["credit_reports_remaining"] == 2
        assert len(result["apis"]) == 4
        assert result["apis"][0]["id"] == "score" and result["apis"][0]["required"] is True

    asyncio.run(run())


def test_attach_cpf_set_once_e_unico_por_conta():
    async def run():
        await server.db.users.delete_many({})
        await server.db.users.insert_one({"id": "u1", "email": "a@x.com", "name": "A"})
        await server.db.users.insert_one({"id": "u2", "email": "b@x.com", "name": "B"})

        user = await server._attach_cpf_to_user("u1", CPF)
        assert user["cpf_masked"] == mask_documento(CPF)
        assert user["cpf_hash"] == hash_documento(CPF)
        assert user["cpf_enc"]

        # Set-once: segunda tentativa na mesma conta falha.
        with pytest.raises(HTTPException) as exc:
            await server._attach_cpf_to_user("u1", "39053344705")
        assert exc.value.status_code == 409

        # Mesmo CPF em outra conta também falha.
        with pytest.raises(HTTPException) as exc2:
            await server._attach_cpf_to_user("u2", CPF)
        assert exc2.value.status_code == 409

        # CNPJ rejeitado.
        with pytest.raises(HTTPException) as exc3:
            await server._attach_cpf_to_user("u2", "11222333000181")
        assert exc3.value.status_code == 400

    asyncio.run(run())


def test_checkout_usa_apenas_cpf_da_conta(monkeypatch):
    """Documento do body é ignorado; a ordem grava o CPF cadastrado."""

    class _FakeSession:
        session_id = "cs_bound"
        url = "https://stripe.test/cs_bound"

    class _FakeStripe:
        def __init__(self, *a, **k):
            pass

        async def create_checkout_session(self, req):
            return _FakeSession()

    class _FakeRequest:
        base_url = "http://test/"
        headers = {"User-Agent": "pytest"}

        class client:
            host = "127.0.0.1"

    async def run():
        await server.db.users.delete_many({})
        await server.db.credit_orders.delete_many({})
        await server.db.users.insert_one({
            "id": "user-1",
            "email": "user@example.com",
            "cpf_enc": encrypt_documento(CPF),
            "cpf_hash": hash_documento(CPF),
            "cpf_masked": mask_documento(CPF),
        })
        monkeypatch.setattr(server, "STRIPE_API_KEY", "sk_test_x")
        monkeypatch.setattr(server, "StripeCheckout", _FakeStripe)

        # Body tenta passar OUTRO CPF — deve ser rejeitado (não sobrescrito).
        payload = server.CreditCheckoutRequest(
            origin_url="http://localhost:3000",
            consent=True,
            documento="39053344705",
        )
        with pytest.raises(HTTPException) as exc:
            await server.create_credit_checkout(payload, _FakeRequest(), USER)
        assert exc.value.status_code == 403

        # Sem documento no body: usa o CPF da conta + APIs escolhidas.
        payload_ok = server.CreditCheckoutRequest(
            origin_url="http://localhost:3000",
            consent=True,
            apis=["score", "scr"],
        )
        result = await server.create_credit_checkout(payload_ok, _FakeRequest(), USER)
        order = await server.db.credit_orders.find_one({"id": result["order_id"]})
        assert order["documento_hash"] == hash_documento(CPF)
        assert order["documento_masked"] == mask_documento(CPF)
        assert order["tipo"] == "pf"
        assert order["apis"] == ["score", "scr"]
        assert decrypt_documento(order["documento_enc"]) == CPF
        assert result["payment"] == "stripe"

    asyncio.run(run())


def test_checkout_incluso_no_plano_pula_stripe(monkeypatch):
    class _FakeRequest:
        base_url = "http://test/"
        headers = {"User-Agent": "pytest"}

        class client:
            host = "127.0.0.1"

    async def run():
        await server.db.users.delete_many({})
        await server.db.credit_orders.delete_many({})
        await server.db.credit_reports.delete_many({})
        await server.db.users.insert_one({
            "id": "user-1",
            "email": "user@example.com",
            "cpf_enc": encrypt_documento(CPF),
            "cpf_hash": hash_documento(CPF),
            "cpf_masked": mask_documento(CPF),
            "credit_reports_remaining": 2,
        })
        monkeypatch.setenv("CREDIT_PROVIDER", "mock")

        payload = server.CreditCheckoutRequest(
            origin_url="http://localhost:3000",
            consent=True,
            apis=["score"],
        )
        result = await server.create_credit_checkout(payload, _FakeRequest(), USER)
        assert result["payment"] == "included"
        assert result["amount"] == 0.0

        user = await server.db.users.find_one({"id": "user-1"})
        assert user["credit_reports_remaining"] == 1

        order = await server.db.credit_orders.find_one({"id": result["order_id"]})
        assert order["status"] == "ready"
        assert order["payment"]["provider"] == "entitlement"
        assert order["apis"] == ["score"]

    asyncio.run(run())


def test_plano_concede_consultas_e_resgasta_no_registro():
    async def run():
        await server.db.users.delete_many({})
        await server.db.credit_entitlements.delete_many({})

        # Compra antes do cadastro → entitlement pendente por email.
        await server._grant_credit_reports(
            "novo@example.com", 3, package_id="complete", session_id="cs_x",
        )
        pending = await server.db.credit_entitlements.find_one({"email": "novo@example.com"})
        assert pending["reports_remaining"] == 3

        await server.db.users.insert_one({
            "id": "u-novo", "email": "novo@example.com", "credit_reports_remaining": 0,
        })
        claimed = await server._claim_pending_credit_entitlements("u-novo", "novo@example.com")
        assert claimed == 3
        user = await server.db.users.find_one({"id": "u-novo"})
        assert user["credit_reports_remaining"] == 3
        assert await server.db.credit_entitlements.find_one({"email": "novo@example.com"}) is None

    asyncio.run(run())


def test_checkout_exige_cpf_cadastrado(monkeypatch):
    class _FakeRequest:
        base_url = "http://test/"
        headers = {}

        class client:
            host = "127.0.0.1"

    async def run():
        await server.db.users.delete_many({})
        await server.db.users.insert_one({"id": "user-1", "email": "user@example.com"})
        monkeypatch.setattr(server, "STRIPE_API_KEY", "sk_test_x")
        payload = server.CreditCheckoutRequest(
            origin_url="http://localhost:3000", consent=True,
        )
        with pytest.raises(HTTPException) as exc:
            await server.create_credit_checkout(payload, _FakeRequest(), USER)
        assert exc.value.status_code == 400
        assert "Cadastre o seu CPF" in exc.value.detail

    asyncio.run(run())


def test_list_credit_orders_and_legacy_import():
    async def run():
        await _reset()
        await server.db.financial_states.delete_many({"user_id": USER["id"]})
        await server.db.credit_orders.insert_one(_make_order())
        await server._generate_credit_report("order-1")

        # Simula relatório legado (sem modalidades) como o da conta real.
        order = await server.db.credit_orders.find_one({"id": "order-1"})
        report = await server.db.credit_reports.find_one({"id": order["report_id"]})
        payload = report["payload_normalizado"]
        payload["scr"] = {
            "divida_atual": 86984.0,
            "faixa_risco": "Risco Baixo",
            "score": 575,
            "quantidade_instituicoes": 7,
            "quantidade_operacoes": 45,
            "carteira": {
                "vencer": 86984.0, "vencido": 0.0, "prejuizo": 0.0, "limite": 23150.0,
            },
            "modalidades": [],
        }
        payload.pop("rating_explicacao", None)
        await server.db.credit_reports.update_one(
            {"id": order["report_id"]}, {"$set": {"payload_normalizado": payload}}
        )

        listed = await server.list_credit_orders(USER)
        assert len(listed["orders"]) >= 1
        assert listed["orders"][0]["order_id"] == "order-1"
        assert listed["orders"][0]["report"]["available"] is True

        fetched = await server.get_credit_report("order-1", USER)
        assert fetched["report"]["scr"]["legado_consolidado"] is True
        assert fetched["report"]["scr"]["modalidades"][0]["codigo"] == "SCR-TOTAL"
        assert fetched["report"]["rating_explicacao"]["letra"]

        imported = await server.import_credit_report_to_plan(
            "order-1", server.CreditImportRequest(), USER
        )
        assert imported["ok"] is True
        assert imported["imported"] == 1
        assert imported["creditInsight"]["divida_atual"] == 86984.0

    asyncio.run(run())


def test_import_scr_to_plan_upsert_idempotent():
    async def run():
        await _reset()
        await server.db.financial_states.delete_many({"user_id": USER["id"]})
        await server.db.credit_orders.insert_one(_make_order())
        await server._generate_credit_report("order-1")

        report_before = await server.get_credit_report("order-1", USER)
        modalidades = report_before["report"]["scr"]["modalidades"]
        assert len(modalidades) >= 1
        assert report_before["report"]["scr"].get("curva_vencimentos")

        first = await server.import_credit_report_to_plan(
            "order-1",
            server.CreditImportRequest(modalidades=None),
            USER,
        )
        assert first["ok"] is True
        assert first["imported"] >= 1
        scr_debts = [d for d in first["state"]["debts"] if d.get("source") == "scr"]
        assert len(scr_debts) == first["imported"]
        assert first["state"]["profile"]["primaryGoal"] == "sair_dividas"
        assert first["state"]["profile"]["firstWeekChecklist"]["goalDebt"] is True
        assert first["creditInsight"]["curva_vencimentos"]

        # Reimporta com override de taxa — não duplica.
        codigo = scr_debts[0]["scrCodigo"]
        second = await server.import_credit_report_to_plan(
            "order-1",
            server.CreditImportRequest(
                modalidades=[
                    server.CreditImportModality(
                        codigo=codigo, rate=2.5, minPayment=200, termMonths=12
                    )
                ]
            ),
            USER,
        )
        scr_after = [d for d in second["state"]["debts"] if d.get("source") == "scr"]
        assert len(scr_after) == 1
        assert scr_after[0]["scrCodigo"] == codigo
        assert scr_after[0]["rate"] == 2.5
        assert scr_after[0]["minPayment"] == 200
        assert scr_after[0]["termMonths"] == 12
        assert scr_after[0]["id"] == scr_debts[0]["id"]

        # Outro usuário não acessa.
        with pytest.raises(HTTPException) as exc:
            await server.import_credit_report_to_plan(
                "order-1",
                server.CreditImportRequest(),
                {"id": "outro", "email": "x@x.com"},
            )
        assert exc.value.status_code == 404

    asyncio.run(run())
