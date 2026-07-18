from financial_state import clean_financial_state, default_financial_state, normalize_label


def test_default_state_has_zeroed_real_values():
    state = default_financial_state("Wesley")

    assert state["profile"] == {
        "name": "Wesley",
        "monthlyIncome": 0.0,
        "onboardingCompleted": False,
        "primaryGoal": "",
        "firstWeekChecklist": {
            "income": False,
            "firstTx": False,
            "budget": False,
            "goalDebt": False,
            "whatsapp": False,
            "dismissed": False,
            "completedAt": "",
        },
    }
    assert state["debts"] == []
    assert state["goals"] == []
    assert all(
        item["actual"] == 0
        for category in state["budget"].values()
        for item in category
    )


def test_clean_state_ignores_client_actual_and_sanitizes_numbers():
    state = clean_financial_state(
        {
            "profile": {"name": "Cliente", "monthlyIncome": "9000"},
            "budget": {
                "necessidades": [
                    {
                        "id": "n1",
                        "name": "Supermercado",
                        "planned": "850.50",
                        "actual": 999999,
                    }
                ],
                "desejos": [],
                "investimentos": [],
            },
            "debts": [
                {
                    "id": "dv1",
                    "name": "Cartão",
                    "balance": "1200",
                    "rate": "9.5",
                    "minPayment": "180",
                    "termMonths": "24",
                }
            ],
            "goals": [],
            "fire": {"safeWithdrawal": 4},
        }
    )

    assert state["profile"]["monthlyIncome"] == 9000
    assert state["budget"]["necessidades"][0]["planned"] == 850.5
    assert state["budget"]["necessidades"][0]["actual"] == 0
    assert state["debts"][0]["rate"] == 9.5
    assert state["debts"][0]["termMonths"] == 24


def test_debt_term_months_defaults_to_zero_when_missing():
    state = clean_financial_state(
        {
            "debts": [
                {"id": "dv1", "name": "Cartão", "balance": 100, "rate": 1, "minPayment": 20}
            ]
        }
    )
    assert state["debts"][0]["termMonths"] == 0


def test_normalize_label_matches_accents_and_punctuation():
    assert normalize_label("Saúde / Farmácia") == "saude farmacia"
    assert normalize_label("  Cartão-de-Crédito ") == "cartao de credito"
