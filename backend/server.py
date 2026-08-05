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
    merge_scr_import,
    save_financial_state,
)

from credit_provider import (
    CREDIT_API_KEYS,
    CreditProviderError,
    credit_api_cost_brl,
    credit_apis_catalog,
    decrypt_documento,
    encrypt_documento,
    ensure_scr_importable,
    explain_rating_bacen,
    gerar_relatorio,
    hash_documento,
    mask_documento,
    normalize_apis,
    valida_documento,
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

# Análise de Crédito (serviço avulso pago) — preço e retenção do relatório.
try:
    CREDIT_REPORT_PRICE_BRL = round(float(os.environ.get('CREDIT_REPORT_PRICE_BRL', '39.90')), 2)
except ValueError:
    CREDIT_REPORT_PRICE_BRL = 39.90
try:
    CREDIT_REPORT_RETENTION_DAYS = int(os.environ.get('CREDIT_REPORT_RETENTION_DAYS', '90'))
except ValueError:
    CREDIT_REPORT_RETENTION_DAYS = 90
# Janela em que o CPF cifrado de um pedido não pago ainda é útil. A sessão do
# Stripe expira em 24h, então depois disso o pedido não pode mais virar pago —
# 48h dá margem de sobra e mantém a retenção curta.
try:
    CREDIT_ORDER_DOC_TTL_HOURS = int(os.environ.get('CREDIT_ORDER_DOC_TTL_HOURS', '48'))
except ValueError:
    CREDIT_ORDER_DOC_TTL_HOURS = 48
CREDIT_CONSENT_VERSION = os.environ.get('CREDIT_CONSENT_VERSION', 'v1')

app = FastAPI()
app.state.db = db
api_router = APIRouter(prefix="/api")
api_router.include_router(twilio_router)


# =============================================================================
# PACKAGES
# =============================================================================
# `credit_reports_included`: quantas análises de crédito o plano libera (cada
# análise consome 1, independentemente de quantas APIs o usuário marcar).
PACKAGES: Dict[str, Dict[str, Any]] = {
    "starter": {
        "name": "FinPremium Starter",
        "amount": 47.00,
        "currency": "brl",
        "description": "Planilha, 3 bônus e 1 consulta de crédito.",
        "credit_reports_included": 1,
        "features": [
            "Planilha + 3 bônus básicos",
            "1 consulta de crédito inclusa",
            "Fontes à escolha: Score, SCR, PGFN",
        ],
    },
    "complete": {
        "name": "FinPremium Completo",
        "amount": 97.00,
        "currency": "brl",
        "description": "Planilha, 6 bônus, comunidade e 3 consultas.",
        "credit_reports_included": 3,
        "features": [
            "Planilha + 6 bônus + comunidade",
            "Acesso vitalício à plataforma",
            "3 consultas de crédito inclusas",
        ],
    },
    "premium_plus": {
        "name": "FinPremium Plus + Mentoria",
        "amount": 297.00,
        "currency": "brl",
        "description": "Tudo do Completo, mentoria e 12 consultas.",
        "credit_reports_included": 12,
        "features": [
            "Tudo do plano Completo",
            "Mentoria em grupo mensal",
            "Suporte prioritário",
            "12 consultas de crédito inclusas",
        ],
    },
}


def _is_test_env() -> bool:
    """Ambiente de testes / CI — permite cadastro sem CPF e admin seed."""
    if os.environ.get("USE_MOCK_DB", "").lower() in ("1", "true", "yes"):
        return True
    if os.environ.get("APP_ENV", "").strip().lower() in ("test", "testing", "ci"):
        return True
    # Escape hatch explícito (ex.: demos internas). Produção mantém default true.
    raw = os.environ.get("REQUIRE_CPF_ON_REGISTER")
    if raw is not None and str(raw).strip().lower() in ("0", "false", "no", "off"):
        return True
    return False


def _admin_email() -> str:
    return (os.environ.get("ADMIN_EMAIL") or "admin@finpremium.com.br").strip().lower()


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
    cpf: Optional[str] = None    # CPF do titular — set-once; obrigatório para Análise de Crédito


class SetCpfRequest(BaseModel):
    cpf: str  # CPF do titular (com ou sem máscara); não pode ser alterado depois

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


class CreditCheckoutRequest(BaseModel):
    origin_url: str
    consent: bool = False                # aceite explícito do titular (LGPD)
    consent_text_version: Optional[str] = None
    # Quais fontes consultar. Score sempre entra. Sempre no CPF da conta.
    apis: Optional[List[str]] = None
    # `documento` do cliente é IGNORADO de propósito: a consulta usa só o CPF
    # cadastrado na conta. Mantido opcional só para não quebrar clientes antigos.
    documento: Optional[str] = None


def _credit_sell_price_brl(apis: Optional[List[str]] = None) -> float:
    """Preço de venda proporcional às APIs escolhidas (margem sobre o custo Direct Data)."""
    try:
        margin = float(os.environ.get("CREDIT_PRICE_MARGIN", "4.15"))
    except ValueError:
        margin = 4.15
    cost = credit_api_cost_brl(apis)
    # Piso evita checkout de centavos se alguém pedir só o score.
    try:
        floor = float(os.environ.get("CREDIT_REPORT_MIN_PRICE_BRL", "9.90"))
    except ValueError:
        floor = 9.90
    return round(max(cost * margin, floor), 2)


def _public_user(user: dict) -> dict:
    """Campos seguros para o frontend — nunca inclui cpf_enc / password_hash."""
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "name": user.get("name", ""),
        "role": user.get("role", "user"),
        "phone": user.get("phone"),
        "cpf_masked": user.get("cpf_masked"),
        "has_cpf": bool(user.get("cpf_hash") or user.get("cpf_masked")),
        "credit_reports_remaining": int(user.get("credit_reports_remaining") or 0),
    }


