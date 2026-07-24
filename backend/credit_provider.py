"""Provedor plugável de dados de crédito (Análise de Crédito / Rating Avançado).

Espelha o estilo de `receipt_vision.py`: módulo próprio, `httpx.AsyncClient`,
credenciais via `os.environ`, exceção dedicada (`CreditProviderError`) e
normalização do retorno antes de devolver ao app.

Fornecedor padrão: **Direct Data** (Score QUOD + SCR BACEN Detalhada +
PEFIN/REFIN). Um provider `mock` devolve payloads fixos para desenvolver o
front sem gastar crédito.

REGRAS DE SEGURANÇA (LGPD / §7 do plano):
- A Direct Data é chamada SOMENTE server-side; o Token nunca vai ao frontend.
- CPF/CNPJ nunca é logado em claro nem o payload cru — sempre mascarado.
- O documento é validado (dígitos verificadores) ANTES de gastar crédito.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger("credit_provider")

DEFAULT_BASE_URL = "https://apiv3.directd.com.br"
DEFAULT_TIMEOUT = 45


class CreditProviderError(Exception):
    """Erro de negócio ao consultar dados de crédito (mensagem amigável)."""


# =============================================================================
# Validação e mascaramento de CPF/CNPJ
# =============================================================================
def only_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def detect_documento_tipo(documento: str) -> str:
    """Retorna 'pf' (CPF, 11 dígitos) ou 'pj' (CNPJ, 14 dígitos)."""
    digits = only_digits(documento)
    if len(digits) == 11:
        return "pf"
    if len(digits) == 14:
        return "pj"
    raise CreditProviderError("Documento inválido: informe um CPF (11) ou CNPJ (14 dígitos).")


def _valida_cpf(cpf: str) -> bool:
    cpf = only_digits(cpf)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for i in (9, 10):
        soma = sum(int(cpf[num]) * ((i + 1) - num) for num in range(i))
        dig = (soma * 10) % 11
        dig = 0 if dig == 10 else dig
        if dig != int(cpf[i]):
            return False
    return True


def _valida_cnpj(cnpj: str) -> bool:
    cnpj = only_digits(cnpj)
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        return False
    pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    pesos2 = [6] + pesos1
    for pesos, pos in ((pesos1, 12), (pesos2, 13)):
        soma = sum(int(cnpj[i]) * pesos[i] for i in range(pos))
        resto = soma % 11
        dig = 0 if resto < 2 else 11 - resto
        if dig != int(cnpj[pos]):
            return False
    return True


def valida_documento(documento: str) -> str:
    """Valida CPF/CNPJ pelos dígitos verificadores. Retorna o tipo ('pf'|'pj').

    Levanta CreditProviderError com mensagem amigável se inválido.
    """
    tipo = detect_documento_tipo(documento)
    digits = only_digits(documento)
    if tipo == "pf" and not _valida_cpf(digits):
        raise CreditProviderError("CPF inválido. Confira os números digitados.")
    if tipo == "pj" and not _valida_cnpj(digits):
        raise CreditProviderError("CNPJ inválido. Confira os números digitados.")
    return tipo


def mask_documento(documento: str) -> str:
    """Mascara CPF/CNPJ para exibição/log. Ex.: ***.***.**9-01 / **.***.***/**01-99."""
    digits = only_digits(documento)
    if len(digits) == 11:
        return f"***.***.**{digits[8]}-{digits[9:11]}"
    if len(digits) == 14:
        return f"**.***.***/{digits[8:12]}-{digits[12:14]}"
    if not digits:
        return "***"
    return "*" * max(0, len(digits) - 2) + digits[-2:]


def hash_documento(documento: str) -> str:
    """Hash SHA-256 dos dígitos do documento (para dedupe/rate-limit sem armazenar em claro)."""
    return sha256(only_digits(documento).encode("utf-8")).hexdigest()


# O documento precisa ficar disponível server-side entre o checkout e a geração
# assíncrona do relatório (no webhook). Guardamos CIFRADO (nunca em claro) e
# apagamos assim que o relatório é gerado. Chave via env `CREDIT_DOC_ENC_KEY`
# (Fernet); se ausente, é derivada do JWT_SECRET para funcionar em dev.
def _fernet():
    import base64

    from cryptography.fernet import Fernet

    key = os.environ.get("CREDIT_DOC_ENC_KEY", "").strip()
    if key:
        return Fernet(key.encode("utf-8"))
    secret = os.environ.get("JWT_SECRET", "finpremium-dev-secret")
    derived = base64.urlsafe_b64encode(sha256(secret.encode("utf-8")).digest())
    return Fernet(derived)


