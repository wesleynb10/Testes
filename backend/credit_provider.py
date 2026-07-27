"""Provedor plugável de dados de crédito (Análise de Crédito / Rating Avançado).

Espelha o estilo de `receipt_vision.py`: módulo próprio, `httpx.AsyncClient`,
credenciais via `os.environ`, exceção dedicada (`CreditProviderError`) e
normalização do retorno antes de devolver ao app.

Fornecedor padrão: **Direct Data**. Consultas que compõem o relatório (custo
por consulta conforme o cardápio V5.3):

    /api/Score                     Score de Crédito QUOD        R$ 1,98
    /api/SCRBacenDetalhada         SCR Detalhada BACEN          R$ 4,90
    /api/DetalhamentoNegativo      Detalhamento Negativo QUOD   R$ 2,38
    /api/PGFNListaDevedoresUniao   Dívida ativa da União        R$ 0,36

O Score é obrigatório; as demais degradam com aviso e podem ser desligadas
por env. Cadastro PF Plus (renda/situação cadastral) foi removido de propósito:
o titular já sabe a própria renda, e a consulta de crédito usa só o CPF
cadastrado na conta. Um provider `mock` devolve payloads fixos para o front.

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
import unicodedata
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger("credit_provider")

DEFAULT_BASE_URL = "https://apiv3.directd.com.br"
DEFAULT_TIMEOUT = 45

# Paths confirmados na central de ajuda da Direct Data. Cada um pode ser
# sobrescrito por env (DIRECTD_<NOME>_ENDPOINT) sem alterar código.
ENDPOINT_SCORE = "/api/Score"
ENDPOINT_SCR = "/api/SCRBacenDetalhada"
ENDPOINT_PENDENCIAS = "/api/DetalhamentoNegativo"
ENDPOINT_DIVIDA_ATIVA = "/api/PGFNListaDevedoresUniao"

# Catálogo de consultas que o usuário pode escolher. `score` é sempre obrigatório.
CREDIT_API_KEYS = ("score", "scr", "pendencias", "divida_ativa")
CREDIT_API_COSTS_BRL = {
    "score": 1.98,
    "scr": 4.90,
    "pendencias": 2.38,
    "divida_ativa": 0.36,
}
CREDIT_API_LABELS = {
    "score": "Score de crédito (QUOD)",
    "scr": "SCR / BACEN",
    "pendencias": "Negativações (PEFIN/REFIN)",
    "divida_ativa": "Dívida ativa da União (PGFN)",
}


def normalize_apis(apis: Optional[List[str]] = None) -> List[str]:
    """Normaliza a seleção do cliente. Score sempre entra."""
    aliases = {"pgfn": "divida_ativa", "divida": "divida_ativa", "pefin": "pendencias"}
    selected: List[str] = []
    # `[]` é seleção válida (vira só score); só `None` usa o pacote completo.
    for raw in (CREDIT_API_KEYS if apis is None else apis):
        key = aliases.get(str(raw).strip().lower(), str(raw).strip().lower())
        if key in CREDIT_API_KEYS and key not in selected:
            selected.append(key)
    if "score" not in selected:
        selected.insert(0, "score")
    # Mantém ordem canônica do catálogo.
    return [k for k in CREDIT_API_KEYS if k in selected]


def credit_api_cost_brl(apis: Optional[List[str]] = None) -> float:
    return round(sum(CREDIT_API_COSTS_BRL[a] for a in normalize_apis(apis)), 2)


def credit_apis_catalog() -> List[Dict[str, Any]]:
    return [
        {
            "id": key,
            "label": CREDIT_API_LABELS[key],
            "cost_brl": CREDIT_API_COSTS_BRL[key],
            "required": key == "score",
        }
        for key in CREDIT_API_KEYS
    ]


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
    capacidade_pagamento: Optional[str] = None   # texto do QUOD
    perfil: Optional[str] = None                 # texto do QUOD
    rating_bacen: Optional[str] = None   # letra derivada (AA..H) — ver derive_rating_bacen
    scr: Dict[str, Any] = Field(default_factory=dict)          # resumo SCR normalizado
    pendencias: List[Dict[str, Any]] = Field(default_factory=list)  # PEFIN/REFIN normalizadas
    tem_pendencias: bool = False
    pendencias_resumo: Dict[str, Any] = Field(default_factory=dict)  # status/total do provedor
    divida_ativa: Dict[str, Any] = Field(default_factory=dict)  # PGFN — dívida ativa da União
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


def _meta(payload: Any) -> Dict[str, Any]:
    """`metaDados` traz mensagem, custo, saldo e — importante — urlComprovante.

    O comprovante fica aqui, e não dentro de `retorno`.
    """
    if not isinstance(payload, dict):
        return {}
    meta = payload.get("metaDados") or payload.get("metadados")
    return meta if isinstance(meta, dict) else {}


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


def _txt(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


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

# Chaves já normalizadas: sem acento e sem a palavra "risco". Assim "Risco Baixo",
# "Baixo Risco" e "baixo" caem na mesma letra — a Direct Data usa a primeira forma,
# e casar só a chave literal fazia a faixa ser ignorada.
_FAIXA_RISCO_TO_RATING = {
    "muito baixo": "AA",
    "baixo": "A",
    "medio baixo": "B",
    "medio": "C",
    "medio alto": "D",
    "alto": "E",
    "muito alto": "G",
    "altissimo": "H",
}


def _sem_acento(texto: str) -> str:
    decomposto = unicodedata.normalize("NFKD", texto)
    return "".join(ch for ch in decomposto if not unicodedata.combining(ch))


def _normaliza_faixa_risco(texto: str) -> str:
    base = _sem_acento(texto).lower()
    palavras = [p for p in re.sub(r"[^a-z ]", " ", base).split() if p and p != "risco"]
    return " ".join(palavras)


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
        letra = _get(op, "classificacao_risco", "classificacaoRisco", "classificacao", "rating", "letra")
        if letra:
            letras.append(str(letra).strip())
    pior = _pior_rating(letras)
    if pior:
        return pior
    if faixa_risco:
        mapped = _FAIXA_RISCO_TO_RATING.get(_normaliza_faixa_risco(str(faixa_risco)))
        if mapped:
            return mapped
    # Último recurso: a escala do score do SCR não é a mesma do QUOD, então esta
    # letra é grosseira. Só entra quando o provedor não classificou a faixa.
    return _rating_from_score(score_scr)


def explain_rating_bacen(
    operacoes: Optional[List[Dict[str, Any]]] = None,
    faixa_risco: Optional[str] = None,
    score_scr: Optional[int] = None,
    rating: Optional[str] = None,
) -> Dict[str, Any]:
    """Texto estruturado da regra derivada (UI “ver detalhes”)."""
    ops = operacoes or []
    letras = []
    for op in ops:
        letra = _get(op, "classificacao_risco", "classificacaoRisco", "classificacao", "rating", "letra")
        if letra:
            letras.append(str(letra).strip().upper())
    pior = _pior_rating(letras)
    faixa_norm = _normaliza_faixa_risco(str(faixa_risco or ""))
    mapped = _FAIXA_RISCO_TO_RATING.get(faixa_norm) if faixa_norm else None
    letra_final = rating or derive_rating_bacen(ops, faixa_risco, score_scr)
    if pior:
        fonte = "pior_operacao"
        detalhe = (
            f"Usamos a pior classificação entre as operações do SCR "
            f"({', '.join(sorted(set(letras)))}). A letra final é {letra_final}."
        )
    elif mapped:
        fonte = "faixa_risco"
        detalhe = (
            f"Sem classificação por operação, mapeamos a faixa de risco "
            f"“{faixa_risco}” → rating {letra_final}."
        )
    elif letra_final:
        fonte = "score_scr"
        detalhe = (
            f"Sem faixa/operação classificável, aproximamos pelo score SCR "
            f"({score_scr}) → rating {letra_final}. Escala diferente do Score QUOD."
        )
    else:
        fonte = "indisponivel"
        detalhe = "Não há dados suficientes no SCR para derivar um rating."
    return {
        "letra": letra_final,
        "fonte": fonte,
        "detalhe": detalhe,
        "faixa_risco": _txt(faixa_risco),
        "score_scr": score_scr,
        "operacoes_classificadas": len(letras),
        "pior_operacao": pior,
    }


def ensure_scr_importable(scr: Any) -> Dict[str, Any]:
    """Relatórios legados (sem modalidades) viram 1 linha consolidada importável.

    Não inventa buckets de prazo — a curva fica vazia até uma nova consulta SCR.
    """
    if not isinstance(scr, dict) or not scr:
        return scr if isinstance(scr, dict) else {}
    out = dict(scr)
    modalidades = out.get("modalidades") if isinstance(out.get("modalidades"), list) else []
    if modalidades:
        if not out.get("curva_vencimentos"):
            out["curva_vencimentos"] = build_curva_vencimentos(modalidades)
        return out

    carteira = out.get("carteira") if isinstance(out.get("carteira"), dict) else {}
    divida = float(out.get("divida_atual") or 0.0)
    if divida <= 0:
        divida = sum(float(carteira.get(k) or 0.0) for k in ("vencer", "vencido", "prejuizo"))
    if divida <= 0:
        return out

    vencer = float(carteira.get("vencer") or divida)
    vencido = float(carteira.get("vencido") or 0.0)
    prejuizo = float(carteira.get("prejuizo") or 0.0)
    consolidada = {
        "modalidade": "Operações SCR (consolidado)",
        "codigo": "SCR-TOTAL",
        "limite_credito": float(carteira.get("limite") or 0.0),
        "a_vencer": vencer,
        "a_vencer_faixas": {"total": vencer},
        "vencido": vencido,
        "vencido_faixas": {"total": vencido},
        "prejuizo": prejuizo,
        "prejuizo_faixas": {"total": prejuizo},
        "saldo": round(vencer + vencido + prejuizo, 2) or divida,
        "classificacao_risco": "",
    }
    out["modalidades"] = [consolidada]
    out["divida_atual"] = divida
    out["curva_vencimentos"] = []
    out["legado_consolidado"] = True
    avisos = list(out.get("avisos") or []) if isinstance(out.get("avisos"), list) else []
    # avisos ficam no relatório raiz; marcamos só a flag no scr.
    return out


# =============================================================================
# Parsers por produto Direct Data
# =============================================================================
def _escopo_pessoa(data: Dict[str, Any], tipo: str) -> Dict[str, Any]:
    """A Direct Data aninha o retorno em `pessoaFisica` / `pessoaJuridica`.

    Sem descer nesse nível, os campos "somem" mesmo com a consulta paga.
    Cai de volta na raiz para aceitar payloads achatados (mock/testes).
    """
    preferida = "pessoaFisica" if tipo == "pf" else "pessoaJuridica"
    for chave in (preferida, "pessoaFisica", "pessoaJuridica"):
        bloco = _get(data, chave)
        if isinstance(bloco, dict) and bloco:
            return bloco
    return data


def _lista_motivos(bloco: Dict[str, Any]) -> List[str]:
    motivos: List[str] = []
    bruto = _get(bloco, "motivos", "fatores", "razoes", default=[]) or []
    if isinstance(bruto, str):
        bruto = [bruto]
    if isinstance(bruto, list):
        for m in bruto:
            if isinstance(m, dict):
                texto = _txt(_get(m, "descricao", "motivo", "texto", "mensagem"))
            else:
                texto = _txt(m)
            if texto:
                motivos.append(texto)
    # Quando não há `motivos`, os indicadores de negócio explicam o score.
    if not motivos:
        for ind in _get(bloco, "indicadoresNegocio", default=[]) or []:
            if not isinstance(ind, dict):
                continue
            titulo = _txt(_get(ind, "indicador"))
            risco = _txt(_get(ind, "risco")) or _txt(_get(ind, "status"))
            if titulo:
                motivos.append(f"{titulo}: {risco}" if risco else titulo)
    return motivos


def parse_score(payload: Any, tipo: str = "pf") -> Dict[str, Any]:
    data = _unwrap(payload)
    bloco = _escopo_pessoa(data, tipo)
    score = _to_int(_get(bloco, "score", "pontuacao", "scoreQuod", "pontuacaoScore"))
    faixa = _get(bloco, "faixaScore", "faixa", "classe", "classificacao")
    return {
        "score": score,
        "faixa": classify_score_faixa(score),
        "faixa_provedor": _txt(faixa),
        "motivos": _lista_motivos(bloco)[:6],
        "capacidade_pagamento": _txt(_get(bloco, "capacidadePagamento")),
        "perfil": _txt(_get(bloco, "perfil")),
    }


def _parse_carteira(bruto: Any) -> Dict[str, float]:
    """`carteiraCredito` é um objeto (total/limite/prejuizo/vencer/vencido)."""
    if not isinstance(bruto, dict):
        return {}
    return {
        campo: _to_float(_get(bruto, campo))
        for campo in ("total", "limite", "prejuizo", "vencer", "vencido")
    }


# Buckets oficiais do SCR Detalhada (a vencer / vencido). Horizonte em dias =
# teto da faixa — usado para montar a curva de pressão de caixa.
_AVENCER_BUCKETS = (
    ("de1a30Dias", "de_1_a_30", 30, "1–30 dias"),
    ("de31a60Dias", "de_31_a_60", 60, "31–60 dias"),
    ("de61a90Dias", "de_61_a_90", 90, "61–90 dias"),
    ("de91a180Dias", "de_91_a_180", 180, "91–180 dias"),
    ("de181a360Dias", "de_181_a_360", 360, "181–360 dias"),
    ("acimaDe361Dias", "acima_361", 720, "Acima de 361 dias"),
)


def _parse_faixa_valores(bruto: Any) -> Dict[str, float]:
    """Extrai total + buckets de um bloco aVencer/vencido do SCR."""
    if not isinstance(bruto, dict):
        total = _to_float(bruto)
        return {"total": total}
    out = {"total": _to_float(_get(bruto, "total"))}
    for api_key, norm_key, _horizonte, _label in _AVENCER_BUCKETS:
        out[norm_key] = _to_float(_get(bruto, api_key))
    # Se a API só mandou o total, os buckets ficam 0 — a curva usa o total no fim.
    return out


def _parse_prejuizo(bruto: Any) -> Dict[str, float]:
    if not isinstance(bruto, dict):
        return {"total": _to_float(bruto)}
    return {
        "total": _to_float(_get(bruto, "total")),
        "m12": _to_float(_get(bruto, "prejuizo12Meses")),
        "m24": _to_float(_get(bruto, "prejuizo24Meses")),
        "m36": _to_float(_get(bruto, "prejuizo36Meses")),
        "m48": _to_float(_get(bruto, "prejuizo48Meses")),
        "acima_48m": _to_float(_get(bruto, "acimaDe48Meses")),
    }


def _parse_modalidades(itens: Any) -> List[Dict[str, Any]]:
    """Normaliza `modalidades` com buckets de prazo (base da curva de dívidas)."""
    if isinstance(itens, dict):
        itens = [itens]
    if not isinstance(itens, list):
        return []

    resultado: List[Dict[str, Any]] = []
    for m in itens:
        if not isinstance(m, dict):
            continue
        a_vencer = _parse_faixa_valores(_get(m, "aVencer"))
        vencido = _parse_faixa_valores(_get(m, "vencido"))
        prejuizo = _parse_prejuizo(_get(m, "prejuizo"))
        saldo = (
            (a_vencer.get("total") or 0.0)
            + (vencido.get("total") or 0.0)
            + (prejuizo.get("total") or 0.0)
        )
        resultado.append(
            {
                "modalidade": _txt(_get(m, "descricaoModalidade", "modalidade", "descricao")),
                "codigo": _txt(_get(m, "codigoModalidade")),
                "limite_credito": _to_float(_get(m, "limiteCredito")),
                "a_vencer": a_vencer.get("total") or 0.0,
                "a_vencer_faixas": a_vencer,
                "vencido": vencido.get("total") or 0.0,
                "vencido_faixas": vencido,
                "prejuizo": prejuizo.get("total") or 0.0,
                "prejuizo_faixas": prejuizo,
                "saldo": saldo,
                "classificacao_risco": _txt(
                    _get(m, "classificacaoRisco", "classificacao", "rating")
                ),
            }
        )
    return resultado


def build_curva_vencimentos(modalidades: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Agrega buckets a vencer de todas as modalidades numa curva única."""
    totais = {norm: 0.0 for _, norm, _, _ in _AVENCER_BUCKETS}
    for m in modalidades or []:
        faixas = m.get("a_vencer_faixas") if isinstance(m.get("a_vencer_faixas"), dict) else {}
        for _, norm, _, _ in _AVENCER_BUCKETS:
            totais[norm] += float(faixas.get(norm) or 0.0)

    curva = []
    acumulado = 0.0
    for _api, norm, horizonte, label in _AVENCER_BUCKETS:
        valor = round(totais[norm], 2)
        acumulado += valor
        curva.append(
            {
                "chave": norm,
                "label": label,
                "horizonte_dias": horizonte,
                "valor": valor,
                "acumulado": round(acumulado, 2),
            }
        )
    return curva


