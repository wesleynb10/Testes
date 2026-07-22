from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import asyncio
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

from twilio_webhook import router as twilio_router, ensure_twilio_indexes, limpar_telefone
from financial_state import (
    ensure_financial_indexes,
    ensure_transaction_budget_item,
    get_or_create_financial_state,
    materialize_actuals,
    save_financial_state,
)


# MongoDB connection
mongo_url = os.environ['MONGO_URL']
# USE_MOCK_DB=1 usa um MongoDB em memória (mongomock) — útil só para
# desenvolvimento/testes locais quando o Atlas não está acessível.
if os.environ.get("USE_MOCK_DB", "").lower() in ("1", "true", "yes"):
    from mongomock_motor import AsyncMongoMockClient
    client = AsyncMongoMockClient()
    logging.getLogger("server").warning("USE_MOCK_DB ativo — usando MongoDB em memória (dados não persistem).")
else:
    _mongo_kwargs = {"serverSelectionTimeoutMS": 8000}
    # Atlas / TLS connections need a CA bundle — use certifi to avoid macOS SSL errors
    if mongo_url.startswith("mongodb+srv://") or "mongodb.net" in mongo_url or os.environ.get("MONGO_TLS", "").lower() in ("1", "true", "yes"):
        import certifi
        _mongo_kwargs["tls"] = True
        _mongo_kwargs["tlsCAFile"] = certifi.where()
    client = AsyncIOMotorClient(mongo_url, **_mongo_kwargs)
db = client[os.environ['DB_NAME']]

STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')

app = FastAPI()
app.state.db = db
api_router = APIRouter(prefix="/api")
api_router.include_router(twilio_router)


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

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str
    phone: Optional[str] = None  # WhatsApp em formato livre; normalizado no backend

class TransactionCreate(BaseModel):
    amount: float
    category: str  # necessidades | desejos | investimentos
    subcategory: Optional[str] = "Outros"
    description: Optional[str] = "Lançamento"
    payment_method: Optional[str] = None
    occurred_at: Optional[str] = None

class TransactionBulkCreate(BaseModel):
    transactions: List[TransactionCreate]

class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    category: Optional[str] = None  # necessidades | desejos | investimentos
    subcategory: Optional[str] = None
    description: Optional[str] = None
    payment_method: Optional[str] = None
    occurred_at: Optional[str] = None

class TransactionUpdate(BaseModel):
    amount: Optional[float] = None
    category: Optional[str] = None  # necessidades | desejos | investimentos
    subcategory: Optional[str] = None
    description: Optional[str] = None
    payment_method: Optional[str] = None
    occurred_at: Optional[str] = None

class FinancialStateUpdate(BaseModel):
    state: Dict[str, Any]


def normalize_transaction_date(value: Optional[str]) -> Optional[str]:
    raw = (value or "").strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            parsed = datetime.strptime(raw[:10], fmt).replace(tzinfo=timezone.utc)
            return parsed.isoformat()
        except ValueError:
            continue
    return None


# Dependency wrapper (closure over db)
async def get_current_user(request: Request):
    return await _get_current_user(request, db)


async def get_current_admin(request: Request):
    current = await _get_current_user(request, db)
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Acesso restrito ao administrador")
    return current


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


@api_router.post("/auth/register")
async def register(payload: RegisterRequest, response: Response):
    email = payload.email.lower().strip()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Email inválido")
    if len(payload.password or "") < 6:
        raise HTTPException(status_code=400, detail="A senha precisa ter ao menos 6 caracteres")

    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Já existe uma conta com este email")

    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": (payload.name or "").strip() or "Cliente",
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    phone = limpar_telefone(payload.phone or "")
    if phone:
        if await db.users.find_one({"$or": [{"phone": phone}, {"whatsapp": f"whatsapp:{phone}"}]}):
            raise HTTPException(status_code=409, detail="Este WhatsApp já está vinculado a outra conta")
        doc["phone"] = phone
        doc["whatsapp"] = f"whatsapp:{phone}"

    await db.users.insert_one(doc)
    access = create_access_token(doc["id"], doc["email"])
    refresh = create_refresh_token(doc["id"])
    set_auth_cookies(response, access, refresh)
    return {
        "id": doc["id"], "email": doc["email"], "name": doc["name"],
        "role": doc["role"], "phone": doc.get("phone"),
    }


@api_router.post("/auth/logout")
async def logout(response: Response, current: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"success": True}


@api_router.get("/auth/me")
async def me(current: dict = Depends(get_current_user)):
    return current


