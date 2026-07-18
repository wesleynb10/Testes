import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@/context/AuthContext";

const FinanceContext = createContext();
const LEGACY_STORAGE_KEY = "finpremium_v1";

const emptyState = {
  profile: {
    name: "Investidor",
    monthlyIncome: 0,
    onboardingCompleted: false,
    primaryGoal: "",
    firstWeekChecklist: {
      income: false,
      firstTx: false,
      budget: false,
      goalDebt: false,
      whatsapp: false,
      dismissed: false,
      completedAt: "",
    },
  },
  budget: {
    necessidades: [],
    desejos: [],
    investimentos: [],
  },
  debts: [],
  goals: [],
  fire: {
    monthlyExpenses: 0,
    monthlyInvestment: 0,
    annualReturn: 6,
    safeWithdrawal: 4,
    currentInvested: 0,
  },
};

const CHECKLIST_KEYS = ["income", "firstTx", "budget", "goalDebt", "whatsapp"];

function normalizeChecklist(raw) {
  const base = {
    income: false,
    firstTx: false,
    budget: false,
    goalDebt: false,
    whatsapp: false,
    dismissed: false,
    completedAt: "",
  };
  const source = raw && typeof raw === "object" ? raw : {};
  CHECKLIST_KEYS.forEach((key) => {
    base[key] = !!source[key];
  });
  base.dismissed = !!source.dismissed;
  base.completedAt = source.completedAt || "";
  return base;
}

function cloneEmptyState() {
  return JSON.parse(JSON.stringify(emptyState));
}

