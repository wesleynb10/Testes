"""
Twilio WhatsApp webhook — recebe lançamentos financeiros via mensagem
e persiste no histórico do usuário (coleção `transactions`).

Endpoint público chamado pela Twilio:
  POST /api/integracao/twilio-webhook
  Content-Type: application/x-www-form-urlencoded
"""
from __future__ import annotations

import logging
import os
import re
import uuid
import xml.sax.saxutils as xml_escape
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Form, Request
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from financial_state import ensure_transaction_budget_item
from audio_transcription import (
    AudioTranscriptionError,
    download_twilio_audio,
    parse_spoken_expense,
    transcribe_audio_media,
)
from receipt_vision import (
    ReceiptVisionError,
    analyze_receipt_media,
    download_twilio_media,
    is_audio_media_type,
    is_receipt_media_type,
    looks_like_audio_media,
    media_fingerprint,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/integracao", tags=["integracao-twilio"])

# Categorias alinhadas à regra 50/30/20 do FinPremium
VALID_CATEGORIES = ("necessidades", "desejos", "investimentos")


# -----------------------------------------------------------------------------
# Helpers — telefone / TwiML
# -----------------------------------------------------------------------------
def limpar_telefone(from_raw: str) -> str:
    """
    Extrai E.164 do campo Twilio `From`.
    Ex.: 'whatsapp:+5511987654321' → '+5511987654321'
    """
    if not from_raw:
        return ""
    value = from_raw.strip()
    if value.lower().startswith("whatsapp:"):
        value = value.split(":", 1)[1].strip()
    # Mantém apenas + e dígitos
    digits = re.sub(r"[^\d+]", "", value)
    if digits and not digits.startswith("+"):
        digits = f"+{digits}"
    return digits


def twiml_message(texto: str) -> Response:
    """Resposta XML (TwiML) esperada pela Twilio."""
    safe = xml_escape.escape(texto)
    body = f'<?xml version="1.0" encoding="UTF-8"?>\n<Response><Message>{safe}</Message></Response>'
    return Response(content=body, media_type="application/xml")


# -----------------------------------------------------------------------------
# Stub — Emergent AI
# -----------------------------------------------------------------------------
_SPEND_PATTERNS = (
    r"(?:eu\s+)?gastei\s+(?:em|no|na|com|um|uma)?\s*(.+)$",
    r"(?:eu\s+)?comprei\s+(?:um|uma|o|a)?\s*(.+)$",
    r"(?:eu\s+)?paguei\s+(?:um|uma|o|a|em|no|na)?\s*(.+)$",
    r"(?:foi|foi\s+um|foi\s+uma)\s+(.+)$",
)


def normalize_expense_description(raw: str) -> str:
    """
    Limpa fala informal para um nome de gasto curto.
    "Oi, a gente eh, eu gastei em uma pizza" → "Pizza"
    """
    text = (raw or "").strip()
    if not text:
        return "Lançamento WhatsApp"

    text = re.sub(r"(?i)r\$\s*\d[\d.,]*", " ", text)
    text = re.sub(
        r"(?i)\b(?:oi|olá|ola|e\s*a[ií]|fala|bom\s*dia|boa\s*tarde|boa\s*noite)\b[,!.]?",
        " ",
        text,
    )
    text = re.sub(
        r"(?i)\b(?:eh|éh|ahn|tipo|então|entao|né|ne|assim|a\s+gente|eu)\b",
        " ",
        text,
    )
    text = re.sub(r"\s+", " ", text).strip(" ,.-")

    for pattern in _SPEND_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            text = match.group(1).strip()
            break

    text = re.sub(
        r"(?i)\bno\s+(débito|debito|crédito|credito|pix|dinheiro)\b",
        " ",
        text,
    )
    text = re.sub(r"(?i)\b(?:reais?|centavos?)\b", " ", text)
    text = re.sub(r"(?i)^\s*(?:um|uma|uns|umas|o|a|os|as)\s+", "", text)
    text = re.sub(r"\s+", " ", text).strip(" ,.-")

    words = text.split()
    if len(words) > 5:
        text = " ".join(words[:5])
    if not text:
        return "Lançamento WhatsApp"
    return text[:1].upper() + text[1:]


FORMA_LABEL = {
    "debito": "débito",
    "credito": "crédito",
    "pix": "Pix",
    "dinheiro": "dinheiro",
}


def detectar_forma_pagamento(text: str) -> Optional[str]:
    """Extrai a forma de pagamento de um texto livre (débito/crédito/pix/dinheiro)."""
    lower = (text or "").lower()
    # Débito antes de crédito para "cartão de débito" não cair em crédito.
    if "déb" in lower or "debito" in lower:
        return "debito"
    if (
        "créd" in lower
        or "credito" in lower
        or "cartão" in lower
        or "cartao" in lower
    ):
        return "credito"
    if "pix" in lower:
        return "pix"
    if "dinheiro" in lower or "espécie" in lower or "especie" in lower or "cash" in lower:
        return "dinheiro"
    return None


def enviar_para_emergent_ai(texto: str) -> Dict[str, Any]:
    """
    Placeholder do agente inteligente Emergent AI.

    Em produção, esta função deve chamar o endpoint/agente do Emergent
    (EMERGENT_AI_URL + EMERGENT_AI_API_KEY) e devolver o JSON estruturado.

    Aqui simulamos o parse de mensagens no estilo:
      "Almoço R$ 42,50 no débito"
    """
    raw = (texto or "").strip()
    if not raw:
        return {
            "valor": 0.0,
            "categoria": "desejos",
            "subcategoria": "Outros",
            "descricao": "Mensagem vazia",
            "forma_pagamento": None,
            "confianca": 0.0,
            "source": "emergent_ai_stub",
        }

    # Valor: R$ 42,50 | 42.50 | 42,50
    amount = 0.0
    money_match = re.search(
        r"(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:[.,]\d{2})?)",
        raw,
        re.IGNORECASE,
    )
    if money_match:
        num = money_match.group(1)
        # BR: 1.234,56 → 1234.56 | 42,50 → 42.50
        if "," in num and "." in num:
            num = num.replace(".", "").replace(",", ".")
        elif "," in num:
            num = num.replace(",", ".")
        try:
            amount = float(num)
        except ValueError:
            amount = 0.0

    lower = raw.lower()
    categoria = "desejos"
    subcategoria = "Outros"

    if any(k in lower for k in ("aluguel", "mercado", "supermercado", "luz", "água", "agua", "internet", "transporte", "uber", "farmácia", "farmacia", "saúde", "saude")):
        categoria = "necessidades"
        if "aluguel" in lower:
            subcategoria = "Aluguel"
        elif any(k in lower for k in ("mercado", "supermercado")):
            subcategoria = "Supermercado"
        elif any(k in lower for k in ("uber", "transporte", "combust", "posto")):
            subcategoria = "Transporte"
        else:
            subcategoria = "Contas / Essenciais"
    elif any(k in lower for k in ("invest", "ações", "acoes", "fii", "cdb", "tesouro", "previd")):
        categoria = "investimentos"
        subcategoria = "Aplicação"
    elif any(k in lower for k in ("almoço", "almoco", "jantar", "restaurante", "ifood", "café", "cafe", "lazer", "cinema", "pizza", "hamburguer", "hamburger", "lanche")):
        categoria = "desejos"
        subcategoria = "Restaurantes"

    forma = detectar_forma_pagamento(raw)

    descricao = normalize_expense_description(raw)

    return {
        "valor": round(amount, 2),
        "categoria": categoria if categoria in VALID_CATEGORIES else "desejos",
        "subcategoria": subcategoria,
        "descricao": descricao,
        "forma_pagamento": forma,
        "confianca": 0.75 if amount > 0 else 0.4,
        "source": "emergent_ai_stub",
        "raw_input": raw,
    }


# -----------------------------------------------------------------------------
# Persistência
# -----------------------------------------------------------------------------
async def buscar_usuario_por_telefone(db: AsyncIOMotorDatabase, phone: str) -> Optional[dict]:
    """
    Localiza cliente FinPremium pelo WhatsApp.
    Aceita `phone` ou `whatsapp` (com/sem prefixo whatsapp:).
    """
    if not phone:
        return None
    variants = {
        phone,
        phone.lstrip("+"),
        f"whatsapp:{phone}",
        f"whatsapp:+{phone.lstrip('+')}",
    }
    user = await db.users.find_one(
        {
            "$or": [
                {"phone": {"$in": list(variants)}},
                {"whatsapp": {"$in": list(variants)}},
            ]
        },
        {"password_hash": 0, "_id": 0},
    )
    return user


async def salvar_transacao(
    db: AsyncIOMotorDatabase,
    user: dict,
    phone: str,
    raw_body: str,
    parsed: Dict[str, Any],
    source: str = "whatsapp",
) -> dict:
    occurred_at = None
    if parsed.get("data"):
        try:
            occurred_at = datetime.strptime(parsed["data"], "%Y-%m-%d").replace(
                tzinfo=timezone.utc
            ).isoformat()
        except (TypeError, ValueError):
            occurred_at = None
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user.get("id"),
        "user_email": user.get("email"),
        "phone": phone,
        "source": source,
        "raw_body": raw_body,
        "amount": float(parsed.get("valor") or 0),
        "category": parsed.get("categoria") or "desejos",
        "subcategory": parsed.get("subcategoria") or "Outros",
        "description": parsed.get("descricao") or "Lançamento WhatsApp",
        "payment_method": parsed.get("forma_pagamento"),
        "occurred_at": occurred_at,
        "ai_meta": {
            "confianca": parsed.get("confianca"),
            "source": parsed.get("source"),
        },
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    await ensure_transaction_budget_item(db, user, doc)
    return doc


def _confirmation_intent(body: str) -> Optional[bool]:
    normalized = re.sub(r"[^\w]", "", (body or "").strip().casefold())
    if normalized in {"sim", "s", "confirmar", "confirmo", "ok", "pode"}:
        return True
    if normalized in {"nao", "não", "n", "cancelar", "cancela"}:
        return False
    return None


async def _latest_pending(db: AsyncIOMotorDatabase, user_id: str) -> Optional[dict]:
    return await db.pending_transactions.find_one(
        {
            "user_id": user_id,
            "status": "pending",
            "expires_at": {"$gte": datetime.now(timezone.utc).isoformat()},
        },
        sort=[("created_at", -1)],
    )


def _resumo(parsed: Dict[str, Any]) -> str:
    """Resumo curto de um lançamento para mensagens do WhatsApp."""
    value = f"R$ {float(parsed.get('valor') or 0):.2f}".replace(".", ",")
    forma = parsed.get("forma_pagamento")
    forma_txt = f" · {FORMA_LABEL.get(forma, forma)}" if forma else ""
    return (
        f"{parsed.get('descricao') or 'Lançamento'} — {value} "
        f"({parsed.get('categoria')}/{parsed.get('subcategoria')}){forma_txt}"
    )


def _prompt_for_stage(pending: Dict[str, Any]) -> Response:
    """Mensagem a enviar conforme o estágio do lançamento pendente."""
    parsed = pending.get("parsed", {})
    if pending.get("stage") == "awaiting_payment":
        return twiml_message(
            f"Entendi: {_resumo(parsed)}.\n"
            "Qual foi a forma de pagamento? Responda: débito, crédito, pix ou dinheiro."
        )
    return twiml_message(
        f"Confirmar lançamento?\n{_resumo(parsed)}.\n"
        "Responda SIM para confirmar ou NÃO para cancelar."
    )


async def _start_pending_flow(
    db: AsyncIOMotorDatabase,
    user: dict,
    phone: str,
    parsed: Dict[str, Any],
    *,
    source: str,
    raw_body: str = "",
    caption: Optional[str] = None,
    image_fingerprint: Optional[str] = None,
) -> Response:
    """
    Cria um lançamento pendente e pergunta a forma de pagamento (se faltar)
    ou pede confirmação. Nada é gravado em `transactions` antes do SIM.
    """
    now = datetime.now(timezone.utc)
    stage = "awaiting_confirmation" if parsed.get("forma_pagamento") else "awaiting_payment"
    pending = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_email": user.get("email"),
        "phone": phone,
        "status": "pending",
        "stage": stage,
        "source": source,
        "raw_body": (raw_body or "")[:500],
        "caption": (caption or "")[:300],
        "parsed": parsed,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=30)).isoformat(),
    }
    if image_fingerprint:
        pending["image_fingerprint"] = image_fingerprint
    await db.pending_transactions.insert_one(pending)
    pending.pop("_id", None)
    return _prompt_for_stage(pending)