def parse_scr(payload: Any) -> Dict[str, Any]:
    data = _unwrap(payload)
    score_scr = _to_int(_get(data, "score", "scoreScr", "pontuacao"))
    faixa_risco = _get(data, "faixaRisco", "faixa", "risco")
    # `modalidades` é o nome real; os demais cobrem payloads antigos.
    modalidades = _parse_modalidades(
        _get(data, "modalidades", "operacoes", "operacoesCredito", "detalheOperacoes", default=[])
    )
    qtd_operacoes = _to_int(_get(data, "quantidadeOperacoes", "qtdOperacoes"))
    if qtd_operacoes is None:
        qtd_operacoes = len(modalidades)
    carteira = _parse_carteira(_get(data, "carteiraCredito", "carteira"))
    risco_total = _to_float(_get(data, "riscoTotal"))
    # `responsabilidadeTotal` pode voltar vazio mesmo com operações ativas; nesse
    # caso o valor real está em `riscoTotal`/`carteiraCredito.total`. Exibir 0 aqui
    # esconderia a dívida do usuário, que é justamente o ponto do relatório.
    responsabilidade = (
        _to_float(_get(data, "responsabilidadeTotal", "valorTotal", "totalResponsabilidade"))
        or risco_total
        or carteira.get("total", 0.0)
    )
    # O `total` da carteira soma o limite ainda não usado; a dívida de fato é o saldo.
    divida_atual = sum(
        carteira.get(campo, 0.0) or 0.0 for campo in ("vencer", "vencido", "prejuizo")
    )
    if not divida_atual and modalidades:
        divida_atual = round(sum(float(m.get("saldo") or 0.0) for m in modalidades), 2)
    return {
        "score": score_scr,
        "faixa_risco": _txt(faixa_risco),
        "score_observacao": _txt(_get(data, "scoreObservacao")),
        "responsabilidade_total": responsabilidade,
        "divida_atual": divida_atual,
        "risco_total": risco_total,
        "quantidade_instituicoes": _to_int(
            _get(data, "quantidadeInstituicoes", "qtdInstituicoes", "numeroInstituicoes")
        ),
        "quantidade_operacoes": qtd_operacoes,
        "data_inicio_relacionamento": _txt(_get(data, "dataInicioRelacionamento")),
        "carteira": carteira,
        "modalidades": modalidades,
        "curva_vencimentos": build_curva_vencimentos(modalidades),
    }