# =============================================================================
# FINANCIAL STATE (planejamento persistente por usuário)
# =============================================================================
@api_router.get("/financial-state")
async def get_financial_state(current: dict = Depends(get_current_user)):
    state = await get_or_create_financial_state(db, current)
    state = await materialize_actuals(db, current["id"], state)
    return {"state": state}


@api_router.put("/financial-state")
async def update_financial_state(
    payload: FinancialStateUpdate,
    current: dict = Depends(get_current_user),
):
    state = await save_financial_state(db, current, payload.state)
    return {"state": state, "saved_at": datetime.now(timezone.utc).isoformat()}


@api_router.get("/dashboard/summary")
async def dashboard_summary(current: dict = Depends(get_current_user)):
    state = await get_or_create_financial_state(db, current)
    income = float(state.get("profile", {}).get("monthlyIncome") or 0)

    now = datetime.now(timezone.utc)
    month_keys = []
    for offset in range(5, -1, -1):
        absolute_month = now.year * 12 + (now.month - 1) - offset
        year, month_zero = divmod(absolute_month, 12)
        month_keys.append(f"{year:04d}-{month_zero + 1:02d}")

    by_month = {
        key: {
            "month": key,
            "income": income,
            "needs": 0.0,
            "wants": 0.0,
            "investments": 0.0,
        }
        for key in month_keys
    }
    docs = await db.transactions.find(
        {"user_id": current["id"]},
        {"_id": 0, "amount": 1, "category": 1, "occurred_at": 1, "created_at": 1},
    ).to_list(length=10000)
    category_fields = {
        "necessidades": "needs",
        "desejos": "wants",
        "investimentos": "investments",
    }
    for tx in docs:
        effective_at = str(tx.get("occurred_at") or tx.get("created_at") or "")
        month_key = effective_at[:7]
        field = category_fields.get(tx.get("category"))
        if month_key in by_month and field:
            by_month[month_key][field] += max(0.0, float(tx.get("amount") or 0))

    months = []
    for key in month_keys:
        item = by_month[key]
        item["expenses"] = round(item["needs"] + item["wants"], 2)
        for field in ("needs", "wants", "investments"):
            item[field] = round(item[field], 2)
        months.append(item)
    return {"months": months}


