"""Stripe Checkout adapter — Session create/status + webhook."""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

import stripe


@dataclass
class CheckoutSessionRequest:
    amount: float
    currency: str
    success_url: str
    cancel_url: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CheckoutSessionResponse:
    session_id: str
    url: str


@dataclass
class CheckoutStatusResponse:
    status: str
    payment_status: str
    amount_total: Optional[float] = None
    currency: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class WebhookEvent:
    session_id: Optional[str] = None
    payment_status: Optional[str] = None
    event_type: Optional[str] = None


def _to_unit_amount(amount: float, currency: str) -> int:
    """Stripe expects the smallest currency unit (centavos for BRL)."""
    return int(round(float(amount) * 100))


def _from_unit_amount(amount_total: Optional[int]) -> Optional[float]:
    if amount_total is None:
        return None
    return round(amount_total / 100.0, 2)


class StripeCheckout:
    def __init__(self, api_key: str = "", webhook_url: str = ""):
        self.api_key = (api_key or "").strip()
        self.webhook_url = webhook_url
        self.webhook_secret = (
            os.environ.get("STRIPE_WEBHOOK_SECRET")
            or os.environ.get("STRIPE_WEBHOOK_SECRET_KEY")
            or ""
        ).strip()
        if self.api_key:
            stripe.api_key = self.api_key

    async def create_checkout_session(self, request: CheckoutSessionRequest) -> CheckoutSessionResponse:
        if not self.api_key:
            raise RuntimeError("STRIPE_API_KEY ausente.")

        currency = (request.currency or "brl").lower()
        product_name = (
            (request.metadata or {}).get("package_name")
            or (request.metadata or {}).get("package_id")
            or "FinPremium"
        )
        customer_email = ((request.metadata or {}).get("email") or "").strip() or None
        unit_amount = _to_unit_amount(request.amount, currency)

        def _create():
            params: Dict[str, Any] = {
                "mode": "payment",
                "success_url": request.success_url,
                "cancel_url": request.cancel_url,
                "line_items": [
                    {
                        "quantity": 1,
                        "price_data": {
                            "currency": currency,
                            "unit_amount": unit_amount,
                            "product_data": {
                                "name": str(product_name)[:120],
                                "description": "Acesso FinPremium · Wealth OS",
                            },
                        },
                    }
                ],
                "metadata": {str(k): str(v) for k, v in (request.metadata or {}).items() if v is not None},
                "payment_method_types": ["card"],
            }
            if customer_email:
                params["customer_email"] = customer_email
            return stripe.checkout.Session.create(**params)

        try:
            session = await asyncio.to_thread(_create)
        except stripe.StripeError as exc:
            raise RuntimeError(f"Stripe session failed: {exc.user_message or str(exc)}") from exc

        if not session.url or not session.id:
            raise RuntimeError("Stripe não retornou url/session_id.")

        return CheckoutSessionResponse(session_id=session.id, url=session.url)

    async def get_checkout_status(self, session_id: str) -> CheckoutStatusResponse:
        if not self.api_key:
            raise RuntimeError("STRIPE_API_KEY ausente.")

        def _retrieve():
            return stripe.checkout.Session.retrieve(session_id)

        try:
            session = await asyncio.to_thread(_retrieve)
        except stripe.StripeError as exc:
            raise RuntimeError(f"Stripe status failed: {exc.user_message or str(exc)}") from exc

        meta = dict(session.metadata or {})
        return CheckoutStatusResponse(
            status=str(session.status or "open"),
            payment_status=str(session.payment_status or "unpaid"),
            amount_total=_from_unit_amount(session.amount_total),
            currency=(session.currency or None),
            metadata=meta,
        )

    async def handle_webhook(self, body: bytes, signature: str) -> WebhookEvent:
        if not self.api_key:
            raise RuntimeError("STRIPE_API_KEY ausente.")
        if not self.webhook_secret:
            raise RuntimeError(
                "STRIPE_WEBHOOK_SECRET ausente. Use `stripe listen` no local ou configure o secret no Dashboard."
            )

        def _construct():
            return stripe.Webhook.construct_event(body, signature, self.webhook_secret)

        try:
            event = await asyncio.to_thread(_construct)
        except ValueError as exc:
            raise RuntimeError("Webhook payload inválido.") from exc
        except stripe.SignatureVerificationError as exc:
            raise RuntimeError("Assinatura do webhook inválida.") from exc

        event_type = event.get("type") or ""
        data_object = (event.get("data") or {}).get("object") or {}
        session_id = data_object.get("id") if data_object.get("object") == "checkout.session" else None
        payment_status = data_object.get("payment_status")

        if event_type in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            payment_status = payment_status or "paid"
        elif event_type == "checkout.session.async_payment_failed":
            payment_status = payment_status or "unpaid"

        return WebhookEvent(
            session_id=session_id,
            payment_status=payment_status,
            event_type=event_type,
        )
