"""Lightweight API tests (stdlib unittest + TestClient)."""

import os
import sys
import tempfile
import unittest
from pathlib import Path

# Ensure backend package root is importable
BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT.parent))

# Isolate DB before importing app
tmpdir = tempfile.mkdtemp()
os.environ.setdefault("FACELESS_TEST", "1")

from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


class FacelessApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        cls.client = TestClient(app)

    def test_health(self):
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["ok"])

    def test_product_scorecard_and_hooks(self):
        payload = {
            "name": "Escova a vapor",
            "niche": "casa",
            "price": 79.9,
            "pain": "roupa amassada",
            "hook_visual": "vapor saindo e tecido alisando",
            "benefits": "1) rápido 2) sem tábua 3) viagem",
            "researcher": "Ana",
            "score_hook": 2,
            "score_price": 2,
            "score_problem": 2,
            "score_margin": 1,
            "score_social": 1,
        }
        preview = self.client.post("/api/products/scorecard", json=payload)
        self.assertEqual(preview.status_code, 200)
        self.assertEqual(preview.json()["score"], 8)
        self.assertEqual(preview.json()["decision"], "produce")

        created = self.client.post("/api/products", json=payload)
        self.assertEqual(created.status_code, 200)
        product_id = created.json()["id"]
        self.assertEqual(created.json()["status"], "produce")

        scripts = self.client.post(f"/api/scripts/generate/{product_id}")
        self.assertEqual(scripts.status_code, 200)
        self.assertEqual(len(scripts.json()), 5)

        kanban = self.client.get("/api/scripts/kanban")
        self.assertEqual(kanban.status_code, 200)
        self.assertGreaterEqual(len(kanban.json()["roteiro"]), 5)

        checklist = self.client.get("/api/metrics/checklist")
        self.assertEqual(checklist.status_code, 200)
        self.assertIn("Checklist diário", checklist.text)

        dash = self.client.get("/api/dashboard")
        self.assertEqual(dash.status_code, 200)
        self.assertGreaterEqual(dash.json()["products_total"], 1)


if __name__ == "__main__":
    unittest.main()
