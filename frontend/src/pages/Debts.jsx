import React, { useEffect, useMemo, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { useFinance } from "@/context/FinanceContext";
import { brl, parseNum } from "@/lib/format";
import {
  Plus, Trash2, Snowflake, Zap, TrendingDown, Check, Loader2,
  ListOrdered, ChevronUp, ChevronDown, CalendarRange, Wallet, GripVertical,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const EXTRA_PRESETS = [0, 200, 500, 1000, 2000];

const STRATEGIES = [
  {
    id: "snowball",
    label: "Bola de Neve",
    icon: Snowflake,
    hint: "Menor saldo primeiro — vitórias rápidas.",
  },
  {
    id: "avalanche",
    label: "Avalanche",
    icon: Zap,
    hint: "Maior juros primeiro — economiza mais no longo prazo.",
  },
  {
    id: "custom",
    label: "Personalizada",
    icon: ListOrdered,
    hint: "Você escolhe o critério de prioridade.",
  },
];

const CUSTOM_PRIORITIES = [
  {
    id: "term",
    label: "Maior prazo",
    icon: CalendarRange,
    description: "Ataca primeiro o financiamento que mais demora a acabar.",
  },
  {
    id: "cashflow",
    label: "Maior parcela",
    icon: Wallet,
    description: "Ataca primeiro a maior parcela — maior alívio na renda ao zerar.",
  },
  {
    id: "manual",
    label: "Ordem manual",
    icon: GripVertical,
    description: "Arraste as dívidas para definir a fila de ataque.",
  },
];

function ManualDebtRow({ debt, index, total, onMoveUp, onMoveDown }) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={debt.id}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3 p-3 rounded-lg list-none"
      style={{
        background: "rgba(11,10,15,0.5)",
        border: "1px solid var(--ink-line)",
        touchAction: "none",
      }}
      whileDrag={{
        scale: 1.02,
        boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
        border: "1px solid rgba(201,169,97,0.45)",
        zIndex: 20,
      }}
      data-testid={`manual-debt-row-${debt.id}`}
    >
      <button
        type="button"
        className="btn-ghost cursor-grab active:cursor-grabbing touch-none"
        style={{ padding: "6px", minHeight: 0, color: "var(--text-muted)" }}
        aria-label={`Arrastar ${debt.name}`}
        onPointerDown={(e) => {
          e.preventDefault();
          controls.start(e);
        }}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="font-mono-num text-[13px] w-5" style={{ color: "var(--text-muted)" }}>
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold truncate">{debt.name}</div>
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {brl(debt.balance)} · {brl(debt.minPayment)}/mês
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "4px 6px", minHeight: 0 }}
          disabled={index === 0}
          onClick={onMoveUp}
          aria-label={`Subir ${debt.name}`}
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          className="btn-ghost"
          style={{ padding: "4px 6px", minHeight: 0 }}
          disabled={index === total - 1}
          onClick={onMoveDown}
          aria-label={`Descer ${debt.name}`}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </Reorder.Item>
  );
}

function formatHorizon(months) {
  if (!Number.isFinite(months) || months <= 0) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y <= 0) return `${months} meses`;
  if (m === 0) return `${y}a`;
  return `${y}a ${m}m`;
}

function payoffDateLabel(monthsFromNow) {
  const months = Math.round(Number(monthsFromNow) || 0);
  if (months <= 0) return "";
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" }).format(d);
}

/** Taxa mensal efetiva (%) usada na simulação. */
function monthlyRatePct(debt) {
  const rate = Math.max(0, Number(debt?.rate) || 0);
  return debt?.ratePeriod === "aa" ? rate / 12 : rate;
}

/** Parcela Price (Tabela Price) para zerar em `termMonths`. */
function priceInstallment(balance, monthlyRatePercent, termMonths) {
  const P = Math.max(0, Number(balance) || 0);
  const n = Math.max(0, Math.round(Number(termMonths) || 0));
  const r = Math.max(0, Number(monthlyRatePercent) || 0) / 100;
  if (P <= 0 || n <= 0) return 0;
  if (r <= 0) return P / n;
  const factor = (1 + r) ** n;
  return (P * r * factor) / (factor - 1);
}

function compareByPriority(priority) {
  return {
    snowball: (a, b) => a.balance - b.balance || monthlyRatePct(b) - monthlyRatePct(a),
    avalanche: (a, b) => monthlyRatePct(b) - monthlyRatePct(a) || a.balance - b.balance,
    term: (a, b) =>
      (Number(b.termMonths) || 0) - (Number(a.termMonths) || 0) ||
      b.balance - a.balance,
    cashflow: (a, b) =>
      b.minPayment - a.minPayment || monthlyRatePct(b) - monthlyRatePct(a) || a.balance - b.balance,
  }[priority];
}

function orderActive(active, strategy, customPriority = "term", customOrder = []) {
  if (strategy === "custom" && customPriority === "manual") {
    const rank = new Map((customOrder || []).map((id, i) => [id, i]));
    return [...active].sort(
      (a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999)
    );
  }
  const key = strategy === "custom" ? customPriority : strategy;
  const compare = compareByPriority(key);
  return [...active].sort(compare || ((a, b) => a.balance - b.balance));
}

/**
 * Simulate debt payoff with a FIXED attack order (set at start).
 * - Every active debt receives its installment.
 * - Extra + parcelas liberadas (e sobras de quitação parcial) vão só ao nº 1 da fila.
 */
