import React, { useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useFinance } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { brl, parseNum } from "@/lib/format";
import {
  Gem,
  Wallet,
  Target,
  TrendingDown,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Loader2,
} from "lucide-react";

const GOALS = [
  {
    id: "sair_dividas",
    title: "Sair das dívidas",
    hint: "Priorizar quitação e pausar gastos desnecessários",
  },
  {
    id: "reserva",
    title: "Montar reserva de emergência",
    hint: "3–6 meses de custo fixo guardados",
  },
  {
    id: "investir",
    title: "Começar a investir",
    hint: "Disciplina de aporte todo mês",
  },
  {
    id: "liberdade",
    title: "Independência financeira",
    hint: "Calcular e perseguir o Número da Liberdade",
  },
];

const PILLAR_RATIO = {
  necessidades: 0.5,
  desejos: 0.3,
  investimentos: 0.2,
};

function distributePlanned(budget, income) {
  const next = { ...budget };
  for (const [category, ratio] of Object.entries(PILLAR_RATIO)) {
    const items = next[category] || [];
    if (!items.length) continue;
    const bucket = income * ratio;
    const each = Math.round((bucket / items.length) * 100) / 100;
    next[category] = items.map((item) => ({ ...item, planned: each }));
  }
  return next;
}

function goalSeed(goalId, income) {
  if (goalId === "reserva") {
    return {
      name: "Reserva de emergência",
      target: Math.round(income * 6),
      current: 0,
      deadline: "",
    };
  }
  if (goalId === "investir") {
    return {
      name: "Primeiro aporte consistente",
      target: Math.round(income * 0.2 * 12),
      current: 0,
      deadline: "",
    };
  }
  if (goalId === "liberdade") {
    return {
      name: "Número da Liberdade",
      target: Math.round(income * 0.7 * 12 * 25),
      current: 0,
      deadline: "",
    };
  }
  return {
    name: "Ficar livre das dívidas",
    target: Math.round(income * 3),
    current: 0,
    deadline: "",
  };
}