async def _grant_credit_reports(email: str, qty: int, *, package_id: str, session_id: str) -> None:
    """Credita consultas inclusas do plano. Aplica na conta se já existir, senão fica pendente."""
    if qty <= 0 or not email:
        return
    email = email.strip().lower()
    grant = {
        "qty": qty,
        "package_id": package_id,
        "session_id": session_id,
        "granted_at": datetime.now(timezone.utc).isoformat(),
    }
    user = await db.users.find_one({"email": email})
    if user:
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$inc": {"credit_reports_remaining": qty},
                "$push": {"credit_grants": grant},
            },
        )
        return
    # Compra antes do cadastro: resgata no register pelo mesmo email.
    await db.credit_entitlements.update_one(
        {"email": email},
        {
            "$inc": {"reports_remaining": qty},
            "$push": {"grants": grant},
            "$setOnInsert": {"created_at": datetime.now(timezone.utc).isoformat()},
        },
        upsert=True,
    )


async def _claim_pending_credit_entitlements(user_id: str, email: str) -> int:
    """Move entitlements pendentes (compra pré-cadastro) para a conta do usuário."""
    email = (email or "").strip().lower()
    if not email:
        return 0
    pending = await db.credit_entitlements.find_one({"email": email})
    if not pending:
        return 0
    qty = int(pending.get("reports_remaining") or 0)
    grants = pending.get("grants") or []
    if qty > 0:
        await db.users.update_one(
            {"id": user_id},
            {
                "$inc": {"credit_reports_remaining": qty},
                "$push": {"credit_grants": {"$each": grants}},
            },
        )
    await db.credit_entitlements.delete_one({"email": email})
    return qty


async def _consume_credit_report(user_id: str) -> bool:
    """Consome 1 consulta inclusa. Retorna True se consumiu, False se não havia saldo."""
    result = await db.users.find_one_and_update(
        {"id": user_id, "credit_reports_remaining": {"$gt": 0}},
        {"$inc": {"credit_reports_remaining": -1}},
    )
    return result is not None


