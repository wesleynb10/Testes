from __future__ import annotations

import base64
import json
import os
import re
from hashlib import sha256
from typing import Any, Dict, Optional
from urllib.parse import urljoin, urlparse

import httpx

ALLOWED_RECEIPT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
}
ALLOWED_AUDIO_TYPES = {
    "audio/ogg",
    "audio/opus",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/aac",
    "audio/amr",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/3gpp",
}
MAX_RECEIPT_BYTES = 10 * 1024 * 1024
MAX_AUDIO_BYTES = 10 * 1024 * 1024
VALID_CATEGORIES = {"necessidades", "desejos", "investimentos"}


class ReceiptVisionError(Exception):
    pass


def normalize_media_type(media_type: str) -> str:
    return (media_type or "").split(";", 1)[0].lower().strip()


def is_receipt_media_type(media_type: str) -> bool:
    return normalize_media_type(media_type) in ALLOWED_RECEIPT_TYPES


def is_audio_media_type(media_type: str) -> bool:
    return normalize_media_type(media_type) in ALLOWED_AUDIO_TYPES


def looks_like_audio_media(media_type: str, media_url: str = "") -> bool:
    """WhatsApp voice notes geralmente vêm como audio/ogg; codecs=opus.
    Em edge cases a Twilio manda type vazio/octet-stream — inferimos pela URL.
    """
    if is_audio_media_type(media_type):
        return True
    normalized = normalize_media_type(media_type)
    if normalized in {"", "application/octet-stream"}:
        path = (urlparse(media_url or "").path or "").lower()
        return path.endswith((".ogg", ".opus", ".mp3", ".m4a", ".amr", ".wav", ".webm", ".3gp"))
    return False


def _money(value: Any) -> float:
    if isinstance(value, (int, float)):
        return max(0.0, round(float(value), 2))
    raw = re.sub(r"[^\d,.-]", "", str(value or ""))
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        raw = raw.replace(",", ".")
    try:
        return max(0.0, round(float(raw), 2))
    except ValueError:
        return 0.0


def normalize_receipt_result(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, str):
        text = payload.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I)
        try:
            payload = json.loads(text)
        except json.JSONDecodeError as exc:
            raise ReceiptVisionError("A IA não devolveu um JSON válido.") from exc
    if not isinstance(payload, dict):
        raise ReceiptVisionError("Resposta inválida do analisador de comprovantes.")

    amount = _money(payload.get("valor", payload.get("amount")))
    if amount <= 0:
        raise ReceiptVisionError("Não consegui identificar o valor total da foto.")

    category = str(payload.get("categoria", payload.get("category", "desejos"))).lower()
    if category not in VALID_CATEGORIES:
        category = "desejos"

    merchant = str(
        payload.get("estabelecimento")
        or payload.get("merchant")
        or payload.get("descricao")
        or "Comprovante"
    ).strip()[:120]
    subcategory = str(
        payload.get("subcategoria") or payload.get("subcategory") or "Outros"
    ).strip()[:100]
    payment = payload.get("forma_pagamento") or payload.get("payment_method")
    if payment:
        payment = str(payment).lower().strip()[:30]

    date = str(payload.get("data") or payload.get("date") or "").strip()[:10]
    if date and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        date = None

    try:
        confidence = float(payload.get("confianca", payload.get("confidence", 0.7)))
    except (TypeError, ValueError):
        confidence = 0.7

    return {
        "valor": amount,
        "categoria": category,
        "subcategoria": subcategory or "Outros",
        "descricao": merchant or "Comprovante",
        "forma_pagamento": payment,
        "data": date,
        "confianca": min(1.0, max(0.0, confidence)),
        "source": "receipt_vision",
    }


def _validate_media_url(url: str) -> None:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    allowed_host = (
        host == "twilio.com"
        or host.endswith(".twilio.com")
        or host == "twiliocdn.com"
        or host.endswith(".twiliocdn.com")
    )
    if parsed.scheme != "https" or not allowed_host:
        raise ReceiptVisionError("URL de mídia não autorizada.")