def _bloco_pendencias(payload: Any, tipo: str) -> Dict[str, Any]:
    """Chega em `retorno.pessoa{Fisica,Juridica}.pendenciaFinanceira`.

    ATENÇÃO: `pendenciaFinanceira` é um *container* (tem `status` e
    `totalPendencia` mais as listas de ocorrências), não uma ocorrência. Tratá-lo
    como item cria uma negativação fantasma para quem tem ficha limpa.
    """
    data = _unwrap(payload)
    bloco = _escopo_pessoa(data, tipo)
    interno = _get(bloco, "pendenciaFinanceira", "pendenciasFinanceiras")
    return interno if isinstance(interno, dict) else bloco


def _pendencias_de_protestos(itens: Any) -> List[Dict[str, Any]]:
    resultado = []
    for p in itens:
        if not isinstance(p, dict):
            continue
        cartorios = _get(p, "cartorios", default=[]) or []
        nomes = [
            _txt(_get(c, "nome")) for c in cartorios if isinstance(c, dict) and _txt(_get(c, "nome"))
        ]
        resultado.append({
            "tipo": "Protesto",
            "credor": ", ".join(nomes) or None,
            "valor": _to_float(_get(p, "valorTotal", "valorProtestado", "valor")),
            "data_ocorrencia": None,
            "situacao": _txt(_get(p, "situacao")),
            "contrato": None,
            "detalhe": _txt(_get(p, "observacao")),
        })
    return resultado


