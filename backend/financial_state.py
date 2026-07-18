from __future__ import annotations

import re
import unicodedata
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict

VALID_CATEGORIES = ("necessidades", "desejos", "investimentos")
CHECKLIST_KEYS = ("income", "firstTx", "budget", "goalDebt", "whatsapp")


def default_first_week_checklist() -> Dict[str, Any]:
    return {
        "income": False,
        "firstTx": False,
        "budget": False,
        "goalDebt": False,
        "whatsapp": False,
        "dismissed": False,
        "completedAt": "",
    }


def _clean_checklist(raw: Any) -> Dict[str, Any]:
    base = default_first_week_checklist()
    source = raw if isinstance(raw, dict) else {}
    for key in CHECKLIST_KEYS:
        base[key] = bool(source.get(key))
    base["dismissed"] = bool(source.get("dismissed"))
    base["completedAt"] = _text(source.get("completedAt"), "", 40)
    return base


def _number(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
        return number if number == number else default
    except (TypeError, ValueError):
        return default


def _text(value: Any, default: str = "", limit: int = 160) -> str:
    text = str(value or "").strip()
    return (text or default)[:limit]


def _id(value: Any, prefix: str) -> str:
    return _text(value, f"{prefix}{uuid.uuid4().hex[:12]}", 80)


def normalize_label(value: Any) -> str:
    text = unicodedata.normalize("NFKD", _text(value).casefold())
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def default_financial_state(name: str = "Investidor") -> Dict[str, Any]:
    def items(prefix: str, names: list[str]) -> list[dict]:
        return [
            {"id": f"{prefix}{index + 1}", "name": item_name, "planned": 0.0, "actual": 0.0}
            for index, item_name in enumerate(names)
        ]

    return {
        "profile": {
            "name": _text(name, "Investidor", 100),
            "monthlyIncome": 0.0,
            "onboardingCompleted": False,
            "primaryGoal": "",
            "firstWeekChecklist": default_first_week_checklist(),
        },
        "budget": {
            "necessidades": items(
                "n",
                ["Aluguel", "Supermercado", "Contas / Essenciais", "Transporte", "Saúde"],
            ),
            "desejos": items("d", ["Restaurantes", "Assinaturas", "Compras / Lazer"]),
            "investimentos": items(
                "i", ["Reserva de emergência", "Aplicação", "Previdência"]
            ),
        },
        "debts": [],
        "goals": [],
        "fire": {
            "monthlyExpenses": 0.0,
            "monthlyInvestment": 0.0,
            "annualReturn": 6.0,
            "safeWithdrawal": 4.0,
            "currentInvested": 0.0,
        },
    }


def clean_financial_state(raw: Any, fallback_name: str = "Investidor") -> Dict[str, Any]:
    source = raw if isinstance(raw, dict) else {}
    defaults = default_financial_state(fallback_name)

    profile_raw = source.get("profile") if isinstance(source.get("profile"), dict) else {}
    monthly_income = max(0.0, _number(profile_raw.get("monthlyIncome")))
    # Contas antigas com renda já definida não precisam repetir o onboarding.
    onboarding_flag = profile_raw.get("onboardingCompleted")
    if onboarding_flag is None:
        onboarding_completed = monthly_income > 0
    else:
        onboarding_completed = bool(onboarding_flag)
    primary_goal = _text(profile_raw.get("primaryGoal"), "", 40)
    checklist = _clean_checklist(profile_raw.get("firstWeekChecklist"))
    # Contas com renda/onboarding já feitos marcam o item de renda.
    if monthly_income > 0 or onboarding_completed:
        checklist["income"] = True
    if all(checklist[key] for key in CHECKLIST_KEYS) and not checklist["completedAt"]:
        checklist["completedAt"] = datetime.now(timezone.utc).isoformat()
    profile = {
        "name": _text(profile_raw.get("name"), fallback_name or "Investidor", 100),
        "monthlyIncome": monthly_income,
        "onboardingCompleted": onboarding_completed,
        "primaryGoal": primary_goal,
        "firstWeekChecklist": checklist,
    }

    budget_raw = source.get("budget") if isinstance(source.get("budget"), dict) else {}
    budget: Dict[str, list] = {}
    for category in VALID_CATEGORIES:
        raw_items = budget_raw.get(category)
        if not isinstance(raw_items, list):
            raw_items = defaults["budget"][category]
        cleaned_items = []
        seen = set()
        for item in raw_items[:100]:
            if not isinstance(item, dict):
                continue
            name = _text(item.get("name"), "Outros", 100)
            key = normalize_label(name)
            if not key or key in seen:
                continue
            seen.add(key)
            cleaned_items.append(
                {
                    "id": _id(item.get("id"), category[0]),
                    "name": name,
                    "planned": max(0.0, _number(item.get("planned"))),
                    # Actual is derived from transactions; never trust client totals.
                    "actual": 0.0,
                }
            )
        budget[category] = cleaned_items

    debts = []
    raw_debts = source.get("debts") if isinstance(source.get("debts"), list) else []
    for debt in raw_debts[:100]:
        if not isinstance(debt, dict):
            continue
        debts.append(
            {
                "id": _id(debt.get("id"), "dv"),
                "name": _text(debt.get("name"), "Dívida", 120),
                "balance": max(0.0, _number(debt.get("balance"))),
                "rate": max(0.0, _number(debt.get("rate"))),
                # am = % ao mês (padrão). aa = % ao ano (conversão linear /12 no simulador).
                "ratePeriod": "aa" if str(debt.get("ratePeriod") or "").lower() == "aa" else "am",
                "minPayment": max(0.0, _number(debt.get("minPayment"))),
                # Meses restantes do contrato (0 = não informado / indeterminado).
                "termMonths": max(0, min(600, int(_number(debt.get("termMonths"))))),
            }
        )

    goals = []
    raw_goals = source.get("goals") if isinstance(source.get("goals"), list) else []
    for goal in raw_goals[:100]:
        if not isinstance(goal, dict):
            continue
        deadline = _text(goal.get("deadline"), "", 10)
        if deadline and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", deadline):
            deadline = ""
        goals.append(
            {
                "id": _id(goal.get("id"), "g"),
                "name": _text(goal.get("name"), "Meta", 120),
                "target": max(0.0, _number(goal.get("target"))),
                "current": max(0.0, _number(goal.get("current"))),
                "deadline": deadline,
            }
        )

    fire_raw = source.get("fire") if isinstance(source.get("fire"), dict) else {}
    fire = {
        "monthlyExpenses": max(0.0, _number(fire_raw.get("monthlyExpenses"))),
        "monthlyInvestment": max(0.0, _number(fire_raw.get("monthlyInvestment"))),
        "annualReturn": max(0.0, _number(fire_raw.get("annualReturn"), 6.0)),
        "safeWithdrawal": max(0.1, _number(fire_raw.get("safeWithdrawal"), 4.0)),
        "currentInvested": max(0.0, _number(fire_raw.get("currentInvested"))),
    }

    return {
        "profile": profile,
        "budget": budget,
        "debts": debts,
        "goals": goals,
        "fire": fire,
    }


async def get_or_create_financial_state(db, user: dict) -> Dict[str, Any]:
    user_id = user["id"]
    doc = await db.financial_states.find_one({"user_id": user_id}, {"_id": 0})
    if doc:
        return clean_financial_state(doc.get("state"), user.get("name") or "Investidor")

    state = default_financial_state(user.get("name") or "Investidor")
    now = datetime.now(timezone.utc).isoformat()
    await db.financial_states.update_one(
        {"user_id": user_id},
        {
            "$setOnInsert": {
                "user_id": user_id,
                "user_email": user.get("email"),
                "state": state,
                "created_at": now,
                "updated_at": now,
            }
        },
        upsert=True,
    )
    return state


async def _current_month_totals(db, user_id: str) -> Dict[str, Dict[str, float]]:
    month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")
    docs = await db.transactions.find(
        {"user_id": user_id},
        {
            "_id": 0,
            "category": 1,
            "subcategory": 1,
            "amount": 1,
            "occurred_at": 1,
            "created_at": 1,
        },
    ).to_list(length=10000)

    totals: Dict[str, Dict[str, float]] = {category: {} for category in VALID_CATEGORIES}
    for tx in docs:
        effective_at = tx.get("occurred_at") or tx.get("created_at") or ""
        if not str(effective_at).startswith(month_prefix):
            continue
        category = tx.get("category")
        if category not in VALID_CATEGORIES:
            continue
        label = _text(tx.get("subcategory"), "Outros", 100)
        key = normalize_label(label) or "outros"
        bucket = totals[category]
        bucket[key] = bucket.get(key, 0.0) + max(0.0, _number(tx.get("amount")))
    return totals


async def materialize_actuals(db, user_id: str, state: Dict[str, Any]) -> Dict[str, Any]:
    result = deepcopy(state)
    totals = await _current_month_totals(db, user_id)
    for category in VALID_CATEGORIES:
        items = result["budget"][category]
        by_key = {normalize_label(item["name"]): item for item in items}
        for key, amount in totals[category].items():
            item = by_key.get(key)
            if item:
                item["actual"] = round(amount, 2)
    return result


async def ensure_transaction_budget_item(db, user: dict, transaction: dict) -> None:
    category = transaction.get("category")
    if category not in VALID_CATEGORIES:
        return
    label = _text(transaction.get("subcategory"), "Outros", 100)
    key = normalize_label(label)

    state = await get_or_create_financial_state(db, user)
    if any(normalize_label(item["name"]) == key for item in state["budget"][category]):
        return

    state["budget"][category].append(
        {
            "id": f"{category[0]}{uuid.uuid4().hex[:12]}",
            "name": label,
            "planned": 0.0,
            "actual": 0.0,
        }
    )
    now = datetime.now(timezone.utc).isoformat()
    await db.financial_states.update_one(
        {"user_id": user["id"]},
        {
            "$set": {
                "state": clean_financial_state(state, user.get("name") or "Investidor"),
                "user_email": user.get("email"),
                "updated_at": now,
            }
        },
        upsert=True,
    )


async def save_financial_state(db, user: dict, raw_state: Any) -> Dict[str, Any]:
    state = clean_financial_state(raw_state, user.get("name") or "Investidor")
    totals = await _current_month_totals(db, user["id"])

    # Preserve/create every category found in transactions, even if a stale client
    # saves while a WhatsApp message is arriving.
    for category in VALID_CATEGORIES:
        existing = {normalize_label(item["name"]) for item in state["budget"][category]}
        for key in totals[category]:
            if key not in existing:
                state["budget"][category].append(
                    {
                        "id": f"{category[0]}{uuid.uuid4().hex[:12]}",
                        "name": key.title() or "Outros",
                        "planned": 0.0,
                        "actual": 0.0,
                    }
                )

    now = datetime.now(timezone.utc).isoformat()
    await db.financial_states.update_one(
        {"user_id": user["id"]},
        {
            "$set": {
                "user_email": user.get("email"),
                "state": state,
                "updated_at": now,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    return await materialize_actuals(db, user["id"], state)


async def ensure_financial_indexes(db) -> None:
    await db.financial_states.create_index("user_id", unique=True)
