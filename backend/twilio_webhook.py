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

    forma = None
    if "débito" in lower or "debito" in lower:
        forma = "debito"
    elif "crédito" in lower or "credito" in lower:
        forma = "credito"
    elif "pix" in lower:
        forma = "pix"
    elif "dinheiro" in lower:
        forma = "dinheiro"

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


async def _handle_confirmation(
    db: AsyncIOMotorDatabase,
    user: dict,
    phone: str,
    body: str,
    confirmed: bool,
) -> Response:
    pending = await _latest_pending(db, user["id"])
    if not pending:
        return twiml_message(
            "Não encontrei nenhum comprovante aguardando confirmação. Envie uma nova foto ou PDF."
        )

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
        return twiml_message("Comprovante cancelado. Nenhum lançamento foi criado.")

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
        return twiml_message("Este comprovante já foi processado.")

    try:
        tx = await salvar_transacao(
            db,
            user,
            phone,
            claimed.get("caption") or "Foto de comprovante",
            claimed["parsed"],
            source="whatsapp_image",
        )
        await db.pending_transactions.update_one(
            {"id": claimed["id"]},
            {"$set": {"status": "confirmed", "transaction_id": tx["id"]}},
        )
        value = f"R$ {tx['amount']:.2f}".replace(".", ",")
        return twiml_message(
            f"Comprovante confirmado! {tx['description']} — {value} "
            f"({tx['category']}/{tx['subcategory']})."
        )
    except Exception:
        await db.pending_transactions.update_one(
            {"id": claimed["id"]},
            {"$set": {"status": "pending"}, "$unset": {"resolved_at": ""}},
        )
        raise


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

    confirmation = _confirmation_intent(transcript)
    if confirmation is not None:
        return await _handle_confirmation(
            db, user, phone, transcript, confirmed=confirmation
        )

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

    tx = await salvar_transacao(
        db,
        user,
        phone,
        transcript,
        parsed,
        source="whatsapp_audio",
    )
    valor_fmt = f"R$ {tx['amount']:.2f}".replace(".", ",")
    return twiml_message(
        f"Áudio entendido. Lançamento: {tx['description']} — {valor_fmt} "
        f"({tx['category']}/{tx['subcategory']})."
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
    now = datetime.now(timezone.utc)
    pending = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "user_email": user.get("email"),
        "phone": phone,
        "status": "pending",
        "caption": caption[:300],
        "media_type": media_type,
        "image_fingerprint": fingerprint,
        "parsed": parsed,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=30)).isoformat(),
    }
    await db.pending_transactions.insert_one(pending)

    value = f"R$ {parsed['valor']:.2f}".replace(".", ",")
    date_text = f", data {parsed['data']}" if parsed.get("data") else ""
    return twiml_message(
        f"Identifiquei: {parsed['descricao']} — {value}{date_text} "
        f"({parsed['categoria']}/{parsed['subcategoria']}). "
        "Responda SIM para confirmar ou NÃO para cancelar."
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

        confirmation = _confirmation_intent(body)
        if confirmation is not None:
            return await _handle_confirmation(
                db, user, phone, body, confirmed=confirmation
            )

        if not body:
            return twiml_message(
                "Envie uma foto/PDF do comprovante, um áudio de voz, "
                "ou escreva: Almoço R$ 42,50 no débito"
            )

        parsed = enviar_para_emergent_ai(body)
        tx = await salvar_transacao(db, user, phone, body, parsed)
        logger.info(
            f"[twilio] saved tx={tx['id']} user={user.get('email')} "
            f"amount={tx['amount']} cat={tx['category']}"
        )
        valor_fmt = f"R$ {tx['amount']:.2f}".replace(".", ",")
        return twiml_message(
            f"Lançamento realizado com sucesso! "
            f"{tx['description']} — {valor_fmt} ({tx['category']}/{tx['subcategory']})."
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
