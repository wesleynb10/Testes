from dataclasses import dataclass, field
from typing import Any, Dict, Optional


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


class StripeCheckout:
    def __init__(self, api_key: str = "", webhook_url: str = ""):
        self.api_key = api_key
        self.webhook_url = webhook_url

    async def create_checkout_session(self, request: CheckoutSessionRequest) -> CheckoutSessionResponse:
        raise RuntimeError("Stripe checkout stub ativo: configure STRIPE_API_KEY e o pacote emergentintegrations real para pagamentos.")

    async def get_checkout_status(self, session_id: str) -> CheckoutStatusResponse:
        raise RuntimeError(f"Stripe status stub: session {session_id} indisponível sem integração real.")

    async def handle_webhook(self, body: bytes, signature: str) -> WebhookEvent:
        raise RuntimeError("Stripe webhook stub ativo.")