def encrypt_documento(documento: str) -> str:
    return _fernet().encrypt(only_digits(documento).encode("utf-8")).decode("ascii")


def decrypt_documento(token: str) -> str:
    return _fernet().decrypt(token.encode("ascii")).decode("utf-8")


# =============================================================================
# Modelo normalizado (agnóstico de provedor)
# =============================================================================
class CreditReport(BaseModel):
    documento: str                       # CPF/CNPJ mascarado
    tipo: str                            # "pf" | "pj"
    score: Optional[int] = None          # Score principal (QUOD)
    score_faixa: str = "indisponivel"    # "alto" | "medio" | "baixo" | "indisponivel"
    score_motivos: List[str] = Field(default_factory=list)
    rating_bacen: Optional[str] = None   # letra derivada (AA..H) — ver derive_rating_bacen
    scr: Dict[str, Any] = Field(default_factory=dict)          # resumo SCR normalizado
    pendencias: List[Dict[str, Any]] = Field(default_factory=list)  # PEFIN/REFIN normalizadas
    tem_pendencias: bool = False
    comprovante_url: Optional[str] = None
    consultado_em: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    fonte: str = "directdata"
    avisos: List[str] = Field(default_factory=list)  # ex.: "PEFIN/REFIN indisponível"


# =============================================================================
# Helpers de parsing (defensivos: a Direct Data varia o envelope por produto)
# =============================================================================
def _unwrap(payload: Any) -> Dict[str, Any]:
    """A Direct Data costuma envelopar em {metaDados, retorno}. Extrai o miolo."""
    if not isinstance(payload, dict):
        return {}
    for key in ("retorno", "return", "resultado", "data", "dados"):
        inner = payload.get(key)
        if isinstance(inner, dict) and inner:
            return inner
    return payload


def _get(d: Dict[str, Any], *names: str, default: Any = None) -> Any:
    """Busca case-insensitive por qualquer um dos nomes fornecidos."""
    if not isinstance(d, dict):
        return default
    lowered = {str(k).lower(): v for k, v in d.items()}
    for name in names:
        val = lowered.get(name.lower())
        if val is not None:
            return val
    return default


