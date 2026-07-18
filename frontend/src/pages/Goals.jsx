import React, { useMemo, useState } from "react";
import { useFinance } from "@/context/FinanceContext";
import { brl, pct, parseNum } from "@/lib/format";
import { Plus, Trash2, Target as TargetIcon, Sparkles } from "lucide-react";

const EXTRA_PRESETS = [0, 200, 500, 1000];

function computeFIRE({ monthlyExpenses, safeWithdrawal, currentInvested, monthlyInvestment, annualReturn }) {
  const target = safeWithdrawal > 0 ? (monthlyExpenses * 12) / (safeWithdrawal / 100) : 0;
  const gap = Math.max(0, target - currentInvested);
  const r = annualReturn / 100 / 12;
  let months = 0;
  if (r <= 0) {
    months = monthlyInvestment > 0 ? gap / monthlyInvestment : Infinity;
  } else if (monthlyInvestment <= 0 && currentInvested < target) {
    months = Infinity;
  } else {
    // FV = PV(1+r)^n + PMT * ((1+r)^n - 1)/r  → solve for n
    const A = currentInvested + monthlyInvestment / r;
    const B = target + monthlyInvestment / r;
    if (A <= 0 || B <= 0) months = Infinity;
    else months = Math.log(B / A) / Math.log(1 + r);
  }
  return {
    target,
    monthsToFire: isFinite(months) ? Math.ceil(months) : Infinity,
    yearsToFire: isFinite(months) ? months / 12 : Infinity,
    progress: target > 0 ? Math.min(100, (currentInvested / target) * 100) : 0,
  };
}

/** Meses para atingir um saldo com aporte fixo (sem juros, para meta de prazo). */
function monthsToBalance(remaining, monthly) {
  const gap = Math.max(0, remaining);
  if (gap <= 0) return 0;
  if (monthly <= 0) return Infinity;
  return Math.ceil(gap / monthly);
}

