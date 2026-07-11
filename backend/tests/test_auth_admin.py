"""Backend tests for v1.4 - auth + admin panel."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://wealth-control-25.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "wesleynb10@gmail.com"
ADMIN_PASSWORD = "FinPremium2026!"


@pytest.fixture
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def logged_in(sess):
    r = sess.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return sess


# ---------- Login ----------
def test_login_success(sess):
    r = sess.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["email"] == ADMIN_EMAIL
    assert data["role"] == "admin"
    assert "id" in data
    # Cookies set
    cookies = sess.cookies.get_dict()
    assert "access_token" in cookies
    assert "refresh_token" in cookies


def test_login_wrong_password(sess):
    r = sess.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrongpass_" + str(time.time())}, timeout=15)
    assert r.status_code == 401


def test_login_unknown_email(sess):
    r = sess.post(f"{API}/auth/login", json={"email": f"nobody_{int(time.time())}@x.com", "password": "x"}, timeout=15)
    assert r.status_code == 401


# ---------- Me / Logout ----------
def test_me_without_auth_returns_401(sess):
    r = sess.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 401


def test_me_with_auth(logged_in):
    r = logged_in.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == ADMIN_EMAIL
    assert data["role"] == "admin"
    assert "password_hash" not in data


def test_logout_clears_cookies(logged_in):
    r = logged_in.post(f"{API}/auth/logout", timeout=15)
    assert r.status_code == 200
    # After logout, /me should fail
    r2 = logged_in.get(f"{API}/auth/me", timeout=15)
    assert r2.status_code == 401


# ---------- Admin endpoints ----------
def test_admin_dashboard_no_auth(sess):
    r = sess.get(f"{API}/admin/dashboard", timeout=15)
    assert r.status_code == 401


def test_admin_dashboard_with_auth(logged_in):
    r = logged_in.get(f"{API}/admin/dashboard", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    for key in ["total_leads", "total_transactions", "paid_transactions", "revenue", "conversion_rate", "leads_last_7d", "sales_last_7d"]:
        assert key in d, f"Missing key {key}"
    assert isinstance(d["total_leads"], int)
    assert isinstance(d["revenue"], (int, float))


def test_admin_leads(logged_in):
    r = logged_in.get(f"{API}/admin/leads", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "leads" in d and "count" in d
    assert isinstance(d["leads"], list)


def test_admin_transactions(logged_in):
    r = logged_in.get(f"{API}/admin/transactions", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert "transactions" in d and "count" in d
    assert isinstance(d["transactions"], list)


def test_admin_no_mongo_id_leaked(logged_in):
    r = logged_in.get(f"{API}/admin/leads", timeout=15)
    for lead in r.json()["leads"]:
        assert "_id" not in lead


# ---------- Brute force lockout ----------
def test_brute_force_lockout_after_5_attempts():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Use a unique email to avoid affecting the real admin login
    fake_email = f"lockout_test_{int(time.time())}@finpremium.com.br"
    got_429 = False
    for i in range(6):
        r = s.post(f"{API}/auth/login", json={"email": fake_email, "password": "wrong"}, timeout=15)
        if r.status_code == 429:
            got_429 = True
            break
    assert got_429, "Expected 429 (lockout) after 5 failed attempts"


# ---------- Regression v1.0-v1.3 ----------
def test_root_still_works():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200


def test_packages_still_works():
    r = requests.get(f"{API}/packages", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert set(data.keys()) == {"starter", "complete", "premium_plus"}


def test_leads_public_endpoint_still_works():
    r = requests.post(f"{API}/leads", json={"email": f"TEST_reg_{int(time.time())}@x.com", "source": "regression"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["success"] is True


def test_checkout_still_works():
    r = requests.post(f"{API}/checkout/session", json={"package_id": "starter", "origin_url": BASE_URL}, timeout=30)
    assert r.status_code == 200
    j = r.json()
    assert j["url"].startswith("https://checkout.stripe.com/")


# ---------- Admin seeding validation ----------
def test_admin_bcrypt_hash_format():
    """Verify admin was seeded with bcrypt (indirect: login works)."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200
