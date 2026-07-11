import React, { createContext, useContext, useEffect, useState } from "react";

const FinanceContext = createContext();

const STORAGE_KEY = "finpremium_v1";

const defaultState = {
  profile: {
    name: "Investidor",
    monthlyIncome: 6500,
  },
  // Categorized under 50/30/20 rule
  budget: {
    necessidades: [
      { id: "n1", name: "Aluguel", planned: 1600, actual: 1600 },
      { id: "n2", name: "Supermercado", planned: 900, actual: 1050 },
      { id: "n3", name: "Contas (luz/água/net)", planned: 450, actual: 420 },
      { id: "n4", name: "Transporte", planned: 300, actual: 340 },
      { id: "n5", name: "Plano de saúde", planned: 380, actual: 380 },
    ],
    desejos: [
      { id: "d1", name: "Restaurantes", planned: 500, actual: 720 },
      { id: "d2", name: "Streaming & Assinaturas", planned: 120, actual: 145 },
      { id: "d3", name: "Compras / Lazer", planned: 400, actual: 380 },
    ],
    investimentos: [
      { id: "i1", name: "Reserva de emergência", planned: 800, actual: 800 },
      { id: "i2", name: "Renda variável", planned: 600, actual: 600 },
      { id: "i3", name: "Previdência / LT", planned: 450, actual: 450 },
    ],
  },
  debts: [
    { id: "dv1", name: "Cartão de crédito Nubank", balance: 4800, rate: 12.5, minPayment: 480 },
    { id: "dv2", name: "Empréstimo consignado", balance: 12000, rate: 2.9, minPayment: 620 },
    { id: "dv3", name: "Financiamento auto", balance: 22000, rate: 1.8, minPayment: 780 },
  ],
  goals: [
    { id: "g1", name: "Reserva de Emergência (6 meses)", target: 39000, current: 12500, deadline: "2026-12-31" },
    { id: "g2", name: "Viagem Europa 2027", target: 28000, current: 6300, deadline: "2027-06-01" },
    { id: "g3", name: "Entrada apartamento", target: 90000, current: 18500, deadline: "2028-01-01" },
  ],
  fire: {
    monthlyExpenses: 4200,
    monthlyInvestment: 1850,
    annualReturn: 8,      // %
    safeWithdrawal: 4,    // %
    currentInvested: 34000,
  },
};

export function FinanceProvider({ children }) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...defaultState, ...JSON.parse(raw) };
    } catch (e) {
      console.warn("Failed loading state", e);
    }
    return defaultState;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed saving state", e);
    }
  }, [state]);

  const update = (patch) => setState((s) => ({ ...s, ...patch }));

  const updateProfile = (patch) =>
    setState((s) => ({ ...s, profile: { ...s.profile, ...patch } }));

  const updateBudgetItem = (cat, id, patch) =>
    setState((s) => ({
      ...s,
      budget: {
        ...s.budget,
        [cat]: s.budget[cat].map((it) => (it.id === id ? { ...it, ...patch } : it)),
      },
    }));

  const addBudgetItem = (cat, item) =>
    setState((s) => ({
      ...s,
      budget: {
        ...s.budget,
        [cat]: [...s.budget[cat], { id: `${cat[0]}${Date.now()}`, ...item }],
      },
    }));

  const removeBudgetItem = (cat, id) =>
    setState((s) => ({
      ...s,
      budget: { ...s.budget, [cat]: s.budget[cat].filter((it) => it.id !== id) },
    }));

  const addDebt = (debt) =>
    setState((s) => ({ ...s, debts: [...s.debts, { id: `dv${Date.now()}`, ...debt }] }));

  const updateDebt = (id, patch) =>
    setState((s) => ({
      ...s,
      debts: s.debts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    }));

  const removeDebt = (id) =>
    setState((s) => ({ ...s, debts: s.debts.filter((d) => d.id !== id) }));

  const addGoal = (goal) =>
    setState((s) => ({ ...s, goals: [...s.goals, { id: `g${Date.now()}`, ...goal }] }));

  const updateGoal = (id, patch) =>
    setState((s) => ({
      ...s,
      goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    }));

  const removeGoal = (id) =>
    setState((s) => ({ ...s, goals: s.goals.filter((g) => g.id !== id) }));

  const updateFire = (patch) =>
    setState((s) => ({ ...s, fire: { ...s.fire, ...patch } }));

  const resetAll = () => setState(defaultState);

  return (
    <FinanceContext.Provider
      value={{
        state,
        update,
        updateProfile,
        updateBudgetItem,
        addBudgetItem,
        removeBudgetItem,
        addDebt,
        updateDebt,
        removeDebt,
        addGoal,
        updateGoal,
        removeGoal,
        updateFire,
        resetAll,
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
}

export const useFinance = () => {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance must be used inside FinanceProvider");
  return ctx;
};
