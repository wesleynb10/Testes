from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
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

from email_service import (
    notify_new_lead,
    send_customer_welcome,
    notify_owner_sale,
)

from auth_service import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    set_auth_cookies, clear_auth_cookies,
    get_current_user as _get_current_user,
    check_lockout, record_failed_attempt, clear_attempts,
    seed_admin, create_indexes,
)

from drip_service import (
    schedule_drip, cancel_drip_for_email, drip_worker_loop,
    fire_next_email_for_lead, send_due_emails,
)


# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')

app = FastAPI()
api_router = APIRouter(prefix="/api")


# =============================================================================
# PACKAGES
# =============================================================================
PACKAGES: Dict[str, Dict[str, Any]] = {
    "starter": {"name": "FinPremium Starter", "amount": 47.00, "currency": "brl",
                "description": "Planilha + 3 bônus básicos"},
    "complete": {"name": "FinPremium Completo", "amount": 97.00, "currency": "brl",
                 "description": "Planilha + 6 bônus + comunidade + acesso vitalício"},
    "premium_plus": {"name": "FinPremium Plus + Mentoria", "amount": 297.00, "currency": "brl",
                     "description": "Tudo + mentoria em grupo mensal + suporte prioritário"},
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

class LoginRequest(BaseModel):
    email: str
    password: str


# Dependency wrapper (closure over db)
async def get_current_user(request: Request):
    return await _get_current_user(request, db)


# =============================================================================
# BASIC ROUTES
# =============================================================================
@api_router.get("/")
async def root():
    return {"message": "FinPremium API v1.4 - Wealth OS"}

@api_router.get("/packages")
async def get_packages():
    return {k: {"id": k, **v} for k, v in PACKAGES.items()}


# =============================================================================
# AUTH
# =============================================================================
@api_router.post("/auth/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    email = payload.email.lower().strip()
    # Behind Kubernetes ingress request.client.host is the pod IP (rotates).
    # Use X-Forwarded-For first entry as the real client IP.
    fwd = request.headers.get("X-Forwarded-For", "")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")
    identifier = f"{ip}:{email}"
    await check_lockout(db, identifier)

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await record_failed_attempt(db, identifier)
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")

    await clear_attempts(db, identifier)
    access = create_access_token(user["id"], user["email"])
    refresh = create_refresh_token(user["id"])
    set_auth_cookies(response, access, refresh)
    return {
        "id": user["id"], "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "user"),
    }


@api_router.post("/auth/logout")
async def logout(response: Response, current: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"success": True}


@api_router.get("/auth/me")
async def me(current: dict = Depends(get_current_user)):
    return current


# =============================================================================
# LEADS (public)
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
    try:
        await notify_new_lead(doc["email"], doc["source"], doc["metadata"])
    except Exception as e:
        logging.warning(f"Lead notify failed: {e}")
    # Kick off the 5-email drip sequence
    try:
        await schedule_drip(db, doc["email"], doc["id"], doc["metadata"])
    except Exception as e:
        logging.warning(f"Drip schedule failed: {e}")
    return {"success": True, "id": doc["id"]}

@api_router.get("/leads/count")
async def leads_count():
    n = await db.leads.count_documents({})
    return {"total": n}


# =============================================================================
# STRIPE CHECKOUT (public)
# =============================================================================
@api_router.post("/checkout/session")
async def create_checkout_session(payload: CheckoutCreateRequest, http_request: Request):
    if payload.package_id not in PACKAGES:
        raise HTTPException(status_code=400, detail="Invalid package")

    pkg = PACKAGES[payload.package_id]
    amount = float(pkg["amount"])
    currency = pkg["currency"]

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
        amount=amount, currency=currency,
        success_url=success_url, cancel_url=cancel_url,
        metadata=metadata,
    )
    session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)

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
    try:
        status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
    except Exception as e:
        logging.warning(f"Stripe status error for {session_id}: {e}")
        raise HTTPException(status_code=404, detail="Session not found or expired")

    tx = await db.payment_transactions.find_one({"session_id": session_id})
    if tx:
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
            if status.payment_status == "paid":
                pkg_id = tx.get("package_id", "")
                pkg = PACKAGES.get(pkg_id, {})
                customer_email = tx.get("email") or ""
                amount = tx.get("amount", 0)
                pkg_name = pkg.get("name", pkg_id)
                try:
                    await send_customer_welcome(customer_email, pkg_name, amount, session_id)
                except Exception as e:
                    logging.warning(f"Welcome email failed: {e}")
                try:
                    await notify_owner_sale(pkg_name, amount, customer_email, session_id)
                except Exception as e:
                    logging.warning(f"Owner sale notify failed: {e}")
                # Cancel the drip sequence for this lead — they converted
                try:
                    await cancel_drip_for_email(db, customer_email, reason="purchased")
                except Exception as e:
                    logging.warning(f"Drip cancel failed: {e}")

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
            # Also cancel drip if this is the paid event
            if event.payment_status == "paid":
                tx = await db.payment_transactions.find_one({"session_id": event.session_id})
                if tx and tx.get("email"):
                    try:
                        await cancel_drip_for_email(db, tx["email"], reason="purchased_webhook")
                    except Exception as e:
                        logging.warning(f"Webhook drip cancel failed: {e}")
        return {"received": True}
    except Exception as e:
        logging.error(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@api_router.post("/test/email")
async def test_email():
    try:
        await notify_new_lead(
            email="teste@finpremium.com.br",
            source="teste-manual",
            metadata={"initial": 1000, "monthly": 500, "years": 20, "rate": 0.9},
        )
        return {"success": True, "message": f"Email enviado para {os.environ.get('OWNER_EMAIL')}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# ADMIN (protected)
# =============================================================================
@api_router.get("/admin/dashboard")
async def admin_dashboard(current: dict = Depends(get_current_user)):
    # KPIs
    total_leads = await db.leads.count_documents({})
    total_tx = await db.payment_transactions.count_documents({})
    paid_tx = await db.payment_transactions.count_documents({"payment_status": "paid"})
    # Revenue: sum of amount for paid transactions
    pipeline = [
        {"$match": {"payment_status": "paid"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    rev_result = await db.payment_transactions.aggregate(pipeline).to_list(length=1)
    revenue = float(rev_result[0]["total"]) if rev_result else 0.0

    # Conversion rate: paid_tx / total_leads (rough)
    conversion = (paid_tx / total_leads * 100) if total_leads > 0 else 0.0

    # Last 7 days breakdown
    seven_days_ago = (datetime.now(timezone.utc) - timedelta_days(7)).isoformat()
    leads_last7 = await db.leads.count_documents({"created_at": {"$gte": seven_days_ago}})
    tx_last7 = await db.payment_transactions.count_documents({"created_at": {"$gte": seven_days_ago}, "payment_status": "paid"})

    return {
        "total_leads": total_leads,
        "total_transactions": total_tx,
        "paid_transactions": paid_tx,
        "revenue": revenue,
        "conversion_rate": conversion,
        "leads_last_7d": leads_last7,
        "sales_last_7d": tx_last7,
    }


@api_router.get("/admin/leads")
async def admin_leads(current: dict = Depends(get_current_user), limit: int = 200):
    docs = await db.leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=limit)
    return {"leads": docs, "count": len(docs)}


@api_router.get("/admin/transactions")
async def admin_transactions(current: dict = Depends(get_current_user), limit: int = 200):
    docs = await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=limit)
    return {"transactions": docs, "count": len(docs)}


@api_router.get("/admin/drip")
async def admin_drip(current: dict = Depends(get_current_user), limit: int = 300):
    docs = await db.email_queue.find({}, {"_id": 0}).sort("send_at", 1).to_list(length=limit)
    # Convert datetime to iso strings for JSON
    for d in docs:
        if isinstance(d.get("send_at"), datetime):
            d["send_at"] = d["send_at"].isoformat()
    pending = sum(1 for d in docs if d.get("status") == "pending")
    sent = sum(1 for d in docs if d.get("status") == "sent")
    cancelled = sum(1 for d in docs if d.get("status") == "cancelled")
    failed = sum(1 for d in docs if d.get("status") == "failed")
    return {
        "queue": docs,
        "summary": {"pending": pending, "sent": sent, "cancelled": cancelled, "failed": failed, "total": len(docs)},
    }


class DripFireRequest(BaseModel):
    email: str


@api_router.post("/admin/drip/fire-next")
async def admin_drip_fire_next(payload: DripFireRequest, current: dict = Depends(get_current_user)):
    result = await fire_next_email_for_lead(db, payload.email)
    if not result:
        raise HTTPException(status_code=404, detail="No pending emails for this lead")
    return result


@api_router.post("/admin/drip/run-now")
async def admin_drip_run_now(current: dict = Depends(get_current_user)):
    sent = await send_due_emails(db)
    return {"sent": sent}


# Helper (timedelta days)
def timedelta_days(n):
    from datetime import timedelta as _td
    return _td(days=n)


# =============================================================================
# LEGACY status endpoints
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

# CORS — must use explicit origin (not *) when using credentials
frontend_url = os.environ.get('FRONTEND_URL', 'https://wealth-control-25.preview.emergentagent.com')
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[frontend_url],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup():
    try:
        await create_indexes(db)
        await seed_admin(db)
        # Additional indexes for drip
        await db.email_queue.create_index("status")
        await db.email_queue.create_index("send_at")
        await db.email_queue.create_index("lead_email")
        # Launch background drip worker
        import asyncio as _asyncio
        _asyncio.create_task(drip_worker_loop(db, interval_seconds=60))
        logger.info("Startup complete: indexes + admin seeded + drip worker started")
    except Exception as e:
        logger.error(f"Startup error: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