def _pendencias_de_acoes(itens: Any) -> List[Dict[str, Any]]:
    resultado = []
    for a in itens:
        if not isinstance(a, dict):
            continue
        resultado.append({
            "tipo": _txt(_get(a, "tipoProcesso")) or "Ação judicial",
            "credor": _txt(_get(a, "autorProcesso")),
            "valor": _to_float(_get(a, "valor")),
            "data_ocorrencia": _txt(_get(a, "dataAjuizamento")),
            "situacao": _txt(_get(a, "status")),
            "contrato": _txt(_get(a, "numeroProcessoPrincipal", "numeroProcessoAntigo")),
            "detalhe": _txt(_get(a, "comarca")) or _txt(_get(a, "cidade")),
        })
    return resultado


def _pendencias_de_recuperacoes(itens: Any) -> List[Dict[str, Any]]:
    resultado = []
    for r in itens:
        if not isinstance(r, dict):
            continue
        resultado.append({
            "tipo": "Recuperação judicial / falência",
            "credor": _txt(_get(r, "nomeEmpresa")),
            "valor": _to_float(_get(r, "valor")),
            "data_ocorrencia": _txt(_get(r, "dataOcorrencia", "dataInclusao")),
            "situacao": _txt(_get(r, "status")),
            "contrato": _txt(_get(r, "numeroContrato")),
            "detalhe": _txt(_get(r, "motivo")),
        })
    return resultado