async def download_twilio_media(
    media_url: str,
    media_type: str,
    account_sid: Optional[str] = None,
    auth_token: Optional[str] = None,
    allowed_types: Optional[set] = None,
    max_bytes: Optional[int] = None,
) -> bytes:
    content_type = normalize_media_type(media_type)
    allowed = allowed_types or ALLOWED_RECEIPT_TYPES
    size_limit = max_bytes if max_bytes is not None else MAX_RECEIPT_BYTES
    if content_type not in allowed:
        if allowed is ALLOWED_AUDIO_TYPES or allowed == ALLOWED_AUDIO_TYPES:
            raise ReceiptVisionError(
                "Envie um áudio de voz compatível (WhatsApp voice note)."
            )
        raise ReceiptVisionError("Envie uma foto JPG, PNG, WEBP ou um PDF.")
    _validate_media_url(media_url)

    sid = account_sid or os.environ.get("TWILIO_ACCOUNT_SID", "")
    token = auth_token or os.environ.get("TWILIO_AUTH_TOKEN", "")
    if not sid or not token:
        raise ReceiptVisionError("Credenciais da Twilio não configuradas.")

    async with httpx.AsyncClient(timeout=20, follow_redirects=False) as client:
        current_url = media_url
        response = None
        for _ in range(4):
            _validate_media_url(current_url)
            host = (urlparse(current_url).hostname or "").lower()
            # Basic Auth is only sent to Twilio's API, never to the signed CDN URL.
            auth = (sid, token) if host.endswith(".twilio.com") else None
            response = await client.get(current_url, auth=auth)
            if response.status_code not in {301, 302, 303, 307, 308}:
                break
            location = response.headers.get("location")
            if not location:
                raise ReceiptVisionError("A Twilio retornou um redirecionamento inválido.")
            current_url = urljoin(current_url, location)
        else:
            raise ReceiptVisionError("A Twilio excedeu o limite de redirecionamentos.")

        if response is None or response.status_code != 200:
            raise ReceiptVisionError("Não consegui baixar o arquivo enviado pela Twilio.")
        declared_size = int(response.headers.get("content-length") or 0)
        if declared_size > size_limit or len(response.content) > size_limit:
            raise ReceiptVisionError(f"O arquivo excede o limite de {size_limit // (1024 * 1024)} MB.")
        response_type = normalize_media_type(response.headers.get("content-type", ""))
        if response_type and response_type not in allowed:
            raise ReceiptVisionError("O arquivo recebido não é um tipo de mídia compatível.")
        return response.content


RECEIPT_PROMPT = """
Analise esta foto ou PDF de nota, recibo ou comprovante brasileiro. Retorne somente JSON:
{
  "valor": número do TOTAL pago (não subtotal),
  "estabelecimento": "nome curto",
  "data": "YYYY-MM-DD" ou null,
  "categoria": "necessidades" | "desejos" | "investimentos",
  "subcategoria": "descrição curta",
  "forma_pagamento": "pix" | "debito" | "credito" | "dinheiro" | null,
  "confianca": número entre 0 e 1
}
Não invente valor. Se houver vários valores, escolha apenas o total final efetivamente pago.
""".strip()


async def analyze_receipt_media(
    media: bytes,
    media_type: str,
    caption: str = "",
) -> Dict[str, Any]:
    media_b64 = base64.b64encode(media).decode("ascii")
    prompt = RECEIPT_PROMPT
    if caption.strip():
        prompt += f"\nLegenda enviada pelo usuário: {caption.strip()[:300]}"

    custom_url = os.environ.get("VISION_API_URL") or os.environ.get("EMERGENT_AI_URL")
    custom_key = os.environ.get("VISION_API_KEY") or os.environ.get("EMERGENT_AI_API_KEY")
    if custom_url:
        headers = {"Content-Type": "application/json"}
        if custom_key:
            headers["Authorization"] = f"Bearer {custom_key}"
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                custom_url,
                headers=headers,
                json={
                    "task": "receipt_extraction",
                    "prompt": prompt,
                    "media_type": media_type,
                    "image_base64": media_b64,
                },
            )
            response.raise_for_status()
            body = response.json()
            return normalize_receipt_result(body.get("data", body))

    gemini_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if gemini_key:
        model = os.environ.get("GEMINI_VISION_MODEL", "gemini-2.5-flash")
        async with httpx.AsyncClient(timeout=60) as client:
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
                                {"text": prompt},
                                {
                                    "inline_data": {
                                        "mime_type": media_type,
                                        "data": media_b64,
                                    }
                                },
                            ],
                        }
                    ],
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "temperature": 0,
                    },
                },
            )
            response.raise_for_status()
            parts = response.json()["candidates"][0]["content"]["parts"]
            content = next(part["text"] for part in parts if part.get("text"))
            return normalize_receipt_result(content)

    openai_key = os.environ.get("OPENAI_API_KEY")
    if openai_key:
        if media_type == "application/pdf":
            raise ReceiptVisionError(
                "PDF requer Gemini ou um endpoint de visão compatível."
            )
        model = os.environ.get("OPENAI_VISION_MODEL", "gpt-4.1-mini")
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {openai_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "response_format": {"type": "json_object"},
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": prompt},
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{media_type};base64,{media_b64}"
                                    },
                                },
                            ],
                        }
                    ],
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            return normalize_receipt_result(content)

    raise ReceiptVisionError(
        "Análise de foto ainda não tem uma chave de IA configurada. "
        "Defina GEMINI_API_KEY, OPENAI_API_KEY ou VISION_API_URL."
    )


def media_fingerprint(media: bytes) -> str:
    return sha256(media).hexdigest()


# Aliases mantidos para compatibilidade com imports anteriores.
download_twilio_image = download_twilio_media
analyze_receipt_image = analyze_receipt_media
image_fingerprint = media_fingerprint