async def _attach_cpf_to_user(user_id: str, cpf: str, *, allow_replace: bool = False) -> dict:
    """Vincula um CPF à conta (set-once). Um CPF só pode existir em uma conta."""
    try:
        tipo = valida_documento(cpf)
    except CreditProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if tipo != "pf":
        raise HTTPException(status_code=400, detail="Informe um CPF válido (11 dígitos).")

    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if user.get("cpf_hash") and not allow_replace:
        raise HTTPException(
            status_code=409,
            detail="CPF já cadastrado nesta conta e não pode ser alterado.",
        )

    cpf_hash = hash_documento(cpf)
    outro = await db.users.find_one({"cpf_hash": cpf_hash, "id": {"$ne": user_id}})
    if outro:
        raise HTTPException(
            status_code=409,
            detail="Este CPF já está vinculado a outra conta.",
        )

    # Se a conta já tem pedidos de crédito, o CPF precisa bater com o hash do pedido
    # (evita vincular outro documento depois de ter consultado).
    pedidos = await db.credit_orders.find(
        {"user_id": user_id, "documento_hash": {"$exists": True, "$ne": ""}},
        {"_id": 0, "documento_hash": 1, "documento_masked": 1},
    ).to_list(20)
    hashes = {p.get("documento_hash") for p in pedidos if p.get("documento_hash")}
    if hashes and cpf_hash not in hashes:
        exemplo = (pedidos[0] or {}).get("documento_masked") or "o já consultado"
        raise HTTPException(
            status_code=400,
            detail=(
                f"Este CPF não corresponde ao documento da consulta anterior ({exemplo}). "
                "Informe o mesmo CPF usado no relatório."
            ),
        )

    fields = {
        "cpf_enc": encrypt_documento(cpf),
        "cpf_hash": cpf_hash,
        "cpf_masked": mask_documento(cpf),
        "cpf_bound_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.update_one({"id": user_id}, {"$set": fields})
    user.update(fields)
    return user


async def _normalize_report_payload(report_doc: dict, *, persist: bool = True) -> dict:
    """Garante modalidades importáveis + explicação do rating em relatórios legados."""
    payload = dict(report_doc.get("payload_normalizado") or {})
    scr = payload.get("scr") if isinstance(payload.get("scr"), dict) else {}
    had_mods = bool(isinstance(scr.get("modalidades"), list) and scr.get("modalidades"))
    scr_fixed = ensure_scr_importable(scr)
    changed = scr_fixed != scr
    payload["scr"] = scr_fixed
    if scr_fixed.get("legado_consolidado") and not had_mods:
        avisos = list(payload.get("avisos") or [])
        msg = (
            "Relatório antigo: as operações SCR foram consolidadas em uma linha "
            "para importar ao plano. Uma nova consulta SCR traz o detalhe por modalidade e a curva de prazos."
        )
        if msg not in avisos:
            avisos.append(msg)
            payload["avisos"] = avisos
            changed = True
    if not payload.get("rating_explicacao"):
        payload["rating_explicacao"] = explain_rating_bacen(
            (scr_fixed or {}).get("modalidades") or [],
            (scr_fixed or {}).get("faixa_risco"),
            (scr_fixed or {}).get("score"),
            payload.get("rating_bacen"),
        )
        changed = True
    if changed and persist and report_doc.get("id"):
        await db.credit_reports.update_one(
            {"id": report_doc["id"]},
            {"$set": {"payload_normalizado": payload}},
        )
        report_doc["payload_normalizado"] = payload
    else:
        report_doc["payload_normalizado"] = payload
    return payload


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
    return _public_user(user)


@api_router.post("/auth/register")
async def register(payload: RegisterRequest, response: Response):
    email = payload.email.lower().strip()
    if "@" not in email or "." not in email:
        raise HTTPException(status_code=400, detail="Email inválido")
    if len(payload.password or "") < 6:
        raise HTTPException(status_code=400, detail="A senha precisa ter ao menos 6 caracteres")

    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="Já existe uma conta com este email")

    # CPF obrigatório para todo cadastro real. Exceções: ambiente de teste e
    # o e-mail do admin (seed). Sem CPF não há Análise de Crédito segura.
    cpf_obrigatorio = not _is_test_env() and email != _admin_email()
    if cpf_obrigatorio and not (payload.cpf or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Informe o seu CPF para criar a conta. Ele fica vinculado e não pode ser alterado.",
        )

    doc = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": (payload.name or "").strip() or "Cliente",
        "role": "user",
        "credit_reports_remaining": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    phone = limpar_telefone(payload.phone or "")
    if phone:
        if await db.users.find_one({"$or": [{"phone": phone}, {"whatsapp": f"whatsapp:{phone}"}]}):
            raise HTTPException(status_code=409, detail="Este WhatsApp já está vinculado a outra conta")
        doc["phone"] = phone
        doc["whatsapp"] = f"whatsapp:{phone}"

    # Valida o CPF ANTES de inserir a conta quando ele é obrigatório.
    if (payload.cpf or "").strip():
        try:
            tipo = valida_documento(payload.cpf)
        except CreditProviderError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if tipo != "pf":
            raise HTTPException(status_code=400, detail="Informe um CPF válido (11 dígitos).")
        if await db.users.find_one({"cpf_hash": hash_documento(payload.cpf)}):
            raise HTTPException(status_code=409, detail="Este CPF já está vinculado a outra conta.")

    await db.users.insert_one(doc)

    if (payload.cpf or "").strip():
        try:
            await _attach_cpf_to_user(doc["id"], payload.cpf)
        except HTTPException:
            await db.users.delete_one({"id": doc["id"]})
            raise

    await _claim_pending_credit_entitlements(doc["id"], email)
    doc = await db.users.find_one({"id": doc["id"]}) or doc

    access = create_access_token(doc["id"], doc["email"])
    refresh = create_refresh_token(doc["id"])
    set_auth_cookies(response, access, refresh)
    return _public_user(doc)


