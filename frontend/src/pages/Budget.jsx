import React, { useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { brl, pct, parseNum } from "@/lib/format";
import { Plus, Trash2, PieChart as PieIcon, Upload } from "lucide-react";
import CSVImport from "@/components/CSVImport";

const CATS = [
  { key: "necessidades", label: "Necessidades", target: 50, color: "var(--gold-bright)", desc: "Aluguel, mercado, contas, transporte, saúde" },
  { key: "desejos", label: "Desejos", target: 30, color: "var(--info)", desc: "Restaurantes, lazer, assinaturas, hobbies" },
  { key: "investimentos", label: "Investimentos", target: 20, color: "var(--success)", desc: "Reserva, renda variável, previdência" },
];

function CategoryBlock({ cat, income }) {
  const { state, updateBudgetItem, addBudgetItem, removeBudgetItem } = useFinance();
  const items = state.budget[cat.key];
  const [newName, setNewName] = useState("");
  const [newPlanned, setNewPlanned] = useState("");

  const totalPlanned = items.reduce((s, it) => s + it.planned, 0);
  const totalActual = items.reduce((s, it) => s + it.actual, 0);
  const idealShare = income * (cat.target / 100);
  const realShare = income > 0 ? (totalActual / income) * 100 : 0;
  const status = realShare <= cat.target ? "success" : realShare <= cat.target * 1.1 ? "warning" : "danger";

  const statusColor = { success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)" }[status];

  const handleAdd = () => {
    if (!newName.trim()) return;
    const planned = parseNum(newPlanned) || 0;
    addBudgetItem(cat.key, { name: newName.trim(), planned, actual: 0 });
    setNewName(""); setNewPlanned("");
  };

  return (
    <div className="card-premium p-6" data-testid={`budget-cat-${cat.key}`}>
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-sm" style={{ background: cat.color }} />
            <div className="font-display text-[24px]" style={{ letterSpacing: "-0.02em" }}>{cat.label}</div>
            <div className="chip" style={{ marginLeft: 8 }}>Ideal: {cat.target}%</div>
          </div>
          <div className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>{cat.desc}</div>
        </div>
        <div className="text-right">
          <div className="kpi-label mb-1">Real</div>
          <div className="font-display text-[22px] font-mono-num" style={{ color: statusColor, letterSpacing: "-0.02em" }}>
            {pct(realShare)}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-[11px] mb-1.5" style={{ color: "var(--text-muted)" }}>
          <span>Gasto: <span className="font-mono-num font-semibold" style={{ color: "var(--text-primary)" }}>{brl(totalActual)}</span></span>
          <span>Ideal: <span className="font-mono-num" style={{ color: "var(--text-secondary)" }}>{brl(idealShare)}</span></span>
        </div>
        <div className="thermometer">
          <div
            className="thermometer-fill"
            style={{
              width: `${Math.min(100, (totalActual / (idealShare || 1)) * 100)}%`,
              background: status === "danger"
                ? "linear-gradient(90deg, var(--danger), #E88888)"
                : status === "warning"
                ? "linear-gradient(90deg, var(--gold-deep), var(--warning))"
                : undefined,
            }}
          />
        </div>
      </div>

      <table className="table-premium">
        <thead>
          <tr>
            <th>Item</th>
            <th style={{ width: 140 }}>Planejado</th>
            <th style={{ width: 140 }}>Real</th>
            <th style={{ width: 100 }}>Δ</th>
            <th style={{ width: 40 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const diff = it.actual - it.planned;
            return (
              <tr key={it.id}>
                <td>
                  <input
                    data-testid={`budget-${cat.key}-name-${it.id}`}
                    className="input-premium"
                    value={it.name}
                    onChange={(e) => updateBudgetItem(cat.key, it.id, { name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    data-testid={`budget-${cat.key}-planned-${it.id}`}
                    type="number"
                    className="input-premium font-mono-num"
                    value={it.planned}
                    onChange={(e) => updateBudgetItem(cat.key, it.id, { planned: parseNum(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    data-testid={`budget-${cat.key}-actual-${it.id}`}
                    type="number"
                    className="input-premium font-mono-num"
                    value={it.actual}
                    onChange={(e) => updateBudgetItem(cat.key, it.id, { actual: parseNum(e.target.value) })}
                  />
                </td>
                <td className="font-mono-num text-[13px]" style={{ color: diff > 0 ? "var(--danger)" : "var(--success)" }}>
                  {diff > 0 ? "+" : ""}{brl(diff)}
                </td>
                <td>
                  <button
                    data-testid={`budget-${cat.key}-remove-${it.id}`}
                    onClick={() => removeBudgetItem(cat.key, it.id)}
                    className="p-2 rounded-md hover:bg-[rgba(212,106,106,0.1)]"
                    style={{ color: "var(--text-muted)" }}
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            );
          })}
          <tr>
            <td>
              <input
                data-testid={`budget-${cat.key}-new-name`}
                className="input-premium"
                placeholder="+ Novo item"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </td>
            <td>
              <input
                data-testid={`budget-${cat.key}-new-planned`}
                type="number"
                className="input-premium font-mono-num"
                placeholder="0"
                value={newPlanned}
                onChange={(e) => setNewPlanned(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </td>
            <td></td>
            <td></td>
            <td>
              <button
                data-testid={`budget-${cat.key}-add`}
                onClick={handleAdd}
                className="p-2 rounded-md"
                style={{ background: "var(--gold-glow)", color: "var(--gold-bright)", border: "1px solid rgba(201,169,97,0.25)" }}
              >
                <Plus className="w-4 h-4" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-4 pt-4 border-t border-[var(--ink-line)] flex justify-between text-[13px]" style={{ color: "var(--text-secondary)" }}>
        <span>Total planejado: <span className="font-mono-num font-semibold" style={{ color: "var(--text-primary)" }}>{brl(totalPlanned)}</span></span>
        <span>Total real: <span className="font-mono-num font-semibold" style={{ color: statusColor }}>{brl(totalActual)}</span></span>
      </div>
    </div>
  );
}

export default function Budget() {
  const { state, updateProfile } = useFinance();
  const [income, setIncome] = useState(state.profile.monthlyIncome);
  const [showImport, setShowImport] = useState(false);

  const handleIncomeChange = (v) => {
    const n = parseNum(v);
    setIncome(n);
    updateProfile({ monthlyIncome: n });
  };

  return (
    <div className="p-8 space-y-6" data-testid="budget-page">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-3">Orçamento Mensal · Regra 50/30/20</div>
          <h1 className="h-display">Cada real, um propósito.</h1>
          <p className="mt-3 text-[15px] max-w-2xl" style={{ color: "var(--text-secondary)" }}>
            Distribua sua renda em três pilares: <span style={{ color: "var(--gold-bright)" }}>Necessidades, Desejos e Investimentos</span>. Ajuste o planejado, registre o real, veja o desvio.
          </p>
        </div>
        <button
          data-testid="open-csv-import"
          onClick={() => setShowImport(true)}
          className="btn-gold"
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <Upload className="w-4 h-4" /> Importar Extrato (CSV)
        </button>
      </header>

      {/* Income input */}
      <div className="card-premium p-6 flex items-end gap-6 flex-wrap" data-testid="income-card">
        <div className="flex-1 min-w-[220px]">
          <div className="kpi-label mb-2">Renda mensal líquida</div>
          <input
            data-testid="income-input"
            type="number"
            className="input-premium font-mono-num text-[22px] font-display"
            value={income}
            onChange={(e) => handleIncomeChange(e.target.value)}
          />
        </div>
        <div className="flex-1 grid grid-cols-3 gap-3 min-w-[280px]">
          {CATS.map((c) => (
            <div key={c.key} className="p-3 rounded-lg" style={{ background: "rgba(11,10,15,0.5)", border: "1px solid var(--ink-line)" }}>
              <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>{c.label}</div>
              <div className="font-display text-[18px] font-mono-num mt-1" style={{ color: c.color }}>{brl(income * c.target / 100)}</div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{c.target}% da renda</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {CATS.map((c) => (
          <CategoryBlock key={c.key} cat={c} income={income} />
        ))}
      </div>

      {showImport && <CSVImport onClose={() => setShowImport(false)} />}
    </div>
  );
}
