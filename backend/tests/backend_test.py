"""Backend tests for FinPremium v1.2 - packages, leads, Stripe checkout."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://wealth-control-25.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


# ---------- Packages ----------
def test_packages_returns_three(s):
    r = s.get(f"{API}/packages", timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert set(data.keys()) == {"starter", "complete", "premium_plus"}
    assert data["starter"]["amount"] == 47.00
    assert data["complete"]["amount"] == 97.00
    assert data["premium_plus"]["amount"] == 297.00
    for k, v in data.items():
        assert v["id"] == k
        assert v["currency"] == "brl"
        assert "name" in v and "description" in v


# ---------- Leads ----------
def test_leads_create_success(s):
    r = s.post(f"{API}/leads", json={"email": "TEST_lead@example.com", "source": "test", "metadata": {"foo": "bar"}}, timeout=15)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["success"] is True
    assert isinstance(j["id"], str) and len(j["id"]) > 0


def test_leads_invalid_email_returns_400(s):
    r = s.post(f"{API}/leads", json={"email": "not-an-email", "source": "test"}, timeout=15)
    assert r.status_code == 400


def test_leads_count_increments(s):
    before = s.get(f"{API}/leads/count", timeout=15).json()["total"]
    s.post(f"{API}/leads", json={"email": "TEST_counter@example.com", "source": "count-test"}, timeout=15)
    after = s.get(f"{API}/leads/count", timeout=15).json()["total"]
    assert after == before + 1


# ---------- Checkout ----------
@pytest.fixture(scope="module")
def created_session(s):
    payload = {"package_id": "complete", "origin_url": BASE_URL, "email": "TEST_buyer@example.com"}
    r = s.post(f"{API}/checkout/session", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "url" in j and "session_id" in j
    assert j["url"].startswith("https://checkout.stripe.com/")
    assert j["session_id"].startswith("cs_test_")
    return j


def test_checkout_session_created(created_session):
    assert created_session["session_id"]


def test_checkout_invalid_package_returns_400(s):
    r = s.post(f"{API}/checkout/session", json={"package_id": "does_not_exist", "origin_url": BASE_URL}, timeout=15)
    assert r.status_code == 400


def test_checkout_status_returns_unpaid(s, created_session):
    sid = created_session["session_id"]
    r = s.get(f"{API}/checkout/status/{sid}", timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "status" in j and "payment_status" in j
    assert j["payment_status"] in ("unpaid", "no_payment_required")
    assert "amount_total" in j and "currency" in j and "metadata" in j
    # Metadata should carry the package info
    if j.get("metadata"):
        assert j["metadata"].get("package_id") == "complete"


def test_checkout_all_three_packages(s):
    for pkg_id, expected in [("starter", 4700), ("complete", 9700), ("premium_plus", 29700)]:
        r = s.post(f"{API}/checkout/session", json={"package_id": pkg_id, "origin_url": BASE_URL}, timeout=30)
        assert r.status_code == 200, f"{pkg_id}: {r.text}"
        j = r.json()
        assert j["url"].startswith("https://checkout.stripe.com/")