export default function Goals() {
  const { state, addGoal, updateGoal, removeGoal, updateFire } = useFinance();
  const goals = state.goals;
  const fire = state.fire;
  const [newGoal, setNewGoal] = useState({ name: "", target: "", current: "", deadline: "" });
  const [whatIfExtra, setWhatIfExtra] = useState(300);

  const fireCalc = useMemo(() => computeFIRE(fire), [fire]);
  const fireWithExtra = useMemo(
    () =>
      computeFIRE({
        ...fire,
        monthlyInvestment: (fire.monthlyInvestment || 0) + whatIfExtra,
      }),
    [fire, whatIfExtra]
  );

  const monthsSaved =
    fireCalc.monthsToFire !== Infinity && fireWithExtra.monthsToFire !== Infinity
      ? Math.max(0, fireCalc.monthsToFire - fireWithExtra.monthsToFire)
      : fireCalc.monthsToFire === Infinity && fireWithExtra.monthsToFire !== Infinity
        ? null
        : 0;

  const handleAdd = () => {
    if (!newGoal.name.trim() || !newGoal.target) return;
    addGoal({
      name: newGoal.name.trim(),
      target: parseNum(newGoal.target),
      current: parseNum(newGoal.current),
      deadline: newGoal.deadline || "2028-01-01",
    });
    setNewGoal({ name: "", target: "", current: "", deadline: "" });
  };

  return (
    <div className="p-8 space-y-6" data-testid="goals-page">
      <header>
        <div className="eyebrow mb-3">Metas de Longo Prazo · Número da Liberdade</div>
        <h1 className="h-display">Onde você quer estar em <span className="text-shimmer">10 anos?</span></h1>
        <p className="mt-3 text-[15px] max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          Metas concretas + cálculo automático de Independência Financeira baseado na Regra dos 4% (safe withdrawal rate).
        </p>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card-gold p-6 xl:col-span-1" data-testid="fire-card">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4" style={{ color: "var(--gold-bright)" }} />
            <div className="eyebrow">Número da Liberdade</div>
          </div>
          <div className="kpi-value gold text-shimmer" style={{ fontSize: 42 }}>
            {brl(fireCalc.target)}
          </div>
          <p className="text-[13px] mt-3" style={{ color: "var(--text-secondary)" }}>
            Patrimônio necessário para viver de renda passiva a <span style={{ color: "var(--gold-bright)" }}>{fire.safeWithdrawal}% a.a.</span>
          </p>

          <div className="mt-6">
            <div className="flex justify-between text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
              <span>Progresso atual</span>
              <span className="font-mono-num font-semibold" style={{ color: "var(--gold-bright)" }}>{pct(fireCalc.progress)}</span>
            </div>
            <div className="thermometer"><div className="thermometer-fill" style={{ width: `${fireCalc.progress}%` }} /></div>
          </div>

          <div className="mt-6 pt-5 border-t border-[var(--ink-line)]">
            <div className="kpi-label mb-2">Tempo para liberdade</div>
            <div className="font-display text-[32px] font-mono-num" style={{ letterSpacing: "-0.02em", color: "var(--gold-bright)" }}>
              {fireCalc.monthsToFire === Infinity ? "∞" : `${fireCalc.yearsToFire.toFixed(1)}`}
              <span className="text-[14px] font-sans" style={{ color: "var(--text-muted)" }}> anos</span>
            </div>
            <div className="text-[12px] mt-1" style={{ color: "var(--text-secondary)" }}>
              {fireCalc.monthsToFire === Infinity ? "Aumente aportes para tornar possível" : `≈ ${fireCalc.monthsToFire} meses no ritmo atual`}
            </div>
          </div>
        </div>

        <div className="card-premium p-6 xl:col-span-2" data-testid="fire-config">
          <div className="kpi-label mb-4">Configuração do cálculo FIRE</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-[12px] block mb-1.5" style={{ color: "var(--text-secondary)" }}>Gasto mensal desejado no futuro</label>
              <input data-testid="fire-monthly-expenses" type="number" className="input-premium font-mono-num"
                value={fire.monthlyExpenses}
                onChange={(e) => updateFire({ monthlyExpenses: parseNum(e.target.value) })} />
              <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Padrão de vida que você quer manter</div>
            </div>
            <div>
              <label className="text-[12px] block mb-1.5" style={{ color: "var(--text-secondary)" }}>Taxa de retirada segura (SWR)</label>
              <input data-testid="fire-swr" type="number" step="0.1" className="input-premium font-mono-num"
                value={fire.safeWithdrawal}
                onChange={(e) => updateFire({ safeWithdrawal: parseNum(e.target.value) })} />
              <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Regra dos 4% é o padrão global (Trinity Study)</div>
            </div>
            <div>
              <label className="text-[12px] block mb-1.5" style={{ color: "var(--text-secondary)" }}>Patrimônio investido hoje</label>
              <input data-testid="fire-current" type="number" className="input-premium font-mono-num"
                value={fire.currentInvested}
                onChange={(e) => updateFire({ currentInvested: parseNum(e.target.value) })} />
              <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Soma de tudo que gera renda: FIIs, ações, renda fixa</div>
            </div>
            <div>
              <label className="text-[12px] block mb-1.5" style={{ color: "var(--text-secondary)" }}>Aporte mensal</label>
              <input data-testid="fire-aporte" type="number" className="input-premium font-mono-num"
                value={fire.monthlyInvestment}
                onChange={(e) => updateFire({ monthlyInvestment: parseNum(e.target.value) })} />
              <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Quanto você aporta em investimentos por mês</div>
            </div>
            <div className="md:col-span-2">
              <label className="text-[12px] block mb-1.5" style={{ color: "var(--text-secondary)" }}>Retorno real esperado (% ao ano)</label>
              <input data-testid="fire-return" type="number" step="0.1" className="input-premium font-mono-num"
                value={fire.annualReturn}
                onChange={(e) => updateFire({ annualReturn: parseNum(e.target.value) })} />
              <div className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Retorno acima da inflação. Conservador: 5-6%. Otimista: 9-10%.</div>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-[var(--ink-line)]" data-testid="fire-whatif">
            <div className="kpi-label mb-3">E se eu aportar um pouco mais?</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              <div>
                <label className="text-[12px] block mb-1.5" style={{ color: "var(--text-secondary)" }}>
                  Aporte extra hipotético (R$/mês)
                </label>
                <input
                  data-testid="fire-whatif-extra"
                  type="number"
                  min={0}
                  className="input-premium font-mono-num font-display text-[20px]"
                  value={whatIfExtra}
                  onChange={(e) => setWhatIfExtra(parseNum(e.target.value))}
                />
                <div className="flex flex-wrap gap-2 mt-3">
                  {EXTRA_PRESETS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      data-testid={`fire-extra-preset-${value}`}
                      onClick={() => setWhatIfExtra(value)}
                      className={whatIfExtra === value ? "chip gold" : "chip"}
                      style={{ cursor: "pointer", border: "none" }}
                    >
                      {value === 0 ? "Sem extra" : `+${brl(value)}`}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="p-4 rounded-xl"
                style={{ background: "rgba(201,169,97,0.08)", border: "1px solid rgba(201,169,97,0.3)" }}
              >
                <div className="text-[11px] uppercase tracking-[0.14em] mb-2" style={{ color: "var(--gold-bright)" }}>
                  Com +{brl(whatIfExtra)}/mês
                </div>
                <div className="font-display text-[28px] font-mono-num" style={{ color: "var(--gold-bright)" }}>
                  {fireWithExtra.monthsToFire === Infinity
                    ? "∞"
                    : `${fireWithExtra.yearsToFire.toFixed(1)} anos`}
                </div>
                <p className="text-[13px] mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }} data-testid="fire-whatif-summary">
                  {whatIfExtra <= 0
                    ? "Defina um extra para ver quanto tempo você antecipa."
                    : fireWithExtra.monthsToFire === Infinity
                      ? "Ainda insuficiente — aumente o aporte base ou o extra."
                      : monthsSaved === null
                        ? <>Com esse extra a liberdade passa a ser possível em ≈ <span className="font-semibold" style={{ color: "var(--gold-bright)" }}>{fireWithExtra.monthsToFire} meses</span>.</>
                        : monthsSaved > 0
                          ? <>Se aportar +{brl(whatIfExtra)}, você antecipa <span className="font-semibold" style={{ color: "var(--gold-bright)" }}>{monthsSaved} meses</span> ({(monthsSaved / 12).toFixed(1)} anos).</>
                          : "Nesse valor o ganho de tempo ainda é pequeno — experimente um extra maior."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card-premium p-6" data-testid="long-term-goals">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="kpi-label mb-1">Metas Ativas</div>
            <div className="font-display text-[22px]" style={{ letterSpacing: "-0.02em" }}>Seus sonhos, com prazo.</div>
          </div>
          <TargetIcon className="w-5 h-5" style={{ color: "var(--gold)" }} />
        </div>

        <div className="space-y-4">
          {goals.map((g) => {
            const p = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
            const remaining = Math.max(0, g.target - g.current);
            const parsedDeadline = g.deadline ? new Date(`${g.deadline}T12:00:00`) : null;
            const monthsLeft = parsedDeadline && !Number.isNaN(parsedDeadline.getTime())
              ? Math.max(1, Math.ceil((parsedDeadline - new Date()) / (1000 * 60 * 60 * 24 * 30)))
              : 1;
            const monthlyNeeded = remaining / monthsLeft;
            const monthsAtNeeded = monthsToBalance(remaining, monthlyNeeded);
            const monthsWithExtra = monthsToBalance(remaining, monthlyNeeded + whatIfExtra);
            const goalMonthsSaved =
              monthsAtNeeded !== Infinity && monthsWithExtra !== Infinity
                ? Math.max(0, monthsAtNeeded - monthsWithExtra)
                : 0;
            return (
              <div key={g.id} className="p-5 rounded-xl" style={{ background: "rgba(11,10,15,0.4)", border: "1px solid var(--ink-line)" }}>
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                  <input data-testid={`goal-name-${g.id}`} className="input-premium lg:col-span-4" value={g.name}
                    onChange={(e) => updateGoal(g.id, { name: e.target.value })} />
                  <div className="lg:col-span-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] mb-1" style={{ color: "var(--text-muted)" }}>Meta</div>
                    <input data-testid={`goal-target-${g.id}`} type="number" className="input-premium font-mono-num" value={g.target}
                      onChange={(e) => updateGoal(g.id, { target: parseNum(e.target.value) })} />
                  </div>
                  <div className="lg:col-span-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] mb-1" style={{ color: "var(--text-muted)" }}>Atual</div>
                    <input data-testid={`goal-current-${g.id}`} type="number" className="input-premium font-mono-num" value={g.current}
                      onChange={(e) => updateGoal(g.id, { current: parseNum(e.target.value) })} />
                  </div>
                  <div className="lg:col-span-3">
                    <div className="text-[10px] uppercase tracking-[0.14em] mb-1" style={{ color: "var(--text-muted)" }}>Prazo</div>
                    <input data-testid={`goal-deadline-${g.id}`} type="date" className="input-premium" value={g.deadline}
                      onChange={(e) => updateGoal(g.id, { deadline: e.target.value })} />
                  </div>
                  <div className="lg:col-span-1 flex justify-end">
                    <button data-testid={`goal-remove-${g.id}`} onClick={() => removeGoal(g.id)}
                      className="p-2 rounded-md" style={{ color: "var(--text-muted)" }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-[11px] mb-2 flex-wrap gap-2">
                    <span style={{ color: "var(--text-muted)" }}>
                      Faltam <span className="font-mono-num font-semibold" style={{ color: "var(--text-primary)" }}>{brl(remaining)}</span>
                      · Aporte necessário: <span className="font-mono-num font-semibold" style={{ color: "var(--gold-bright)" }}>{brl(monthlyNeeded)}/mês</span>
                    </span>
                    <span className="font-mono-num font-semibold" style={{ color: "var(--gold-bright)" }}>{pct(p)}</span>
                  </div>
                  <div className="thermometer"><div className="thermometer-fill" style={{ width: `${p}%` }} /></div>
                  {whatIfExtra > 0 && remaining > 0 && (
                    <p className="text-[12px] mt-3" style={{ color: "var(--text-secondary)" }} data-testid={`goal-whatif-${g.id}`}>
                      Se aportar +{brl(whatIfExtra)} nesta meta, antecipa{" "}
                      <span className="font-semibold" style={{ color: "var(--gold-bright)" }}>
                        {goalMonthsSaved} {goalMonthsSaved === 1 ? "mês" : "meses"}
                      </span>
                      {" "}(≈ {monthsWithExtra === Infinity ? "∞" : monthsWithExtra} meses no total).
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          <div className="p-5 rounded-xl border-dashed" style={{ background: "rgba(201,169,97,0.04)", border: "1px dashed rgba(201,169,97,0.25)" }}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              <input data-testid="goal-new-name" className="input-premium lg:col-span-4" placeholder="Nome da meta (ex: Casa própria)"
                value={newGoal.name} onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })} />
              <input data-testid="goal-new-target" type="number" className="input-premium font-mono-num lg:col-span-2" placeholder="Alvo"
                value={newGoal.target} onChange={(e) => setNewGoal({ ...newGoal, target: e.target.value })} />
              <input data-testid="goal-new-current" type="number" className="input-premium font-mono-num lg:col-span-2" placeholder="Atual"
                value={newGoal.current} onChange={(e) => setNewGoal({ ...newGoal, current: e.target.value })} />
              <input data-testid="goal-new-deadline" type="date" className="input-premium lg:col-span-3"
                value={newGoal.deadline} onChange={(e) => setNewGoal({ ...newGoal, deadline: e.target.value })} />
              <button data-testid="goal-add" onClick={handleAdd} className="btn-gold lg:col-span-1" style={{ display: "flex", justifyContent: "center", padding: "10px" }}>
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
