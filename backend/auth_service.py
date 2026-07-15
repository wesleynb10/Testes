"""
Auth service — bcrypt password hashing + JWT tokens (access + refresh)
+ brute force protection + admin seeding + get_current_user dependency.
"""
import os
import bcrypt
import jwt
import logging
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_TTL_MIN = 60 * 12  # 12h — this is an admin panel, longer session
REFRESH_TOKEN_TTL_DAYS = 30

MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


# -----------------------------------------------------------------------------
# Password hashing
# -----------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# -----------------------------------------------------------------------------
# JWT
# -----------------------------------------------------------------------------
def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_TTL_MIN),
        "type": "access",
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_TTL_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


def _cookie_flags() -> dict:
    # Local HTTP: Secure+SameSite=None is rejected by browsers.
    # Cross-port 127.0.0.1 (3000↔8000) is same-site, so Lax works.
    secure = os.environ.get("COOKIE_SECURE", "true").lower() in ("1", "true", "yes")
    return {"httponly": True, "secure": secure, "samesite": "none" if secure else "lax"}


def set_auth_cookies(response, access_token: str, refresh_token: str):
    flags = _cookie_flags()
    response.set_cookie(
        key="access_token", value=access_token,
        max_age=ACCESS_TOKEN_TTL_MIN * 60, path="/",
        **flags,
    )
    response.set_cookie(
        key="refresh_token", value=refresh_token,
        max_age=REFRESH_TOKEN_TTL_DAYS * 24 * 3600, path="/",
        **flags,
    )


def clear_auth_cookies(response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


# -----------------------------------------------------------------------------
# get_current_user dependency (returns user document minus password_hash)
# -----------------------------------------------------------------------------
async def get_current_user(request: Request, db) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user.pop("password_hash", None)
        user.pop("_id", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# -----------------------------------------------------------------------------
# Brute force protection
# -----------------------------------------------------------------------------
async def check_lockout(db, identifier: str):
    doc = await db.login_attempts.find_one({"identifier": identifier})
    if not doc:
        return
    attempts = doc.get("attempts", 0)
    last_at = doc.get("last_attempt")
    if attempts >= MAX_LOGIN_ATTEMPTS and last_at:
        # MongoDB returns naive datetimes — normalize to UTC-aware
        if last_at.tzinfo is None:
            last_at = last_at.replace(tzinfo=timezone.utc)
        elapsed = datetime.now(timezone.utc) - last_at
        if elapsed < timedelta(minutes=LOCKOUT_MINUTES):
            remaining = LOCKOUT_MINUTES - int(elapsed.total_seconds() // 60)
            raise HTTPException(status_code=429, detail=f"Muitas tentativas. Aguarde {remaining} minutos.")
        await db.login_attempts.delete_one({"identifier": identifier})


async def record_failed_attempt(db, identifier: str):
    await db.login_attempts.update_one(
        {"identifier": identifier},
        {"$inc": {"attempts": 1}, "$set": {"last_attempt": datetime.now(timezone.utc)}},
        upsert=True,
    )


async def clear_attempts(db, identifier: str):
    await db.login_attempts.delete_one({"identifier": identifier})


# -----------------------------------------------------------------------------
# Admin seeding
# -----------------------------------------------------------------------------
async def seed_admin(db):
    import uuid
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@finpremium.com.br").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password_hash": hash_password(admin_password),
            "name": "Admin FinPremium",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Admin created: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email},
            {"$set": {"password_hash": hash_password(admin_password)}},
        )
        logger.info(f"Admin password updated: {admin_email}")


async def create_indexes(db):
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.leads.create_index("created_at")
    await db.payment_transactions.create_index("created_at")
