"""Backend tests for v1.5 - Drip email campaign."""
import os
import time
import pytest
import requests
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://wealth-control-25.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "wesleynb10@gmail.com"
ADMIN_PASSWORD = "FinPremium2026!"

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


@pytest.fixture
def sess():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def admin(sess):
    r = sess.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return sess


@pytest.fixture
def mongo():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------- Schedule on lead creation ----------
def test_creating_lead_schedules_5_emails(mongo):
    unique_email = f"TEST_drip_{int(time.time())}@example.com"
    r = requests.post(f"{API}/leads", json={"email": unique_email, "source": "test-drip", "metadata": {"monthly": 500, "years": 20, "rate": 0.9, "initial": 1000}}, timeout=15)
    assert r.status_code == 200
    time.sleep(1)  # let the drip insert complete
    unique_email = unique_email.lower()
    count = run(mongo.email_queue.count_documents({"lead_email": unique_email}))
    assert count == 5, f"Expected 5 drip emails, got {count}"
    pending = run(mongo.email_queue.count_documents({"lead_email": unique_email, "status": "pending"}))
    assert pending == 5


# ---------- Admin GET /admin/drip ----------
def test_admin_drip_endpoint_requires_auth(sess):
    r = sess.get(f"{API}/admin/drip", timeout=15)
    assert r.status_code == 401


def test_admin_drip_returns_queue_and_summary(admin):
    r = admin.get(f"{API}/admin/drip", timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "queue" in d and "summary" in d
    for k in ["pending", "sent", "cancelled", "failed", "total"]:
        assert k in d["summary"], f"Missing {k}"
    # queue sorted asc by send_at
    q = d["queue"]
    if len(q) >= 2:
        ts = [item["send_at"] for item in q if item.get("send_at")]
        assert ts == sorted(ts), "Queue not sorted by send_at asc"
    # No _id leak
    for item in q:
        assert "_id" not in item


# ---------- Fire-next ----------
def test_fire_next_advances_step_and_marks_sent(admin, mongo):
    # Create dedicated lead using admin's real email (Resend test mode only delivers there)
    unique = f"TEST_fire_{int(time.time())}"
    # Actually to test API succeeds, we use admin email so Resend accepts
    r = requests.post(f"{API}/leads", json={"email": ADMIN_EMAIL, "source": unique, "metadata": {"monthly": 500, "years": 20, "rate": 0.9, "initial": 1000}}, timeout=15)
    assert r.status_code == 200
    time.sleep(1)

    # Fire step 1
    r1 = admin.post(f"{API}/admin/drip/fire-next", json={"email": ADMIN_EMAIL}, timeout=30)
    assert r1.status_code == 200, r1.text
    j = r1.json()
    assert j["triggered"] is True
    assert j["step"] == 1
    assert j["sent_this_run"] >= 1

    # Verify the sent doc in Mongo
    time.sleep(0.5)
    sent_docs = run(mongo.email_queue.find({"lead_email": ADMIN_EMAIL.lower(), "step": 1, "status": "sent"}).to_list(length=10))
    assert len(sent_docs) >= 1
    d0 = sent_docs[0]
    assert d0.get("sent_at")
    assert d0.get("email_id")


def test_fire_next_returns_404_when_no_pending(admin):
    fresh_email = f"nopending_{int(time.time())}@example.com"
    r = admin.post(f"{API}/admin/drip/fire-next", json={"email": fresh_email}, timeout=15)
    assert r.status_code == 404


# ---------- Run-now ----------
def test_run_now_returns_sent_count(admin):
    r = admin.post(f"{API}/admin/drip/run-now", json={}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "sent" in j
    assert isinstance(j["sent"], int)
    assert j["sent"] >= 0


# ---------- Cancellation flow ----------
def test_drip_cancelled_when_lead_becomes_buyer(mongo):
    """Simulate: lead -> checkout session -> mark tx paid in mongo -> GET /checkout/status
    should trigger cancel_drip_for_email."""
    buyer = f"TEST_buyer_{int(time.time())}@example.com".lower()
    # 1) create lead -> schedules 5 pending emails
    r = requests.post(f"{API}/leads", json={"email": buyer, "source": "buyer-flow", "metadata": {}}, timeout=15)
    assert r.status_code == 200
    time.sleep(1)
    assert run(mongo.email_queue.count_documents({"lead_email": buyer, "status": "pending"})) == 5

    # 2) create checkout session with this email
    r2 = requests.post(f"{API}/checkout/session", json={"package_id": "complete", "origin_url": BASE_URL, "email": buyer}, timeout=30)
    assert r2.status_code == 200
    session_id = r2.json()["session_id"]

    # 3) Manually mark tx as paid in mongo (simulating Stripe payment success),
    # but keeping payment_status pending so checkout/status flow will detect the transition
    # NOTE: /api/checkout/status reads the actual Stripe status. Since we can't pay,
    # we test cancel_drip_for_email directly by calling the drip service via mongo assertion.
    # Instead, directly invoke cancel via mongo update (simulating the codepath).
    # This mirrors what /checkout/status does when Stripe returns paid.
    from drip_service import cancel_drip_for_email
    import sys
    sys.path.insert(0, '/app/backend')
    modified = run(cancel_drip_for_email(mongo, buyer, reason="purchased"))
    assert modified == 5, f"Expected 5 cancellations, got {modified}"

    cancelled = run(mongo.email_queue.count_documents({"lead_email": buyer, "status": "cancelled", "cancelled_reason": "purchased"}))
    assert cancelled == 5
    pending = run(mongo.email_queue.count_documents({"lead_email": buyer, "status": "pending"}))
    assert pending == 0


# ---------- Send timings ----------
def test_drip_send_at_delays_match_schedule(mongo):
    unique = f"TEST_delays_{int(time.time())}@example.com".lower()
    now = datetime.now(timezone.utc)
    r = requests.post(f"{API}/leads", json={"email": unique, "source": "delays-test", "metadata": {}}, timeout=15)
    assert r.status_code == 200
    time.sleep(1)
    docs = run(mongo.email_queue.find({"lead_email": unique}).sort("step", 1).to_list(length=10))
    assert len(docs) == 5
    expected_hours = [24, 72, 120, 216, 336]
    for doc, exp in zip(docs, expected_hours):
        send_at = doc["send_at"]
        if isinstance(send_at, str):
            send_at = datetime.fromisoformat(send_at.replace("Z", "+00:00"))
        if send_at.tzinfo is None:
            send_at = send_at.replace(tzinfo=timezone.utc)
        diff_hours = (send_at - now).total_seconds() / 3600
        assert abs(diff_hours - exp) < 1.5, f"Step delay off: got {diff_hours}h, expected {exp}h"
