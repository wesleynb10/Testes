import asyncio

import pytest

import audio_transcription
from audio_transcription import (
    AudioTranscriptionError,
    _clean_transcript,
    transcribe_audio_media,
)
from receipt_vision import is_audio_media_type, is_receipt_media_type


def test_clean_transcript_strips_markdown_and_quotes():
    assert _clean_transcript('```\n"Almoço R$ 42,50"\n```') == "Almoço R$ 42,50"


def test_media_type_helpers():
    assert is_audio_media_type("audio/ogg; codecs=opus")
    assert is_receipt_media_type("image/jpeg")
    assert not is_audio_media_type("image/jpeg")
    assert not is_receipt_media_type("audio/ogg")


def test_transcribe_rejects_unsupported_type():
    with pytest.raises(AudioTranscriptionError):
        asyncio.run(transcribe_audio_media(b"fake", "video/mp4"))


def test_gemini_transcription_sends_inline_audio(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_AUDIO_MODEL", "gemini-test-audio")

    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [{"text": "Almoço R$ 42,50 no débito"}]
                        }
                    }
                ]
            }

        @property
        def text(self):
            return ""

    class FakeClient:
        def __init__(self, *args, **kwargs):
            self.kwargs = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, url, headers=None, json=None):
            assert "gemini-test-audio" in url
            assert headers["x-goog-api-key"] == "test-key"
            part = json["contents"][0]["parts"][1]["inline_data"]
            assert part["mime_type"] == "audio/ogg"
            assert part["data"]
            return FakeResponse()

    monkeypatch.setattr(audio_transcription.httpx, "AsyncClient", FakeClient)
    text = asyncio.run(transcribe_audio_media(b"ogg-bytes", "audio/ogg"))
    assert text == "Almoço R$ 42,50 no débito"


def test_gemini_transcription_treats_inaudible_as_error(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")

    class FakeResponse:
        status_code = 200

        def json(self):
            return {"candidates": [{"content": {"parts": [{"text": "[INAUDIVEL]"}]}}]}

        @property
        def text(self):
            return ""

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return None

        async def post(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr(audio_transcription.httpx, "AsyncClient", FakeClient)
    with pytest.raises(AudioTranscriptionError):
        asyncio.run(transcribe_audio_media(b"ogg-bytes", "audio/ogg"))
