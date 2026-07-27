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
    ensure_scr_importable,
    explain_rating_bacen,
    gerar_relatorio,
    hash_documento,
    mask_documento,
    normalize_apis,
    parse_divida_ativa,
    parse_pendencias,
    parse_pendencias_resumo,
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


def test_ensure_scr_importable_consolida_legado():
    scr = {
        "divida_atual": 86984.0,
        "faixa_risco": "Risco Baixo",
        "carteira": {"vencer": 86984.0, "vencido": 0.0, "prejuizo": 0.0, "limite": 23150.0},
        "modalidades": [],
    }
    fixed = ensure_scr_importable(scr)
    assert fixed["legado_consolidado"] is True
    assert len(fixed["modalidades"]) == 1
    assert fixed["modalidades"][0]["codigo"] == "SCR-TOTAL"
    assert fixed["modalidades"][0]["saldo"] == 86984.0


def test_explain_rating_usa_faixa():
    info = explain_rating_bacen([], "Risco Baixo", 575, "A")
    assert info["letra"] == "A"
    assert info["fonte"] == "faixa_risco"
    assert "faixa" in info["detalhe"].lower() or "Risco" in info["detalhe"]


@pytest.mark.parametrize(
    "faixa,esperado",
    [
        ("Risco Baixo", "A"),      # forma real da Direct Data
        ("Baixo Risco", "A"),
        ("baixo", "A"),
        ("Risco Médio Alto", "D"),
        ("MÉDIO BAIXO", "B"),
        ("Risco Muito Alto", "G"),
    ],
)
def test_derive_rating_aceita_variacoes_da_faixa_risco(faixa, esperado):
    """A faixa precisa vencer o fallback por score, senão o rating contradiz o texto."""
    # score 575 sozinho daria "D": se a faixa não casar, o card fica incoerente.
    assert derive_rating_bacen([], faixa, 575) == esperado


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


def test_parse_score_le_estrutura_real_aninhada_em_pessoa_fisica():
    """O QUOD devolve o score dentro de pessoaFisica, não na raiz do retorno."""
    payload = {
        "retorno": {
            "documentoConsultado": "529...",
            "pessoaFisica": {
                "score": 812,
                "faixaScore": "Baixo índice de inadimplência",
                "capacidadePagamento": "Alta",
                "perfil": "Consumidor adimplente",
            },
        }
    }
    parsed = parse_score(payload, "pf")
    assert parsed["score"] == 812
    assert parsed["faixa"] == "baixo"
    assert parsed["faixa_provedor"] == "Baixo índice de inadimplência"
    assert parsed["capacidade_pagamento"] == "Alta"
    assert parsed["perfil"] == "Consumidor adimplente"


def test_parse_score_pj_usa_indicadores_como_motivos():
    payload = {
        "retorno": {
            "pessoaJuridica": {
                "score": 540,
                "indicadoresNegocio": [
                    {"indicador": "Endividamento", "risco": "Alto"},
                    {"indicador": "Tempo de atividade", "status": "Regular"},
                ],
            }
        }
    }
    parsed = parse_score(payload, "pj")
    assert parsed["score"] == 540
    assert parsed["faixa"] == "alto"
    assert "Endividamento: Alto" in parsed["motivos"]
    assert "Tempo de atividade: Regular" in parsed["motivos"]


