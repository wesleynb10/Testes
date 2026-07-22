"""Testes das regras puras do fluxo de lançamento via WhatsApp (Twilio).

Cobrem:
- detecção da forma de pagamento a partir de texto livre;
- decisão de estágio (pedir forma de pagamento x pedir confirmação);
- confirmação obrigatória antes de gravar.
"""
import pytest

from twilio_webhook import (
    detectar_forma_pagamento,
    enviar_para_emergent_ai,
    _confirmation_intent,
    _prompt_for_stage,
    _resumo,
)


def _text_of(response) -> str:
    """Extrai o texto de uma resposta TwiML (XML)."""
    return response.body.decode("utf-8") if hasattr(response, "body") else str(response)


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Paguei no débito", "debito"),
        ("cartão de débito", "debito"),
        ("foi no crédito", "credito"),
        ("passei no cartão", "credito"),
        ("mandei um pix", "pix"),
        ("paguei em dinheiro", "dinheiro"),
        ("paguei em espécie", "dinheiro"),
    ],
)
def test_detectar_forma_pagamento(text, expected):
    assert detectar_forma_pagamento(text) == expected


def test_detectar_forma_pagamento_ausente():
    assert detectar_forma_pagamento("Almoço R$ 42,50") is None


def test_mensagem_sem_forma_fica_pendente_de_pagamento():
    parsed = enviar_para_emergent_ai("Almoço R$ 42,50")
    assert parsed["valor"] == 42.5
    assert parsed["forma_pagamento"] is None
    # Sem forma de pagamento => precisa perguntar antes de confirmar.
    pending = {"stage": "awaiting_confirmation" if parsed["forma_pagamento"] else "awaiting_payment", "parsed": parsed}
    prompt = _text_of(_prompt_for_stage(pending))
    assert "forma de pagamento" in prompt.lower()


def test_mensagem_com_forma_vai_para_confirmacao():
    parsed = enviar_para_emergent_ai("Almoço R$ 42,50 no débito")
    assert parsed["forma_pagamento"] == "debito"
    pending = {"stage": "awaiting_confirmation" if parsed["forma_pagamento"] else "awaiting_payment", "parsed": parsed}
    prompt = _text_of(_prompt_for_stage(pending))
    assert "confirmar" in prompt.lower()
    assert "sim" in prompt.lower()


def test_resumo_inclui_forma_quando_presente():
    parsed = {
        "valor": 42.5,
        "descricao": "Almoço",
        "categoria": "desejos",
        "subcategoria": "Restaurantes",
        "forma_pagamento": "pix",
    }
    resumo = _resumo(parsed)
    assert "R$ 42,50" in resumo
    assert "Pix" in resumo


def test_confirmation_intent_reconhece_sim_e_nao():
    assert _confirmation_intent("sim") is True
    assert _confirmation_intent("não") is False
    assert _confirmation_intent("pix") is None