@api_router.post("/auth/cpf")
async def set_cpf(payload: SetCpfRequest, current: dict = Depends(get_current_user)):
    """Vincula o CPF do titular à conta. Set-once — não pode ser alterado."""
    user = await _attach_cpf_to_user(current["id"], payload.cpf)
    return _public_user(user)


@api_router.post("/auth/logout")
async def logout(response: Response, current: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"success": True}


@api_router.get("/auth/me")
async def me(current: dict = Depends(get_current_user)):
    return _public_user(current)


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

    # Consultas de crédito inclusas no plano (1 consumo = 1 relatório, APIs à escolha).
    included = int(pkg.get("credit_reports_included") or 0)
    if included > 0 and customer_email:
        try:
            await _grant_credit_reports(
                customer_email, included, package_id=pkg_id, session_id=session_id,
            )
        except Exception as e:
            logging.warning(f"Credit entitlement grant failed: {e}")

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
        # Análise de crédito: dispara a geração do relatório assim que o Pix é pago.
        if event.session_id:
            try:
                await _process_credit_session(
                    event.session_id, paid=event.payment_status == "paid"
                )
            except Exception as e:  # nunca derrubar o webhook por causa do crédito
                logging.warning(f"Credit webhook processing failed: {e}")
        return {"received": True}
    except Exception as e:
        logging.error(f"Webhook error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# =============================================================================
# ANÁLISE DE CRÉDITO (serviço avulso pago via Pix/Stripe + Direct Data)
# =============================================================================
def _client_ip(request: Request) -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _credit_order_public(order: dict) -> dict:
    """Projeção segura do pedido (nunca expõe documento em claro/cifrado)."""
    return {
        "order_id": order.get("id"),
        "documento": order.get("documento_masked"),
        "tipo": order.get("tipo"),
        "status": order.get("status"),
        "payment_status": order.get("payment", {}).get("status"),
        "report_ready": order.get("status") == "ready",
        "report_id": order.get("report_id"),
        "price": order.get("amount"),
        "currency": order.get("currency", "brl"),
        "error": order.get("error"),
        "created_at": order.get("created_at"),
        "updated_at": order.get("updated_at"),
    }


async def _generate_credit_report(order_id: str) -> None:
    """Gera o relatório na Direct Data — idempotente (uma vez por pedido pago).

    Só chamada após pagamento confirmado. Usa claim atômico (paid -> processing)
    para evitar gerar/cobrar crédito duas vezes pelo mesmo pagamento.
    """
    now = datetime.now(timezone.utc).isoformat()
    claimed = await db.credit_orders.find_one_and_update(
        {"id": order_id, "status": "paid", "report_id": None},
        {"$set": {"status": "processing", "updated_at": now}},
    )
    if not claimed:
        return  # já em processamento, pronto, ou não pago ainda

    if not claimed.get("documento_enc"):
        # A varredura de retenção já apagou o documento: o pagamento chegou
        # depois da janela. Erro explícito para o suporte saber que cabe estorno.
        logger.warning(f"Credit order {order_id} pago após a purga do documento")
        await db.credit_orders.update_one(
            {"id": order_id},
            {"$set": {
                "status": "error",
                "error": (
                    "Este pedido expirou antes da confirmação do pagamento. "
                    "Refaça a consulta — qualquer cobrança será estornada."
                ),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        return

    try:
        documento = decrypt_documento(claimed["documento_enc"])
    except Exception:
        await db.credit_orders.update_one(
            {"id": order_id},
            {"$set": {"status": "error", "error": "Não foi possível recuperar o documento.",
                      "updated_at": datetime.now(timezone.utc).isoformat()},
             "$unset": {"documento_enc": ""}},
        )
        return

    try:
        report = await gerar_relatorio(
            documento,
            claimed.get("tipo"),
            apis=claimed.get("apis") or list(CREDIT_API_KEYS),
        )
    except CreditProviderError as exc:
        logging.warning(f"Credit report generation failed (order {order_id}): {exc}")
        await db.credit_orders.update_one(
            {"id": order_id},
            {"$set": {"status": "error", "error": str(exc),
                      "updated_at": datetime.now(timezone.utc).isoformat()},
             "$unset": {"documento_enc": ""}},
        )
        return
    except Exception as exc:
        logging.exception(f"Unexpected credit report error (order {order_id})")
        await db.credit_orders.update_one(
            {"id": order_id},
            {"$set": {"status": "error", "error": "Falha inesperada ao gerar o relatório.",
                      "updated_at": datetime.now(timezone.utc).isoformat()},
             "$unset": {"documento_enc": ""}},
        )
        return

    created_at = datetime.now(timezone.utc)
    expires_at = created_at + timedelta_days(CREDIT_REPORT_RETENTION_DAYS)
    report_id = str(uuid.uuid4())
    report_doc = {
        "id": report_id,
        "order_id": order_id,
        "user_id": claimed.get("user_id"),
        "payload_normalizado": report.model_dump(),
        "provider_meta": {"fonte": report.fonte},
        "comprovante_url": report.comprovante_url,
        "created_at": created_at.isoformat(),
        "expires_at": expires_at.isoformat(),
    }
    # O índice TTL só age sobre BSON Date — a string ISO acima é para a API.
    # Retenção <= 0 desliga a expiração (o campo não é gravado).
    if CREDIT_REPORT_RETENTION_DAYS > 0:
        report_doc["expires_at_dt"] = expires_at
    await db.credit_reports.insert_one(report_doc)
    # Documento em claro deixa de ser necessário: apagamos a versão cifrada (LGPD).
    await db.credit_orders.update_one(
        {"id": order_id},
        {"$set": {"status": "ready", "report_id": report_id, "error": None,
                  "updated_at": datetime.now(timezone.utc).isoformat()},
         "$unset": {"documento_enc": ""}},
    )


async def purge_abandoned_credit_documents() -> int:
    """Apaga o CPF cifrado de pedidos abandonados (checkout iniciado, nunca pago).

    O `documento_enc` existe só para a janela entre o checkout e a geração do
    relatório. Sem pagamento essa finalidade nunca se concretiza, então manter o
    dado contraria o consentimento (LGPD) — mas o resto do pedido é preservado
    como trilha de auditoria.

    O `status` é mantido de propósito: alterá-lo quebraria a reconciliação de um
    pagamento que chegasse atrasado, e o cliente pagaria sem receber o relatório.
    Quem trata esse caso é `_generate_credit_report`, com erro explícito.
    """
    agora = datetime.now(timezone.utc)
    limite = (agora - timedelta_hours(CREDIT_ORDER_DOC_TTL_HOURS)).isoformat()
    result = await db.credit_orders.update_many(
        {
            "status": "pending",
            "documento_enc": {"$exists": True},
            "created_at": {"$lt": limite},
        },
        {
            "$unset": {"documento_enc": ""},
            "$set": {"documento_purgado_em": agora.isoformat()},
        },
    )
    if result.modified_count:
        logger.info(
            f"[credit] documento cifrado apagado de {result.modified_count} "
            f"pedido(s) abandonado(s) (> {CREDIT_ORDER_DOC_TTL_HOURS}h)"
        )
    return result.modified_count


async def credit_retention_worker_loop(interval_seconds: int = 3600):
    """Varredura de retenção da análise de crédito (LGPD).

    O relatório expira via índice TTL do Mongo; só o pedido abandonado precisa
    desta varredura, porque TTL apaga o documento inteiro e aqui queremos zerar
    apenas um campo.
    """
    import asyncio as _asyncio

    logger.info(f"[credit] worker de retenção iniciado (intervalo={interval_seconds}s)")
    while True:
        try:
            await purge_abandoned_credit_documents()
        except Exception as e:
            logger.exception(f"[credit] varredura de retenção falhou: {e}")
        await _asyncio.sleep(interval_seconds)


async def _process_credit_session(session_id: str, paid: bool) -> Optional[dict]:
    """Reconciliação de pagamento de um pedido de crédito por session_id."""
    order = await db.credit_orders.find_one({"payment.session_id": session_id})
    if not order:
        return None
    now = datetime.now(timezone.utc).isoformat()
    if paid and order.get("status") in ("pending", "paid"):
        await db.credit_orders.update_one(
            {"id": order["id"], "status": "pending"},
            {"$set": {"status": "paid", "payment.status": "paid", "updated_at": now}},
        )
        await _generate_credit_report(order["id"])
    elif not paid:
        await db.credit_orders.update_one(
            {"id": order["id"]},
            {"$set": {"payment.status": "pending", "updated_at": now}},
        )
    return await db.credit_orders.find_one({"id": order["id"]})


@api_router.post("/credit/checkout")
async def create_credit_checkout(
    payload: CreditCheckoutRequest,
    request: Request,
    current: dict = Depends(get_current_user),
):
    # 1) Consentimento LGPD é obrigatório antes de qualquer coisa.
    if not payload.consent:
        raise HTTPException(
            status_code=400,
            detail="É necessário aceitar o termo de consentimento para consultar seus dados.",
        )

    # 2) A consulta usa SOMENTE o CPF cadastrado na conta — nunca o que o cliente
    # enviou no body. Assim não dá para consultar o CPF de terceiros.
    user_doc = await db.users.find_one({"id": current.get("id")})
    if not user_doc or not user_doc.get("cpf_enc"):
        raise HTTPException(
            status_code=400,
            detail="Cadastre o seu CPF na conta antes de consultar o crédito.",
        )
    try:
        documento = decrypt_documento(user_doc["cpf_enc"])
        tipo = valida_documento(documento)
    except CreditProviderError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if tipo != "pf":
        raise HTTPException(
            status_code=400,
            detail="A Análise de Crédito está disponível apenas para CPF.",
        )
    if payload.documento:
        if hash_documento(payload.documento) != user_doc.get("cpf_hash"):
            raise HTTPException(
                status_code=403,
                detail="Só é possível consultar o CPF cadastrado na sua conta.",
            )

    apis = normalize_apis(payload.apis)
    order_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    origin = payload.origin_url.rstrip("/")

    base_order = {
        "id": order_id,
        "user_id": current.get("id"),
        "user_email": current.get("email"),
        "documento_masked": user_doc.get("cpf_masked") or mask_documento(documento),
        "documento_hash": user_doc.get("cpf_hash") or hash_documento(documento),
        "documento_enc": encrypt_documento(documento),
        "tipo": "pf",
        "apis": apis,
        "currency": "brl",
        "consent": {
            "aceito": True,
            "texto_versao": payload.consent_text_version or CREDIT_CONSENT_VERSION,
            "ip": _client_ip(request),
            "user_agent": request.headers.get("User-Agent", "")[:400],
            "timestamp": now,
        },
        "report_id": None,
        "error": None,
        "created_at": now,
        "updated_at": now,
    }

    # 3) Plano incluso: consome 1 consulta sem Stripe.
    if await _consume_credit_report(current["id"]):
        order = {
            **base_order,
            "amount": 0.0,
            "payment": {"provider": "entitlement", "session_id": None, "status": "paid"},
            "status": "paid",
        }
        await db.credit_orders.insert_one(order)
        logging.info(
            "Credit order (inclusa) order=%s user=%s apis=%s",
            order_id, current.get("id"), ",".join(apis),
        )
        await _generate_credit_report(order_id)
        return {
            "url": f"{origin}/app/credito?order_id={order_id}",
            "session_id": None,
            "order_id": order_id,
            "payment": "included",
            "apis": apis,
            "amount": 0.0,
        }

    # 4) Avulso: cobra proporcional às APIs escolhidas.
    amount = _credit_sell_price_brl(apis)
    if not (STRIPE_API_KEY or "").strip():
        raise HTTPException(
            status_code=503,
            detail="Pagamentos temporariamente indisponíveis. O Stripe ainda não está configurado.",
        )

    success_url = f"{origin}/app/credito?order_id={order_id}&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/app/credito?canceled=1"
    host_url = str(request.base_url)
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)

    metadata = {
        "type": "credit",
        "order_id": order_id,
        "email": (current.get("email") or "").lower().strip(),
        "source": "analise_credito",
        "apis": ",".join(apis),
    }
    checkout_request = CheckoutSessionRequest(
        amount=float(amount),
        currency="brl",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
    )
    try:
        session: CheckoutSessionResponse = await stripe_checkout.create_checkout_session(checkout_request)
    except Exception as exc:
        logging.warning(f"Credit checkout session error: {exc}")
        raise HTTPException(
            status_code=503,
            detail="Pagamentos temporariamente indisponíveis. Tente novamente em breve.",
        ) from exc

    order = {
        **base_order,
        "amount": float(amount),
        "payment": {"provider": "stripe", "session_id": session.session_id, "status": "pending"},
        "status": "pending",
    }
    await db.credit_orders.insert_one(order)
    logging.info(
        "Credit order criada order=%s user=%s apis=%s amount=%.2f",
        order_id, current.get("id"), ",".join(apis), amount,
    )
    return {
        "url": session.url,
        "session_id": session.session_id,
        "order_id": order_id,
        "payment": "stripe",
        "apis": apis,
        "amount": float(amount),
    }


@api_router.get("/credit/status/{order_id}")
async def get_credit_status(order_id: str, current: dict = Depends(get_current_user)):
    order = await db.credit_orders.find_one({"id": order_id})
    if not order or order.get("user_id") != current.get("id"):
        raise HTTPException(status_code=404, detail="Pedido não encontrado")

    # Se ainda não está finalizado, reconcilia o pagamento com o Stripe (fallback
    # ao webhook) e dispara a geração do relatório quando confirmado o pagamento.
    if order.get("status") in ("pending", "paid", "processing"):
        session_id = order.get("payment", {}).get("session_id")
        if session_id and order.get("status") in ("pending", "paid"):
            try:
                stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
                status: CheckoutStatusResponse = await stripe_checkout.get_checkout_status(session_id)
                refreshed = await _process_credit_session(
                    session_id, paid=status.payment_status == "paid"
                )
                if refreshed:
                    order = refreshed
            except HTTPException:
                raise
            except Exception as e:
                logging.warning(f"Credit status reconcile failed for {order_id}: {e}")

    return _credit_order_public(order)


@api_router.get("/credit/orders")
async def list_credit_orders(current: dict = Depends(get_current_user)):
    """Histórico de consultas de crédito da conta (mais recentes primeiro)."""
    cursor = db.credit_orders.find(
        {"user_id": current.get("id")},
        {"_id": 0},
    ).sort("created_at", -1).limit(30)
    orders = await cursor.to_list(30)
    items = []
    for order in orders:
        public = _credit_order_public(order)
        report_meta = None
        if order.get("status") == "ready" and order.get("report_id"):
            report = await db.credit_reports.find_one(
                {"id": order["report_id"]},
                {"_id": 0, "expires_at": 1, "payload_normalizado.score": 1,
                 "payload_normalizado.rating_bacen": 1,
                 "payload_normalizado.scr.divida_atual": 1,
                 "payload_normalizado.scr.legado_consolidado": 1},
            )
            if report:
                payload = report.get("payload_normalizado") or {}
                scr = payload.get("scr") or {}
                report_meta = {
                    "score": payload.get("score"),
                    "rating_bacen": payload.get("rating_bacen"),
                    "divida_atual": scr.get("divida_atual"),
                    "legado_consolidado": bool(scr.get("legado_consolidado")),
                    "expires_at": report.get("expires_at"),
                    "available": True,
                }
            else:
                report_meta = {"available": False, "expired": True}
        items.append({**public, "report": report_meta})
    return {"orders": items}


@api_router.get("/credit/report/{order_id}")
async def get_credit_report(order_id: str, current: dict = Depends(get_current_user)):
    order = await db.credit_orders.find_one({"id": order_id})
    if not order or order.get("user_id") != current.get("id"):
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if order.get("status") != "ready" or not order.get("report_id"):
        raise HTTPException(status_code=409, detail="Relatório ainda não está disponível")

    report = await db.credit_reports.find_one({"id": order["report_id"]}, {"_id": 0})
    if not report:
        # O pedido está "ready" e aponta para um relatório que não existe mais:
        # foi apagado pela retenção (TTL). 410 em vez de 404 para o front poder
        # diferenciar "expirou" de "erro".
        raise HTTPException(
            status_code=410,
            detail=(
                f"Este relatório expirou. Por segurança, os dados de crédito são apagados "
                f"após {CREDIT_REPORT_RETENTION_DAYS} dias. Faça uma nova consulta."
            ),
        )
    payload = await _normalize_report_payload(report, persist=True)
    return {
        "order": _credit_order_public(order),
        "report": payload,
        "comprovante_url": report.get("comprovante_url"),
        "expires_at": report.get("expires_at"),
    }


@api_router.get("/credit/price")
async def get_credit_price(current: dict = Depends(get_current_user)):
    """Catálogo de APIs + preço do pacote completo + saldo de consultas do plano."""
    user = await db.users.find_one({"id": current.get("id")}) or {}
    return {
        "price": float(CREDIT_REPORT_PRICE_BRL),  # pacote completo (referência)
        "currency": "brl",
        "consent_version": CREDIT_CONSENT_VERSION,
        "apis": credit_apis_catalog(),
        "price_by_apis": {
            # Exemplo de preço se o cliente marcar o pacote inteiro.
            "all": _credit_sell_price_brl(list(CREDIT_API_KEYS)),
        },
        "credit_reports_remaining": int(user.get("credit_reports_remaining") or 0),
    }


class CreditQuoteRequest(BaseModel):
    apis: Optional[List[str]] = None


class CreditImportModality(BaseModel):
    codigo: str
    rate: Optional[float] = 0.0
    ratePeriod: Optional[str] = "am"
    minPayment: Optional[float] = 0.0
    termMonths: Optional[int] = 0


class CreditImportRequest(BaseModel):
    # Se vazio/omitido, importa todas as modalidades com saldo > 0.
    modalidades: Optional[List[CreditImportModality]] = None
    # Relatórios legados (1 linha consolidada) costumam sobrepor dívidas manuais.
    replace_manual: bool = False


@api_router.post("/credit/quote")
async def quote_credit_report(
    payload: CreditQuoteRequest,
    current: dict = Depends(get_current_user),
):
    """Calcula o preço das APIs escolhidas sem abrir checkout."""
    apis = normalize_apis(payload.apis)
    user = await db.users.find_one({"id": current.get("id")}) or {}
    remaining = int(user.get("credit_reports_remaining") or 0)
    return {
        "apis": apis,
        "amount": 0.0 if remaining > 0 else _credit_sell_price_brl(apis),
        "currency": "brl",
        "payment": "included" if remaining > 0 else "stripe",
        "credit_reports_remaining": remaining,
        "cost_provider_brl": credit_api_cost_brl(apis),
    }


@api_router.post("/credit/report/{order_id}/import")
async def import_credit_report_to_plan(
    order_id: str,
    payload: CreditImportRequest,
    current: dict = Depends(get_current_user),
):
    """Importa modalidades do SCR do relatório para `financial_state.debts`.

    Idempotente por `scrCodigo`: reimportar atualiza saldos, não duplica.
    """
    order = await db.credit_orders.find_one({"id": order_id})
    if not order or order.get("user_id") != current.get("id"):
        raise HTTPException(status_code=404, detail="Pedido não encontrado")
    if order.get("status") != "ready" or not order.get("report_id"):
        raise HTTPException(status_code=409, detail="Relatório ainda não está disponível")

    report = await db.credit_reports.find_one({"id": order["report_id"]}, {"_id": 0})
    if not report:
        raise HTTPException(
            status_code=410,
            detail=(
                f"Este relatório expirou. Por segurança, os dados de crédito são apagados "
                f"após {CREDIT_REPORT_RETENTION_DAYS} dias. Faça uma nova consulta."
            ),
        )

    normalized = await _normalize_report_payload(report, persist=True)
    scr = normalized.get("scr") if isinstance(normalized.get("scr"), dict) else {}
    modalidades = scr.get("modalidades") if isinstance(scr.get("modalidades"), list) else []
    if not modalidades:
        raise HTTPException(
            status_code=422,
            detail="Este relatório não tem operações SCR para importar. Inclua a consulta SCR na próxima vez.",
        )

    selected = None
    if payload.modalidades:
        selected = [item.model_dump() for item in payload.modalidades]

    current_state = await get_or_create_financial_state(db, current)
    if payload.replace_manual:
        current_state = {
            **current_state,
            "debts": [d for d in (current_state.get("debts") or []) if d.get("source") == "scr"],
        }
    merged = merge_scr_import(
        current_state,
        report_id=order["report_id"],
        order_id=order_id,
        scr=scr,
        selected=selected,
    )
    state = await save_financial_state(db, current, merged)
    imported_count = sum(1 for d in state.get("debts") or [] if d.get("source") == "scr")
    logging.info(
        "Credit SCR import order=%s user=%s debts_scr=%s",
        order_id, current.get("id"), imported_count,
    )
    return {
        "ok": True,
        "imported": imported_count,
        "state": state,
        "creditInsight": state.get("creditInsight") or {},
    }


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


def timedelta_hours(n):
    from datetime import timedelta as _td
    return _td(hours=n)


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
        # Análise de crédito
        await db.credit_orders.create_index("id", unique=True)
        await db.credit_orders.create_index("user_id")
        await db.credit_orders.create_index("payment.session_id")
        await db.credit_orders.create_index("documento_hash")
        # Suporta a varredura de retenção (status + idade do pedido).
        await db.credit_orders.create_index([("status", 1), ("created_at", 1)])
        await db.credit_reports.create_index("id", unique=True)
        await db.credit_reports.create_index("order_id")
        # Retenção LGPD: o Mongo apaga o relatório sozinho quando expires_at_dt
        # vence, sem depender de worker de pé.
        await db.credit_reports.create_index("expires_at_dt", expireAfterSeconds=0)
        # Launch background drip worker
        import asyncio as _asyncio
        _asyncio.create_task(drip_worker_loop(db, interval_seconds=60))
        _asyncio.create_task(credit_retention_worker_loop())
        logger.info("Startup complete: indexes + admin seeded + drip worker + financial state")
    except Exception as e:
        logger.error(f"Startup error: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