def _to_int(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(round(float(str(value).replace(",", ".").strip())))
    except (TypeError, ValueError):
        return None


def _to_float(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    raw = re.sub(r"[^\d,.-]", "", str(value))
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        raw = raw.replace(",", ".")
    try:
        return round(float(raw), 2)
    except ValueError:
        return 0.0


def classify_score_faixa(score: Optional[int]) -> str:
    """Faixas QUOD (§2): 0–600 alto risco · 601–700 médio · 701–1000 baixo."""
    if score is None:
        return "indisponivel"
    if score <= 600:
        return "alto"
    if score <= 700:
        return "medio"
    return "baixo"


# Rating BACEN derivado (AA..H). Regra documentada (§2):
# o SCR não devolve a letra consolidada — ela é por operação. Aqui derivamos
# uma letra consolidada usando, na ordem de preferência:
#   1) a PIOR classificação (letra) entre as operações do SCR;
#   2) o mapeamento faixaRisco -> letra (quando não há letra por operação);
#   3) o score do SCR -> letra (fallback).
# Trata-se de um "rating derivado" — documentado como tal na resposta ao usuário.
RATING_ORDER = ["AA", "A", "B", "C", "D", "E", "F", "G", "H"]

_FAIXA_RISCO_TO_RATING = {
    "muito baixo": "AA",
    "baixo": "A",
    "baixo risco": "A",
    "medio baixo": "B",
    "médio baixo": "B",
    "medio": "C",
    "médio": "C",
    "medio risco": "C",
    "médio risco": "C",
    "medio alto": "D",
    "médio alto": "D",
    "alto": "E",
    "alto risco": "E",
    "muito alto": "G",
    "altissimo": "H",
    "altíssimo": "H",
}


def _rating_from_score(score: Optional[int]) -> Optional[str]:
    """Mapeia um score 0..1000 (maior = melhor) numa letra AA..H."""
    if score is None:
        return None
    thresholds = [
        (900, "AA"), (800, "A"), (700, "B"), (600, "C"),
        (500, "D"), (400, "E"), (300, "F"), (200, "G"),
    ]
    for limit, letter in thresholds:
        if score >= limit:
            return letter
    return "H"


def _pior_rating(letras: List[str]) -> Optional[str]:
    validas = [l.upper() for l in letras if l and l.upper() in RATING_ORDER]
    if not validas:
        return None
    return max(validas, key=lambda l: RATING_ORDER.index(l))


def derive_rating_bacen(
    operacoes: List[Dict[str, Any]],
    faixa_risco: Optional[str],
    score_scr: Optional[int],
) -> Optional[str]:
    letras = []
    for op in operacoes or []:
        letra = _get(op, "classificacaoRisco", "classificacao", "rating", "letra")
        if letra:
            letras.append(str(letra).strip())
    pior = _pior_rating(letras)
    if pior:
        return pior
    if faixa_risco:
        mapped = _FAIXA_RISCO_TO_RATING.get(str(faixa_risco).strip().lower())
        if mapped:
            return mapped
    return _rating_from_score(score_scr)


# =============================================================================
# Parsers por produto Direct Data
# =============================================================================
def parse_score(payload: Any) -> Dict[str, Any]:
    data = _unwrap(payload)
    score = _to_int(_get(data, "score", "pontuacao", "scoreQuod", "pontuacaoScore"))
    faixa = _get(data, "faixa", "classe", "classificacao")
    motivos_raw = _get(data, "motivos", "fatores", "razoes", default=[]) or []
    motivos: List[str] = []
    if isinstance(motivos_raw, list):
        for m in motivos_raw:
            if isinstance(m, dict):
                texto = _get(m, "descricao", "motivo", "texto", "mensagem")
                if texto:
                    motivos.append(str(texto).strip())
            elif m:
                motivos.append(str(m).strip())
    elif isinstance(motivos_raw, str) and motivos_raw.strip():
        motivos.append(motivos_raw.strip())
    return {
        "score": score,
        "faixa": classify_score_faixa(score),
        "faixa_provedor": str(faixa).strip() if faixa else None,
        "motivos": motivos[:6],
    }


def parse_scr(payload: Any) -> Dict[str, Any]:
    data = _unwrap(payload)
    score_scr = _to_int(_get(data, "score", "scoreScr", "pontuacao"))
    faixa_risco = _get(data, "faixaRisco", "faixa", "risco")
    carteira = _get(data, "carteiraCredito", "carteira", default=[]) or []
    operacoes = _get(data, "operacoes", "operacoesCredito", "detalheOperacoes", default=[]) or []
    if isinstance(operacoes, dict):
        operacoes = [operacoes]
    responsabilidade = _to_float(
        _get(data, "responsabilidadeTotal", "valorTotal", "totalResponsabilidade", "valorVencer")
    )
    qtd_instituicoes = _to_int(
        _get(data, "quantidadeInstituicoes", "qtdInstituicoes", "numeroInstituicoes")
    )
    return {
        "score": score_scr,
        "faixa_risco": str(faixa_risco).strip() if faixa_risco else None,
        "responsabilidade_total": responsabilidade,
        "quantidade_instituicoes": qtd_instituicoes,
        "quantidade_operacoes": len(operacoes) if isinstance(operacoes, list) else 0,
        "carteira": carteira if isinstance(carteira, list) else [],
        "operacoes": operacoes if isinstance(operacoes, list) else [],
    }


def parse_pendencias(payload: Any) -> List[Dict[str, Any]]:
    """Normaliza PEFIN/REFIN (negativações). Endpoint/payload a confirmar (§2)."""
    data = _unwrap(payload)
    itens = (
        _get(data, "pendencias", "negativacoes", "ocorrencias", "registros", "anotacoes", default=None)
    )
    if itens is None and isinstance(data, list):
        itens = data
    if isinstance(itens, dict):
        itens = [itens]
    if not isinstance(itens, list):
        return []
    result: List[Dict[str, Any]] = []
    for item in itens:
        if not isinstance(item, dict):
            continue
        result.append(
            {
                "tipo": _get(item, "tipo", "natureza", "modalidade", default="PEFIN/REFIN"),
                "credor": _get(item, "credor", "empresa", "informante", "razaoSocial"),
                "valor": _to_float(_get(item, "valor", "valorPendencia", "montante")),
                "data_ocorrencia": _get(item, "dataOcorrencia", "data", "dataInclusao"),
                "situacao": _get(item, "situacao", "status"),
                "contrato": _get(item, "contrato", "numeroContrato"),
            }
        )
    return result


def _mesano_atual() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.month:02d}{now.year}"


# =============================================================================
# Provider: Direct Data
# =============================================================================
async def _directd_get(
    client: httpx.AsyncClient,
    base_url: str,
    path: str,
    params: Dict[str, Any],
    label: str,
) -> Any:
    url = f"{base_url.rstrip('/')}/{path.lstrip('/')}"
    try:
        response = await client.get(url, params=params)
    except httpx.TimeoutException as exc:
        raise CreditProviderError(
            "A consulta demorou mais que o esperado. Tente novamente em instantes."
        ) from exc
    except httpx.HTTPError as exc:
        logger.warning("Direct Data %s: erro de conexão", label)
        raise CreditProviderError("Não foi possível falar com o provedor de crédito.") from exc

    if response.status_code == 401 or response.status_code == 403:
        raise CreditProviderError("Token da Direct Data inválido ou sem permissão.")
    if response.status_code == 402:
        raise CreditProviderError("Saldo de créditos insuficiente para a consulta.")
    if response.status_code >= 500:
        raise CreditProviderError("Provedor de crédito indisponível no momento.")
    if response.status_code >= 400:
        raise CreditProviderError("Consulta de crédito recusada pelo provedor.")

    try:
        return response.json()
    except ValueError as exc:
        raise CreditProviderError("O provedor devolveu uma resposta inválida.") from exc


async def _gerar_relatorio_directdata(documento: str, tipo: str) -> CreditReport:
    token = os.environ.get("DIRECTD_TOKEN", "").strip()
    if not token:
        raise CreditProviderError(
            "Análise de crédito indisponível: DIRECTD_TOKEN não configurado."
        )
    base_url = os.environ.get("DIRECTD_BASE_URL", DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL
    try:
        timeout = float(os.environ.get("DIRECTD_TIMEOUT", DEFAULT_TIMEOUT))
    except ValueError:
        timeout = DEFAULT_TIMEOUT

    digits = only_digits(documento)
    doc_param = "CPF" if tipo == "pf" else "CNPJ"
    base_params = {doc_param: digits, "Token": token}

    pendencias_endpoint = os.environ.get("DIRECTD_PENDENCIAS_ENDPOINT", "").strip()
    pendencias_enabled = os.environ.get(
        "DIRECTD_PENDENCIAS_ENABLED", "true"
    ).lower() in ("1", "true", "yes") and bool(pendencias_endpoint)

    avisos: List[str] = []

    async with httpx.AsyncClient(timeout=timeout) as client:
        tasks = {
            "score": _directd_get(client, base_url, "/api/Score", dict(base_params), "Score"),
            "scr": _directd_get(
                client,
                base_url,
                "/api/SCRBacenDetalhada",
                {**base_params, "MESANO": _mesano_atual()},
                "SCR",
            ),
        }
        if pendencias_enabled:
            tasks["pendencias"] = _directd_get(
                client, base_url, pendencias_endpoint, dict(base_params), "Pendencias"
            )

        results = await asyncio.gather(*tasks.values(), return_exceptions=True)
        raw = dict(zip(tasks.keys(), results))

    # Score é o dado principal — se falhar, é erro. SCR/pendências degradam com aviso.
    score_res = raw.get("score")
    if isinstance(score_res, Exception):
        raise score_res if isinstance(score_res, CreditProviderError) else CreditProviderError(
            "Não foi possível obter o score de crédito."
        )
    score_norm = parse_score(score_res)

    scr_norm: Dict[str, Any] = {}
    scr_res = raw.get("scr")
    if isinstance(scr_res, Exception):
        avisos.append("Resumo BACEN (SCR) indisponível nesta consulta.")
    else:
        scr_norm = parse_scr(scr_res)

    pendencias: List[Dict[str, Any]] = []
    if not pendencias_enabled:
        avisos.append("Consulta de PEFIN/REFIN não habilitada.")
    else:
        pend_res = raw.get("pendencias")
        if isinstance(pend_res, Exception):
            avisos.append("Consulta de negativações (PEFIN/REFIN) indisponível.")
        else:
            pendencias = parse_pendencias(pend_res)

    rating = derive_rating_bacen(
        scr_norm.get("operacoes", []),
        scr_norm.get("faixa_risco"),
        scr_norm.get("score"),
    )
    comprovante = _get(_unwrap(scr_res) if not isinstance(scr_res, Exception) else {}, "urlComprovante", "comprovante")

    logger.info(
        "Relatório de crédito gerado (directdata) doc=%s tipo=%s score=%s rating=%s pendencias=%d",
        mask_documento(documento), tipo, score_norm.get("score"), rating, len(pendencias),
    )

    return CreditReport(
        documento=mask_documento(documento),
        tipo=tipo,
        score=score_norm.get("score"),
        score_faixa=score_norm.get("faixa", "indisponivel"),
        score_motivos=score_norm.get("motivos", []),
        rating_bacen=rating,
        scr={k: v for k, v in scr_norm.items() if k not in ("operacoes",)} | {
            "quantidade_operacoes": scr_norm.get("quantidade_operacoes", 0),
        },
        pendencias=pendencias,
        tem_pendencias=bool(pendencias),
        comprovante_url=str(comprovante).strip() if comprovante else None,
        fonte="directdata",
        avisos=avisos,
    )


# =============================================================================
# Provider: mock (não gasta crédito — para desenvolver o front)
# =============================================================================
def _mock_payloads(tipo: str) -> Dict[str, Any]:
    return {
        "score": {
            "retorno": {
                "score": 742,
                "classe": "B",
                "motivos": [
                    {"descricao": "Bom histórico de pagamentos"},
                    {"descricao": "Baixo comprometimento de renda"},
                ],
            }
        },
        "scr": {
            "retorno": {
                "score": 680,
                "faixaRisco": "Médio baixo",
                "responsabilidadeTotal": 18450.75,
                "quantidadeInstituicoes": 3,
                "carteiraCredito": [
                    {"modalidade": "Cartão de crédito", "valor": 4200.00},
                    {"modalidade": "Empréstimo pessoal", "valor": 14250.75},
                ],
                "operacoes": [
                    {"modalidade": "Cartão de crédito", "classificacaoRisco": "A"},
                    {"modalidade": "Empréstimo pessoal", "classificacaoRisco": "C"},
                ],
                "urlComprovante": "https://exemplo.directd.com.br/comprovante/mock.pdf",
            }
        },
        "pendencias": {
            "retorno": {
                "pendencias": [
                    {
                        "tipo": "PEFIN",
                        "credor": "Loja Exemplo LTDA",
                        "valor": 349.90,
                        "dataOcorrencia": "2026-03-12",
                        "situacao": "Em aberto",
                        "contrato": "CT-99182",
                    }
                ]
            }
        },
    }


async def _gerar_relatorio_mock(documento: str, tipo: str) -> CreditReport:
    payloads = _mock_payloads(tipo)
    score_norm = parse_score(payloads["score"])
    scr_norm = parse_scr(payloads["scr"])
    pendencias = parse_pendencias(payloads["pendencias"])
    rating = derive_rating_bacen(
        scr_norm.get("operacoes", []),
        scr_norm.get("faixa_risco"),
        scr_norm.get("score"),
    )
    logger.info(
        "Relatório de crédito gerado (mock) doc=%s tipo=%s", mask_documento(documento), tipo
    )
    return CreditReport(
        documento=mask_documento(documento),
        tipo=tipo,
        score=score_norm.get("score"),
        score_faixa=score_norm.get("faixa", "indisponivel"),
        score_motivos=score_norm.get("motivos", []),
        rating_bacen=rating,
        scr={
            "score": scr_norm.get("score"),
            "faixa_risco": scr_norm.get("faixa_risco"),
            "responsabilidade_total": scr_norm.get("responsabilidade_total"),
            "quantidade_instituicoes": scr_norm.get("quantidade_instituicoes"),
            "quantidade_operacoes": scr_norm.get("quantidade_operacoes"),
            "carteira": scr_norm.get("carteira", []),
        },
        pendencias=pendencias,
        tem_pendencias=bool(pendencias),
        comprovante_url="https://exemplo.directd.com.br/comprovante/mock.pdf",
        fonte="mock",
        avisos=["Relatório de demonstração (provedor mock) — nenhum crédito consumido."],
    )


# =============================================================================
# Seletor (igual ao fallback de visão em receipt_vision.py)
# =============================================================================
async def gerar_relatorio(documento: str, tipo: Optional[str] = None) -> CreditReport:
    """Gera o relatório normalizado de crédito.

    Valida o documento (dígitos verificadores) antes de qualquer consulta paga
    e seleciona o provider via env `CREDIT_PROVIDER` (directdata | mock).
    """
    tipo_validado = valida_documento(documento)
    if tipo and tipo != tipo_validado:
        raise CreditProviderError("Tipo de documento não confere com o número informado.")

    provider = os.environ.get("CREDIT_PROVIDER", "directdata").strip().lower()
    if provider == "mock":
        return await _gerar_relatorio_mock(documento, tipo_validado)
    if provider == "directdata":
        return await _gerar_relatorio_directdata(documento, tipo_validado)
    raise CreditProviderError(f"Provedor de crédito desconhecido: {provider}")
