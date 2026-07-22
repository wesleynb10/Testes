import React, { useEffect, useMemo, useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { brl, pct, parseNum, stripLeadingZeros } from "@/lib/format";
import {
  Plus, Trash2, Upload, Save, Check, SlidersHorizontal, RotateCcw, AlertTriangle, TrendingUp,
} from "lucide-react";
import CSVImport from "@/components/CSVImport";

const DEFAULT_RULE = { necessidades: 50, desejos: 30, investimentos: 20 };

const CAT_META = [
  { key: "necessidades", label: "Necessidades", color: "var(--gold-bright)", desc: "Aluguel, mercado, contas, transporte, saúde" },
  { key: "desejos", label: "Desejos", color: "var(--info)", desc: "Restaurantes, lazer, assinaturas, hobbies" },
  { key: "investimentos", label: "Investimentos", color: "var(--success)", desc: "Reserva, renda variável, previdência" },
];

const SEVERITY_COLOR = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
};

function CategoryBlock({ cat, income }) {
  const {
    state, updateBudgetItem, addBudgetItem, removeBudgetItem, saveNow,
  } = useFinance();
  const items = state.budget[cat.key];
  const [newName, setNewName] = useState("");
  const [newPlanned, setNewPlanned] = useState("");
  const [saved, setSaved] = useState(false);
  const [savingLocal, setSavingLocal] = useState(false);

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

  const handleSave = async () => {
    setSavingLocal(true);
    try {
      await saveNow();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSavingLocal(false);
    }
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
                    readOnly
                    title="Calculado automaticamente pelos lançamentos do mês"
                    style={{ opacity: 0.75, cursor: "not-allowed" }}
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
                onChange={(e) => setNewPlanned(stripLeadingZeros(e.target.value))}
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

      <div className="mt-4 pt-4 border-t border-[var(--ink-line)] flex items-center justify-between gap-4 flex-wrap text-[13px]" style={{ color: "var(--text-secondary)" }}>
        <div className="flex gap-4">
          <span>Total planejado: <span className="font-mono-num font-semibold" style={{ color: "var(--text-primary)" }}>{brl(totalPlanned)}</span></span>
          <span>Total real: <span className="font-mono-num font-semibold" style={{ color: statusColor }}>{brl(totalActual)}</span></span>
        </div>
        <button
          data-testid={`budget-${cat.key}-save`}
          onClick={handleSave}
          disabled={savingLocal}
          className="btn-gold"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", fontSize: 13, opacity: savingLocal ? 0.6 : 1 }}
        >
          {saved
            ? <><Check className="w-4 h-4" /> Salvo</>
            : savingLocal
            ? <>Salvando...</>
            : <><Save className="w-4 h-4" /> Salvar {cat.label}</>}
        </button>
      </div>
    </div>
  );
}

