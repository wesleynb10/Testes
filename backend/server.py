from fastapi import FastAPI, APIRouter, HTTPException, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone

from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionResponse,
    CheckoutStatusResponse,
    CheckoutSessionRequest,
)


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")


# =============================================================================
# PACKAGES — server-side fixed pricing (never trust the frontend)
# =============================================================================
PACKAGES: Dict[str, Dict[str, Any]] = {
    "starter": {
        "name": "FinPremium Starter",
        "amount": 47.00,
        "currency": "brl",
        "description": "Planilha + 3 bônus básicos",
    },
    "complete": {
        "name": "FinPremium Completo",
        "amount": 97.00,
        "currency": "brl",
        "description": "Planilha + 6 bônus + comunidade + acesso vitalício",
    },
    "premium_plus": {
        "name": "FinPremium Plus + Mentoria",
        "amount": 297.00,
        "currency": "brl",
        "description": "Tudo + mentoria em grupo mensal + suporte prioritário",
    },
}


# =============================================================================
# MODELS
# =============================================================================
class StatusCheck(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StatusCheckCreate(BaseModel):
    client_name: str

class CheckoutCreateRequest(BaseModel):
    package_id: str
    origin_url: str
    email: Optional[str] = None

class LeadCreate(BaseModel):
    email: str
    source: Optional[str] = "calculadora"
    metadata: Optional[Dict[str, Any]] = None


# =============================================================================
# BASIC ROUTES
# =============================================================================
@api_router.get("/")
async def root():
    return {"message": "FinPremium API v1.2 - Wealth OS"}

@api_router.get("/packages")
async def get_packages():
    return {k: {"id": k, **v} for k, v in PACKAGES.items()}


# =============================================================================
# LEADS
# =============================================================================
@api_router.post("/leads")
async def create_lead(payload: LeadCreate):
    if "@" not in payload.email or "." not in payload.email:
        raise HTTPException(status_code=400, detail="Invalid email")
    doc = {
        "id": str(uuid.uuid4()),
        "email": payload.email.lower().strip(),
        "source": payload.source or "unknown",
        "metadata": payload.metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.leads.insert_one(doc)
    return {"success": True, "id": doc["id"]}

@api_router.get("/leads/count")
async def leads_count():
    n = await db.leads.count_documents({})
    return {"total": n}


# =============================================================================
# STRIPE CHECKOUT
# =============================================================================
@api_router.post("/checkout/session")
async def create_checkout_session(payload: CheckoutCreateRequest, http_request: Request):
    if payload.package_id not in PACKAGES:
        raise HTTPException(status_code=400, detail="Invalid package")

    pkg = PACKAGES[payload.package_id]
    amount = float(pkg["amount"])
    currency = pkg["currency"]

    # Build success/cancel URLs from provided origin
    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/obrigado?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/venda"

    host_url = str(http_request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    metadata = {
        "package_id": payload.package_id,
        "package_name": pkg["name"],
        "email": (payload.email or "").lower().strip(),
        "source": "landing_venda",
    }

    checkout_request = CheckoutSessionRequest(
        amount=amount,
        currency=currency,
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
    )

    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)

    # Record transaction as pending
    tx = {
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "package_id": payload.package_id,
        "amount": amount,
        "currency": currency,
        "email": (payload.email or "").lower().strip() or None,
        "metadata": metadata,
        "payment_status": "pending",
        "status": "initiated",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.payment_transactions.insert_one(tx)

    return {"url": session.url, "session_id": session.session_id}


@api_router.get("/checkout/status/{session_id}")
async def get_checkout_status(session_id: str):
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)

    # Update transaction if it exists (idempotent — only if payment_status changed to paid)
    tx = await db.payment_transactions.find_one({"session_id": session_id})
    if tx:
        # Only update if we're moving to a terminal state and haven't already processed
        already_paid = tx.get("payment_status") == "paid"
        if not already_paid:
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {
                    "payment_status": status.payment_status,
                    "status": status.status,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )

    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency,
        "metadata": status.metadata,
    }


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    try:
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
        event = await stripe_checkout.handle_webhook(body, signature)
        if event.session_id:
            await db.payment_transactions.update_one(
                {"session_id": event.session_id},
                {"$set": {
                    "payment_status": event.payment_status,
                    "status": event.event_type,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
        return {"received": True}
    except Exception as e:
        logging.error(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# LEGACY status endpoints (kept for compatibility)
# =============================================================================
@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_obj = StatusCheck(**input.model_dump())
    doc = status_obj.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.status_checks.insert_one(doc)
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find({}, {"_id": 0}).to_list(1000)
    for check in status_checks:
        if isinstance(check['timestamp'], str):
            check['timestamp'] = datetime.fromisoformat(check['timestamp'])
    return status_checks


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