function simulate(
  debts,
  extraMonthly,
  strategy = "snowball",
  customPriority = "term",
  customOrder = []
) {
  const clones = debts.map((d) => ({
    ...d,
    balance: Math.max(0, Number(d.balance) || 0),
    rate: monthlyRatePct(d), // sempre % a.m. efetivo na simulação
    minPayment: Math.max(0, Number(d.minPayment) || 0),
    termMonths: Math.max(0, Number(d.termMonths) || 0),
    interestPaid: 0,
  }));

  const attackOrder = orderActive(
    clones.filter((d) => d.balance > 0),
    strategy,
    customPriority,
    customOrder
  ).map((d) => d.id);
  const byId = Object.fromEntries(clones.map((d) => [d.id, d]));
  const initialFocusId = attackOrder[0] || null;
  const startedIds = new Set(
    debts.filter((d) => (Number(d.balance) || 0) > 0).map((d) => d.id)
  );

  const payoffById = {};
  let month = 0;
  let totalInterest = 0;
  const history = [];
  const MAX = 600;

  while (clones.some((d) => d.balance > 0.01) && month < MAX) {
    month++;

    clones.forEach((d) => {
      if (d.balance > 0.01) {
        const interest = d.balance * (d.rate / 100);
        d.balance += interest;
        d.interestPaid += interest;
        totalInterest += interest;
      }
    });

    // Extra + parcelas de dívidas já quitadas + sobra de quitação parcial neste mês.
    let rollover = Math.max(0, Number(extraMonthly) || 0);

    attackOrder.forEach((id) => {
      const d = byId[id];
      if (!d || !startedIds.has(id)) return;
      if (d.balance <= 0.01 && payoffById[id]) {
        rollover += d.minPayment;
      }
    });

    attackOrder.forEach((id) => {
      const d = byId[id];
      if (!d || d.balance <= 0.01) return;
      const pay = Math.min(d.balance, d.minPayment);
      d.balance -= pay;
      if (pay < d.minPayment) {
        rollover += d.minPayment - pay;
      }
    });

    const focus = attackOrder.map((id) => byId[id]).find((d) => d && d.balance > 0.01);
    if (focus && rollover > 0) {
      focus.balance -= Math.min(focus.balance, rollover);
    }

    clones.forEach((d) => {
      if (d.balance <= 0.01 && !payoffById[d.id] && startedIds.has(d.id)) {
        payoffById[d.id] = month;
        d.balance = 0;
      }
    });

    const total = clones.reduce((s, d) => s + Math.max(0, d.balance), 0);
    history.push({ mes: month, saldo: total });
    if (total <= 0.01) break;
  }

  const interestById = {};
  clones.forEach((d) => {
    interestById[d.id] = d.interestPaid;
  });

  return {
    months: month,
    totalInterest,
    history,
    cleared: clones.every((d) => d.balance <= 0.01),
    payoffById,
    interestById,
    initialFocusId,
    attackOrder,
  };
}