def _pendencias_de_cheques(itens: Any) -> List[Dict[str, Any]]:
    resultado = []
    for c in itens:
        if not isinstance(c, dict):
            continue
        qtd = _to_int(_get(c, "quantidadeOcorrencia"))
        agencia = _txt(_get(c, "nomeAgencia"))
        banco = _txt(_get(c, "codigoBanco"))
        resultado.append({
            "tipo": "Cheque sem fundo",
            "credor": agencia or (f"Banco {banco}" if banco else None),
            # Este produto informa a quantidade de ocorrências, não o valor.
            "valor": 0.0,
            "data_ocorrencia": _txt(_get(c, "dataUltimaOcorrencia")),
            "situacao": f"{qtd} ocorrência(s)" if qtd else None,
            "contrato": _txt(_get(c, "numeroAgencia")),
            "detalhe": None,
        })
    return resultado


# bucket real -> normalizador específico (cada um tem nomes de campo próprios)
_PENDENCIA_BUCKETS = {
    "protestos": _pendencias_de_protestos,
    "acoesJudiciais": _pendencias_de_acoes,
    "recuperacoesJudiciaisFalencia": _pendencias_de_recuperacoes,
    "chequesSemFundo": _pendencias_de_cheques,
}


def parse_pendencias(payload: Any, tipo: str = "pf") -> List[Dict[str, Any]]:
    """Normaliza as negativações do Detalhamento Negativo QUOD.

    Atenção: os protestos desse produto cobrem apenas SP — abrangência nacional
    exige o IEPTB (ver docs/integracao-direct-data.md).
    """
    bloco = _bloco_pendencias(payload, tipo)
    resultado: List[Dict[str, Any]] = []
    for chave, normalizador in _PENDENCIA_BUCKETS.items():
        itens = _get(bloco, chave, default=[]) or []
        if isinstance(itens, dict):
            itens = [itens]
        if isinstance(itens, list):
            resultado.extend(normalizador(itens))
    return resultado


def parse_pendencias_resumo(payload: Any, tipo: str = "pf") -> Dict[str, Any]:
    """Status agregado do Detalhamento Negativo (ex.: "Não Consta Pendência").

    Permite dizer "consultamos e não consta" em vez de exibir uma linha vazia.
    """
    bloco = _bloco_pendencias(payload, tipo)
    return {
        "status": _txt(_get(bloco, "status")),
        "total": _to_int(_get(bloco, "totalPendencia")) or 0,
    }