function createId(prefix) {
  const random =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}${random}`;
}

function readLegacyState() {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function FinanceProvider({ children }) {
  const { user, api } = useAuth();
  const [state, setState] = useState(cloneEmptyState);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [summary, setSummary] = useState({ months: [] });
  const [legacyState, setLegacyState] = useState(readLegacyState);

  const loadedUserRef = useRef(null);
  const skipNextSaveRef = useRef(true);
  const saveTimerRef = useRef(null);

  // O dono também pode usar a visão de cliente para testar o produto completo.
  // O backend continua isolando todos os dados pelo id da conta autenticada.
  const authenticatedUser = user && typeof user === "object" ? user : null;
  const authenticatedUserId = authenticatedUser?.id || null;

  const refreshFinance = useCallback(async () => {
    if (!authenticatedUserId) return null;
    setLoading(true);
    setError(null);
    try {
      const [stateResponse, summaryResponse] = await Promise.all([
        api.get("/financial-state"),
        api.get("/dashboard/summary"),
      ]);
      const data = stateResponse.data;
      skipNextSaveRef.current = true;
      const nextState = data.state || cloneEmptyState();
      if (nextState.profile) {
        nextState.profile = {
          ...nextState.profile,
          firstWeekChecklist: normalizeChecklist(nextState.profile.firstWeekChecklist),
        };
      }
      setState(nextState);
      setSummary(summaryResponse.data || { months: [] });
      loadedUserRef.current = authenticatedUserId;
      return data.state;
    } catch (err) {
      setError(err.response?.data?.detail || "Não foi possível carregar seus dados financeiros.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [api, authenticatedUserId]);

  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    if (!authenticatedUserId) {
      loadedUserRef.current = null;
      skipNextSaveRef.current = true;
      setState(cloneEmptyState());
      setSummary({ months: [] });
      setLoading(false);
      return;
    }

    refreshFinance().catch(() => {});
  }, [authenticatedUserId, refreshFinance]);

  useEffect(() => {
    if (!authenticatedUserId || loadedUserRef.current !== authenticatedUserId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      setSaving(true);
      setError(null);
      try {
        const { data } = await api.put("/financial-state", { state });
        setLastSavedAt(data.saved_at || new Date().toISOString());
      } catch (err) {
        setError(err.response?.data?.detail || "Não foi possível salvar as alterações.");
      } finally {
        setSaving(false);
      }
    }, 650);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state, authenticatedUserId, api]);

  const update = (patch) => setState((current) => ({ ...current, ...patch }));

  const updateProfile = (patch) =>
    setState((current) => ({
      ...current,
      profile: { ...current.profile, ...patch },
    }));

  const completeChecklistItem = useCallback((key) => {
    if (!CHECKLIST_KEYS.includes(key)) return;
    setState((current) => {
      const checklist = normalizeChecklist(current.profile?.firstWeekChecklist);
      if (checklist[key]) return current;
      const next = { ...checklist, [key]: true };
      const allDone = CHECKLIST_KEYS.every((k) => next[k]);
      if (allDone && !next.completedAt) {
        next.completedAt = new Date().toISOString();
      }
      return {
        ...current,
        profile: { ...current.profile, firstWeekChecklist: next },
      };
    });
  }, []);

  const dismissChecklist = useCallback(() => {
    setState((current) => {
      const checklist = normalizeChecklist(current.profile?.firstWeekChecklist);
      return {
        ...current,
        profile: {
          ...current.profile,
          firstWeekChecklist: { ...checklist, dismissed: true },
        },
      };
    });
  }, []);

  const syncChecklistFromFacts = useCallback((facts = {}) => {
    setState((current) => {
      const checklist = normalizeChecklist(current.profile?.firstWeekChecklist);
      const next = { ...checklist };
      if (facts.income || (current.profile?.monthlyIncome || 0) > 0 || current.profile?.onboardingCompleted) {
        next.income = true;
      }
      if (facts.firstTx) next.firstTx = true;
      if (facts.budget) next.budget = true;
      if (facts.goalDebt || (current.goals || []).length > 0 || (current.debts || []).length > 0) {
        next.goalDebt = true;
      }
      if (facts.whatsapp) next.whatsapp = true;
      const allDone = CHECKLIST_KEYS.every((k) => next[k]);
      if (allDone && !next.completedAt) next.completedAt = new Date().toISOString();
      const changed = CHECKLIST_KEYS.some((k) => next[k] !== checklist[k]) || next.completedAt !== checklist.completedAt;
      if (!changed) return current;
      return {
        ...current,
        profile: { ...current.profile, firstWeekChecklist: next },
      };
    });
  }, []);

  const updateBudgetItem = (category, id, patch) =>
    setState((current) => ({
      ...current,
      budget: {
        ...current.budget,
        [category]: current.budget[category].map((item) =>
          item.id === id ? { ...item, ...patch } : item
        ),
      },
    }));

  const addBudgetItem = (category, item) =>
    setState((current) => ({
      ...current,
      budget: {
        ...current.budget,
        [category]: [
          ...current.budget[category],
          { id: createId(category[0]), actual: 0, ...item },
        ],
      },
    }));

  const removeBudgetItem = (category, id) =>
    setState((current) => ({
      ...current,
      budget: {
        ...current.budget,
        [category]: current.budget[category].filter((item) => item.id !== id),
      },
    }));

  const addDebt = (debt) =>
    setState((current) => {
      const checklist = normalizeChecklist(current.profile?.firstWeekChecklist);
      return {
        ...current,
        debts: [...current.debts, { id: createId("dv"), ...debt }],
        profile: {
          ...current.profile,
          firstWeekChecklist: { ...checklist, goalDebt: true },
        },
      };
    });

  const updateDebt = (id, patch) =>
    setState((current) => ({
      ...current,
      debts: current.debts.map((debt) =>
        debt.id === id ? { ...debt, ...patch } : debt
      ),
    }));

  const removeDebt = (id) =>
    setState((current) => ({
      ...current,
      debts: current.debts.filter((debt) => debt.id !== id),
    }));

  const addGoal = (goal) =>
    setState((current) => {
      const checklist = normalizeChecklist(current.profile?.firstWeekChecklist);
      return {
        ...current,
        goals: [...current.goals, { id: createId("g"), ...goal }],
        profile: {
          ...current.profile,
          firstWeekChecklist: { ...checklist, goalDebt: true },
        },
      };
    });

  const updateGoal = (id, patch) =>
    setState((current) => ({
      ...current,
      goals: current.goals.map((goal) =>
        goal.id === id ? { ...goal, ...patch } : goal
      ),
    }));

  const removeGoal = (id) =>
    setState((current) => ({
      ...current,
      goals: current.goals.filter((goal) => goal.id !== id),
    }));

  const updateFire = (patch) =>
    setState((current) => ({
      ...current,
      fire: { ...current.fire, ...patch },
    }));

  const importTransactions = useCallback(
    async (transactions) => {
      const { data } = await api.post("/transactions/bulk", { transactions });
      await refreshFinance();
      return data;
    },
    [api, refreshFinance]
  );

  const importLegacyData = useCallback(async () => {
    if (!legacyState) return;
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.put("/financial-state", { state: legacyState });
      skipNextSaveRef.current = true;
      setState(data.state || legacyState);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      setLegacyState(null);
      setLastSavedAt(data.saved_at || new Date().toISOString());
    } catch (err) {
      setError(err.response?.data?.detail || "Não foi possível importar os dados locais.");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [api, legacyState]);

  const dismissLegacyData = useCallback(() => {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    setLegacyState(null);
  }, []);

  const resetAll = useCallback(() => {
    const next = cloneEmptyState();
    next.profile.name = authenticatedUser?.name || "Investidor";
    setState(next);
  }, [authenticatedUser?.name]);

  const value = useMemo(
    () => ({
      state,
      summary,
      loading,
      saving,
      error,
      lastSavedAt,
      hasLegacyData: !!legacyState,
      update,
      updateProfile,
      completeChecklistItem,
      dismissChecklist,
      syncChecklistFromFacts,
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
      refreshFinance,
      importTransactions,
      importLegacyData,
      dismissLegacyData,
      resetAll,
    }),
    [
      state,
      summary,
      loading,
      saving,
      error,
      lastSavedAt,
      legacyState,
      completeChecklistItem,
      dismissChecklist,
      syncChecklistFromFacts,
      refreshFinance,
      importTransactions,
      importLegacyData,
      dismissLegacyData,
      resetAll,
    ]
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export const useFinance = () => {
  const context = useContext(FinanceContext);
  if (!context) throw new Error("useFinance must be used inside FinanceProvider");
  return context;
};