# =============================================================================
# TRANSACTIONS (do usuário logado)
# =============================================================================
@api_router.get("/transactions")
async def list_transactions(current: dict = Depends(get_current_user), limit: int = 200):
    docs = await db.transactions.find(
        {"user_id": current["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=limit)
    total = sum(float(d.get("amount") or 0) for d in docs)
    return {"transactions": docs, "count": len(docs), "total": round(total, 2)}


@api_router.post("/transactions")
async def create_transaction(payload: TransactionCreate, current: dict = Depends(get_current_user)):
    if payload.category not in ("necessidades", "desejos", "investimentos"):
        raise HTTPException(status_code=400, detail="Categoria inválida")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="O valor deve ser maior que zero")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current["id"],
        "user_email": current.get("email"),
        "phone": current.get("phone"),
        "source": "app",
        "amount": float(payload.amount),
        "category": payload.category,
        "subcategory": payload.subcategory or "Outros",
        "description": payload.description or "Lançamento",
        "payment_method": payload.payment_method,
        "occurred_at": normalize_transaction_date(payload.occurred_at),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.transactions.insert_one(doc)
    doc.pop("_id", None)
    await ensure_transaction_budget_item(db, current, doc)
    return doc


@api_router.post("/transactions/bulk")
async def create_transactions_bulk(
    payload: TransactionBulkCreate,
    current: dict = Depends(get_current_user),
):
    if not payload.transactions:
        raise HTTPException(status_code=400, detail="Nenhum lançamento informado")
    if len(payload.transactions) > 500:
        raise HTTPException(status_code=400, detail="Limite de 500 lançamentos por importação")

    now = datetime.now(timezone.utc).isoformat()
    docs = []
    for item in payload.transactions:
        if item.category not in ("necessidades", "desejos", "investimentos"):
            raise HTTPException(status_code=400, detail="Categoria inválida")
        if item.amount <= 0:
            continue
        docs.append(
            {
                "id": str(uuid.uuid4()),
                "user_id": current["id"],
                "user_email": current.get("email"),
                "phone": current.get("phone"),
                "source": "csv",
                "amount": float(item.amount),
                "category": item.category,
                "subcategory": item.subcategory or "Outros",
                "description": item.description or "Importação CSV",
                "payment_method": item.payment_method,
                "occurred_at": normalize_transaction_date(item.occurred_at),
                "created_at": now,
            }
        )
    if not docs:
        raise HTTPException(status_code=400, detail="Nenhum lançamento válido")

    await db.transactions.insert_many(docs)
    for doc in docs:
        doc.pop("_id", None)
    seen = set()
    for doc in docs:
        key = (doc["category"], doc["subcategory"].casefold())
        if key not in seen:
            seen.add(key)
            await ensure_transaction_budget_item(db, current, doc)
    return {"created": len(docs), "transactions": docs}


@api_router.put("/transactions/{tx_id}")
async def update_transaction(
    tx_id: str,
    payload: TransactionUpdate,
    current: dict = Depends(get_current_user),
):
    existing = await db.transactions.find_one(
        {"id": tx_id, "user_id": current["id"]}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")

    updates: Dict[str, Any] = {}
    if payload.amount is not None:
        if payload.amount <= 0:
            raise HTTPException(status_code=400, detail="O valor deve ser maior que zero")
        updates["amount"] = float(payload.amount)
    if payload.category is not None:
        if payload.category not in ("necessidades", "desejos", "investimentos"):
            raise HTTPException(status_code=400, detail="Categoria inválida")
        updates["category"] = payload.category
    if payload.subcategory is not None:
        updates["subcategory"] = payload.subcategory.strip() or "Outros"
    if payload.description is not None:
        updates["description"] = payload.description.strip() or "Lançamento"
    if payload.payment_method is not None:
        updates["payment_method"] = payload.payment_method or None
    if payload.occurred_at is not None:
        updates["occurred_at"] = normalize_transaction_date(payload.occurred_at)

    if not updates:
        return existing

    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.transactions.update_one(
        {"id": tx_id, "user_id": current["id"]}, {"$set": updates}
    )
    merged = {**existing, **updates}
    # Garante que a subcategoria (nova ou renomeada) exista no orçamento.
    await ensure_transaction_budget_item(db, current, merged)
    return merged


@api_router.put("/transactions/{tx_id}")
async def update_transaction(
    tx_id: str,
    payload: TransactionUpdate,
    current: dict = Depends(get_current_user),
):
    existing = await db.transactions.find_one(
        {"id": tx_id, "user_id": current["id"]}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")

    updates: Dict[str, Any] = {}
    if payload.amount is not None:
        if payload.amount <= 0:
            raise HTTPException(status_code=400, detail="O valor deve ser maior que zero")
        updates["amount"] = float(payload.amount)
    if payload.category is not None:
        if payload.category not in ("necessidades", "desejos", "investimentos"):
            raise HTTPException(status_code=400, detail="Categoria inválida")
        updates["category"] = payload.category
    if payload.subcategory is not None:
        updates["subcategory"] = payload.subcategory.strip() or "Outros"
    if payload.description is not None:
        updates["description"] = payload.description.strip() or "Lançamento"
    if payload.payment_method is not None:
        updates["payment_method"] = payload.payment_method or None
    if payload.occurred_at is not None:
        updates["occurred_at"] = normalize_transaction_date(payload.occurred_at)

    if updates:
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.transactions.update_one(
            {"id": tx_id, "user_id": current["id"]}, {"$set": updates}
        )

    doc = await db.transactions.find_one(
        {"id": tx_id, "user_id": current["id"]}, {"_id": 0}
    )
    # Garante que a subcategoria/categoria (nova) exista no orçamento para refletir o real.
    await ensure_transaction_budget_item(db, current, doc)
    return doc


@api_router.delete("/transactions/{tx_id}")
async def delete_transaction(tx_id: str, current: dict = Depends(get_current_user)):
    res = await db.transactions.delete_one({"id": tx_id, "user_id": current["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return {"success": True}


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

    if not (STRIPE_API_KEY or "").strip():
        raise HTTPException(
            status_code=503,
            detail="Pagamentos temporariamente indisponíveis. O Stripe ainda não está configurado.",
        )

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
    try:
        session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
    except RuntimeError as exc:
        logging.warning(f"Checkout session error: {exc}")
        raise HTTPException(
            status_code=503,
            detail=str(exc) if "Stripe" in str(exc) else "Pagamentos temporariamente indisponíveis. Estamos finalizando a integração com o Stripe — tente novamente em breve.",
        ) from exc
    except Exception as exc:
        logging.exception("Checkout session unexpected error")
        raise HTTPException(
            status_code=503,
            detail="Pagamentos temporariamente indisponíveis. Tente novamente em breve.",
        ) from exc

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


async def _enrich_email_from_stripe_session(session_id: str, fallback: str = "") -> str:
    email = (fallback or "").strip().lower()
    try:
        import stripe as stripe_sdk
        if not STRIPE_API_KEY:
            return email
        stripe_sdk.api_key = STRIPE_API_KEY
        raw = await asyncio.to_thread(stripe_sdk.checkout.Session.retrieve, session_id)
        details = getattr(raw, "customer_details", None)
        if details and getattr(details, "email", None):
            email = (details.email or email).strip().lower()
        elif getattr(raw, "customer_email", None):
            email = (raw.customer_email or email).strip().lower()
    except Exception as e:
        logging.warning(f"Could not enrich checkout email from Stripe: {e}")
    return email


async def _fulfill_paid_transaction(tx: dict, customer_email: str, status_label: str) -> None:
    """Mark paid once and send welcome/owner emails at most once."""
    session_id = tx.get("session_id")
    customer_email = (customer_email or tx.get("email") or "").strip().lower()
    updates = {
        "payment_status": "paid",
        "status": status_label,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if customer_email:
        updates["email"] = customer_email

    await db.payment_transactions.update_one({"session_id": session_id}, {"$set": updates})

    if tx.get("emails_sent_at"):
        return

    pkg_id = tx.get("package_id", "")
    pkg = PACKAGES.get(pkg_id, {})
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
    try:
        await cancel_drip_for_email(db, customer_email, reason="purchased")
    except Exception as e:
        logging.warning(f"Drip cancel failed: {e}")

    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {"emails_sent_at": datetime.now(timezone.utc).isoformat()}},
    )


@api_router.get("/checkout/status/{session_id}")
async def get_checkout_status(session_id: str):
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    try:
        status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
    except Exception as e:
        logging.warning(f"Stripe status error for {session_id}: {e}")
        raise HTTPException(status_code=404, detail="Session not found or expired")

    stripe_email = ((status.metadata or {}).get("email") or "").strip().lower()
    stripe_email = await _enrich_email_from_stripe_session(session_id, stripe_email)

    tx = await db.payment_transactions.find_one({"session_id": session_id})
    if tx:
        customer_email = (tx.get("email") or stripe_email or "").strip().lower()
        if status.payment_status == "paid":
            await _fulfill_paid_transaction(tx, customer_email, status.status or "complete")
        else:
            updates = {
                "payment_status": status.payment_status,
                "status": status.status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            if customer_email and not tx.get("email"):
                updates["email"] = customer_email
            await db.payment_transactions.update_one({"session_id": session_id}, {"$set": updates})

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
        if event.session_id and event.payment_status == "paid":
            tx = await db.payment_transactions.find_one({"session_id": event.session_id})
            if tx:
                customer_email = await _enrich_email_from_stripe_session(
                    event.session_id, tx.get("email") or ""
                )
                await _fulfill_paid_transaction(
                    tx, customer_email, event.event_type or "checkout.session.completed"
                )
            else:
                await db.payment_transactions.update_one(
                    {"session_id": event.session_id},
                    {"$set": {
                        "payment_status": "paid",
                        "status": event.event_type,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }},
                    upsert=False,
                )
        elif event.session_id:
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


@api_router.post("/test/email")
async def test_email(current: dict = Depends(get_current_admin)):
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
async def admin_dashboard(current: dict = Depends(get_current_admin)):
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
async def admin_leads(current: dict = Depends(get_current_admin), limit: int = 200):
    docs = await db.leads.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=limit)
    return {"leads": docs, "count": len(docs)}


@api_router.get("/admin/transactions")
async def admin_transactions(current: dict = Depends(get_current_admin), limit: int = 200):
    docs = await db.payment_transactions.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=limit)
    return {"transactions": docs, "count": len(docs)}


@api_router.get("/admin/drip")
async def admin_drip(current: dict = Depends(get_current_admin), limit: int = 300):
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
async def admin_drip_fire_next(payload: DripFireRequest, current: dict = Depends(get_current_admin)):
    result = await fire_next_email_for_lead(db, payload.email)
    if not result:
        raise HTTPException(status_code=404, detail="No pending emails for this lead")
    return result


@api_router.post("/admin/drip/run-now")
async def admin_drip_run_now(current: dict = Depends(get_current_admin)):
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

# CORS — must use explicit origins (not *) when using credentials
_frontend = os.environ.get('FRONTEND_URL', 'https://wealth-control-25.preview.emergentagent.com')
_cors_extra = os.environ.get('CORS_ORIGINS', '')
_cors_origins = []
for part in [_frontend] + _cors_extra.split(','):
    origin = part.strip().rstrip('/')
    if origin and origin not in _cors_origins:
        _cors_origins.append(origin)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
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
        await ensure_twilio_indexes(db)
        await ensure_financial_indexes(db)
        # Launch background drip worker
        import asyncio as _asyncio
        _asyncio.create_task(drip_worker_loop(db, interval_seconds=60))
        logger.info("Startup complete: indexes + admin seeded + drip worker + financial state")
    except Exception as e:
        logger.error(f"Startup error: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