def test_parse_scr_le_modalidades_e_carteira_objeto():
    payload = {
        "retorno": {
            "score": "705",
            "faixaRisco": "Baixo",
            "responsabilidadeTotal": "R$ 12.000,00",
            "quantidadeOperacoes": 2,
            "carteiraCredito": {"total": "R$ 12.000,00", "vencido": "R$ 500,00",
                                "limite": "R$ 3.000,00", "prejuizo": "R$ 0,00",
                                "vencer": "R$ 11.500,00"},
            "modalidades": [
                {"descricaoModalidade": "Cartão de crédito",
                 "codigoModalidade": "0203",
                 "aVencer": {
                     "total": "R$ 2.000,00",
                     "de1a30Dias": "R$ 500,00",
                     "de31a60Dias": "R$ 500,00",
                     "de61a90Dias": "R$ 1.000,00",
                 },
                 "vencido": {"total": "R$ 500,00"},
                 "prejuizo": {"total": "R$ 0,00"}},
                {"descricaoModalidade": "Financiamento",
                 "codigoModalidade": "0902",
                 "aVencer": {
                     "total": "R$ 9.500,00",
                     "de181a360Dias": "R$ 4.000,00",
                     "acimaDe361Dias": "R$ 5.500,00",
                 }},
            ],
        }
    }
    parsed = parse_scr(payload)
    assert parsed["score"] == 705
    assert parsed["carteira"]["total"] == 12000.00
    assert parsed["carteira"]["vencido"] == 500.00
    assert parsed["quantidade_operacoes"] == 2
    assert parsed["modalidades"][0]["modalidade"] == "Cartão de crédito"
    assert parsed["modalidades"][0]["a_vencer"] == 2000.00
    assert parsed["modalidades"][0]["saldo"] == 2500.00
    assert parsed["modalidades"][0]["a_vencer_faixas"]["de_1_a_30"] == 500.00
    assert parsed["modalidades"][1]["vencido"] == 0.0
    curva = {p["chave"]: p for p in parsed["curva_vencimentos"]}
    assert curva["de_1_a_30"]["valor"] == 500.00
    assert curva["de_61_a_90"]["valor"] == 1000.00
    assert curva["acima_361"]["valor"] == 5500.00
    assert curva["acima_361"]["acumulado"] == 11500.00


def test_parse_scr_usa_risco_total_quando_responsabilidade_vem_zerada():
    """Caso real: responsabilidadeTotal vazio com R$ 110 mil em operações."""
    payload = {
        "retorno": {
            "responsabilidadeTotal": "",
            "riscoTotal": "R$ 110.134,00",
            "quantidadeInstituicoes": 7,
            "quantidadeOperacoes": 45,
            "carteiraCredito": {
                "total": "R$ 110.134,00",
                "limite": "R$ 23.150,00",
                "vencer": "R$ 86.984,00",
                "vencido": "R$ 0,00",
                "prejuizo": "R$ 0,00",
            },
        }
    }
    parsed = parse_scr(payload)
    assert parsed["responsabilidade_total"] == 110134.00
    # A dívida é o saldo — o `total` da carteira inclui limite não usado.
    assert parsed["divida_atual"] == 86984.00


def test_parse_scr_prefere_responsabilidade_informada():
    payload = {"retorno": {"responsabilidadeTotal": "R$ 900,00", "riscoTotal": "R$ 5.000,00"}}
    assert parse_scr(payload)["responsabilidade_total"] == 900.00


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


def _payload_negativo(pendencia_financeira):
    """Estrutura real: retorno.pessoaFisica.pendenciaFinanceira.<bucket>."""
    return {"retorno": {"pessoaFisica": {"pendenciaFinanceira": pendencia_financeira}}}


def test_parse_pendencias_normaliza_buckets_reais():
    payload = _payload_negativo({
        "status": "Consta Pendência",
        "totalPendencia": 3,
        "protestos": [{
            "situacao": "Em aberto",
            "valorTotal": 1200,
            "cartorios": [{"nome": "3º Ofício de Notas", "valorProtestado": 1200}],
        }],
        "acoesJudiciais": [{
            "autorProcesso": "Loja X",
            "tipoProcesso": "Execução de título",
            "valor": "349,90",
            "dataAjuizamento": "12/03/2026",
            "status": "Em andamento",
            "numeroProcessoPrincipal": "123-45",
        }],
        "chequesSemFundo": [{"nomeAgencia": "Ag. Centro", "quantidadeOcorrencia": 2,
                             "dataUltimaOcorrencia": "01/02/2026"}],
        "recuperacoesJudiciaisFalencia": [],
    })
    itens = parse_pendencias(payload)
    assert len(itens) == 3

    protesto = next(i for i in itens if i["tipo"] == "Protesto")
    assert protesto["valor"] == 1200.0
    assert protesto["credor"] == "3º Ofício de Notas"

    acao = next(i for i in itens if i["tipo"] == "Execução de título")
    assert acao["valor"] == 349.90
    assert acao["credor"] == "Loja X"
    assert acao["contrato"] == "123-45"

    cheque = next(i for i in itens if i["tipo"] == "Cheque sem fundo")
    assert cheque["situacao"] == "2 ocorrência(s)"