def parse_divida_ativa(payload: Any) -> Dict[str, Any]:
    """Dívida ativa da União (PGFN — Lista de Devedores)."""
    data = _unwrap(payload)
    itens = _get(
        data, "dividas", "debitos", "listaDevedores", "devedores", "registros", default=None
    )
    if isinstance(itens, dict):
        itens = [itens]
    if not isinstance(itens, list):
        itens = []

    normalizados: List[Dict[str, Any]] = []
    total = 0.0
    for item in itens:
        if not isinstance(item, dict):
            continue
        valor = _to_float(_get(item, "valor", "valorConsolidado", "montante", "valorTotal"))
        total += valor
        normalizados.append(
            {
                "valor": valor,
                "situacao": _txt(_get(item, "situacao", "status")),
                "natureza": _txt(_get(item, "naturezaDivida", "natureza", "tipoDivida", "tipo")),
                "orgao": _txt(_get(item, "orgao", "orgaoResponsavel", "unidade")),
                "inscricao": _txt(_get(item, "numeroInscricao", "inscricao", "numero")),
            }
        )

    possui = _get(data, "possuiDivida", "possuiDebitos", "temDivida")
    return {
        "possui_divida": bool(normalizados) if possui is None else bool(possui),
        "quantidade": len(normalizados),
        "valor_total": round(total, 2),
        "itens": normalizados[:20],
    }


def _mesano_atual() -> str:
    now = datetime.now(timezone.utc)
    return f"{now.month:02d}{now.year}"


def _scr_mesano_param() -> Dict[str, str]:
    """MESANO do SCR — opcional na API e, por padrão, omitido.

    O SCR é fechado mensalmente com defasagem: pedir o mês corrente faz a
    consulta ser recusada (nem chega a debitar crédito). Omitindo, a Direct Data
    devolve a competência mais recente disponível. Use `DIRECTD_SCR_MESANO`
    (formato MMAAAA, ou "atual") só para forçar uma competência específica.
    """
    valor = (os.environ.get("DIRECTD_SCR_MESANO", "") or "").strip()
    if not valor:
        return {}
    return {"MESANO": _mesano_atual() if valor.lower() == "atual" else valor}


def _flag(name: str, default: bool = True) -> bool:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def _endpoint(name: str, default: str) -> str:
    return (os.environ.get(name, "") or "").strip() or default


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

    if response.status_code >= 400:
        # A mensagem da Direct Data é o que diz de fato o que deu errado; sem ela
        # a falha vira um "indisponível" opaco. Não contém o documento.
        try:
            motivo = _txt(_get(_meta(response.json()), "mensagem", "resultado"))
        except ValueError:
            motivo = None
        logger.warning(
            "Direct Data %s falhou: HTTP %s%s",
            label, response.status_code, f" — {motivo}" if motivo else "",
        )
        if response.status_code == 401:
            raise CreditProviderError("Token da Direct Data inválido (ou IP não liberado).")
        # Na Direct Data, 403 significa saldo indisponível — não falta de permissão.
        if response.status_code in (402, 403):
            raise CreditProviderError("Saldo de créditos insuficiente para a consulta.")
        if response.status_code >= 500:
            raise CreditProviderError("Provedor de crédito indisponível no momento.")
        raise CreditProviderError("Consulta de crédito recusada pelo provedor.")

    try:
        return response.json()
    except ValueError as exc:
        raise CreditProviderError("O provedor devolveu uma resposta inválida.") from exc


