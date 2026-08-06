#!/usr/bin/env python3
"""Simula personas distintas no FinPremium (ASGI in-process) e grava relatório JSON."""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

# Ambiente isolado antes de importar o server
os.environ["USE_MOCK_DB"] = "1"
os.environ["CREDIT_PROVIDER"] = "mock"
os.environ["REQUIRE_CPF_ON_REGISTER"] = "0"
os.environ.setdefault("JWT_SECRET", "persona-demo-secret")
os.environ.setdefault("DB_NAME", "finpremium_personas")
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("ADMIN_EMAIL", "wesleynb10@gmail.com")
os.environ.setdefault("ADMIN_PASSWORD", "FinPremium2026!")

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

import server as srv  # noqa: E402

OUT_DIR = ROOT / "test_reports" / "personas"
STAMP = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

CPFS = ["52998224725", "39053344705", "15350946056", "11144477735"]

PERSONAS: List[Dict[str, Any]] = [
    {
        "id": "ana_endividada",
        "name": "Ana Souza",
        "role": "Endividada — quitar dívidas",
        "goal": "quitar_dividas",
        "income": 4200,
        "story": "Cartão e carnê pesando; quer sobra mensal e plano bola de neve.",
        "debts": [
            {"id": "d1", "name": "Cartão Nubank", "balance": 6800, "rate": 14.9, "ratePeriod": "am", "minPayment": 420},
            {"id": "d2", "name": "Carnê Magazine", "balance": 2400, "rate": 3.2, "ratePeriod": "am", "minPayment": 280, "termMonths": 10},
        ],
        "goals": [
            {"id": "g1", "name": "Livre das dívidas", "target": 9200, "current": 0, "deadline": "2027-06-30"},
        ],
        "budget": {
            "necessidades": [
                {"id": "n1", "name": "Aluguel", "planned": 1400},
                {"id": "n2", "name": "Supermercado", "planned": 900},
                {"id": "n3", "name": "Contas / Essenciais", "planned": 450},
            ],
            "desejos": [{"id": "d1", "name": "Restaurantes", "planned": 250}],
            "investimentos": [{"id": "i1", "name": "Reserva de emergência", "planned": 100}],
        },
        "transactions": [
            {"description": "Mercado Extra", "amount": 187.4, "category": "necessidades", "subcategory": "Supermercado"},
            {"description": "iFood", "amount": 62.9, "category": "desejos", "subcategory": "Restaurantes"},
            {"description": "Conta de luz", "amount": 210.0, "category": "necessidades", "subcategory": "Contas / Essenciais"},
        ],
        "credit": True,
        "credit_apis": ["score", "scr"],
        "grant_reports": 1,
    },
    {
        "id": "bruno_investidor",
        "name": "Bruno Lima",
        "role": "Investidor iniciante — reserva + FIRE",
        "goal": "liberdade_financeira",
        "income": 12500,
        "story": "Renda boa, pouca dívida; quer reserva e Número da Liberdade.",
        "debts": [
            {"id": "d1", "name": "Financiamento carro", "balance": 28000, "rate": 1.6, "ratePeriod": "am", "minPayment": 890, "termMonths": 36},
        ],
        "goals": [
            {"id": "g1", "name": "Reserva de emergência", "target": 37500, "current": 12000, "deadline": "2027-12-31"},
            {"id": "g2", "name": "Número da Liberdade", "target": 1500000, "current": 85000, "deadline": "2038-01-01"},
        ],
        "budget": {
            "necessidades": [
                {"id": "n1", "name": "Aluguel", "planned": 2800},
                {"id": "n2", "name": "Supermercado", "planned": 1200},
            ],
            "desejos": [{"id": "d1", "name": "Lazer", "planned": 800}],
            "investimentos": [
                {"id": "i1", "name": "Aplicação", "planned": 3500},
                {"id": "i2", "name": "Reserva de emergência", "planned": 1000},
            ],
        },
        "transactions": [
            {"description": "Aporte CDB", "amount": 3500, "category": "investimentos", "subcategory": "Aplicação"},
            {"description": "Netflix", "amount": 55.9, "category": "desejos", "subcategory": "Assinaturas"},
            {"description": "Supermercado", "amount": 890, "category": "necessidades", "subcategory": "Supermercado"},
        ],
        "credit": False,
        "fire": {
            "monthlyExpenses": 6500,
            "monthlyInvestment": 3500,
            "annualReturn": 8.0,
            "safeWithdrawal": 4.0,
            "currentInvested": 85000,
        },
    },
    {
        "id": "carla_freelancer",
        "name": "Carla Mendes",
        "role": "Freelancer — organizar fluxo de caixa",
        "goal": "organizar_gastos",
        "income": 6800,
        "story": "Renda variável; precisa categorizar gastos e ver 50/30/20.",
        "debts": [],
        "goals": [
            {"id": "g1", "name": "Colchão 3 meses", "target": 20400, "current": 4100, "deadline": "2027-03-31"},
        ],
        "budget": {
            "necessidades": [
                {"id": "n1", "name": "Aluguel", "planned": 1800},
                {"id": "n2", "name": "Transporte", "planned": 400},
                {"id": "n3", "name": "Saúde", "planned": 350},
            ],
            "desejos": [
                {"id": "d1", "name": "Assinaturas", "planned": 180},
                {"id": "d2", "name": "Compras / Lazer", "planned": 500},
            ],
            "investimentos": [{"id": "i1", "name": "Reserva de emergência", "planned": 800}],
        },
        "transactions": [
            {"description": "Uber", "amount": 84.2, "category": "necessidades", "subcategory": "Transporte"},
            {"description": "Figma", "amount": 75, "category": "desejos", "subcategory": "Assinaturas"},
            {"description": "Farmácia", "amount": 129.9, "category": "necessidades", "subcategory": "Saúde"},
            {"description": "Material escritório", "amount": 210, "category": "desejos", "subcategory": "Compras / Lazer"},
            {"description": "Reserva mensal", "amount": 800, "category": "investimentos", "subcategory": "Reserva de emergência"},
        ],
        "credit": False,
    },
    {
        "id": "diego_credito",
        "name": "Diego Rocha",
        "role": "Premium — Análise de Crédito + import SCR",
        "goal": "quitar_dividas",
        "income": 9800,
        "story": "Quer score/SCR, importar modalidades e alinhar plano vs BACEN.",
        "debts": [
            {"id": "d1", "name": "Cartão Inter", "balance": 3100, "rate": 12.5, "ratePeriod": "am", "minPayment": 250},
        ],
        "goals": [
            {"id": "g1", "name": "Quitar cartão", "target": 3100, "current": 400, "deadline": "2026-12-31"},
        ],
        "budget": {
            "necessidades": [{"id": "n1", "name": "Aluguel", "planned": 2200}],
            "desejos": [{"id": "d1", "name": "Restaurantes", "planned": 400}],
            "investimentos": [{"id": "i1", "name": "Aplicação", "planned": 1500}],
        },
        "transactions": [
            {"description": "Parcela cartão", "amount": 250, "category": "necessidades", "subcategory": "Dívidas"},
            {"description": "Almoço", "amount": 48, "category": "desejos", "subcategory": "Restaurantes"},
            {"description": "Aporte mensal", "amount": 1500, "category": "investimentos", "subcategory": "Aplicação"},
        ],
        "credit": True,
        "credit_apis": ["score", "scr", "pendencias", "acoes"],
        "grant_reports": 2,
    },
]


