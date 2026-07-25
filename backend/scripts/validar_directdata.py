#!/usr/bin/env python3
"""Valida o token e os parsers da Direct Data contra a API real.

Os nomes de campo dos parsers em `credit_provider.py` foram inferidos da
central de ajuda. Este script confere o retorno real ANTES de a feature ir
para produção, mostrando quanto cada consulta custou e o saldo restante.

Uso:
    # 1) Só checa se o token autentica (documento inválido de propósito).
    #    Não retorna dados e não deve consumir crédito.
    python scripts/validar_directdata.py --probe

    # 2) Valida os parsers com um documento real (consome crédito!).
    #    Use SEU PRÓPRIO CPF — consultar terceiro sem consentimento é LGPD.
    python scripts/validar_directdata.py 529.982.247-25
    python scripts/validar_directdata.py SEU_CPF --apenas renda,divida

Sai com código 1 se o token estiver inválido ou sem saldo.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

import credit_provider as cp  # noqa: E402

# nome -> (endpoint, custo em BRL, parser, só PF?)
CONSULTAS = {
    "score": (cp.ENDPOINT_SCORE, 1.98, cp.parse_score, False),
    "scr": (cp.ENDPOINT_SCR, 4.90, cp.parse_scr, False),
    "pendencias": (cp.ENDPOINT_PENDENCIAS, 2.38, cp.parse_pendencias, False),
    "renda": (cp.ENDPOINT_RENDA, 0.36, cp.parse_renda, True),
    "divida": (cp.ENDPOINT_DIVIDA_ATIVA, 0.36, cp.parse_divida_ativa, False),
}

CPF_INVALIDO = "00000000000"


def _meta(payload) -> dict:
    """Extrai metaDados (custo, saldo, mensagem) de qualquer resposta."""
    if not isinstance(payload, dict):
        return {}
    meta = payload.get("metaDados") or payload.get("MetaDados") or {}
    return meta if isinstance(meta, dict) else {}


def _campos_preenchidos(valor: dict) -> tuple[int, int]:
    """Conta quantos campos do parser saíram com dado útil (não None/0/vazio)."""
    total = len(valor)
    ok = sum(1 for v in valor.values() if v not in (None, "", 0, 0.0, [], {}, False))
    return ok, total


async def _chamar(client, endpoint: str, documento: str, token: str) -> tuple[int, object]:
    base = os.environ.get("DIRECTD_BASE_URL", cp.DEFAULT_BASE_URL).rstrip("/")
    digits = cp.only_digits(documento)
    param = "CPF" if len(digits) != 14 else "CNPJ"
    params = {param: digits, "Token": token}
    if endpoint == cp.ENDPOINT_SCR:
        params["MESANO"] = cp._mesano_atual()
    resp = await client.get(f"{base}/{endpoint.lstrip('/')}", params=params)
    try:
        return resp.status_code, resp.json()
    except ValueError:
        return resp.status_code, resp.text


async def probe(token: str) -> int:
    """Confere autenticação sem pedir dados de ninguém."""
    print("Probe de autenticação (documento inválido de propósito)\n")
    async with httpx.AsyncClient(timeout=45) as client:
        status, payload = await _chamar(client, cp.ENDPOINT_SCORE, CPF_INVALIDO, token)

    meta = _meta(payload)
    print(f"  HTTP {status}")
    if meta:
        for chave in ("mensagem", "custoTotalEmCreditos", "saldoEmCreditos", "apiVersao"):
            valor = cp._get(meta, chave)
            if valor is not None:
                print(f"  {chave}: {valor}")
    else:
        print(f"  resposta: {str(payload)[:300]}")

    if status in (401, 403):
        print("\nFALHOU: token inválido ou sem permissão.")
        return 1
    if status == 402:
        print("\nFALHOU: conta sem saldo em créditos.")
        return 1
    print("\nToken autenticou (o erro acima é do documento inválido, esperado).")
    return 0


async def validar(documento: str, token: str, apenas: set[str] | None, mostrar_bruto: bool) -> int:
    tipo = cp.valida_documento(documento)
    alvos = {k: v for k, v in CONSULTAS.items() if not apenas or k in apenas}
    if tipo == "pj":
        alvos = {k: v for k, v in alvos.items() if not v[3]}

    custo_previsto = sum(v[1] for v in alvos.values())
    print(f"Documento: {cp.mask_documento(documento)} ({tipo.upper()})")
    print(f"Consultas: {', '.join(alvos)}")
    print(f"Custo previsto: R$ {custo_previsto:.2f}\n")

    saldo_final = None
    custo_real = 0.0
    problemas: list[str] = []

    async with httpx.AsyncClient(timeout=45) as client:
        for nome, (endpoint, _, parser, _) in alvos.items():
            status, payload = await _chamar(client, endpoint, documento, token)
            meta = _meta(payload)
            custo = cp._to_float(cp._get(meta, "custoTotalEmCreditos")) or 0.0
            custo_real += custo
            saldo = cp._get(meta, "saldoEmCreditos")
            if saldo is not None:
                saldo_final = saldo

            print(f"── {nome}  ({endpoint})")
            print(f"   HTTP {status} · custo {custo} · {cp._get(meta, 'mensagem') or 's/ mensagem'}")

            if status >= 400:
                problemas.append(f"{nome}: HTTP {status}")
                print()
                continue

            try:
                parsed = parser(payload)
            except Exception as exc:  # o parser não deve explodir com dado real
                problemas.append(f"{nome}: parser quebrou ({exc})")
                print(f"   PARSER QUEBROU: {exc}\n")
                continue

            if isinstance(parsed, list):
                # Lista vazia é resultado legítimo (ficha limpa), não erro de parser.
                print(f"   parser OK: {len(parsed)} ocorrência(s)")
            else:
                ok, total = _campos_preenchidos(parsed)
                if ok == 0:
                    problemas.append(f"{nome}: parser não extraiu nada — conferir nomes de campo")
                    print(f"   PARSER VAZIO ({ok}/{total}) — provável divergência de nomes")
                else:
                    print(f"   parser OK: {ok}/{total} campos com dado")
            print(f"   {json.dumps(parsed, ensure_ascii=False, default=str)[:400]}")
            if mostrar_bruto:
                bruto = cp._unwrap(payload)
                print(f"   chaves do retorno: {sorted(bruto)[:25]}")
            print()

    print(f"Custo real: {custo_real} créditos · saldo restante: {saldo_final}")
    if problemas:
        print("\nPendências para revisar:")
        for p in problemas:
            print(f"  - {p}")
        return 1
    print("\nTudo certo: token válido e parsers alinhados com o retorno real.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Valida token e parsers da Direct Data.")
    ap.add_argument("documento", nargs="?", help="CPF/CNPJ real (consome crédito)")
    ap.add_argument("--probe", action="store_true", help="só testa o token, sem consultar ninguém")
    ap.add_argument("--apenas", help="subconjunto: score,scr,pendencias,renda,divida")
    ap.add_argument("--bruto", action="store_true", help="mostra as chaves do payload cru")
    args = ap.parse_args()

    token = os.environ.get("DIRECTD_TOKEN", "").strip()
    if not token:
        print("DIRECTD_TOKEN não encontrado no backend/.env", file=sys.stderr)
        return 1

    if args.probe or not args.documento:
        return asyncio.run(probe(token))

    apenas = {s.strip() for s in args.apenas.split(",")} if args.apenas else None
    try:
        return asyncio.run(validar(args.documento, token, apenas, args.bruto))
    except cp.CreditProviderError as exc:
        print(f"Documento rejeitado localmente: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