async def _gerar_relatorio_directdata(
    documento: str, tipo: str, apis: Optional[List[str]] = None
) -> CreditReport:
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

    selected = normalize_apis(apis)
    digits = only_digits(documento)
    doc_param = "CPF" if tipo == "pf" else "CNPJ"
    base_params = {doc_param: digits, "Token": token}

    want_scr = "scr" in selected
    want_pendencias = (
        "pendencias" in selected
        and _flag("DIRECTD_PENDENCIAS_ENABLED")
        and bool(_endpoint("DIRECTD_PENDENCIAS_ENDPOINT", ENDPOINT_PENDENCIAS))
    )
    want_divida = (
        "divida_ativa" in selected
        and _flag("DIRECTD_DIVIDA_ATIVA_ENABLED")
        and bool(_endpoint("DIRECTD_DIVIDA_ATIVA_ENDPOINT", ENDPOINT_DIVIDA_ATIVA))
    )

    avisos: List[str] = []

    async with httpx.AsyncClient(timeout=timeout) as client:
        tasks = {
            "score": _directd_get(
                client,
                base_url,
                _endpoint("DIRECTD_SCORE_ENDPOINT", ENDPOINT_SCORE),
                dict(base_params),
                "Score",
            ),
        }
        if want_scr:
            tasks["scr"] = _directd_get(
                client,
                base_url,
                _endpoint("DIRECTD_SCR_ENDPOINT", ENDPOINT_SCR),
                {**base_params, **_scr_mesano_param()},
                "SCR",
            )
        if want_pendencias:
            tasks["pendencias"] = _directd_get(
                client,
                base_url,
                _endpoint("DIRECTD_PENDENCIAS_ENDPOINT", ENDPOINT_PENDENCIAS),
                dict(base_params),
                "Pendencias",
            )
        if want_divida:
            tasks["divida_ativa"] = _directd_get(
                client,
                base_url,
                _endpoint("DIRECTD_DIVIDA_ATIVA_ENDPOINT", ENDPOINT_DIVIDA_ATIVA),
                dict(base_params),
                "DividaAtiva",
            )

        results = await asyncio.gather(*tasks.values(), return_exceptions=True)
        raw = dict(zip(tasks.keys(), results))

    # Score é o dado principal — se falhar, é erro. Demais degradam com aviso.
    score_res = raw.get("score")
    if isinstance(score_res, Exception):
        raise score_res if isinstance(score_res, CreditProviderError) else CreditProviderError(
            "Não foi possível obter o score de crédito."
        )
    score_norm = parse_score(score_res, tipo)

    scr_norm: Dict[str, Any] = {}
    scr_res = raw.get("scr")
    if want_scr:
        if isinstance(scr_res, Exception):
            avisos.append("Resumo BACEN (SCR) indisponível nesta consulta.")
        else:
            scr_norm = parse_scr(scr_res)

    pendencias: List[Dict[str, Any]] = []
    pendencias_resumo: Dict[str, Any] = {}
    if "pendencias" in selected and not want_pendencias:
        avisos.append("Consulta de PEFIN/REFIN não habilitada.")
    elif want_pendencias:
        pend_res = raw.get("pendencias")
        if isinstance(pend_res, Exception):
            avisos.append("Consulta de negativações (PEFIN/REFIN) indisponível.")
        else:
            pendencias = parse_pendencias(pend_res, tipo)
            pendencias_resumo = parse_pendencias_resumo(pend_res, tipo)

    divida_ativa: Dict[str, Any] = {}
    if want_divida:
        divida_res = raw.get("divida_ativa")
        if isinstance(divida_res, Exception):
            avisos.append("Consulta de dívida ativa da União (PGFN) indisponível.")
        else:
            divida_ativa = parse_divida_ativa(divida_res)

    rating = (
        derive_rating_bacen(
            scr_norm.get("modalidades", []),
            scr_norm.get("faixa_risco"),
            scr_norm.get("score"),
        )
        if scr_norm
        else None
    )
    # O comprovante vem em metaDados (não em `retorno`) e só o SCR gera PDF.
    comprovante = None
    if want_scr and scr_res is not None and not isinstance(scr_res, Exception):
        comprovante = _get(_meta(scr_res), "urlComprovante", "comprovante")

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
        capacidade_pagamento=score_norm.get("capacidade_pagamento"),
        perfil=score_norm.get("perfil"),
        rating_bacen=rating,
        # modalidades + curva_vencimentos ficam no payload: alimentam o import
        # para Dívidas / Projeção ("Importar para o meu plano").
        scr=scr_norm,
        pendencias=pendencias,
        tem_pendencias=bool(pendencias),
        pendencias_resumo=pendencias_resumo,
        divida_ativa=divida_ativa,
        comprovante_url=str(comprovante).strip() if comprovante else None,
        fonte="directdata",
        avisos=avisos,
    )


# =============================================================================
# Provider: mock (não gasta crédito — para desenvolver o front)
# =============================================================================
def _mock_payloads(tipo: str) -> Dict[str, Any]:
    """Payloads de demonstração — espelham a estrutura REAL da Direct Data.

    Os aninhamentos (`pessoaFisica`, `pendenciaFinanceira`) são justamente onde
    o mapeamento erra, então o mock precisa reproduzi-los para ter valor.
    """
    pessoa = "pessoaFisica" if tipo == "pf" else "pessoaJuridica"
    return {
        "score": {
            "metaDados": {"mensagem": "Sucesso"},
            "retorno": {
                "documentoConsultado": "***",
                pessoa: {
                    "score": 742,
                    "faixaScore": "Baixo índice de inadimplência",
                    "capacidadePagamento": "Média",
                    "perfil": "Consumidor adimplente",
                    "motivos": [
                        "Bom histórico de pagamentos",
                        "Baixo comprometimento de renda",
                    ],
                },
            },
        },
        "scr": {
            "metaDados": {
                "mensagem": "Sucesso",
                "urlComprovante": "https://exemplo.directd.com.br/comprovante/mock.pdf",
            },
            "retorno": {
                "score": "680",
                "faixaRisco": "Médio baixo",
                "responsabilidadeTotal": "R$ 18.450,75",
                "quantidadeInstituicoes": 3,
                "quantidadeOperacoes": 2,
                "carteiraCredito": {
                    "total": "R$ 18.450,75",
                    "limite": "R$ 6.000,00",
                    "prejuizo": "R$ 0,00",
                    "vencer": "R$ 17.200,75",
                    "vencido": "R$ 1.250,00",
                },
                "modalidades": [
                    {
                        "descricaoModalidade": "Cartão de crédito",
                        "codigoModalidade": "0203",
                        "limiteCredito": "R$ 6.000,00",
                        "aVencer": {
                            "total": "R$ 4.200,00",
                            "de1a30Dias": "R$ 800,00",
                            "de31a60Dias": "R$ 800,00",
                            "de61a90Dias": "R$ 800,00",
                            "de91a180Dias": "R$ 1.000,00",
                            "de181a360Dias": "R$ 800,00",
                            "acimaDe361Dias": "R$ 0,00",
                        },
                        "vencido": {"total": "R$ 0,00"},
                        "prejuizo": {"total": "R$ 0,00"},
                    },
                    {
                        "descricaoModalidade": "Empréstimo pessoal",
                        "codigoModalidade": "0401",
                        "aVencer": {
                            "total": "R$ 13.000,75",
                            "de1a30Dias": "R$ 1.000,00",
                            "de31a60Dias": "R$ 1.000,00",
                            "de61a90Dias": "R$ 1.000,00",
                            "de91a180Dias": "R$ 2.000,00",
                            "de181a360Dias": "R$ 4.000,00",
                            "acimaDe361Dias": "R$ 4.000,75",
                        },
                        "vencido": {"total": "R$ 1.250,00", "de1a30Dias": "R$ 1.250,00"},
                        "prejuizo": {"total": "R$ 0,00"},
                    },
                ],
            },
        },
        "pendencias": {
            "metaDados": {"mensagem": "Sucesso"},
            "retorno": {
                pessoa: {
                    "pendenciaFinanceira": {
                        "status": "Consta Pendência",
                        "totalPendencia": 2,
                        "protestos": [
                            {
                                "situacao": "Em aberto",
                                "valorTotal": 1200.00,
                                "cartorios": [
                                    {"nome": "3º Ofício de Notas", "cidade": "São Paulo",
                                     "quantidadeProtestos": 1, "valorProtestado": 1200.00}
                                ],
                                "observacao": "Protesto registrado em SP",
                            }
                        ],
                        "acoesJudiciais": [
                            {
                                "numeroProcessoPrincipal": "1234567-89.2025.8.26.0100",
                                "autorProcesso": "Loja Exemplo LTDA",
                                "tipoProcesso": "Execução de título",
                                "status": "Em andamento",
                                "valor": 349.90,
                                "dataAjuizamento": "12/03/2026",
                                "comarca": "São Paulo",
                            }
                        ],
                        "recuperacoesJudiciaisFalencia": [],
                        "chequesSemFundo": [],
                    }
                }
            },
        },
        "divida_ativa": {
            "metaDados": {"mensagem": "Sucesso"},
            "retorno": {"possuiDivida": False, "dividas": []},
        },
    }


