"""Testes do merge SCR → financial_state (sem Mongo)."""
from financial_state import clean_financial_state, merge_scr_import


def _scr_fixture():
    return {
        "divida_atual": 18500.0,
        "quantidade_instituicoes": 2,
        "quantidade_operacoes": 2,
        "faixa_risco": "Baixo",
        "modalidades": [
            {
                "modalidade": "Cartão de crédito",
                "codigo": "0203",
                "saldo": 4500.0,
                "vencido": 0.0,
            },
            {
                "modalidade": "Empréstimo pessoal",
                "codigo": "0401",
                "saldo": 14000.0,
                "vencido": 1250.0,
            },
        ],
        "curva_vencimentos": [
            {
                "chave": "de_1_a_30",
                "label": "1–30 dias",
                "horizonte_dias": 30,
                "valor": 1800.0,
                "acumulado": 1800.0,
            }
        ],
    }


def test_merge_scr_import_cria_debts_e_insight():
    state = merge_scr_import(
        {"profile": {"name": "Ana", "monthlyIncome": 5000}, "debts": []},
        report_id="rep-1",
        order_id="ord-1",
        scr=_scr_fixture(),
    )
    cleaned = clean_financial_state(state)
    scr_debts = [d for d in cleaned["debts"] if d["source"] == "scr"]
    assert len(scr_debts) == 2
    assert {d["scrCodigo"] for d in scr_debts} == {"0203", "0401"}
    assert cleaned["profile"]["primaryGoal"] == "sair_dividas"
    assert cleaned["profile"]["firstWeekChecklist"]["goalDebt"] is True
    assert cleaned["creditInsight"]["reportId"] == "rep-1"
    assert cleaned["creditInsight"]["divida_atual"] == 18500.0
    assert cleaned["creditInsight"]["curva_vencimentos"][0]["valor"] == 1800.0


def test_merge_scr_import_preserva_debt_manual_e_nao_duplica():
    base = {
        "debts": [
            {
                "id": "dvmanual1",
                "name": "Amigo",
                "balance": 300,
                "rate": 0,
                "minPayment": 50,
                "source": "manual",
            },
            {
                "id": "dvscr1",
                "name": "Cartão antigo",
                "balance": 1000,
                "rate": 1.0,
                "minPayment": 100,
                "termMonths": 6,
                "source": "scr",
                "scrCodigo": "0203",
                "reportId": "old",
            },
        ]
    }
    state = merge_scr_import(
        base,
        report_id="rep-2",
        order_id="ord-2",
        scr=_scr_fixture(),
        selected=[{"codigo": "0203", "rate": 3.2, "minPayment": 220, "termMonths": 10}],
    )
    debts = state["debts"]
    manuals = [d for d in debts if d["source"] == "manual"]
    scrs = [d for d in debts if d["source"] == "scr"]
    assert len(manuals) == 1
    assert manuals[0]["name"] == "Amigo"
    assert len(scrs) == 1
    assert scrs[0]["id"] == "dvscr1"
    assert scrs[0]["balance"] == 4500.0
    assert scrs[0]["rate"] == 3.2
    assert scrs[0]["reportId"] == "rep-2"
