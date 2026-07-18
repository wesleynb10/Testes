"""
Transcrição de áudios do WhatsApp via Gemini (STT).

Usado pelo webhook Twilio: voice note → texto → parser de lançamento.
"""
from __future__ import annotations

import base64
import os
import re
from typing import Optional

import httpx

from receipt_vision import (
    ALLOWED_AUDIO_TYPES,
    MAX_AUDIO_BYTES,
    ReceiptVisionError,
    download_twilio_media,
    normalize_media_type,
)


class AudioTranscriptionError(Exception):
    pass


TRANSCRIBE_PROMPT = """
Transcreva este áudio em português do Brasil.
Retorne APENAS o texto falado, sem aspas, sem markdown e sem explicações.
Se o usuário mencionar valores em reais, escreva-os no formato R$ XX,XX quando possível
(ex.: "quarenta e dois reais e cinquenta" → "R$ 42,50").
Se o áudio estiver inaudível ou vazio, responda exatamente: [INAUDIVEL]
""".strip()

PARSE_SPOKEN_EXPENSE_PROMPT = """
Você extrai lançamentos financeiros de fala informal em português do Brasil.
Retorne SOMENTE JSON válido (sem markdown):
{
  "descricao": "nome curto do gasto",
  "valor": 0.0,
  "categoria": "necessidades" | "desejos" | "investimentos",
  "subcategoria": "string curta",
  "forma_pagamento": "pix" | "debito" | "credito" | "dinheiro" | null
}

Regras para descricao:
- 1 a 4 palavras no máximo
- Sem cumprimentos ("oi", "olá"), sem "eu gastei", sem "a gente", sem vícios ("eh", "tipo")
- Prefira o estabelecimento ou o item: "Pizza", "Uber", "Mercado", "Farmácia"
- Nunca devolva a frase completa falada

Se não houver valor claro, use 0.
""".strip()


def _clean_transcript(raw: str) -> str:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:\w+)?\s*|\s*```$", "", text, flags=re.I).strip()
    text = text.strip().strip('"').strip("'").strip()
    return text


async def download_twilio_audio(
    media_url: str,
    media_type: str,
    account_sid: Optional[str] = None,
    auth_token: Optional[str] = None,
) -> bytes:
    try:
        return await download_twilio_media(
            media_url,
            media_type,
            account_sid=account_sid,
            auth_token=auth_token,
            allowed_types=ALLOWED_AUDIO_TYPES,
            max_bytes=MAX_AUDIO_BYTES,
        )
    except ReceiptVisionError as exc:
        raise AudioTranscriptionError(str(exc)) from exc


async def transcribe_audio_media(media: bytes, media_type: str) -> str:
    content_type = normalize_media_type(media_type)
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise AudioTranscriptionError(
            "Formato de áudio não suportado. Envie um áudio de voz pelo WhatsApp."
        )
    if not media:
        raise AudioTranscriptionError("Áudio vazio.")
    if len(media) > MAX_AUDIO_BYTES:
        raise AudioTranscriptionError("O áudio excede o limite de 10 MB.")

    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not gemini_key:
        raise AudioTranscriptionError(
            "Transcrição de áudio ainda não tem GEMINI_API_KEY configurada."
        )

    model = os.environ.get("GEMINI_AUDIO_MODEL") or os.environ.get(
        "GEMINI_VISION_MODEL", "gemini-2.5-flash"
    )
    media_b64 = base64.b64encode(media).decode("ascii")

    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={
                "x-goog-api-key": gemini_key,
                "Content-Type": "application/json",
            },
            json={
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {"text": TRANSCRIBE_PROMPT},
                            {
                                "inline_data": {
                                    "mime_type": content_type,
                                    "data": media_b64,
                                }
                            },
                        ],
                    }
                ],
                "generationConfig": {
                    "temperature": 0,
                },
            },
        )
        if response.status_code >= 400:
            detail = response.text[:300]
            raise AudioTranscriptionError(
                f"Falha ao transcrever com Gemini ({response.status_code}): {detail}"
            )
        try:
            parts = response.json()["candidates"][0]["content"]["parts"]
            content = next(part["text"] for part in parts if part.get("text"))
        except (KeyError, StopIteration, TypeError, IndexError) as exc:
            raise AudioTranscriptionError(
                "A Gemini não devolveu uma transcrição válida."
            ) from exc

    transcript = _clean_transcript(content)
    if not transcript or transcript.upper() == "[INAUDIVEL]":
        raise AudioTranscriptionError(
            "Não consegui entender o áudio. Fale mais perto do microfone ou escreva o lançamento."
        )
    return transcript


async def parse_spoken_expense(transcript: str) -> dict:
    """
    Transforma fala informal em lançamento curto.
    Ex.: "Oi, a gente eh, eu gastei em uma pizza" → descricao "Pizza"
    """
    import json

    text = (transcript or "").strip()
    if not text:
        raise AudioTranscriptionError("Transcrição vazia.")

    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not gemini_key:
        raise AudioTranscriptionError("GEMINI_API_KEY não configurada.")

    model = os.environ.get("GEMINI_AUDIO_MODEL") or os.environ.get(
        "GEMINI_VISION_MODEL", "gemini-2.5-flash"
    )

    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={
                "x-goog-api-key": gemini_key,
                "Content-Type": "application/json",
            },
            json={
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "text": (
                                    f"{PARSE_SPOKEN_EXPENSE_PROMPT}\n\n"
                                    f"Texto falado:\n{text[:800]}"
                                )
                            }
                        ],
                    }
                ],
                "generationConfig": {
                    "temperature": 0,
                    "responseMimeType": "application/json",
                },
            },
        )
        if response.status_code >= 400:
            detail = response.text[:300]
            raise AudioTranscriptionError(
                f"Falha ao interpretar o áudio ({response.status_code}): {detail}"
            )
        try:
            parts = response.json()["candidates"][0]["content"]["parts"]
            content = next(part["text"] for part in parts if part.get("text"))
            payload = json.loads(_clean_transcript(content))
        except (KeyError, StopIteration, TypeError, IndexError, json.JSONDecodeError) as exc:
            raise AudioTranscriptionError(
                "Não consegui estruturar o lançamento a partir do áudio."
            ) from exc

    if not isinstance(payload, dict):
        raise AudioTranscriptionError("Resposta inválida ao interpretar o áudio.")

    descricao = str(payload.get("descricao") or "").strip()[:80]
    if not descricao:
        raise AudioTranscriptionError("Não identifiquei o nome do gasto no áudio.")

    try:
        valor = float(payload.get("valor") or 0)
    except (TypeError, ValueError):
        valor = 0.0

    categoria = str(payload.get("categoria") or "desejos").lower().strip()
    if categoria not in {"necessidades", "desejos", "investimentos"}:
        categoria = "desejos"

    forma = payload.get("forma_pagamento")
    if forma is not None:
        forma = str(forma).lower().strip()[:30] or None

    return {
        "valor": round(max(0.0, valor), 2),
        "categoria": categoria,
        "subcategoria": str(payload.get("subcategoria") or "Outros").strip()[:100] or "Outros",
        "descricao": descricao,
        "forma_pagamento": forma,
        "confianca": 0.85,
        "source": "gemini_spoken_expense",
        "raw_input": text,
    }