def test_parse_pendencias_ficha_limpa_nao_inventa_ocorrencia():
    """`pendenciaFinanceira` é container: virava uma negativação fantasma."""
    payload = _payload_negativo({
        "status": "Não Consta Pendência",
        "totalPendencia": 0,
        "protestos": [],
        "acoesJudiciais": [],
        "recuperacoesJudiciaisFalencia": [],
        "chequesSemFundo": [],
    })
    assert parse_pendencias(payload) == []
    resumo = parse_pendencias_resumo(payload)
    assert resumo["status"] == "Não Consta Pendência"
    assert resumo["total"] == 0


def test_parse_pendencias_usa_escopo_pj_para_cnpj():
    payload = {"retorno": {"pessoaJuridica": {"pendenciaFinanceira": {
        "status": "Consta Pendência",
        "protestos": [{"valorTotal": 500, "cartorios": []}],
    }}}}
    itens = parse_pendencias(payload, "pj")
    assert len(itens) == 1
    assert itens[0]["valor"] == 500.0


def test_parse_pendencias_le_buckets_aninhados_em_pessoa_fisica():
    payload = {"retorno": {"pessoaFisica": {"acoesJudiciais": [{"valor": 500}]}}}
    itens = parse_pendencias(payload)
    assert len(itens) == 1
    assert itens[0]["tipo"] == "Ação judicial"


def test_parse_divida_ativa_soma_valores():
    payload = {
        "retorno": {
            "possuiDivida": True,
            "dividas": [
                {"valor": "1.000,00", "situacao": "Ativa", "natureza": "Tributária"},
                {"valor": 250.50},
            ],
        }
    }
    divida = parse_divida_ativa(payload)
    assert divida["possui_divida"] is True
    assert divida["quantidade"] == 2
    assert divida["valor_total"] == 1250.50


def test_parse_divida_ativa_sem_registros():
    divida = parse_divida_ativa({"retorno": {"possuiDivida": False, "dividas": []}})
    assert divida["possui_divida"] is False
    assert divida["valor_total"] == 0.0


def test_normalize_apis_sempre_inclui_score():
    assert normalize_apis(None) == ["score", "scr", "pendencias", "divida_ativa"]
    assert normalize_apis([]) == ["score"]
    assert normalize_apis(["scr", "pgfn"]) == ["score", "scr", "divida_ativa"]
    assert normalize_apis(["SCORE", "pendencias", "pendencias"]) == ["score", "pendencias"]


# --------------------------- Provider mock --------------------------------
def test_mock_provider_gera_relatorio_completo(monkeypatch):
    monkeypatch.setenv("CREDIT_PROVIDER", "mock")
    report = asyncio.run(gerar_relatorio(CPF_VALIDO))
    assert report.fonte == "mock"
    assert report.tipo == "pf"
    assert report.score == 742
    assert report.score_faixa == "baixo"
    # Derivado da faixaRisco "Médio baixo" — o SCR real não tem letra por operação.
    assert report.rating_bacen == "B"
    assert report.tem_pendencias is True
    assert report.documento == "***.***.**7-25"  # nunca em claro


def test_mock_provider_respeita_selecao_de_apis(monkeypatch):
    monkeypatch.setenv("CREDIT_PROVIDER", "mock")
    report = asyncio.run(gerar_relatorio(CPF_VALIDO, apis=["score"]))
    assert report.score == 742
    assert report.rating_bacen is None
    assert report.scr == {}
    assert report.pendencias == []
    assert report.divida_ativa == {}


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


