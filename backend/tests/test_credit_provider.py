"""Testes do provider de crédito (fixtures — sem gastar crédito na Direct Data)."""
import asyncio

import pytest

import credit_provider
from credit_provider import (
    CreditProviderError,
    classify_score_faixa,
    decrypt_documento,
    derive_rating_bacen,
    encrypt_documento,
    gerar_relatorio,
    hash_documento,
    mask_documento,
    parse_pendencias,
    parse_score,
    parse_scr,
    valida_documento,
)

# CPFs/CNPJs de teste com dígitos verificadores válidos.
CPF_VALIDO = "529.982.247-25"
CNPJ_VALIDO = "11.222.333/0001-81"


# --------------------------- Validação / máscara ---------------------------
def test_valida_cpf_valido_retorna_pf():
    assert valida_documento(CPF_VALIDO) == "pf"


def test_valida_cnpj_valido_retorna_pj():
    assert valida_documento(CNPJ_VALIDO) == "pj"


@pytest.mark.parametrize("doc", ["11111111111", "123.456.789-00", "12345", "00000000000000"])
def test_valida_documento_invalido_levanta(doc):
    with pytest.raises(CreditProviderError):
        valida_documento(doc)


def test_mask_documento_cpf_e_cnpj():
    assert mask_documento("52998224725") == "***.***.**7-25"
    assert mask_documento("11222333000181").startswith("**.***.***/")


def test_hash_documento_estavel_e_ignora_mascara():
    assert hash_documento(CPF_VALIDO) == hash_documento("52998224725")
    assert len(hash_documento(CPF_VALIDO)) == 64


def test_encrypt_decrypt_roundtrip(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "unit-test-secret")
    token = encrypt_documento(CPF_VALIDO)
    assert token != "52998224725"
    assert decrypt_documento(token) == "52998224725"


# --------------------------- Score / faixa / rating ------------------------
@pytest.mark.parametrize(
    "score,faixa",
    [(0, "alto"), (600, "alto"), (601, "medio"), (700, "medio"), (701, "baixo"), (1000, "baixo"), (None, "indisponivel")],
)
def test_classify_score_faixa(score, faixa):
    assert classify_score_faixa(score) == faixa


def test_derive_rating_usa_pior_operacao():
    ops = [{"classificacaoRisco": "A"}, {"classificacaoRisco": "D"}, {"classificacaoRisco": "B"}]
    assert derive_rating_bacen(ops, None, None) == "D"


def test_derive_rating_mapeia_faixa_risco_quando_sem_operacoes():
    assert derive_rating_bacen([], "Alto", None) == "E"


def test_derive_rating_usa_score_como_fallback():
    assert derive_rating_bacen([], None, 950) == "AA"
    assert derive_rating_bacen([], None, 150) == "H"


# --------------------------- Parsers ---------------------------------------
def test_parse_score_extrai_score_motivos():
    payload = {"retorno": {"score": 742, "motivos": [{"descricao": "Bom histórico"}, "Renda estável"]}}
    parsed = parse_score(payload)
    assert parsed["score"] == 742
    assert parsed["faixa"] == "baixo"
    assert "Bom histórico" in parsed["motivos"]
    assert "Renda estável" in parsed["motivos"]


def test_parse_scr_normaliza_campos():
    payload = {
        "retorno": {
            "score": 680,
            "faixaRisco": "Médio baixo",
            "responsabilidadeTotal": "R$ 18.450,75",
            "quantidadeInstituicoes": 3,
            "operacoes": [{"classificacaoRisco": "A"}, {"classificacaoRisco": "C"}],
        }
    }
    parsed = parse_scr(payload)
    assert parsed["score"] == 680
    assert parsed["responsabilidade_total"] == 18450.75
    assert parsed["quantidade_instituicoes"] == 3
    assert parsed["quantidade_operacoes"] == 2


def test_parse_pendencias_lista_vazia_quando_ausente():
    assert parse_pendencias({"retorno": {}}) == []


def test_parse_pendencias_normaliza_itens():
    payload = {"retorno": {"pendencias": [{"tipo": "PEFIN", "credor": "Loja X", "valor": "349,90"}]}}
    itens = parse_pendencias(payload)
    assert len(itens) == 1
    assert itens[0]["valor"] == 349.90
    assert itens[0]["credor"] == "Loja X"