export default function Onboarding() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { state, loading, update } = useFinance();
  const [step, setStep] = useState(0);
  const [income, setIncome] = useState("");
  const [goalId, setGoalId] = useState("reserva");
  const [skipDebt, setSkipDebt] = useState(false);
  const [debt, setDebt] = useState({ name: "", balance: "", rate: "", minPayment: "" });
  const [busy, setBusy] = useState(false);

  const profile = state?.profile || {};
  const needsOnboarding = !profile.onboardingCompleted;

  const incomeValue = useMemo(() => parseNum(income), [income]);
  const preview = useMemo(
    () => ({
      n: incomeValue * 0.5,
      d: incomeValue * 0.3,
      i: incomeValue * 0.2,
    }),
    [incomeValue]
  );

  if (loading) {
    return (
      <div className="grain min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--gold-bright)" }} />
      </div>
    );
  }

  if (!needsOnboarding) {
    return <Navigate to="/app" replace />;
  }

  const finish = async () => {
    if (incomeValue <= 0) {
      setStep(0);
      return;
    }
    setBusy(true);
    try {
      const nextBudget = distributePlanned(state.budget, incomeValue);
      const nextGoals =
        state.goals.length > 0
          ? state.goals
          : [
              {
                id: `g${Date.now().toString(16)}`,
                ...goalSeed(goalId, incomeValue),
              },
            ];
      const nextDebts = [...state.debts];
      if (!skipDebt && debt.name.trim() && parseNum(debt.balance) > 0) {
        nextDebts.push({
          id: `dv${Date.now().toString(16)}`,
          name: debt.name.trim(),
          balance: parseNum(debt.balance),
          rate: parseNum(debt.rate),
          minPayment: parseNum(debt.minPayment),
        });
      }
      const addedGoalOrDebt =
        nextGoals.length > (state.goals || []).length ||
        nextDebts.length > (state.debts || []).length ||
        !!goalId;
      update({
        profile: {
          ...profile,
          name: (user && user.name) || profile.name,
          monthlyIncome: incomeValue,
          onboardingCompleted: true,
          primaryGoal: goalId,
          firstWeekChecklist: {
            ...(profile.firstWeekChecklist || {}),
            income: true,
            goalDebt: addedGoalOrDebt,
          },
        },
        budget: nextBudget,
        goals: nextGoals,
        debts: nextDebts,
        fire: {
          ...state.fire,
          monthlyExpenses: Math.round(incomeValue * 0.7),
          monthlyInvestment: Math.round(incomeValue * 0.2),
        },
      });
      nav("/app", { replace: true });
    } finally {
      setBusy(false);
    }
  };

  const canNextIncome = incomeValue > 0;
  const canNextGoal = !!goalId;

  return (
    <div className="grain min-h-screen flex items-center justify-center px-6 py-12" data-testid="onboarding-page">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div
            className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))",
              boxShadow: "0 8px 30px rgba(201,169,97,0.35)",
            }}
          >
            <Gem className="w-6 h-6" style={{ color: "var(--ink-void)" }} />
          </div>
          <div className="eyebrow mb-2">Configuração inicial · {step + 1}/3</div>
          <h1 className="font-display text-[32px]" style={{ letterSpacing: "-0.02em" }}>
            Vamos personalizar seu <span className="text-shimmer">Wealth OS</span>
          </h1>
          <p className="mt-2 text-[14px]" style={{ color: "var(--text-secondary)" }}>
            Leva menos de 1 minuto. Sem isso, o dashboard não tem o que mostrar.
          </p>
        </div>

        <div className="flex gap-2 mb-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{
                background: i <= step ? "var(--gold-bright)" : "rgba(255,255,255,0.08)",
              }}
            />
          ))}
        </div>

        <div className="card-premium p-6 space-y-5">
          {step === 0 && (
            <>
              <div className="flex items-center gap-3">
                <Wallet className="w-5 h-5" style={{ color: "var(--gold-bright)" }} />
                <div>
                  <div className="font-semibold text-[16px]">Sua renda líquida mensal</div>
                  <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    O valor que realmente entra na conta todo mês
                  </div>
                </div>
              </div>
              <input
                data-testid="onboarding-income"
                className="input-premium font-mono-num text-[22px] font-display"
                inputMode="decimal"
                placeholder="Ex: 6500"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                autoFocus
              />
              {incomeValue > 0 && (
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    ["Necessidades", preview.n, "50%"],
                    ["Desejos", preview.d, "30%"],
                    ["Investir", preview.i, "20%"],
                  ].map(([label, value, pct]) => (
                    <div
                      key={label}
                      className="p-3 rounded-lg"
                      style={{ background: "rgba(11,10,15,0.5)", border: "1px solid var(--ink-line)" }}
                    >
                      <div className="text-[10px] uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                        {label}
                      </div>
                      <div className="font-mono-num text-[14px] mt-1" style={{ color: "var(--gold-bright)" }}>
                        {brl(value)}
                      </div>
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {pct}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5" style={{ color: "var(--gold-bright)" }} />
                <div>
                  <div className="font-semibold text-[16px]">Objetivo principal agora</div>
                  <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    Usamos isso para priorizar alertas e metas
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    data-testid={`onboarding-goal-${g.id}`}
                    onClick={() => setGoalId(g.id)}
                    className="w-full text-left p-4 rounded-xl transition-colors"
                    style={{
                      background:
                        goalId === g.id ? "rgba(201,169,97,0.12)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${goalId === g.id ? "rgba(201,169,97,0.45)" : "var(--ink-line)"}`,
                    }}
                  >
                    <div className="font-semibold text-[14px]">{g.title}</div>
                    <div className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {g.hint}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex items-center gap-3">
                <TrendingDown className="w-5 h-5" style={{ color: "var(--gold-bright)" }} />
                <div>
                  <div className="font-semibold text-[16px]">Tem alguma dívida agora?</div>
                  <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    Opcional — você pode cadastrar depois
                  </div>
                </div>
              </div>

              {!skipDebt ? (
                <div className="space-y-3">
                  <input
                    data-testid="onboarding-debt-name"
                    className="input-premium"
                    placeholder="Ex: Cartão Nubank"
                    value={debt.name}
                    onChange={(e) => setDebt((d) => ({ ...d, name: e.target.value }))}
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      data-testid="onboarding-debt-balance"
                      className="input-premium"
                      placeholder="Saldo"
                      inputMode="decimal"
                      value={debt.balance}
                      onChange={(e) => setDebt((d) => ({ ...d, balance: e.target.value }))}
                    />
                    <input
                      data-testid="onboarding-debt-rate"
                      className="input-premium"
                      placeholder="Taxa % a.m."
                      inputMode="decimal"
                      value={debt.rate}
                      onChange={(e) => setDebt((d) => ({ ...d, rate: e.target.value }))}
                    />
                    <input
                      data-testid="onboarding-debt-min"
                      className="input-premium"
                      placeholder="Mínimo"
                      inputMode="decimal"
                      value={debt.minPayment}
                      onChange={(e) => setDebt((d) => ({ ...d, minPayment: e.target.value }))}
                    />
                  </div>
                  <button
                    type="button"
                    className="text-[12px] underline"
                    style={{ color: "var(--text-muted)" }}
                    onClick={() => setSkipDebt(true)}
                    data-testid="onboarding-skip-debt"
                  >
                    Pular — não tenho dívidas agora
                  </button>
                </div>
              ) : (
                <div
                  className="p-4 rounded-xl text-[13px]"
                  style={{ background: "rgba(127,176,105,0.08)", border: "1px solid rgba(127,176,105,0.25)", color: "var(--success)" }}
                >
                  Ok — vamos focar em reserva e investimentos. Você pode adicionar dívidas depois em Controle de Dívidas.
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {step > 0 ? (
              <button
                type="button"
                className="btn-ghost"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => setStep((s) => s - 1)}
                data-testid="onboarding-back"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            ) : (
              <span />
            )}

            {step < 2 ? (
              <button
                type="button"
                className="btn-gold"
                style={{ display: "flex", alignItems: "center", gap: 6, opacity: (step === 0 ? canNextIncome : canNextGoal) ? 1 : 0.45 }}
                disabled={step === 0 ? !canNextIncome : !canNextGoal}
                onClick={() => setStep((s) => s + 1)}
                data-testid="onboarding-next"
              >
                Continuar <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                className="btn-gold"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
                disabled={busy || incomeValue <= 0}
                onClick={finish}
                data-testid="onboarding-finish"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Salvando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" /> Ir para o dashboard
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