async def _finalize_pending(
    db: AsyncIOMotorDatabase,
    user: dict,
    phone: str,
    pending: Dict[str, Any],
    *,
    confirmed: bool,
) -> Response:
    """Confirma (grava) ou cancela um lançamento pendente."""
    if not confirmed:
        await db.pending_transactions.update_one(
            {"id": pending["id"], "status": "pending"},
            {
                "$set": {
                    "status": "cancelled",
                    "resolved_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        return twiml_message("Lançamento cancelado. Nada foi registrado.")

    claimed = await db.pending_transactions.find_one_and_update(
        {"id": pending["id"], "status": "pending"},
        {
            "$set": {
                "status": "processing",
                "resolved_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        return_document=ReturnDocument.AFTER,
    )
    if not claimed:
        return twiml_message("Este lançamento já foi processado.")

    try:
        tx = await salvar_transacao(
            db,
            user,
            phone,
            claimed.get("raw_body") or claimed.get("caption") or "Lançamento WhatsApp",
            claimed["parsed"],
            source=claimed.get("source", "whatsapp"),
        )
        await db.pending_transactions.update_one(
            {"id": claimed["id"]},
            {"$set": {"status": "confirmed", "transaction_id": tx["id"]}},
        )
        value = f"R$ {tx['amount']:.2f}".replace(".", ",")
        forma = tx.get("payment_method")
        forma_txt = f" · {FORMA_LABEL.get(forma, forma)}" if forma else ""
        return twiml_message(
            f"Lançamento confirmado! {tx['description']} — {value} "
            f"({tx['category']}/{tx['subcategory']}){forma_txt}."
        )
    except Exception:
        await db.pending_transactions.update_one(
            {"id": claimed["id"]},
            {"$set": {"status": "pending"}, "$unset": {"resolved_at": ""}},
        )
        raise


async def _advance_pending(
    db: AsyncIOMotorDatabase,
    user: dict,
    phone: str,
    pending: Dict[str, Any],
    body: str,
) -> Response:
    """
    Faz o lançamento pendente avançar conforme a resposta do usuário:
      - awaiting_payment: interpreta a forma de pagamento (ou cancela).
      - awaiting_confirmation: interpreta SIM/NÃO.
    """
    intent = _confirmation_intent(body)

    if pending.get("stage") == "awaiting_payment":
        if intent is False:
            return await _finalize_pending(db, user, phone, pending, confirmed=False)
        forma = detectar_forma_pagamento(body)
        if not forma:
            return twiml_message(
                "Não entendi a forma de pagamento. Responda: débito, crédito, pix ou dinheiro "
                "(ou responda NÃO para cancelar)."
            )
        new_parsed = {**pending.get("parsed", {}), "forma_pagamento": forma}
        await db.pending_transactions.update_one(
            {"id": pending["id"], "status": "pending"},
            {"$set": {"parsed": new_parsed, "stage": "awaiting_confirmation"}},
        )
        pending = {**pending, "parsed": new_parsed, "stage": "awaiting_confirmation"}
        return _prompt_for_stage(pending)

    # awaiting_confirmation (padrão)
    if intent is None:
        return twiml_message(
            f"Ainda não confirmei este lançamento:\n{_resumo(pending.get('parsed', {}))}.\n"
            "Responda SIM para confirmar ou NÃO para cancelar."
        )
    return await _finalize_pending(db, user, phone, pending, confirmed=intent)


async def _handle_audio_media(
    db: AsyncIOMotorDatabase,
    user: dict,
    phone: str,
    media_url: str,
    media_type: str,
) -> Response:
    media = await download_twilio_audio(media_url, media_type)
    transcript = await transcribe_audio_media(media, media_type)
    logger.info(f"[twilio] audio transcript from={phone}: {transcript[:160]!r}")

    # Se há um lançamento aguardando (forma de pagamento ou confirmação),
    # o áudio responde a essa etapa (ex.: "pix", "sim", "não").
    pending = await _latest_pending(db, user["id"])
    if pending:
        return await _advance_pending(db, user, phone, pending, transcript)

    try:
        parsed = await parse_spoken_expense(transcript)
    except AudioTranscriptionError as exc:
        logger.warning(f"[twilio] spoken parse fallback from={phone}: {exc}")
        parsed = enviar_para_emergent_ai(transcript)

    if float(parsed.get("valor") or 0) <= 0:
        return twiml_message(
            f'Entendi o áudio ("{transcript[:80]}"), mas não identifiquei um valor. '
            'Tente de novo, por exemplo: "Gastei R$ 42,50 numa pizza no débito".'
        )

    return await _start_pending_flow(
        db, user, phone, parsed, source="whatsapp_audio", raw_body=transcript
    )


async def _handle_receipt_media(
    db: AsyncIOMotorDatabase,
    user: dict,
    phone: str,
    caption: str,
    media_url: str,
    media_type: str,
) -> Response:
    media = await download_twilio_media(media_url, media_type)
    fingerprint = media_fingerprint(media)
    duplicate = await db.pending_transactions.find_one(
        {
            "user_id": user["id"],
            "image_fingerprint": fingerprint,
            "status": {"$in": ["pending", "processing", "confirmed"]},
        },
        {"_id": 0},
    )
    if duplicate:
        if duplicate.get("status") == "confirmed":
            return twiml_message("Este comprovante já foi lançado anteriormente.")
        return twiml_message(
            "Este arquivo já está aguardando confirmação. Responda SIM ou NÃO."
        )

    parsed = await analyze_receipt_media(media, media_type, caption)
    return await _start_pending_flow(
        db,
        user,
        phone,
        parsed,
        source="whatsapp_image",
        raw_body=caption or "Foto de comprovante",
        caption=caption,
        image_fingerprint=fingerprint,
    )


async def ensure_twilio_indexes(db: AsyncIOMotorDatabase) -> None:
    # Sparse: nem todo user tem WhatsApp vinculado ainda
    await db.users.create_index("phone", unique=True, sparse=True)
    await db.users.create_index("whatsapp", unique=True, sparse=True)
    await db.transactions.create_index("user_id")
    await db.transactions.create_index("phone")
    await db.transactions.create_index("created_at")
    await db.pending_transactions.create_index([("user_id", 1), ("status", 1), ("created_at", -1)])
    await db.pending_transactions.create_index([("user_id", 1), ("image_fingerprint", 1)])
    await db.pending_transactions.create_index("expires_at")


# -----------------------------------------------------------------------------
# Rota — Webhook Twilio
# -----------------------------------------------------------------------------
@router.post("/twilio-webhook")
async def twilio_whatsapp_webhook(
    request: Request,
    From: str = Form(...),
    Body: str = Form(""),
    NumMedia: int = Form(0),
    MediaUrl0: str = Form(""),
    MediaContentType0: str = Form(""),
):
    """
    Webhook chamado pela Twilio a cada mensagem WhatsApp.

    Campos form-urlencoded típicos da Twilio:
      From = whatsapp:+5511...
      Body = texto da mensagem
      NumMedia / MediaUrl0 / MediaContentType0 = foto, PDF ou áudio opcional
    """
    db: AsyncIOMotorDatabase = request.app.state.db

    phone = limpar_telefone(From)
    body = (Body or "").strip()
    logger.info(
        f"[twilio] msg from={phone} media={NumMedia} "
        f"type={MediaContentType0!r} body={body[:120]!r}"
    )

    if not phone:
        return twiml_message(
            "Não consegui identificar seu número. Cadastre seu WhatsApp na plataforma FinPremium."
        )

    user = await buscar_usuario_por_telefone(db, phone)
    if not user:
        app_url = os.environ.get("FRONTEND_URL", "https://finpremium.app").rstrip("/")
        return twiml_message(
            f"Olá! Não encontrei este WhatsApp ({phone}) na FinPremium. "
            f"Cadastre-se ou vincule seu número em {app_url} e tente de novo."
        )

    try:
        if NumMedia > 0:
            if not MediaUrl0:
                raise ReceiptVisionError("A Twilio não enviou a URL do arquivo.")
            if is_audio_media_type(MediaContentType0) or looks_like_audio_media(
                MediaContentType0, MediaUrl0
            ):
                return await _handle_audio_media(
                    db,
                    user,
                    phone,
                    MediaUrl0,
                    MediaContentType0 or "audio/ogg",
                )
            if is_receipt_media_type(MediaContentType0):
                return await _handle_receipt_media(
                    db,
                    user,
                    phone,
                    body,
                    MediaUrl0,
                    MediaContentType0,
                )
            return twiml_message(
                "Recebi um arquivo, mas ainda aceito só foto, PDF ou áudio de voz. "
                "Você também pode escrever: Almoço R$ 42,50 no débito"
            )

        # Se já existe um lançamento aguardando resposta (forma de pagamento
        # ou confirmação), o texto atual responde a essa etapa.
        pending = await _latest_pending(db, user["id"])
        if pending:
            return await _advance_pending(db, user, phone, pending, body)

        if not body:
            return twiml_message(
                "Envie uma foto/PDF do comprovante, um áudio de voz, "
                "ou escreva: Almoço R$ 42,50 no débito"
            )

        parsed = enviar_para_emergent_ai(body)
        if float(parsed.get("valor") or 0) <= 0:
            return twiml_message(
                "Não identifiquei um valor na mensagem. "
                'Tente por exemplo: "Almoço R$ 42,50 no débito".'
            )
        logger.info(
            f"[twilio] pending tx user={user.get('email')} "
            f"amount={parsed.get('valor')} cat={parsed.get('categoria')} "
            f"forma={parsed.get('forma_pagamento')}"
        )
        # Nada é gravado ainda: pede forma de pagamento (se faltar) e confirmação.
        return await _start_pending_flow(
            db, user, phone, parsed, source="whatsapp", raw_body=body
        )
    except AudioTranscriptionError as e:
        logger.warning(f"[twilio] audio rejected from={phone}: {e}")
        return twiml_message(
            f"Não consegui processar o áudio: {e} "
            "Você também pode escrever o valor, por exemplo: Mercado R$ 120,00 no pix."
        )
    except ReceiptVisionError as e:
        logger.warning(f"[twilio] receipt rejected from={phone}: {e}")
        return twiml_message(
            f"Não consegui processar o arquivo: {e} "
            "Você também pode escrever o valor, por exemplo: Mercado R$ 120,00 no pix."
        )
    except Exception as e:
        logger.exception(f"[twilio] failed to process message: {e}")
        return twiml_message(
            "Tive um problema ao registrar seu lançamento. Tente novamente em instantes."
        )