def step(results: List[dict], name: str, ok: bool, detail: Any = None):
    results.append({"step": name, "ok": bool(ok), "detail": detail})
    print(f"  [{'OK' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail and not ok else ""))
    return ok


def run_persona(client: TestClient, persona: Dict[str, Any], cpf: str) -> Dict[str, Any]:
    results: List[dict] = []
    email = f"persona_{persona['id']}_{uuid.uuid4().hex[:8]}@finpremium.test"
    password = "PersonaDemo2026!"
    print(f"\n=== {persona['name']} ({persona['role']}) ===")

    lead = client.post(
        "/api/leads",
        json={"email": email, "source": f"persona-{persona['id']}", "metadata": {"persona": persona["id"]}},
    )
    step(results, "1_lead_captura", lead.status_code == 200, None if lead.status_code == 200 else lead.text[:200])

    if persona.get("grant_reports"):
        asyncio.run(
            srv._grant_credit_reports(
                email,
                int(persona["grant_reports"]),
                package_id="persona_sim",
                session_id=f"sim_{uuid.uuid4().hex[:8]}",
            )
        )
        step(results, "1b_entitlement_pre_cadastro", True, f"+{persona['grant_reports']} consultas")

    reg = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "name": persona["name"], "cpf": cpf},
    )
    step(results, "2_cadastro", reg.status_code in (200, 201), None if reg.status_code in (200, 201) else reg.text[:240])
    if reg.status_code not in (200, 201):
        return {"persona": persona["id"], "name": persona["name"], "email": email, "steps": results, "passed": False}

    me = client.get("/api/auth/me")
    step(results, "3_sessao", me.status_code == 200 and me.json().get("email") == email)

    st = client.get("/api/financial-state")
    ok_get = st.status_code == 200
    step(results, "4_estado_inicial", ok_get)
    state = st.json().get("state", {}) if ok_get else {}
    profile = state.setdefault("profile", {})
    profile.update(
        {
            "name": persona["name"],
            "monthlyIncome": persona["income"],
            "onboardingCompleted": True,
            "primaryGoal": persona["goal"],
            "firstWeekChecklist": {
                "income": True,
                "firstTx": True,
                "budget": True,
                "goalDebt": True,
                "whatsapp": False,
                "dismissed": False,
                "completedAt": "",
            },
        }
    )
    state["debts"] = persona["debts"]
    state["goals"] = persona["goals"]
    if persona.get("budget"):
        state["budget"] = persona["budget"]
    if persona.get("fire"):
        state["fire"] = persona["fire"]

    put = client.put("/api/financial-state", json={"state": state})
    step(results, "5_onboarding_plano", put.status_code == 200, None if put.status_code == 200 else put.text[:200])

    tx_ok = 0
    for tx in persona.get("transactions") or []:
        body = {
            "description": tx["description"],
            "amount": abs(float(tx["amount"])),
            "category": tx["category"],
            "subcategory": tx.get("subcategory") or "Outros",
            "occurred_at": datetime.now(timezone.utc).date().isoformat(),
        }
        r = client.post("/api/transactions", json=body)
        if r.status_code in (200, 201):
            tx_ok += 1
        step(results, f"6_lancamento:{tx['description'][:24]}", r.status_code in (200, 201), None if r.status_code in (200, 201) else r.text[:120])

    listed = client.get("/api/transactions")
    listed_n = 0
    if listed.status_code == 200:
        data = listed.json()
        if isinstance(data, list):
            listed_n = len(data)
        elif isinstance(data, dict):
            listed_n = len(data.get("transactions") or data.get("items") or data.get("data") or [])
    step(results, "7_lista_lancamentos", listed.status_code == 200 and listed_n >= 1, {"count": listed_n, "posted": tx_ok})

    dash = client.get("/api/dashboard/summary")
    dash_ok = dash.status_code == 200
    dash_data = dash.json() if dash_ok else {}
    step(results, "8_dashboard", dash_ok, {"keys": list(dash_data.keys())[:10]} if dash_ok else dash.text[:120])

    credit_info: Dict[str, Any] = {}
    if persona.get("credit"):
        price = client.get("/api/credit/price")
        step(results, "9_credit_price", price.status_code == 200, price.json() if price.status_code == 200 else price.text[:120])

        quote = client.post("/api/credit/quote", json={"apis": persona.get("credit_apis") or ["score"]})
        step(results, "10_credit_quote", quote.status_code == 200, quote.json() if quote.status_code == 200 else quote.text[:160])

        checkout = client.post(
            "/api/credit/checkout",
            json={
                "consent": True,
                "consent_text_version": "v1",
                "apis": persona.get("credit_apis") or ["score", "scr"],
                "origin_url": "http://127.0.0.1:3000",
            },
        )
        credit_ok = checkout.status_code == 200
        credit_info = checkout.json() if credit_ok else {"error": checkout.text[:240], "status": checkout.status_code}
        step(
            results,
            "11_credit_checkout",
            credit_ok,
            {"order_id": credit_info.get("order_id"), "payment": credit_info.get("payment")} if credit_ok else credit_info,
        )

        if credit_ok and credit_info.get("order_id"):
            oid = credit_info["order_id"]
            ready = False
            status_body = {}
            for _ in range(20):
                stt = client.get(f"/api/credit/status/{oid}")
                status_body = stt.json() if stt.status_code == 200 else {}
                if status_body.get("status") in ("ready", "failed"):
                    ready = status_body.get("status") == "ready"
                    break
                time.sleep(0.25)
            step(results, "12_credit_report_ready", ready, status_body)

            if ready:
                rep = client.get(f"/api/credit/report/{oid}")
                report = rep.json() if rep.status_code == 200 else {}
                payload = report.get("payload_normalizado") or report.get("report") or report
                score = payload.get("score") if isinstance(payload, dict) else None
                rating = payload.get("rating_bacen") if isinstance(payload, dict) else None
                step(results, "13_credit_report_read", rep.status_code == 200, {"score": score, "rating": rating})
                credit_info["score"] = score
                credit_info["rating"] = rating

                imp = client.post(f"/api/credit/report/{oid}/import", json={"replace_manual": True})
                step(results, "14_credit_import_plano", imp.status_code == 200, imp.json() if imp.status_code == 200 else imp.text[:200])
                if imp.status_code == 200:
                    credit_info["import"] = imp.json()

            orders = client.get("/api/credit/orders")
            step(results, "15_credit_orders", orders.status_code == 200, {"n": len(orders.json()) if orders.status_code == 200 and isinstance(orders.json(), list) else "ok"})

    final = client.get("/api/financial-state")
    final_state = final.json().get("state", {}) if final.status_code == 200 else {}
    step(
        results,
        "16_estado_final",
        final.status_code == 200,
        {
            "income": (final_state.get("profile") or {}).get("monthlyIncome"),
            "debts": len(final_state.get("debts") or []),
            "goals": len(final_state.get("goals") or []),
            "creditInsight": bool(final_state.get("creditInsight")),
        },
    )

    client.post("/api/auth/logout")

    return {
        "persona": persona["id"],
        "name": persona["name"],
        "role": persona["role"],
        "story": persona["story"],
        "email": email,
        "password": password,
        "income": persona["income"],
        "goal": persona["goal"],
        "steps": results,
        "passed": all(r["ok"] for r in results),
        "dashboard_keys": list(dash_data.keys())[:12] if dash_ok else [],
        "final": {
            "income": (final_state.get("profile") or {}).get("monthlyIncome"),
            "primaryGoal": (final_state.get("profile") or {}).get("primaryGoal"),
            "debts_count": len(final_state.get("debts") or []),
            "goals_count": len(final_state.get("goals") or []),
            "debts": [
                {"name": d.get("name"), "balance": d.get("balance"), "source": d.get("source")}
                for d in (final_state.get("debts") or [])
            ],
            "goals": [
                {"name": g.get("name"), "target": g.get("target"), "current": g.get("current")}
                for g in (final_state.get("goals") or [])
            ],
            "creditInsight": final_state.get("creditInsight") or {},
        },
        "credit": credit_info,
        "tx_count": tx_ok,
    }


def main() -> int:
    print("Boot TestClient (USE_MOCK_DB + CREDIT_PROVIDER=mock)")
    with TestClient(srv.app) as client:
        root = client.get("/api/")
        print("API:", root.status_code, root.json())

        reports = []
        for i, persona in enumerate(PERSONAS):
            reports.append(run_persona(client, persona, CPFS[i % len(CPFS)]))

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "asgi_testclient_mock",
        "personas": len(reports),
        "passed": sum(1 for r in reports if r["passed"]),
        "results": reports,
    }
    out = OUT_DIR / f"persona_run_{STAMP}.json"
    out.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "latest.json").write_text(out.read_text(encoding="utf-8"), encoding="utf-8")

    print("\n======== RESUMO ========")
    for r in reports:
        fails = [s["step"] for s in r["steps"] if not s["ok"]]
        print(f"{r['name']}: {'PASS' if r['passed'] else 'FAIL'} fails={fails or '-'}")
    print(f"Relatório: {out}")
    return 0 if summary["passed"] == summary["personas"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