async def _gerar_relatorio_mock(
    documento: str, tipo: str, apis: Optional[List[str]] = None
) -> CreditReport:
    selected = normalize_apis(apis)
    payloads = _mock_payloads(tipo)
    score_norm = parse_score(payloads["score"], tipo)
    scr_norm = parse_scr(payloads["scr"]) if "scr" in selected else {}
    pendencias = (
        parse_pendencias(payloads["pendencias"], tipo) if "pendencias" in selected else []
    )
    pendencias_resumo = (
        parse_pendencias_resumo(payloads["pendencias"], tipo)
        if "pendencias" in selected
        else {}
    )
    divida_ativa = (
        parse_divida_ativa(payloads["divida_ativa"]) if "divida_ativa" in selected else {}
    )
    rating = derive_rating_bacen(
        scr_norm.get("modalidades", []),
        scr_norm.get("faixa_risco"),
        scr_norm.get("score"),
    ) if scr_norm else None
    logger.info(
        "Relatório de crédito gerado (mock) doc=%s tipo=%s apis=%s",
        mask_documento(documento), tipo, ",".join(selected),
    )
    return CreditReport(
        documento=mask_documento(documento),
        tipo=tipo,
        score=score_norm.get("score"),
        score_faixa=score_norm.get("faixa", "indisponivel"),
        score_motivos=score_norm.get("motivos", []),
        capacidade_pagamento=score_norm.get("capacidade_pagamento"),
        perfil=score_norm.get("perfil"),
        rating_bacen=rating,
        scr=scr_norm,
        pendencias=pendencias,
        tem_pendencias=bool(pendencias),
        pendencias_resumo=pendencias_resumo,
        divida_ativa=divida_ativa,
        comprovante_url=(
            "https://exemplo.directd.com.br/comprovante/mock.pdf"
            if "scr" in selected
            else None
        ),
        fonte="mock",
        avisos=["Relatório de demonstração (provedor mock) — nenhum crédito consumido."],
    )


# =============================================================================
# Seletor (igual ao fallback de visão em receipt_vision.py)
# =============================================================================
async def gerar_relatorio(
    documento: str,
    tipo: Optional[str] = None,
    apis: Optional[List[str]] = None,
) -> CreditReport:
    """Gera o relatório normalizado de crédito.

    Valida o documento (dígitos verificadores) antes de qualquer consulta paga
    e seleciona o provider via env `CREDIT_PROVIDER` (directdata | mock).
    `apis` limita quais fontes consultar (score sempre incluso).
    """
    tipo_validado = valida_documento(documento)
    if tipo and tipo != tipo_validado:
        raise CreditProviderError("Tipo de documento não confere com o número informado.")
    selected = normalize_apis(apis)

    provider = os.environ.get("CREDIT_PROVIDER", "directdata").strip().lower()
    if provider == "mock":
        return await _gerar_relatorio_mock(documento, tipo_validado, selected)
    if provider == "directdata":
        return await _gerar_relatorio_directdata(documento, tipo_validado, selected)
    raise CreditProviderError(f"Provedor de crédito desconhecido: {provider}")
