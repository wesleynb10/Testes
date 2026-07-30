"""E2E da integração Direct Data com credenciais reais do backend/.env.

Camadas:
  1) Smoke ao vivo — autentica o token em cada endpoint (CPF inválido de
     propósito; não deve consumir crédito).
  2) Fluxo completo pedido→relatório→leitura com CREDIT_PROVIDER=directdata
     e HTTP fake espelhando o schema real (não gasta crédito).

Rode:
    pytest tests/test_directdata_e2e.py -q
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path

import httpx
import pytest
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

# Ambiente de teste isolado — setdefault NÃO sobrescreve DIRECTD_* do .env.
os.environ.setdefault("USE_MOCK_DB", "1")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_directdata_e2e")
os.environ.setdefault("JWT_SECRET", "e2e-directdata-secret")
os.environ.setdefault("CREDIT_PROVIDER", "directdata")

import credit_provider as cp  # noqa: E402
import server  # noqa: E402
from credit_provider import (  # noqa: E402
    encrypt_documento,
    hash_documento,
    mask_documento,
)

CPF_INVALIDO = "00000000000"
CPF_VALIDO = "52998224725"
USER = {"id": "e2e-user", "email": "e2e@example.com"}

ENDPOINTS = (
    ("score", cp.ENDPOINT_SCORE),
    ("scr", cp.ENDPOINT_SCR),
    ("pendencias", cp.ENDPOINT_PENDENCIAS),
    ("divida_ativa", cp.ENDPOINT_DIVIDA_ATIVA),
)


def _require_live_token():
    token = (os.environ.get("DIRECTD_TOKEN") or "").strip()
    if not token or token.startswith("xxxxx"):
        pytest.skip("DIRECTD_TOKEN real não configurado no backend/.env")
    return token


# ───────────────────────── 1) Smoke ao vivo ─────────────────────────


def test_live_token_autentica_em_todos_os_endpoints():
    """Token do .env autentica nos 4 endpoints; doc inválido → 4xx de negócio, não auth."""
    token = _require_live_token()
    base = (os.environ.get("DIRECTD_BASE_URL") or cp.DEFAULT_BASE_URL).rstrip("/")
    timeout = float(os.environ.get("DIRECTD_TIMEOUT") or cp.DEFAULT_TIMEOUT)

    async def run():
        async with httpx.AsyncClient(timeout=timeout) as client:
            for nome, endpoint in ENDPOINTS:
                params = {"CPF": CPF_INVALIDO, "Token": token}
                if endpoint == cp.ENDPOINT_SCR:
                    params.update(cp._scr_mesano_param())
                resp = await client.get(f"{base}{endpoint}", params=params)
                assert resp.status_code not in (401, 403), (
                    f"{nome}: token/IP rejeitado (HTTP {resp.status_code})"
                )
                assert resp.status_code != 402, f"{nome}: conta sem saldo"
                assert resp.status_code != 404, f"{nome}: endpoint não encontrado"
                assert resp.status_code != 405, f"{nome}: método não permitido"
                try:
                    payload = resp.json()
                except ValueError as exc:
                    raise AssertionError(
                        f"{nome}: resposta não-JSON ({resp.status_code})"
                    ) from exc
                meta = payload.get("metaDados") or payload.get("MetaDados") or {}
                assert resp.status_code < 500, (
                    f"{nome}: erro de servidor {resp.status_code} — {meta}"
                )

    asyncio.run(run())


def test_live_probe_script_equivale_a_sucesso():
    """Espelha `scripts/validar_directdata.py --probe` com as credenciais do .env."""
    token = _require_live_token()
    base = (os.environ.get("DIRECTD_BASE_URL") or cp.DEFAULT_BASE_URL).rstrip("/")

    async def run():
        async with httpx.AsyncClient(timeout=45) as client:
            return await client.get(
                f"{base}{cp.ENDPOINT_SCORE}",
                params={"CPF": CPF_INVALIDO, "Token": token},
            )

    resp = asyncio.run(run())
    assert resp.status_code not in (401, 402, 403)
    body = resp.json()
    meta = body.get("metaDados") or {}
    mensagem = str(meta.get("mensagem") or meta.get("Mensagem") or "")
    assert resp.status_code == 400 or "inválid" in mensagem.lower() or "invalid" in mensagem.lower()


# ───────────────────────── 2) Fluxo E2E orquestrado ─────────────────────────


class _FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, routes, calls):
        self._routes = routes
        self._calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def get(self, url, params=None):
        self._calls.append((url, dict(params or {})))
        for fragment, response in self._routes.items():
            if fragment in url:
                if isinstance(response, Exception):
                    raise response
                return response
        return _FakeResponse({}, status=404)


def _install_fake(monkeypatch, routes, calls):
    monkeypatch.setattr(
        cp.httpx, "AsyncClient", lambda **_: _FakeClient(routes, calls)
    )


def _routes_reais():
    """Payloads no schema real validado em produção (docs/integracao-direct-data.md)."""
    return {
        "/api/Score": _FakeResponse({
            "metaDados": {"mensagem": "Sucesso", "custoTotalEmCreditos": 1.98},
            "retorno": {
                "pessoaFisica": {
                    "score": 742,
                    "faixaScore": "Baixo",
                    "motivos": ["Bom histórico de pagamento"],
                }
            },
        }),
        "/api/SCRBacenDetalhada": _FakeResponse({
            "metaDados": {
                "mensagem": "Sucesso",
                "custoTotalEmCreditos": 4.90,
                "urlComprovante": "https://example.test/comprovante.pdf",
            },
            "retorno": {
                "score": "680",
                "faixaRisco": "Risco Baixo",
                "quantidadeInstituicoes": 3,
                "quantidadeOperacoes": 5,
                "riscoTotal": "15000.00",
                "carteiraCredito": {
                    "total": "25000.00",
                    "limite": "10000.00",
                    "prejuizo": "0",
                    "vencer": "14000.00",
                    "vencido": "1000.00",
                },
                "modalidades": [
                    {
                        "codigoModalidade": "0203",
                        "descricaoModalidade": "Cartão de crédito",
                        "aVencer": {"total": "8000.00"},
                        "vencido": {"total": "0"},
                        "prejuizo": {"total": "0"},
                    }
                ],
            },
        }),
        "/api/DetalhamentoNegativo": _FakeResponse({
            "metaDados": {"mensagem": "Sucesso", "custoTotalEmCreditos": 2.38},
            "retorno": {
                "pessoaFisica": {
                    "pendenciaFinanceira": {
                        "status": "Não Consta Pendência",
                        "totalPendencia": 0,
                        "protestos": [],
                        "acoesJudiciais": [],
                        "recuperacoesJudiciaisFalencia": [],
                        "chequesSemFundo": [],
                    }
                }
            },
        }),
        "/api/PGFNListaDevedoresUniao": _FakeResponse({
            "metaDados": {"mensagem": "Sucesso", "custoTotalEmCreditos": 0.36},
            "retorno": {"possuiDivida": False, "dividas": []},
        }),
    }


async def _reset():
    await server.db.credit_orders.delete_many({})
    await server.db.credit_reports.delete_many({})
    await server.db.users.delete_many({"id": USER["id"]})


def _make_order(order_id="e2e-order-1"):
    now = "2026-07-28T12:00:00+00:00"
    return {
        "id": order_id,
        "user_id": USER["id"],
        "documento_masked": mask_documento(CPF_VALIDO),
        "documento_hash": hash_documento(CPF_VALIDO),
        "documento_enc": encrypt_documento(CPF_VALIDO),
        "tipo": "pf",
        "apis": list(cp.CREDIT_API_KEYS),
        "amount": 39.90,
        "currency": "brl",
        "payment": {"provider": "stripe", "session_id": "cs_e2e", "status": "paid"},
        "status": "paid",
        "report_id": None,
        "error": None,
        "created_at": now,
        "updated_at": now,
    }


def test_e2e_pedido_pago_gera_relatorio_com_provider_directdata(monkeypatch):
    """Pedido pago → geração → leitura, com provider=directdata e token do .env."""
    token = _require_live_token()
    monkeypatch.setenv("CREDIT_PROVIDER", "directdata")
    monkeypatch.setenv("DIRECTD_TOKEN", token)
    monkeypatch.setenv("DIRECTD_PENDENCIAS_ENABLED", "true")
    monkeypatch.setenv("DIRECTD_DIVIDA_ATIVA_ENABLED", "true")

    calls = []
    _install_fake(monkeypatch, _routes_reais(), calls)

    async def run():
        await _reset()
        await server.db.credit_orders.insert_one(_make_order())
        await server._generate_credit_report("e2e-order-1")

        order = await server.db.credit_orders.find_one({"id": "e2e-order-1"})
        assert order["status"] == "ready", order.get("error")
        assert order["report_id"]
        assert not order.get("documento_enc")  # scrub LGPD

        result = await server.get_credit_report("e2e-order-1", USER)
        report = result["report"]
        assert report["score"] == 742
        assert report["score_faixa"] == "baixo"
        assert report["rating_bacen"] == "A"  # faixa "Risco Baixo"
        assert report["tem_pendencias"] is False
        assert report.get("divida_ativa", {}).get("possui_divida") is False
        assert "renda" not in report
        assert result.get("comprovante_url") == "https://example.test/comprovante.pdf"

        assert len(calls) == 4
        assert all(c[1].get("Token") == token for c in calls)
        assert all(c[1].get("CPF") == CPF_VALIDO for c in calls)
        joined = " ".join(url for url, _ in calls)
        assert cp.ENDPOINT_SCORE in joined
        assert cp.ENDPOINT_SCR in joined
        assert cp.ENDPOINT_PENDENCIAS in joined
        assert cp.ENDPOINT_DIVIDA_ATIVA in joined
        assert "CadastroPessoaFisica" not in joined

    asyncio.run(run())


def test_e2e_sem_token_falha_com_erro_explicito(monkeypatch):
    monkeypatch.setenv("CREDIT_PROVIDER", "directdata")
    monkeypatch.setenv("DIRECTD_TOKEN", "")

    async def run():
        await _reset()
        await server.db.credit_orders.insert_one(_make_order("e2e-order-notoken"))
        await server._generate_credit_report("e2e-order-notoken")
        order = await server.db.credit_orders.find_one({"id": "e2e-order-notoken"})
        assert order["status"] == "error"
        err = (order.get("error") or "").lower()
        assert "token" in err or "crédito" in err or "credito" in err

    asyncio.run(run())


def test_e2e_env_flags_opcionais_respeitadas(monkeypatch):
    token = _require_live_token()
    monkeypatch.setenv("CREDIT_PROVIDER", "directdata")
    monkeypatch.setenv("DIRECTD_TOKEN", token)
    monkeypatch.setenv("DIRECTD_PENDENCIAS_ENABLED", "false")
    monkeypatch.setenv("DIRECTD_DIVIDA_ATIVA_ENABLED", "true")

    calls = []
    _install_fake(monkeypatch, _routes_reais(), calls)

    async def run():
        await _reset()
        order = _make_order("e2e-order-flags")
        order["apis"] = ["score", "scr", "divida_ativa"]
        await server.db.credit_orders.insert_one(order)
        await server._generate_credit_report("e2e-order-flags")
        saved = await server.db.credit_orders.find_one({"id": "e2e-order-flags"})
        assert saved["status"] == "ready", saved.get("error")
        joined = " ".join(url for url, _ in calls)
        assert cp.ENDPOINT_PENDENCIAS not in joined
        assert cp.ENDPOINT_DIVIDA_ATIVA in joined

    asyncio.run(run())