# --------------------------- Provider mock --------------------------------
def test_mock_provider_gera_relatorio_completo(monkeypatch):
    monkeypatch.setenv("CREDIT_PROVIDER", "mock")
    report = asyncio.run(gerar_relatorio(CPF_VALIDO))
    assert report.fonte == "mock"
    assert report.tipo == "pf"
    assert report.score == 742
    assert report.score_faixa == "baixo"
    assert report.rating_bacen == "C"  # pior entre A e C
    assert report.tem_pendencias is True
    assert report.documento == "***.***.**7-25"  # nunca em claro


def test_gerar_relatorio_rejeita_documento_invalido_antes_de_consultar(monkeypatch):
    monkeypatch.setenv("CREDIT_PROVIDER", "mock")
    with pytest.raises(CreditProviderError):
        asyncio.run(gerar_relatorio("123.456.789-00"))


# --------------------------- Provider Direct Data (httpx mockado) ---------
class _FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def json(self):
        return self._payload


class _FakeClient:
    """Simula a Direct Data roteando por endpoint. Registra os params enviados."""

    def __init__(self, routes, calls):
        self._routes = routes
        self._calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return None

    async def get(self, url, params=None):
        self._calls.append((url, params))
        for fragment, response in self._routes.items():
            if fragment in url:
                if isinstance(response, Exception):
                    raise response
                return response
        return _FakeResponse({}, status=404)


def _install_fake(monkeypatch, routes, calls):
    monkeypatch.setattr(
        credit_provider.httpx, "AsyncClient", lambda **_: _FakeClient(routes, calls)
    )


def test_directdata_monta_relatorio_e_envia_token(monkeypatch):
    monkeypatch.setenv("CREDIT_PROVIDER", "directdata")
    monkeypatch.setenv("DIRECTD_TOKEN", "tok-123")
    monkeypatch.setenv("DIRECTD_PENDENCIAS_ENABLED", "true")
    monkeypatch.setenv("DIRECTD_PENDENCIAS_ENDPOINT", "/api/PendenciasFinanceiras")

    calls = []
    routes = {
        "/api/Score": _FakeResponse({"retorno": {"score": 810, "motivos": ["Ótimo histórico"]}}),
        "/api/SCRBacenDetalhada": _FakeResponse(
            {"retorno": {"score": 720, "faixaRisco": "Baixo", "responsabilidadeTotal": 5000,
                         "operacoes": [{"classificacaoRisco": "B"}], "urlComprovante": "http://x/y.pdf"}}
        ),
        "/api/PendenciasFinanceiras": _FakeResponse({"retorno": {"pendencias": []}}),
    }
    _install_fake(monkeypatch, routes, calls)

    report = asyncio.run(gerar_relatorio(CPF_VALIDO))
    assert report.score == 810
    assert report.score_faixa == "baixo"
    assert report.rating_bacen == "B"
    assert report.tem_pendencias is False
    assert report.comprovante_url == "http://x/y.pdf"
    # Token enviado como query param em toda chamada.
    assert all(c[1].get("Token") == "tok-123" for c in calls)
    # CPF enviado (dígitos), nunca mascarado, mas só server-side.
    assert any(c[1].get("CPF") == "52998224725" for c in calls)


def test_directdata_degrada_quando_scr_falha(monkeypatch):
    monkeypatch.setenv("CREDIT_PROVIDER", "directdata")
    monkeypatch.setenv("DIRECTD_TOKEN", "tok-123")
    monkeypatch.setenv("DIRECTD_PENDENCIAS_ENABLED", "false")

    calls = []
    routes = {
        "/api/Score": _FakeResponse({"retorno": {"score": 500}}),
        "/api/SCRBacenDetalhada": CreditProviderError("SCR fora do ar"),
    }
    _install_fake(monkeypatch, routes, calls)

    report = asyncio.run(gerar_relatorio(CPF_VALIDO))
    assert report.score == 500
    assert report.score_faixa == "alto"
    assert report.scr.get("quantidade_operacoes", 0) == 0
    assert any("SCR" in a for a in report.avisos)


def test_directdata_sem_token_levanta(monkeypatch):
    monkeypatch.setenv("CREDIT_PROVIDER", "directdata")
    monkeypatch.delenv("DIRECTD_TOKEN", raising=False)
    with pytest.raises(CreditProviderError):
        asyncio.run(gerar_relatorio(CPF_VALIDO))
