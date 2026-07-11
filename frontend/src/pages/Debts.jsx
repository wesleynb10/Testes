import React, { useMemo, useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { brl, parseNum } from "@/lib/format";
import { Plus, Trash2, Snowflake, Zap, TrendingDown } from "lucide-react";

/**
 * Simulate debt payoff with snowball (smallest balance first) or avalanche (highest rate first).
 * Interest is monthly (rate given as % per month).
 */
function simulate(debts, extraMonthly, strategy = "snowball") {
  const clones = debts.map((d) => ({ ...d }));
  const sortFn =
    strategy === "avalanche"
      ? (a, b) => b.rate - a.rate
      : (a, b) => a.balance - b.balance;

  let month = 0;
  let totalInterest = 0;
  const history = [];
  const MAX = 600; // 50 years cap

  while (clones.some((d) => d.balance > 0) && month < MAX) {
    month++;
    // 1) accrue interest
    clones.forEach((d) => {
      if (d.balance > 0) {
        const interest = d.balance * (d.rate / 100);
        d.balance += interest;
        totalInterest += interest;
      }
    });
    // 2) apply minimum payments
    let extra = extraMonthly;
    clones.forEach((d) => {
      if (d.balance > 0) {
        const pay = Math.min(d.balance, d.minPayment);
        d.balance -= pay;
      }
    });
    // 3) sort and apply extra + freed minimums to top-priority debt
    const active = clones.filter((d) => d.balance > 0).sort(sortFn);
    // freed minimums from paid-off debts
    const freed = clones
      .filter((d) => d.balance <= 0 && d.minPayment > 0)
      .reduce((s, d) => s + d.minPayment, 0);
    const bullet = extra + freed;
    if (active.length > 0 && bullet > 0) {
      const pay = Math.min(active[0].balance, bullet);
      active[0].balance -= pay;
    }
    const total = clones.reduce((s, d) => s + Math.max(0, d.balance), 0);
    history.push({ mes: month, saldo: total });
    if (total <= 0.01) break;
  }
  return { months: month, totalInterest, history, cleared: clones.every((d) => d.balance <= 0.01) };
}

export default function Debts() {
  const { state, addDebt, updateDebt, removeDebt } = useFinance();
  const debts = state.debts;

  const [strategy, setStrategy] = useState("snowball");
  const [extra, setExtra] = useState(500);
  const [newDebt, setNewDebt] = useState({ name: "", balance: "", rate: "", minPayment: "" });

  const totalBalance = debts.reduce((s, d) => s + d.balance, 0);
  const totalMin = debts.reduce((s, d) => s + d.minPayment, 0);
  const weightedRate = totalBalance > 0 ? debts.reduce((s, d) => s + d.rate * d.balance, 0) / totalBalance : 0;

  const simulation = useMemo(() => simulate(debts, extra, strategy), [debts, extra, strategy]);
  const baseline = useMemo(() => simulate(debts, 0, strategy), [debts, strategy]);

  // If baseline didn't converge (min payments < interest), we can't compute real savings
  const baselineConverged = baseline.cleared;
  const savedMonths = baselineConverged ? Math.max(0, baseline.months - simulation.months) : null;
  const savedInterest = baselineConverged ? Math.max(0, baseline.totalInterest - simulation.totalInterest) : null;

  const handleAdd = () => {
    if (!newDebt.name.trim()) return;
    addDebt({
      name: newDebt.name.trim(),
      balance: parseNum(newDebt.balance),
      rate: parseNum(newDebt.rate),
      minPayment: parseNum(newDebt.minPayment),
    });
    setNewDebt({ name: "", balance: "", rate: "", minPayment: "" });
  };

  const priority = [...debts]
    .filter((d) => d.balance > 0)
    .sort((a, b) => (strategy === "avalanche" ? b.rate - a.rate : a.balance - b.balance));

  return (
    <div className="p-8 space-y-6" data-testid="debts-page">
      <header>
        <div className="eyebrow mb-3">Controle de Dívidas · Simulador de Quitação</div>
        <h1 className="h-display">De devedor a <span className="text-shimmer">livre.</span></h1>
        <p className="mt-3 text-[15px] max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          Estratégia Bola de Neve ou Avalanche. Você escolhe o método, o sistema mostra em quantos meses você sai da pior.
        </p>
      </header>

      {/* Overview cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        <div className="card-premium p-5" data-testid="kpi-total-dividas">
          <div className="kpi-label mb-2">Saldo devedor total</div>
          <div className="kpi-value danger">{brl(totalBalance)}</div>
        </div>
        <div className="card-premium p-5">
          <div className="kpi-label mb-2">Parcela mínima mensal</div>
          <div className="kpi-value">{brl(totalMin)}</div>
        </div>
        <div className="card-premium p-5">
          <div className="kpi-label mb-2">Juros médio ponderado</div>
          <div className="kpi-value">{weightedRate.toFixed(2)}%<span className="text-[14px]" style={{ color: "var(--text-muted)" }}> a.m.</span></div>
        </div>
        <div className="card-gold p-5" data-testid="kpi-quitacao">
          <div className="kpi-label mb-2">Livre em</div>
          <div className="kpi-value gold">{simulation.months}<span className="text-[14px]" style={{ color: "var(--text-muted)" }}> meses</span></div>
          <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
            ({Math.floor(simulation.months / 12)}a {simulation.months % 12}m)
          </div>
        </div>
      </div>

      {/* Simulator controls */}
      <div className="card-premium p-6" data-testid="simulator-controls">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex-1 min-w-[280px]">
            <div className="kpi-label mb-3">Estratégia de quitação</div>
            <div className="flex gap-2">
              <button
                data-testid="strategy-snowball"
                onClick={() => setStrategy("snowball")}
                className={strategy === "snowball" ? "btn-gold" : "btn-ghost"}
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <Snowflake className="w-4 h-4" /> Bola de Neve
              </button>
              <button
                data-testid="strategy-avalanche"
                onClick={() => setStrategy("avalanche")}
                className={strategy === "avalanche" ? "btn-gold" : "btn-ghost"}
                style={{ display: "flex", gap: 8, alignItems: "center" }}
              >
                <Zap className="w-4 h-4" /> Avalanche
              </button>
            </div>
            <p className="text-[12px] mt-3" style={{ color: "var(--text-muted)" }}>
              {strategy === "snowball"
                ? "Prioriza a menor dívida — vitórias rápidas mantêm o foco."
                : "Prioriza a maior taxa de juros — matemática pura, economia máxima."}
            </p>
          </div>

          <div className="flex-1 min-w-[240px]">
            <div className="kpi-label mb-3">Aporte extra mensal</div>
            <input
              data-testid="extra-payment-input"
              type="number"
              className="input-premium font-mono-num font-display text-[22px]"
              value={extra}
              onChange={(e) => setExtra(parseNum(e.target.value))}
            />
            <p className="text-[12px] mt-2" style={{ color: "var(--text-muted)" }}>
              Além das parcelas mínimas, quanto você consegue destinar a mais por mês.
            </p>
          </div>

          <div className="flex-1 min-w-[260px]">
            <div className="kpi-label mb-3">Impacto</div>
            <div className="space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <span style={{ color: "var(--text-secondary)" }}>Meses economizados</span>
                <span className="font-mono-num font-semibold" style={{ color: "var(--gold-bright)" }}>
                  {savedMonths === null ? "—" : savedMonths}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-secondary)" }}>Juros que você não paga</span>
                <span className="font-mono-num font-semibold" style={{ color: "var(--success)" }}>
                  {savedInterest === null ? "—" : brl(savedInterest)}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-secondary)" }}>Total pago em juros</span>
                <span className="font-mono-num" style={{ color: "var(--text-primary)" }}>{brl(simulation.totalInterest)}</span>
              </div>
              {!baselineConverged && (
                <div className="text-[11px] pt-2 mt-1 border-t border-[var(--ink-line)]" style={{ color: "var(--warning)" }}>
                  ⚠ Parcelas mínimas não cobrem os juros. O aporte extra é essencial para quitar.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Priority order */}
      {priority.length > 0 && (
        <div className="card-premium p-6" data-testid="priority-order">
          <div className="kpi-label mb-4">Ordem de ataque</div>
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
                <div className="flex-1">
                  <div className="font-semibold text-[14px]">{d.name}</div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Saldo: <span className="font-mono-num">{brl(d.balance)}</span> · Taxa: <span className="font-mono-num">{d.rate}%/mês</span>
                  </div>
                </div>
                {i === 0 && <div className="chip gold">Foco atual</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Debts table */}
      <div className="card-premium p-6" data-testid="debts-table">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="kpi-label mb-1">Suas dívidas</div>
            <div className="font-display text-[22px]" style={{ letterSpacing: "-0.02em" }}>Cadastro detalhado</div>
          </div>
          <TrendingDown className="w-5 h-5" style={{ color: "var(--gold)" }} />
        </div>

        <table className="table-premium">
          <thead>
            <tr>
              <th>Credor / Descrição</th>
              <th style={{ width: 150 }}>Saldo devedor</th>
              <th style={{ width: 130 }}>Taxa (% a.m.)</th>
              <th style={{ width: 150 }}>Parcela mínima</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {debts.map((d) => (
              <tr key={d.id}>
                <td>
                  <input data-testid={`debt-name-${d.id}`} className="input-premium" value={d.name}
                    onChange={(e) => updateDebt(d.id, { name: e.target.value })} />
                </td>
                <td>
                  <input data-testid={`debt-balance-${d.id}`} type="number" className="input-premium font-mono-num" value={d.balance}
                    onChange={(e) => updateDebt(d.id, { balance: parseNum(e.target.value) })} />
                </td>
                <td>
                  <input data-testid={`debt-rate-${d.id}`} type="number" step="0.1" className="input-premium font-mono-num" value={d.rate}
                    onChange={(e) => updateDebt(d.id, { rate: parseNum(e.target.value) })} />
                </td>
                <td>
                  <input data-testid={`debt-min-${d.id}`} type="number" className="input-premium font-mono-num" value={d.minPayment}
                    onChange={(e) => updateDebt(d.id, { minPayment: parseNum(e.target.value) })} />
                </td>
                <td>
                  <button data-testid={`debt-remove-${d.id}`} onClick={() => removeDebt(d.id)}
                    className="p-2 rounded-md" style={{ color: "var(--text-muted)" }}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            <tr>
              <td>
                <input data-testid="debt-new-name" className="input-premium" placeholder="+ Nova dívida"
                  value={newDebt.name} onChange={(e) => setNewDebt({ ...newDebt, name: e.target.value })} />
              </td>
              <td>
                <input data-testid="debt-new-balance" type="number" className="input-premium font-mono-num" placeholder="Saldo"
                  value={newDebt.balance} onChange={(e) => setNewDebt({ ...newDebt, balance: e.target.value })} />
              </td>
              <td>
                <input data-testid="debt-new-rate" type="number" step="0.1" className="input-premium font-mono-num" placeholder="Taxa"
                  value={newDebt.rate} onChange={(e) => setNewDebt({ ...newDebt, rate: e.target.value })} />
              </td>
              <td>
                <input data-testid="debt-new-min" type="number" className="input-premium font-mono-num" placeholder="Mínimo"
                  value={newDebt.minPayment} onChange={(e) => setNewDebt({ ...newDebt, minPayment: e.target.value })} />
              </td>
              <td>
                <button data-testid="debt-add" onClick={handleAdd} className="p-2 rounded-md"
                  style={{ background: "var(--gold-glow)", color: "var(--gold-bright)", border: "1px solid rgba(201,169,97,0.25)" }}>
                  <Plus className="w-4 h-4" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
