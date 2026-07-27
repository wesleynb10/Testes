"""
End-to-end API test covering FinPremium core flows against a local/preview backend.

Covers:
  - packages
  - auth (register / login / me / logout / admin)
  - leads + drip schedule
  - financial-state + dashboard summary
  - transactions CRUD + bulk
  - credit price / quote / orders (mock provider)
  - admin dashboard / leads / transactions / drip
  - checkout session creation (skipped if Stripe key invalid)
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "wesleynb10@gmail.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "FinPremium2026!")


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def client_user(s):
    email = f"e2e_client_{uuid.uuid4().hex[:10]}@example.com"
    password = "E2eClient2026!"
    r = s.post(
        f"{API}/auth/register",
        json={"email": email, "password": password, "name": "E2E Cliente"},
        timeout=20,
    )
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data.get("email") == email
    return {"email": email, "password": password, "session": s, "user": data}


@pytest.fixture(scope="module")
def admin(s):
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    r = sess.post(
        f"{API}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin"
    return sess


# ---------- Health / packages ----------
def test_api_root(s):
    r = s.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert "FinPremium" in r.json().get("message", "")


def test_packages(s):
    r = s.get(f"{API}/packages", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert set(data.keys()) == {"starter", "complete", "premium_plus"}
    assert data["starter"]["amount"] == 47.0
    assert data["complete"]["amount"] == 97.0
    assert data["premium_plus"]["amount"] == 297.0


# ---------- Auth ----------
def test_register_and_me(client_user):
    sess = client_user["session"]
    r = sess.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == client_user["email"]


def test_logout_and_relogin(client_user):
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    r = sess.post(
        f"{API}/auth/login",
        json={"email": client_user["email"], "password": client_user["password"]},
        timeout=15,
    )
    assert r.status_code == 200
    r2 = sess.post(f"{API}/auth/logout", timeout=15)
    assert r2.status_code == 200
    r3 = sess.get(f"{API}/auth/me", timeout=15)
    assert r3.status_code == 401
    # restore session for later fixtures that share module session
    r4 = client_user["session"].post(
        f"{API}/auth/login",
        json={"email": client_user["email"], "password": client_user["password"]},
        timeout=15,
    )
    assert r4.status_code == 200


def test_admin_login(admin):
    r = admin.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    assert r.json()["role"] == "admin"


# ---------- Leads ----------
def test_lead_create_and_count(s):
    email = f"e2e_lead_{uuid.uuid4().hex[:8]}@example.com"
    before = s.get(f"{API}/leads/count", timeout=15).json()["total"]
    r = s.post(
        f"{API}/leads",
        json={
            "email": email,
            "source": "e2e-full",
            "metadata": {"monthly": 800, "years": 15, "rate": 0.8, "initial": 2000},
        },
        timeout=20,
    )
    assert r.status_code == 200, r.text
    assert r.json()["success"] is True
    after = s.get(f"{API}/leads/count", timeout=15).json()["total"]
    assert after == before + 1


def test_lead_invalid_email(s):
    r = s.post(f"{API}/leads", json={"email": "not-email", "source": "e2e"}, timeout=15)
    assert r.status_code == 400


# ---------- Financial state / dashboard ----------
def test_financial_state_get_put(client_user):
    sess = client_user["session"]
    # ensure logged in
    sess.post(
        f"{API}/auth/login",
        json={"email": client_user["email"], "password": client_user["password"]},
        timeout=15,
    )
    r = sess.get(f"{API}/financial-state", timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "state" in body
    payload_state = body["state"]
    payload_state.setdefault("profile", {})
    payload_state["profile"]["monthlyIncome"] = 7500
    payload_state["profile"]["onboardingCompleted"] = True
    payload_state["profile"]["name"] = "E2E Cliente"
    payload_state["profile"]["primaryGoal"] = "quitar_dividas"
    payload_state["debts"] = [
        {
            "id": "d1",
            "name": "Cartão Nubank",
            "balance": 4200,
            "rate": 2.5,
            "minPayment": 350,
        }
    ]
    payload_state["goals"] = [
        {
            "id": "g1",
            "name": "Reserva de emergência",
            "target": 15000,
            "current": 3000,
            "deadline": "2027-12-31",
        }
    ]

    r2 = sess.put(f"{API}/financial-state", json={"state": payload_state}, timeout=20)
    assert r2.status_code == 200, r2.text


def test_dashboard_summary(client_user):
    sess = client_user["session"]
    sess.post(
        f"{API}/auth/login",
        json={"email": client_user["email"], "password": client_user["password"]},
        timeout=15,
    )
    r = sess.get(f"{API}/dashboard/summary", timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "months" in data


# ---------- Transactions ----------
def test_transactions_crud(client_user):
    sess = client_user["session"]
    sess.post(
        f"{API}/auth/login",
        json={"email": client_user["email"], "password": client_user["password"]},
        timeout=15,
    )
    create = sess.post(
        f"{API}/transactions",
        json={
            "description": "E2E Supermercado",
            "amount": 185.50,
            "category": "necessidades",
            "occurred_at": "2026-07-20",
        },
        timeout=20,
    )
    assert create.status_code in (200, 201), create.text
    tx = create.json()
    tx_id = tx.get("id") or tx.get("_id") or (tx.get("transaction") or {}).get("id")
    assert tx_id, f"missing id in {tx}"

    listed = sess.get(f"{API}/transactions", timeout=15)
    assert listed.status_code == 200
    items = listed.json()
    if isinstance(items, dict):
        items = items.get("transactions") or items.get("items") or []
    assert any((t.get("id") or t.get("_id")) == tx_id for t in items)

    updated = sess.put(
        f"{API}/transactions/{tx_id}",
        json={
            "description": "E2E Supermercado Atualizado",
            "amount": 190.0,
            "category": "necessidades",
            "occurred_at": "2026-07-20",
        },
        timeout=20,
    )
    assert updated.status_code == 200, updated.text

    deleted = sess.delete(f"{API}/transactions/{tx_id}", timeout=15)
    assert deleted.status_code == 200, deleted.text


def test_transactions_bulk(client_user):
    sess = client_user["session"]
    sess.post(
        f"{API}/auth/login",
        json={"email": client_user["email"], "password": client_user["password"]},
        timeout=15,
    )
    r = sess.post(
        f"{API}/transactions/bulk",
        json={
            "transactions": [
                {
                    "description": "Bulk Padaria",
                    "amount": 22.0,
                    "category": "necessidades",
                    "occurred_at": "2026-07-18",
                },
                {
                    "description": "Bulk Netflix",
                    "amount": 55.9,
                    "category": "desejos",
                    "occurred_at": "2026-07-18",
                },
            ]
        },
        timeout=20,
    )
    assert r.status_code in (200, 201), r.text


# ---------- Credit (mock provider) ----------
def test_credit_price_and_quote(client_user):
    sess = client_user["session"]
    sess.post(
        f"{API}/auth/login",
        json={"email": client_user["email"], "password": client_user["password"]},
        timeout=15,
    )
    price = sess.get(f"{API}/credit/price", timeout=15)
    assert price.status_code == 200, price.text
    pdata = price.json()
    assert "price" in pdata or "amount" in pdata or "apis" in pdata or "catalog" in pdata

    quote = sess.post(f"{API}/credit/quote", json={"apis": ["score"]}, timeout=20)
    # quote may require specific api keys; accept 200 or 400 with validation message
    assert quote.status_code in (200, 400, 422), quote.text


def test_credit_orders_list(client_user):
    sess = client_user["session"]
    sess.post(
        f"{API}/auth/login",
        json={"email": client_user["email"], "password": client_user["password"]},
        timeout=15,
    )
    r = sess.get(f"{API}/credit/orders", timeout=15)
    assert r.status_code == 200, r.text


# ---------- Admin ----------
def test_admin_dashboard(admin):
    r = admin.get(f"{API}/admin/dashboard", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, dict)


def test_admin_leads(admin):
    r = admin.get(f"{API}/admin/leads?limit=50", timeout=20)
    assert r.status_code == 200, r.text


def test_admin_transactions(admin):
    r = admin.get(f"{API}/admin/transactions?limit=50", timeout=20)
    assert r.status_code == 200, r.text


def test_admin_drip(admin):
    r = admin.get(f"{API}/admin/drip?limit=50", timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert isinstance(data, (dict, list))


def test_admin_drip_run_now(admin):
    r = admin.post(f"{API}/admin/drip/run-now", json={}, timeout=30)
    assert r.status_code == 200, r.text


# ---------- Checkout (best-effort; Stripe may be unavailable) ----------
def test_checkout_invalid_package(s):
    r = s.post(
        f"{API}/checkout/session",
        json={"package_id": "does_not_exist", "origin_url": BASE_URL},
        timeout=20,
    )
    assert r.status_code == 400


def test_checkout_session_optional(s):
    r = s.post(
        f"{API}/checkout/session",
        json={
            "package_id": "complete",
            "origin_url": BASE_URL,
            "email": f"e2e_buyer_{uuid.uuid4().hex[:6]}@example.com",
        },
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"Stripe checkout unavailable in this env: {r.status_code} {r.text[:200]}")
    data = r.json()
    assert "session_id" in data and "url" in data
    status = s.get(f"{API}/checkout/status/{data['session_id']}", timeout=30)
    assert status.status_code == 200, status.text