function BudgetRuleCard({ rule, ruleSum, updateBudgetRule, saveNow }) {
  const [open, setOpen] = useState(() => (
    rule.necessidades !== DEFAULT_RULE.necessidades ||
    rule.desejos !== DEFAULT_RULE.desejos ||
    rule.investimentos !== DEFAULT_RULE.investimentos
  ));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid = Math.round(ruleSum) === 100;

  const setPct = (key) => (e) => updateBudgetRule({ [key]: Math.max(0, Math.min(100, parseNum(e.target.value))) });

  const restore = () => updateBudgetRule({ ...DEFAULT_RULE });

  const save = async () => {
    setBusy(true);
    try {
      await saveNow();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-premium p-6" data-testid="budget-rule-card">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="eyebrow mb-1">Regra de Orçamento</div>
          <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Padrão <strong style={{ color: "var(--gold-bright)" }}>50/30/20</strong> — ou defina seus próprios percentuais por categoria.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip" data-testid="budget-rule-summary">
            {pct(rule.necessidades, 0)} / {pct(rule.desejos, 0)} / {pct(rule.investimentos, 0)}
          </span>
          <button
            data-testid="budget-rule-toggle"
            onClick={() => setOpen((v) => !v)}
            className="btn-ghost"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 16px", fontSize: 13 }}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {open ? "Fechar" : "Personalizar Regra de Orçamento"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-5 pt-5 border-t border-[var(--ink-line)]" data-testid="budget-rule-editor">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {CAT_META.map((c) => (
              <div key={c.key}>
                <label className="text-[11px] uppercase tracking-[0.14em] flex items-center gap-2 mb-2" style={{ color: "var(--text-muted)" }}>
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.color }} />
                  {c.label} (%)
                </label>
                <input
                  data-testid={`budget-rule-${c.key}`}
                  type="number"
                  min="0"
                  max="100"
                  className="input-premium font-mono-num text-[18px]"
                  value={rule[c.key]}
                  onChange={setPct(c.key)}
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
            <div
              className="text-[13px] flex items-center gap-2"
              data-testid="budget-rule-sum"
              style={{ color: valid ? "var(--success)" : "var(--danger)" }}
            >
              {valid ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              Soma: <span className="font-mono-num font-semibold">{pct(ruleSum, 0)}</span>
              {!valid && <span style={{ color: "var(--text-muted)" }}>(precisa somar 100%)</span>}
            </div>
            <div className="flex items-center gap-2">
              <button
                data-testid="budget-rule-restore"
                onClick={restore}
                className="btn-ghost"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px", fontSize: 13 }}
              >
                <RotateCcw className="w-4 h-4" /> Padrão 50/30/20
              </button>
              <button
                data-testid="budget-rule-save"
                onClick={save}
                disabled={busy || !valid}
                className="btn-gold"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 18px", fontSize: 13, opacity: busy || !valid ? 0.5 : 1 }}
              >
                {saved ? <><Check className="w-4 h-4" /> Salvo</> : busy ? "Salvando..." : <><Save className="w-4 h-4" /> Salvar regra</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetAlerts({ cats, income }) {
  const alerts = useMemo(() => {
    if (income <= 0) return [];
    return cats.map((cat) => {
      const totalActual = cat.items.reduce((s, it) => s + it.actual, 0);
      const realShare = (totalActual / income) * 100;
      const target = cat.target || 0;
      const usageOfTarget = target > 0 ? (realShare / target) * 100 : 0;

      let severity = "success";
      let message = "";
      if (cat.key === "investimentos") {
        if (realShare >= target) { severity = "success"; message = "Meta de investimento atingida. Excelente!"; }
        else if (realShare >= target * 0.5) { severity = "warning"; message = "Abaixo da meta de investimento do mês."; }
        else { severity = "danger"; message = "Muito abaixo da meta de investimento."; }
      } else {
        if (realShare > target) { severity = "danger"; message = `Estourou o limite de ${cat.label.toLowerCase()} em ${pct(realShare - target)} da renda.`; }
        else if (usageOfTarget >= 90) { severity = "warning"; message = "Perto do limite — atenção aos próximos gastos."; }
        else { severity = "success"; message = "Dentro do planejado."; }
      }
      return { key: cat.key, label: cat.label, color: cat.color, totalActual, realShare, target, usageOfTarget, severity, message };
    });
  }, [cats, income]);

  if (income <= 0) {
    return (
      <div className="card-premium p-5" data-testid="budget-alerts">
        <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Informe sua renda mensal acima para ver os alertas de uso das metas.
        </div>
      </div>
    );
  }

  const attention = alerts.filter((a) => a.severity !== "success").length;

  return (
    <div className="card-premium p-6" data-testid="budget-alerts">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" style={{ color: attention > 0 ? "var(--warning)" : "var(--success)" }} />
          <div className="kpi-label">Alertas de uso das metas</div>
        </div>
        <div className="chip" style={{ color: attention > 0 ? "var(--warning)" : "var(--success)" }}>
          {attention > 0 ? `${attention} ponto(s) de atenção` : "Tudo sob controle"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {alerts.map((a) => {
          const color = SEVERITY_COLOR[a.severity];
          return (
            <div
              key={a.key}
              data-testid={`budget-alert-${a.key}`}
              className="p-4 rounded-lg"
              style={{ background: "rgba(11,10,15,0.5)", border: `1px solid ${a.severity === "success" ? "var(--ink-line)" : color}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: a.color }} />
                  {a.label}
                </div>
                {a.key === "investimentos"
                  ? <TrendingUp className="w-4 h-4" style={{ color }} />
                  : a.severity !== "success" && <AlertTriangle className="w-4 h-4" style={{ color }} />}
              </div>
              <div className="flex items-end justify-between mb-2">
                <div className="font-display text-[22px] font-mono-num" style={{ color }}>{pct(a.usageOfTarget, 0)}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>da meta ({pct(a.realShare)} da renda)</div>
              </div>
              <div className="thermometer mb-2">
                <div
                  className="thermometer-fill"
                  style={{ width: `${Math.min(100, a.usageOfTarget)}%`, background: color }}
                />
              </div>
              <div className="text-[12px]" style={{ color: a.severity === "success" ? "var(--text-muted)" : color }}>
                {a.message}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Budget() {
  const { state, updateProfile, updateBudgetRule, saveNow, completeChecklistItem } = useFinance();
  const [showImport, setShowImport] = useState(false);
  const income = state.profile.monthlyIncome;
  const rule = state.budgetRule || DEFAULT_RULE;
  const ruleSum = (rule.necessidades || 0) + (rule.desejos || 0) + (rule.investimentos || 0);

  const cats = CAT_META.map((c) => ({ ...c, target: rule[c.key] ?? DEFAULT_RULE[c.key], items: state.budget[c.key] }));

  useEffect(() => {
    completeChecklistItem("budget");
  }, [completeChecklistItem]);

  const handleIncomeChange = (v) => {
    const n = parseNum(v);
    updateProfile({ monthlyIncome: n });
    if (n > 0) completeChecklistItem("income");
  };

  return (
    <div className="p-8 space-y-6" data-testid="budget-page">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-3">Orçamento Mensal · Regra {pct(rule.necessidades, 0)}/{pct(rule.desejos, 0)}/{pct(rule.investimentos, 0)}</div>
          <h1 className="h-display">Cada real, um propósito.</h1>
          <p className="mt-3 text-[15px] max-w-2xl" style={{ color: "var(--text-secondary)" }}>
            Distribua sua renda em três pilares: <span style={{ color: "var(--gold-bright)" }}>Necessidades, Desejos e Investimentos</span>. Ajuste o planejado, registre o real, veja o desvio.
          </p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            A coluna Real é calculada automaticamente pelos lançamentos do app, WhatsApp e extratos importados.
          </p>
        </div>
        <button
          data-testid="open-csv-import"
          onClick={() => setShowImport(true)}
          className="btn-gold"
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <Upload className="w-4 h-4" /> Importar Extrato
        </button>
      </header>

      {/* Regra de orçamento personalizável */}
      <BudgetRuleCard rule={rule} ruleSum={ruleSum} updateBudgetRule={updateBudgetRule} saveNow={saveNow} />

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
          {cats.map((c) => (
            <div key={c.key} className="p-3 rounded-lg" style={{ background: "rgba(11,10,15,0.5)", border: "1px solid var(--ink-line)" }}>
              <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>{c.label}</div>
              <div className="font-display text-[18px] font-mono-num mt-1" style={{ color: c.color }}>{brl(income * c.target / 100)}</div>
              <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{pct(c.target, 0)} da renda</div>
            </div>
          ))}
        </div>
      </div>

      {/* Alertas de uso das metas */}
      <BudgetAlerts cats={cats} income={income} />

      <div className="space-y-6">
        {cats.map((c) => (
          <CategoryBlock key={c.key} cat={c} income={income} />
        ))}
      </div>

      {showImport && <CSVImport onClose={() => setShowImport(false)} />}
    </div>
  );
}