def _routes_padrao():
    """Rotas cobrindo as quatro consultas do relatório, nas estruturas reais."""
    return {
        "/api/Score": _FakeResponse({
            "metaDados": {"mensagem": "Sucesso"},
            "retorno": {"pessoaFisica": {"score": 810, "faixaScore": "Baixo",
                                         "motivos": ["Ótimo histórico"]}},
        }),
        "/api/SCRBacenDetalhada": _FakeResponse({
            # O comprovante vem em metaDados, não em retorno.
            "metaDados": {"mensagem": "Sucesso", "urlComprovante": "http://x/y.pdf"},
            "retorno": {"score": "720", "faixaRisco": "Baixo",
                        "responsabilidadeTotal": "R$ 5.000,00", "quantidadeOperacoes": 1,
                        "modalidades": [{"descricaoModalidade": "Cartão",
                                         "aVencer": {"total": "R$ 5.000,00"}}]},
        }),
        "/api/DetalhamentoNegativo": _FakeResponse({
            "retorno": {"pessoaFisica": {"pendenciaFinanceira": {
                "status": "Não Consta Pendência", "totalPendencia": 0,
                "protestos": [], "acoesJudiciais": [],
                "recuperacoesJudiciaisFalencia": [], "chequesSemFundo": [],
            }}},
        }),
        "/api/PGFNListaDevedoresUniao": _FakeResponse(
            {"retorno": {"possuiDivida": False, "dividas": []}}
        ),
    }


def test_directdata_monta_relatorio_e_envia_token(monkeypatch):
    monkeypatch.setenv("CREDIT_PROVIDER", "directdata")
    monkeypatch.setenv("DIRECTD_TOKEN", "tok-123")

    calls = []
    _install_fake(monkeypatch, _routes_padrao(), calls)

    report = asyncio.run(gerar_relatorio(CPF_VALIDO))
    assert report.score == 810
    assert report.score_faixa == "baixo"
    # O SCR real não traz letra por operação: o rating vem da faixaRisco "Baixo".
    assert report.rating_bacen == "A"
    assert report.tem_pendencias is False
    assert report.pendencias_resumo["status"] == "Não Consta Pendência"
    assert report.comprovante_url == "http://x/y.pdf"
    assert report.divida_ativa["possui_divida"] is False
    assert "renda" not in report.model_dump()
    assert "cadastro" not in report.model_dump()
    assert report.avisos == []
    assert all(c[1].get("Token") == "tok-123" for c in calls)
    assert any(c[1].get("CPF") == "52998224725" for c in calls)


def test_directdata_usa_endpoints_padrao_confirmados(monkeypatch):
    monkeypatch.setenv("CREDIT_PROVIDER", "directdata")
    monkeypatch.setenv("DIRECTD_TOKEN", "tok-123")

    calls = []
    _install_fake(monkeypatch, _routes_padrao(), calls)
    asyncio.run(gerar_relatorio(CPF_VALIDO))

    chamados = {url.replace(credit_provider.DEFAULT_BASE_URL, "") for url, _ in calls}
    assert chamados == {
        credit_provider.ENDPOINT_SCORE,
        credit_provider.ENDPOINT_SCR,
        credit_provider.ENDPOINT_PENDENCIAS,
        credit_provider.ENDPOINT_DIVIDA_ATIVA,
    }
    assert not any("CadastroPessoaFisica" in url for url, _ in calls)


def test_directdata_desabilitar_consultas_opcionais(monkeypatch):
    monkeypatch.setenv("CREDIT_PROVIDER", "directdata")
    monkeypatch.setenv("DIRECTD_TOKEN", "tok-123")
    monkeypatch.setenv("DIRECTD_DIVIDA_ATIVA_ENABLED", "false")

    calls = []
    _install_fake(monkeypatch, _routes_padrao(), calls)
    report = asyncio.run(gerar_relatorio(CPF_VALIDO))

    assert len(calls) == 3
    assert not any(credit_provider.ENDPOINT_DIVIDA_ATIVA in url for url, _ in calls)
    assert report.avisos == []


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