export default function Debts() {
  const { state, updateDebt, removeDebt, saveNow, saving } = useFinance();
  const debts = state.debts;

  const [strategy, setStrategy] = useState("snowball");
  const [customPriority, setCustomPriority] = useState("term");
  const [customOrder, setCustomOrder] = useState([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [draftPriority, setDraftPriority] = useState("term");
  const [draftOrder, setDraftOrder] = useState([]);
  const [extra, setExtra] = useState(500);
  const [newDebt, setNewDebt] = useState({
    name: "", balance: "", rate: "", ratePeriod: "am", minPayment: "", termMonths: "",
  });
  const [savedFlash, setSavedFlash] = useState(null); // debt id | "new"
  const [savingId, setSavingId] = useState(null);

  // Keep custom order in sync when debts are added/removed.
  useEffect(() => {
    const ids = debts.map((d) => d.id);
    setCustomOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !kept.includes(id));
      return [...kept, ...missing];
    });
  }, [debts]);

  const flashSaved = (id) => {
    setSavedFlash(id);
    window.setTimeout(() => {
      setSavedFlash((current) => (current === id ? null : current));
    }, 1800);
  };

  const handleSaveDebt = async (id) => {
    setSavingId(id);
    try {
      await saveNow();
      flashSaved(id);
    } catch {
      // error already in FinanceContext
    } finally {
      setSavingId(null);
    }
  };

  const handleAdd = async () => {
    if (!newDebt.name.trim()) return;
    if (!(parseNum(newDebt.balance) > 0)) return;
    setSavingId("new");
    try {
      const entry = {
        id: `dv${Date.now().toString(16)}${Math.random().toString(16).slice(2, 6)}`,
        name: newDebt.name.trim(),
        balance: parseNum(newDebt.balance),
        rate: parseNum(newDebt.rate),
        ratePeriod: newDebt.ratePeriod === "aa" ? "aa" : "am",
        minPayment: parseNum(newDebt.minPayment),
        termMonths: Math.max(0, Math.min(600, Math.round(parseNum(newDebt.termMonths)))),
      };
      const nextState = {
        ...state,
        debts: [...debts, entry],
        profile: {
          ...state.profile,
          firstWeekChecklist: {
            ...(state.profile?.firstWeekChecklist || {}),
            goalDebt: true,
          },
        },
      };
      setNewDebt({ name: "", balance: "", rate: "", ratePeriod: "am", minPayment: "", termMonths: "" });
      await saveNow(nextState);
      flashSaved("new");
    } catch {
      // error already in FinanceContext
    } finally {
      setSavingId(null);
    }
  };

  const totalBalance = debts.reduce((s, d) => s + d.balance, 0);
  const totalMin = debts.reduce((s, d) => s + d.minPayment, 0);
  const weightedRate = totalBalance > 0
    ? debts.reduce((s, d) => s + monthlyRatePct(d) * d.balance, 0) / totalBalance
    : 0;
  const longestContract = debts.reduce((max, d) => Math.max(max, Number(d.termMonths) || 0), 0);

  const simulation = useMemo(
    () => simulate(debts, extra, strategy, customPriority, customOrder),
    [debts, extra, strategy, customPriority, customOrder]
  );
  const baseline = useMemo(
    () => simulate(debts, 0, strategy, customPriority, customOrder),
    [debts, strategy, customPriority, customOrder]
  );
  const baselineConverged = baseline.cleared;
  const savedMonths = baselineConverged ? Math.max(0, baseline.months - simulation.months) : null;
  const savedInterest = baselineConverged ? Math.max(0, baseline.totalInterest - simulation.totalInterest) : null;
  const beatsContract =
    longestContract > 0 && simulation.cleared && simulation.months < longestContract
      ? longestContract - simulation.months
      : null;

  const priority = useMemo(
    () => orderActive(debts.filter((d) => d.balance > 0), strategy, customPriority, customOrder),
    [debts, strategy, customPriority, customOrder]
  );
  const strategyMeta = STRATEGIES.find((s) => s.id === strategy) || STRATEGIES[0];
  const customPriorityMeta = CUSTOM_PRIORITIES.find((p) => p.id === customPriority);

  const strategyHint =
    strategy === "custom" && customPriorityMeta
      ? `${customPriorityMeta.label}: ${customPriorityMeta.description}`
      : strategyMeta.hint;

  const buildOrderFrom = (sortKey, order = customOrder) => {
    const isAutoCustom = sortKey === "term" || sortKey === "cashflow";
    const ordered = orderActive(
      debts.filter((d) => d.balance > 0),
      isAutoCustom || sortKey === "manual" ? "custom" : sortKey,
      isAutoCustom ? sortKey : sortKey === "manual" ? "manual" : "term",
      order
    ).map((d) => d.id);
    const rest = debts.map((d) => d.id).filter((id) => !ordered.includes(id));
    return [...ordered, ...rest];
  };

  const openCustomDialog = () => {
    setDraftPriority(strategy === "custom" ? customPriority : "term");
    setDraftOrder(
      strategy === "custom" && customPriority === "manual"
        ? [...customOrder]
        : buildOrderFrom(strategy === "custom" ? customPriority : strategy)
    );
    setCustomOpen(true);
  };

  const applyCustomStrategy = () => {
    setCustomPriority(draftPriority);
    if (draftPriority === "manual") {
      setCustomOrder(draftOrder);
    } else {
      setCustomOrder(buildOrderFrom(draftPriority, draftOrder));
    }
    setStrategy("custom");
    setCustomOpen(false);
  };

  const moveDraft = (id, dir) => {
    setDraftOrder((prev) => {
      const activeIds = new Set(
        debts.filter((d) => (Number(d.balance) || 0) > 0).map((d) => d.id)
      );
      const activeOrdered = [
        ...prev.filter((x) => activeIds.has(x)),
        ...[...activeIds].filter((x) => !prev.includes(x)),
      ];
      const rest = prev.filter((x) => !activeIds.has(x));
      const idx = activeOrdered.indexOf(id);
      if (idx < 0) return prev;
      const next = idx + dir;
      if (next < 0 || next >= activeOrdered.length) return prev;
      const copy = [...activeOrdered];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return [...copy, ...rest];
    });
  };

  const reorderDraft = (newActiveIds) => {
    setDraftOrder((prev) => {
      const rest = prev.filter((id) => !newActiveIds.includes(id));
      return [...newActiveIds, ...rest];
    });
  };

  const draftPreview = useMemo(() => {
    const active = debts.filter((d) => d.balance > 0);
    if (draftPriority === "manual") {
      const rank = new Map(draftOrder.map((id, i) => [id, i]));
      return [...active].sort((a, b) => (rank.get(a.id) ?? 9999) - (rank.get(b.id) ?? 9999));
    }
    return orderActive(active, "custom", draftPriority, draftOrder);
  }, [debts, draftPriority, draftOrder]);

  const draftIds = useMemo(() => draftPreview.map((d) => d.id), [draftPreview]);

  const focusDebt = priority[0] || null;
  const focusPayoffMonths = focusDebt ? simulation.payoffById?.[focusDebt.id] : null;
  const focusBaselineMonths = focusDebt ? baseline.payoffById?.[focusDebt.id] : null;
  const focusInterest = focusDebt ? simulation.interestById?.[focusDebt.id] : null;
  const focusBaselineInterest = focusDebt ? baseline.interestById?.[focusDebt.id] : null;
  const focusSavedMonths =
    focusPayoffMonths && focusBaselineMonths
      ? Math.max(0, focusBaselineMonths - focusPayoffMonths)
      : null;
  const focusSavedInterest =
    focusInterest != null && focusBaselineInterest != null && baseline.payoffById?.[focusDebt?.id]
      ? Math.max(0, focusBaselineInterest - focusInterest)
      : null;
  const focusContractMonths = focusDebt ? Math.max(0, Number(focusDebt.termMonths) || 0) : 0;
  const focusBeyondContract =
    focusContractMonths > 0 && focusBaselineMonths
      ? focusBaselineMonths - focusContractMonths
      : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden" data-testid="debts-page">
      <header>
        <div className="eyebrow mb-3">Controle de Dívidas · Simulador de Quitação</div>
        <h1 className="h-display">De devedor a <span className="text-shimmer">livre.</span></h1>
        <p className="mt-3 text-[15px] max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          Cartão em atraso, empréstimo ou financiamento: se tem juros, parcela e prazo, é financiamento.
          Escolha Bola de Neve, Avalanche ou Personalizada e veja quando você fica livre — e se o aporte extra bate o prazo.
        </p>
      </header>

      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5">
        <div className="card-premium p-5" data-testid="kpi-total-dividas">
          <div className="kpi-label mb-2">Saldo devedor total</div>
          <div className="kpi-value danger">{brl(totalBalance)}</div>
        </div>
        <div className="card-premium p-5">
          <div className="kpi-label mb-2">Parcela mensal total</div>
          <div className="kpi-value">{brl(totalMin)}</div>
        </div>
        <div className="card-premium p-5">
          <div className="kpi-label mb-2">Juros médio ponderado</div>
          <div className="kpi-value">{weightedRate.toFixed(2)}%<span className="text-[14px]" style={{ color: "var(--text-muted)" }}> a.m.</span></div>
        </div>
        <div className="card-gold p-5" data-testid="kpi-quitacao">
          <div className="kpi-label mb-2">Todas livres em</div>
          <div className="kpi-value gold">{simulation.months}<span className="text-[14px]" style={{ color: "var(--text-muted)" }}> meses</span></div>
          <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
            ({Math.floor(simulation.months / 12)}a {simulation.months % 12}m)
            {payoffDateLabel(simulation.months) ? ` · ~${payoffDateLabel(simulation.months)}` : ""}
          </div>
          {focusDebt && focusPayoffMonths && (
            <div className="text-[11px] mt-2" style={{ color: "var(--text-secondary)" }} data-testid="kpi-focus-payoff">
              Foco ({focusDebt.name}): {formatHorizon(focusPayoffMonths)}
            </div>
          )}
          {beatsContract != null && (
            <div className="text-[11px] mt-2" style={{ color: "var(--success)" }} data-testid="beats-contract">
              {beatsContract > 0
                ? `${beatsContract} meses antes do maior prazo informado`
                : "No ritmo do maior prazo informado"}
            </div>
          )}
        </div>
      </div>

      {/* Simulator controls */}
      <div className="card-premium p-4 sm:p-6" data-testid="simulator-controls">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-w-0">
          <div className="min-w-0">
            <div className="kpi-label mb-3">Estratégia de quitação</div>
            <div className="flex flex-wrap gap-2" data-testid="strategy-buttons">
              {STRATEGIES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`strategy-${id}`}
                  onClick={() => {
                    if (id === "custom") {
                      openCustomDialog();
                      return;
                    }
                    setStrategy(id);
                  }}
                  className={strategy === id ? "btn-gold" : "btn-ghost"}
                  style={{ display: "flex", gap: 8, alignItems: "center" }}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
            <p className="text-[12px] mt-3" style={{ color: "var(--text-muted)" }}>
              {strategyHint} As outras dívidas só recebem a parcela mensal.
            </p>
            {strategy === "custom" && (
              <button
                type="button"
                className="chip mt-2"
                style={{ cursor: "pointer", border: "none" }}
                data-testid="edit-custom-strategy"
                onClick={openCustomDialog}
              >
                Editar prioridade
              </button>
            )}
          </div>

          <div className="min-w-0">
            <div className="kpi-label mb-3">Aporte extra mensal</div>
            <input
              data-testid="extra-payment-input"
              type="number"
              min={0}
              className="input-premium font-mono-num font-display text-[22px] w-full"
              value={extra}
              onChange={(e) => setExtra(parseNum(e.target.value))}
            />
            <div className="flex flex-wrap gap-2 mt-3" data-testid="extra-presets">
              {EXTRA_PRESETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={`extra-preset-${value}`}
                  onClick={() => setExtra(value)}
                  className={extra === value ? "chip gold" : "chip"}
                  style={{ cursor: "pointer", border: "none" }}
                >
                  {value === 0 ? "Só parcelas" : `+${brl(value)}`}
                </button>
              ))}
            </div>
            <p className="text-[12px] mt-2 leading-relaxed" style={{ color: "var(--text-muted)" }} data-testid="extra-focus-hint">
              {priority[0]
                ? <>Todo o extra vai só para <span style={{ color: "var(--gold-bright)" }} className="font-semibold">{priority[0].name}</span> (foco atual). Nas demais você mantém só a parcela.</>
                : "Cadastre uma dívida para ver onde o extra será aplicado."}
            </p>
          </div>

          <div className="min-w-0">
            <div className="kpi-label mb-3">Impacto do extra (dívida em foco)</div>
            <div className="space-y-2 text-[13px]" data-testid="impact-focus">
              {focusDebt ? (
                <>
                  <div className="text-[12px] mb-1" style={{ color: "var(--gold-bright)" }}>
                    {focusDebt.name}
                  </div>
                  <div className="flex justify-between gap-3 items-baseline">
                    <span style={{ color: "var(--text-secondary)" }}>Com +{brl(extra)}/mês</span>
                    <span className="font-mono-num font-semibold text-right" style={{ color: "var(--gold-bright)" }} data-testid="impact-with-extra">
                      {focusPayoffMonths ? `${formatHorizon(focusPayoffMonths)} (${focusPayoffMonths}m)` : "Não quita"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 items-baseline">
                    <span style={{ color: "var(--text-secondary)" }}>Só a parcela</span>
                    <span className="font-mono-num font-semibold text-right" style={{ color: focusBaselineMonths ? "var(--text-primary)" : "var(--danger)" }} data-testid="impact-baseline">
                      {focusBaselineMonths ? `${formatHorizon(focusBaselineMonths)} (${focusBaselineMonths}m)` : "Não quita"}
                    </span>
                  </div>
                  {extra > 0 && focusSavedMonths != null && (
                    <div className="flex justify-between gap-3 items-baseline">
                      <span style={{ color: "var(--text-secondary)" }}>Antecipa</span>
                      <span className="font-mono-num font-semibold text-right" style={{ color: focusSavedMonths > 0 ? "var(--success)" : "var(--text-muted)" }} data-testid="impact-saved">
                        {focusSavedMonths > 0 ? `${formatHorizon(focusSavedMonths)} (−${focusSavedMonths}m)` : "Sem ganho"}
                      </span>
                    </div>
                  )}
                  {focusContractMonths > 0 && (
                    <div className="flex justify-between gap-3 items-baseline" data-testid="impact-contract">
                      <span style={{ color: "var(--text-secondary)" }}>Prazo informado</span>
                      <span className="font-mono-num text-right" style={{ color: "var(--text-muted)" }}>
                        {focusContractMonths}m
                        {focusBeyondContract != null && focusBeyondContract > 0 && (
                          <span style={{ color: "var(--danger)" }}> · só parcela passa +{focusBeyondContract}m</span>
                        )}
                        {focusBeyondContract != null && focusBeyondContract <= 0 && focusBaselineMonths && (
                          <span style={{ color: "var(--success)" }}> · cabe no prazo</span>
                        )}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 items-baseline">
                    <span style={{ color: "var(--text-secondary)" }}>Juros do foco</span>
                    <span className="font-mono-num text-right" style={{ color: "var(--text-primary)" }}>
                      {focusInterest != null ? brl(focusInterest) : "—"}
                    </span>
                  </div>
                  {extra > 0 && focusSavedInterest != null && focusSavedInterest > 0 && (
                    <div className="flex justify-between gap-3 items-baseline">
                      <span style={{ color: "var(--text-secondary)" }}>Juros evitados</span>
                      <span className="font-mono-num font-semibold text-right" style={{ color: "var(--success)" }}>
                        {brl(focusSavedInterest)}
                      </span>
                    </div>
                  )}
                  <div className="text-[11px] pt-2 mt-1 border-t border-[var(--ink-line)] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    Prazos vêm do saldo + juros (a.m. ou a.a.) + parcela — não do campo prazo sozinho.
                    {simulation.cleared && (
                      <> Carteira toda: {formatHorizon(simulation.months)}{savedMonths != null ? ` (−${savedMonths}m vs só parcela)` : ""}.</>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Cadastre uma dívida para ver o impacto.
                </div>
              )}
            </div>
          </div>
        </div>

        {debts.length > 0 && focusDebt && (
          <div
            className="mt-6 pt-5 border-t border-[var(--ink-line)] grid grid-cols-1 xl:grid-cols-2 gap-4"
            data-testid="whatif-comparison"
          >
            <div className="p-4 rounded-xl min-w-0 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--ink-line)" }}>
              <div className="text-[11px] uppercase tracking-[0.14em] mb-2" style={{ color: "var(--text-muted)" }}>
                Sem aporte · {focusDebt.name}
              </div>
              <div className="font-display text-[24px] sm:text-[28px] font-mono-num break-words" style={{ color: focusBaselineMonths ? "var(--text-primary)" : "var(--danger)" }} data-testid="whatif-baseline-focus">
                {focusBaselineMonths ? formatHorizon(focusBaselineMonths) : "Não quita"}
              </div>
              <div className="text-[12px] mt-2 leading-relaxed break-words" style={{ color: "var(--text-secondary)" }}>
                {focusBaselineMonths
                  ? <>Só a parcela desta dívida{focusContractMonths > 0 ? ` · prazo informado ${focusContractMonths}m` : ""}.</>
                  : "Parcela não cobre os juros desta dívida."}
                {baseline.cleared && (
                  <> Carteira toda (todas as dívidas): {formatHorizon(baseline.months)} · juros {brl(baseline.totalInterest)}.</>
                )}
                {!baseline.cleared && baseline.months >= 600 && (
                  <> Alguma dívida da carteira não fecha só com parcela.</>
                )}
              </div>
            </div>
            <div
              className="p-4 rounded-xl min-w-0 overflow-hidden"
              style={{ background: "rgba(201,169,97,0.08)", border: "1px solid rgba(201,169,97,0.3)" }}
            >
              <div className="text-[11px] uppercase tracking-[0.14em] mb-2" style={{ color: "var(--gold-bright)" }}>
                Com +{brl(extra)}/mês · {focusDebt.name}
              </div>
              <div className="font-display text-[24px] sm:text-[28px] font-mono-num break-words" style={{ color: "var(--gold-bright)" }} data-testid="whatif-extra-focus">
                {extra <= 0
                  ? "Defina um aporte"
                  : focusPayoffMonths
                    ? formatHorizon(focusPayoffMonths)
                    : "Ainda não quita"}
              </div>
              <p className="text-[13px] mt-2 leading-relaxed break-words" style={{ color: "var(--text-secondary)" }} data-testid="whatif-summary">
                {extra <= 0
                  ? "Escolha um aporte acima para ver quanto o foco antecipa."
                  : focusPayoffMonths && focusSavedMonths != null && focusSavedMonths > 0
                    ? <>Antecipa o foco em {formatHorizon(focusSavedMonths)} (−{focusSavedMonths}m). Depois o extra migra para a próxima da fila{simulation.cleared ? ` · carteira toda em ${formatHorizon(simulation.months)}` : ""}.</>
                    : focusPayoffMonths
                      ? <>Foco quita em {formatHorizon(focusPayoffMonths)}{simulation.cleared ? ` · carteira toda em ${formatHorizon(simulation.months)}` : ""}.</>
                      : "Aumente o aporte ou a parcela — o foco ainda não fecha."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Priority order */}
      {priority.length > 0 && (
        <div className="card-premium p-6" data-testid="priority-order">
          <div className="kpi-label mb-2">
            Ordem de ataque · {strategy === "custom" && customPriorityMeta
              ? `Personalizada (${customPriorityMeta.label})`
              : strategyMeta.label}
          </div>
          <p className="text-[12px] mb-4" style={{ color: "var(--text-muted)" }}>
            Todo mês: parcela em todas. O aporte extra + parcelas liberadas das já quitadas
            caem só na dívida nº 1. Quando ela zerar, o foco passa para a próxima.
            {strategy === "custom"
              ? " Use Personalizada para mudar o critério."
              : " Use Personalizada para priorizar prazo, parcela ou ordem manual."}
          </p>
          <div className="space-y-3">
            {priority.map((d, i) => (
              <div key={d.id} className="flex items-center gap-4 p-3 rounded-lg" style={{ background: "rgba(11,10,15,0.5)", border: "1px solid var(--ink-line)" }}>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center font-display font-semibold text-[14px]"
                  style={{
                    background: i === 0 ? "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))" : "var(--ink-elevated)",
                    color: i === 0 ? "var(--ink-void)" : "var(--text-secondary)",
                    border: i === 0 ? "none" : "1px solid var(--ink-line)",
                  }}
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px]">{d.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Saldo: <span className="font-mono-num">{brl(d.balance)}</span>
                    {" "}· Parcela: <span className="font-mono-num">{brl(d.minPayment)}</span>
                    {" "}· Taxa:{" "}
                    <span className="font-mono-num">
                      {d.rate}%/{d.ratePeriod === "aa" ? "ano" : "mês"}
                      {d.ratePeriod === "aa" ? ` (≈${monthlyRatePct(d).toFixed(3)}% a.m.)` : ""}
                    </span>
                    {d.termMonths > 0 && (
                      <>
                        {" "}· Prazo: <span className="font-mono-num">{d.termMonths} meses</span>
                        {payoffDateLabel(d.termMonths) ? ` (~${payoffDateLabel(d.termMonths)})` : ""}
                      </>
                    )}
                  </div>
                </div>
                {i === 0 && <div className="chip gold">Foco atual</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent
          className="sm:max-w-lg border-[var(--ink-line)] p-0 gap-0 overflow-y-auto max-h-[85vh]"
          style={{ background: "var(--ink-elevated)", color: "var(--text-primary)" }}
          data-testid="custom-strategy-dialog"
        >
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="font-display text-[22px]" style={{ color: "var(--text-primary)" }}>
              Prioridade personalizada
            </DialogTitle>
            <DialogDescription style={{ color: "var(--text-secondary)" }}>
              Escolha o que atacar primeiro. O aporte extra vai só para o nº 1 da fila.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 space-y-3">
            {CUSTOM_PRIORITIES.map(({ id, label, icon: Icon, description }) => {
              const selected = draftPriority === id;
              return (
                <button
                  key={id}
                  type="button"
                  data-testid={`custom-priority-${id}`}
                  onClick={() => {
                    setDraftPriority(id);
                    if (id !== "manual") {
                      setDraftOrder(buildOrderFrom(id, draftOrder));
                    }
                  }}
                  className="w-full text-left p-4 rounded-xl transition-colors"
                  style={{
                    background: selected ? "rgba(201,169,97,0.12)" : "rgba(11,10,15,0.45)",
                    border: selected ? "1px solid rgba(201,169,97,0.45)" : "1px solid var(--ink-line)",
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-0.5 w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: selected ? "rgba(201,169,97,0.2)" : "var(--ink-void)",
                        color: selected ? "var(--gold-bright)" : "var(--text-secondary)",
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-[14px]" style={{ color: "var(--text-primary)" }}>
                        {label}
                      </div>
                      <div className="text-[12px] mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
                        {description}
                      </div>
                    </div>
                    {selected && <Check className="w-4 h-4 shrink-0 mt-1" style={{ color: "var(--gold-bright)" }} />}
                  </div>
                </button>
              );
            })}
          </div>

          {draftPriority === "manual" && draftPreview.length > 0 && (
            <div className="px-6 mt-4" data-testid="custom-manual-order">
              <div className="text-[11px] uppercase tracking-[0.14em] mb-2" style={{ color: "var(--text-muted)" }}>
                Ordem de ataque · arraste pelo ícone
              </div>
              <Reorder.Group
                axis="y"
                values={draftIds}
                onReorder={reorderDraft}
                className="space-y-2"
                as="div"
              >
                {draftPreview.map((d, i) => (
                  <ManualDebtRow
                    key={d.id}
                    debt={d}
                    index={i}
                    total={draftPreview.length}
                    onMoveUp={() => moveDraft(d.id, -1)}
                    onMoveDown={() => moveDraft(d.id, 1)}
                  />
                ))}
              </Reorder.Group>
            </div>
          )}

          {draftPriority !== "manual" && draftPreview[0] && (
            <p className="px-6 mt-4 text-[12px]" style={{ color: "var(--text-secondary)" }} data-testid="custom-preview-focus">
              Com isso, o foco inicial será{" "}
              <span style={{ color: "var(--gold-bright)" }} className="font-semibold">{draftPreview[0].name}</span>.
            </p>
          )}

          <DialogFooter className="px-6 py-5 mt-2 border-t border-[var(--ink-line)] gap-2">
            <button type="button" className="btn-ghost" onClick={() => setCustomOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-gold"
              data-testid="apply-custom-strategy"
              onClick={applyCustomStrategy}
            >
              Aplicar estratégia
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Debts cards */}
      <div className="space-y-4" data-testid="debts-table">
        <div className="flex items-center justify-between">
          <div>
            <div className="kpi-label mb-1">Suas dívidas</div>
            <div className="font-display text-[22px]" style={{ letterSpacing: "-0.02em" }}>Cadastro detalhado</div>
          </div>
          <TrendingDown className="w-5 h-5" style={{ color: "var(--gold)" }} />
        </div>

        {debts.map((d) => (
          <div
            key={d.id}
            className="card-premium p-5 space-y-4"
            data-testid={`debt-card-${d.id}`}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              <div className="xl:col-span-1">
                <label className="text-[10px] uppercase tracking-[0.14em] block mb-1.5" style={{ color: "var(--text-muted)" }}>Qual dívida?</label>
                <input data-testid={`debt-name-${d.id}`} className="input-premium" value={d.name}
                  onChange={(e) => updateDebt(d.id, { name: e.target.value })} />
                {d.termMonths > 0 && (
                  <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                    Meta de quitação ~{payoffDateLabel(d.termMonths)}
                  </div>
                )}
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.14em] block mb-1.5" style={{ color: "var(--text-muted)" }}>Quanto deve</label>
                <input data-testid={`debt-balance-${d.id}`} type="number" className="input-premium font-mono-num" value={d.balance}
                  onChange={(e) => updateDebt(d.id, { balance: parseNum(e.target.value) })} />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
                    Juros %
                  </label>
                  <div className="flex gap-1" data-testid={`debt-rate-period-${d.id}`}>
                    {["am", "aa"].map((period) => (
                      <button
                        key={period}
                        type="button"
                        className={(d.ratePeriod || "am") === period ? "chip gold" : "chip"}
                        style={{ cursor: "pointer", border: "none", padding: "2px 8px", fontSize: 10 }}
                        onClick={() => updateDebt(d.id, { ratePeriod: period })}
                      >
                        {period === "am" ? "a.m." : "a.a."}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  data-testid={`debt-rate-${d.id}`}
                  type="number"
                  step="0.01"
                  className="input-premium font-mono-num"
                  value={d.rate}
                  onChange={(e) => updateDebt(d.id, { rate: parseNum(e.target.value) })}
                />
                <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                  {(d.ratePeriod || "am") === "aa"
                    ? `≈ ${monthlyRatePct(d).toFixed(3)}% a.m. na simulação`
                    : "ao mês sobre o saldo (não sobre a parcela)"}
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.14em] block mb-1.5" style={{ color: "var(--text-muted)" }}>Parcela mensal</label>
                <input data-testid={`debt-min-${d.id}`} type="number" className="input-premium font-mono-num" value={d.minPayment}
                  onChange={(e) => updateDebt(d.id, { minPayment: parseNum(e.target.value) })} />
                {d.balance > 0 && d.termMonths > 0 && (
                  <button
                    type="button"
                    className="text-[10px] mt-1 underline-offset-2 hover:underline"
                    style={{ color: "var(--gold-bright)", background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    data-testid={`debt-price-${d.id}`}
                    onClick={() => {
                      const pmt = priceInstallment(d.balance, monthlyRatePct(d), d.termMonths);
                      updateDebt(d.id, { minPayment: Math.round(pmt * 100) / 100 });
                    }}
                  >
                    Price {d.termMonths}m: {brl(priceInstallment(d.balance, monthlyRatePct(d), d.termMonths))}
                  </button>
                )}
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.14em] block mb-1.5" style={{ color: "var(--text-muted)" }}>Prazo (meses)</label>
                <input
                  data-testid={`debt-term-${d.id}`}
                  type="number"
                  min={0}
                  className="input-premium font-mono-num"
                  value={d.termMonths || ""}
                  placeholder="—"
                  onChange={(e) =>
                    updateDebt(d.id, {
                      termMonths: Math.max(0, Math.min(600, Math.round(parseNum(e.target.value)))),
                    })
                  }
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                data-testid={`debt-remove-${d.id}`}
                onClick={() => removeDebt(d.id)}
                className="btn-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", fontSize: 13 }}
              >
                <Trash2 className="w-4 h-4" /> Remover
              </button>
              <button
                type="button"
                data-testid={`debt-save-${d.id}`}
                onClick={() => handleSaveDebt(d.id)}
                className="btn-gold"
                disabled={savingId === d.id || saving}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 18px",
                  fontSize: 13,
                  opacity: savingId === d.id ? 0.7 : 1,
                }}
              >
                {savingId === d.id ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                ) : savedFlash === d.id ? (
                  <><Check className="w-4 h-4" /> Salvo</>
                ) : (
                  "Salvar"
                )}
              </button>
            </div>
          </div>
        ))}

        <div
          className="card-premium p-5 space-y-4"
          style={{ borderStyle: "dashed", borderColor: "rgba(201,169,97,0.35)" }}
          data-testid="debt-new-card"
        >
          <div className="kpi-label">Nova dívida / financiamento</div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.14em] block mb-1.5" style={{ color: "var(--text-muted)" }}>Qual dívida?</label>
              <input data-testid="debt-new-name" className="input-premium" placeholder="Ex: Cartão em atraso, financiamento"
                value={newDebt.name} onChange={(e) => setNewDebt({ ...newDebt, name: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.14em] block mb-1.5" style={{ color: "var(--text-muted)" }}>Quanto deve</label>
              <input data-testid="debt-new-balance" type="number" className="input-premium font-mono-num" placeholder="Ex: 25000"
                value={newDebt.balance} onChange={(e) => setNewDebt({ ...newDebt, balance: e.target.value })} />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
                  Juros %
                </label>
                <div className="flex gap-1" data-testid="debt-new-rate-period">
                  {["am", "aa"].map((period) => (
                    <button
                      key={period}
                      type="button"
                      className={newDebt.ratePeriod === period ? "chip gold" : "chip"}
                      style={{ cursor: "pointer", border: "none", padding: "2px 8px", fontSize: 10 }}
                      onClick={() => setNewDebt({ ...newDebt, ratePeriod: period })}
                    >
                      {period === "am" ? "a.m." : "a.a."}
                    </button>
                  ))}
                </div>
              </div>
              <input data-testid="debt-new-rate" type="number" step="0.01" className="input-premium font-mono-num" placeholder={newDebt.ratePeriod === "aa" ? "Ex: 2" : "Ex: 1,5"}
                value={newDebt.rate} onChange={(e) => setNewDebt({ ...newDebt, rate: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.14em] block mb-1.5" style={{ color: "var(--text-muted)" }}>Parcela mensal</label>
              <input data-testid="debt-new-min" type="number" className="input-premium font-mono-num" placeholder="Parcela / mês"
                value={newDebt.minPayment} onChange={(e) => setNewDebt({ ...newDebt, minPayment: e.target.value })} />
              {parseNum(newDebt.balance) > 0 && parseNum(newDebt.termMonths) > 0 && (
                <button
                  type="button"
                  className="text-[10px] mt-1"
                  style={{ color: "var(--gold-bright)", background: "none", border: "none", padding: 0, cursor: "pointer", textDecoration: "underline" }}
                  data-testid="debt-new-price"
                  onClick={() => {
                    const monthly = newDebt.ratePeriod === "aa" ? parseNum(newDebt.rate) / 12 : parseNum(newDebt.rate);
                    const pmt = priceInstallment(parseNum(newDebt.balance), monthly, parseNum(newDebt.termMonths));
                    setNewDebt({ ...newDebt, minPayment: String(Math.round(pmt * 100) / 100) });
                  }}
                >
                  Calcular parcela Price
                </button>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.14em] block mb-1.5" style={{ color: "var(--text-muted)" }}>Prazo (meses)</label>
              <input data-testid="debt-new-term" type="number" min={0} className="input-premium font-mono-num" placeholder="Ex: 12"
                value={newDebt.termMonths} onChange={(e) => setNewDebt({ ...newDebt, termMonths: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              data-testid="debt-add"
              onClick={handleAdd}
              className="btn-gold"
              disabled={savingId === "new" || !newDebt.name.trim() || !(parseNum(newDebt.balance) > 0)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                fontSize: 13,
                opacity: savingId === "new" ? 0.7 : 1,
              }}
            >
              {savingId === "new" ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
              ) : savedFlash === "new" ? (
                <><Check className="w-4 h-4" /> Salvo</>
              ) : (
                <><Plus className="w-4 h-4" /> Salvar dívida</>
              )}
            </button>
          </div>
        </div>

        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Regra simples: se tem taxa, parcela e prazo, é financiamento — inclusive cartão em atraso.
          Use Salvar em cada cadastro para gravar na sua conta.
        </p>
      </div>
    </div>
  );
}
