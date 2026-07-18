import asyncio

import pytest

import receipt_vision
from receipt_vision import (
    ReceiptVisionError,
    analyze_receipt_media,
    download_twilio_media,
    normalize_receipt_result,
)
from twilio_webhook import _confirmation_intent


def test_normalize_receipt_result_accepts_brazilian_money():
    result = normalize_receipt_result(
        {
            "valor": "R$ 1.234,56",
            "estabelecimento": "Mercado Central",
            "data": "2026-07-16",
            "categoria": "necessidades",
            "subcategoria": "Supermercado",
            "forma_pagamento": "PIX",
            "confianca": 0.93,
        }
    )

    assert result["valor"] == 1234.56
    assert result["descricao"] == "Mercado Central"
    assert result["forma_pagamento"] == "pix"
    assert result["data"] == "2026-07-16"


def test_normalize_receipt_result_rejects_missing_total():
    with pytest.raises(ReceiptVisionError):
        normalize_receipt_result({"estabelecimento": "Mercado"})


@pytest.mark.parametrize("text", ["SIM", "confirmo", "Ok", "pode"])
def test_positive_confirmation_words(text):
    assert _confirmation_intent(text) is True


@pytest.mark.parametrize("text", ["NÃO", "nao", "cancelar"])
def test_negative_confirmation_words(text):
    assert _confirmation_intent(text) is False


def test_regular_expense_is_not_treated_as_confirmation():
    assert _confirmation_intent("Mercado R$ 120 no pix") is None


def test_twilio_download_follows_validated_cdn_redirect_without_leaking_auth(monkeypatch):
    calls = []

    class FakeResponse:
        def __init__(self, status, headers=None, content=b""):
            self.status_code = status
            self.headers = headers or {}
            self.content = content

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def get(self, url, auth=None):
            calls.append((url, auth))
            if len(calls) == 1:
                return FakeResponse(
                    307,
                    {"location": "https://mms.twiliocdn.com/signed/file?token=secret"},
                )
            return FakeResponse(
                200,
                {"content-type": "application/pdf", "content-length": "8"},
                b"%PDFtest",
            )

    monkeypatch.setattr(receipt_vision.httpx, "AsyncClient", lambda **_: FakeClient())
    content = asyncio.run(
        download_twilio_media(
            "https://api.twilio.com/Media/ME123",
            "application/pdf",
            account_sid="AC123",
            auth_token="token",
        )
    )

    assert content == b"%PDFtest"
    assert calls[0][1] == ("AC123", "token")
    assert calls[1][1] is None


@pytest.mark.parametrize("media_type", ["image/jpeg", "application/pdf"])
def test_gemini_provider_sends_inline_media_and_parses_json(monkeypatch, media_type):
    monkeypatch.delenv("VISION_API_URL", raising=False)
    monkeypatch.delenv("EMERGENT_AI_URL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_VISION_MODEL", "gemini-test")

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "text": (
                                        '{"valor": 42.5, "estabelecimento": "Padaria", '
                                        '"categoria": "desejos", "subcategoria": "Restaurantes"}'
                                    )
                                }
                            ]
                        }
                    }
                ]
            }

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, url, headers, json):
            assert url.endswith("/gemini-test:generateContent")
            assert headers["x-goog-api-key"] == "test-key"
            inline = json["contents"][0]["parts"][1]["inline_data"]
            assert inline["mime_type"] == media_type
            assert inline["data"]
            return FakeResponse()

    monkeypatch.setattr(receipt_vision.httpx, "AsyncClient", lambda **_: FakeClient())
    result = asyncio.run(analyze_receipt_media(b"fake-media", media_type))

    assert result["valor"] == 42.5
    assert result["descricao"] == "Padaria"
