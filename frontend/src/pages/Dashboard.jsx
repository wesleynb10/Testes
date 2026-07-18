import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFinance } from "@/context/FinanceContext";
import { useAuth } from "@/context/AuthContext";
import { brl, pct } from "@/lib/format";
import ShareStory from "@/components/ShareStory";
import FirstWeekChecklist from "@/components/FirstWeekChecklist";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Target,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Instagram,
} from "lucide-react";

const GOLD_PALETTE = ["#E8CE87", "#C9A961", "#8B7A3E", "#7A9AB8", "#7FB069", "#D46A6A", "#6B5D3A"];

function TooltipDark({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "rgba(11,10,15,0.95)",
        border: "1px solid var(--ink-line)",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 12,
        color: "var(--text-primary)",
        boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
      }}
    >
      {label && <div style={{ color: "var(--gold-bright)", fontWeight: 600, marginBottom: 4 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ width: 8, height: 8, background: p.color || p.fill, borderRadius: 2 }} />
          <span style={{ color: "var(--text-secondary)" }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{brl(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

function KPI({ label, value, delta, tone = "default", icon: Icon, testId }) {
  const positive = delta > 0;
  return (
    <div className="card-premium p-6 fade-up" data-testid={testId}>
      <div className="flex items-start justify-between mb-4">
        <div className="kpi-label">{label}</div>
        {Icon && (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{
              background: "rgba(201,169,97,0.1)",
              border: "1px solid rgba(201,169,97,0.2)",
            }}
          >
            <Icon className="w-4 h-4" style={{ color: "var(--gold-bright)" }} strokeWidth={1.75} />
          </div>
        )}
      </div>
      <div className={`kpi-value ${tone}`}>{value}</div>
      {delta !== undefined && (
        <div className="mt-3 flex items-center gap-1 text-[12px]" style={{ color: positive ? "var(--success)" : "var(--danger)" }}>
          {positive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
          <span className="font-semibold font-mono-num">{Math.abs(delta).toFixed(1)}%</span>
          <span style={{ color: "var(--text-muted)" }}>vs. mês anterior</span>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const { state, summary, syncChecklistFromFacts } = useFinance();
  const { user } = useAuth();
  const { budget, goals, debts, profile, fire } = state;
  const [showShare, setShowShare] = useState(false);

  useEffect(() => {
    const hasPhone = !!(user && typeof user === "object" && String(user.phone || "").trim());
    syncChecklistFromFacts({
      goalDebt: (goals || []).length > 0 || (debts || []).length > 0,
      whatsapp: hasPhone,
    });
  }, [user, goals, debts, syncChecklistFromFacts]);

  const greetName =
    (user && typeof user === "object" && (user.name || (user.email || "").split("@")[0])) ||
    profile.name;

  const totalReceita = profile.monthlyIncome;
  const gastosNec = budget.necessidades.reduce((s, it) => s + it.actual, 0);
  const gastosDes = budget.desejos.reduce((s, it) => s + it.actual, 0);
  const investimentos = budget.investimentos.reduce((s, it) => s + it.actual, 0);
  const totalGastos = gastosNec + gastosDes;
  const saldo = totalReceita - totalGastos - investimentos;
  const taxaPoupanca = totalReceita > 0 ? (investimentos / totalReceita) * 100 : 0;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date());

  // Expense breakdown pie data
  const allExpenses = [
    ...budget.necessidades.map((it) => ({ name: it.name, value: it.actual, cat: "Necessidades" })),
    ...budget.desejos.map((it) => ({ name: it.name, value: it.actual, cat: "Desejos" })),
  ]
    .filter((it) => it.value > 0)
    .sort((a, b) => b.value - a.value);

  const history = (summary?.months || []).map((item) => ({
    mes: new Intl.DateTimeFormat("pt-BR", { month: "short" })
      .format(new Date(`${item.month}-01T12:00:00`))
      .replace(".", ""),
    receita: totalReceita,
    gastos: item.expenses || 0,
    investido: item.investments || 0,
  }));
  const previousMonth = history.length > 1 ? history[history.length - 2] : null;
  const percentChange = (current, previous) => {
    if (!previous) return undefined;
    if (previous === 0) return current === 0 ? 0 : 100;
    return ((current - previous) / previous) * 100;
  };

  // FIRE calculation
  const numeroLiberdade =
    fire.safeWithdrawal > 0 ? (fire.monthlyExpenses * 12) / (fire.safeWithdrawal / 100) : 0;
  const progresso =
    numeroLiberdade > 0 ? Math.min(100, (fire.currentInvested / numeroLiberdade) * 100) : 0;

  // Alerts — só compara com orçamento quando há valor planejado (> 0)
  const overspent = [...budget.necessidades, ...budget.desejos]
    .filter((it) => it.planned > 0 && it.actual > it.planned * 1.05)
    .slice(0, 3);

  const needsIncomeSetup = !(totalReceita > 0);

  return (
    <div className="p-8 space-y-8" data-testid="dashboard-page">
      {/* Header */}
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="eyebrow mb-3">Painel Executivo · {monthLabel}</div>
          <h1 className="h-display">
            Olá, {greetName}. <span className="text-shimmer">Seu patrimônio agradece.</span>
          </h1>
          <p className="mt-3 text-[15px] max-w-xl" style={{ color: "var(--text-secondary)" }}>
            Visão consolidada do seu mês. Cada real com nome, categoria e destino.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="chip gold">
            <Sparkles className="w-3 h-3" />
            {needsIncomeSetup ? "Configure sua renda" : "Regra 50/30/20 ativa"}
          </div>
          <button
            data-testid="open-share-story"
            onClick={() => setShowShare(true)}
            className="btn-ghost"
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <Instagram className="w-4 h-4" /> Compartilhar Story
          </button>
        </div>
      </header>

      <FirstWeekChecklist />

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <KPI label="Receita do mês" value={brl(totalReceita)} icon={TrendingUp} testId="kpi-receita" />
        <KPI label="Gastos totais" value={brl(totalGastos)} delta={percentChange(totalGastos, previousMonth?.gastos)} tone="default" icon={TrendingDown} testId="kpi-gastos" />
        <KPI label="Investido no mês" value={brl(investimentos)} tone="gold" delta={percentChange(investimentos, previousMonth?.investido)} icon={Wallet} testId="kpi-investido" />
        <KPI label="Sobra / Saldo" value={brl(saldo)} tone={saldo >= 0 ? "success" : "danger"} icon={Target} testId="kpi-saldo" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Pie chart */}
        <div className="card-premium p-6 xl:col-span-1" data-testid="chart-despesas-pie">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="kpi-label mb-1">Distribuição de Despesas</div>
              <div className="font-display text-[22px]" style={{ letterSpacing: "-0.02em" }}>
                {brl(totalGastos)}
              </div>
            </div>
          </div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={allExpenses}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="var(--ink-void)"
                  strokeWidth={2}
                >
                  {allExpenses.map((_, i) => (
                    <Cell key={i} fill={GOLD_PALETTE[i % GOLD_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip content={<TooltipDark />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-1.5 max-h-32 overflow-auto pr-2">
            {allExpenses.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-[12px]">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{ background: GOLD_PALETTE[i % GOLD_PALETTE.length] }}
                  />
                  <span className="truncate" style={{ color: "var(--text-secondary)" }}>{e.name}</span>
                </div>
                <span className="font-mono-num font-semibold" style={{ color: "var(--text-primary)" }}>
                  {pct((e.value / totalGastos) * 100)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Evolução patrimonial */}
        <div className="card-premium p-6 xl:col-span-2" data-testid="chart-evolucao">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="kpi-label mb-1">Evolução dos últimos 6 meses</div>
              <div className="font-display text-[22px]" style={{ letterSpacing: "-0.02em" }}>
                Fluxo de caixa
              </div>
            </div>
            <div className="flex gap-4 text-[11px]">
              <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--gold-bright)" }} /> Receita
              </span>
              <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--danger)" }} /> Gastos
              </span>
              <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--success)" }} /> Investido
              </span>
            </div>
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={history} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="mes" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<TooltipDark />} />
                <Line type="monotone" dataKey="receita" stroke="var(--gold-bright)" strokeWidth={2.5} dot={{ fill: "var(--gold-bright)", r: 3 }} activeDot={{ r: 5 }} name="Receita" />
                <Line type="monotone" dataKey="gastos" stroke="var(--danger)" strokeWidth={2} dot={{ fill: "var(--danger)", r: 3 }} name="Gastos" />
                <Line type="monotone" dataKey="investido" stroke="var(--success)" strokeWidth={2} dot={{ fill: "var(--success)", r: 3 }} name="Investido" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Termômetros de Metas + FIRE */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card-premium p-6 xl:col-span-2" data-testid="metas-termometro">
          <div className="flex items-baseline justify-between mb-5">
            <div>
              <div className="kpi-label mb-1">Termômetro de Metas</div>
              <div className="font-display text-[22px]" style={{ letterSpacing: "-0.02em" }}>
                Sonhos em progresso
              </div>
            </div>
            <div className="chip"><Target className="w-3 h-3" /> {goals.length} ativas</div>
          </div>
          <div className="space-y-5">
            {goals.map((g) => {
              const p = Math.min(100, (g.current / g.target) * 100);
              return (
                <div key={g.id}>
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="font-semibold text-[14px]" style={{ color: "var(--text-primary)" }}>{g.name}</div>
                    <div className="text-[12px] font-mono-num" style={{ color: "var(--text-secondary)" }}>
                      <span style={{ color: "var(--gold-bright)" }}>{brl(g.current)}</span>
                      <span style={{ color: "var(--text-muted)" }}> / {brl(g.target)}</span>
                    </div>
                  </div>
                  <div className="thermometer">
                    <div className="thermometer-fill" style={{ width: `${p}%` }} />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
                    <span>{g.deadline ? `Prazo: ${new Date(g.deadline).toLocaleDateString("pt-BR")}` : "Sem prazo definido"}</span>
                    <span className="font-mono-num font-semibold" style={{ color: "var(--gold)" }}>{pct(p)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* FIRE Number */}
        <div className="card-gold p-6" data-testid="fire-card">
          <div className="eyebrow mb-3">Número da Liberdade</div>
          <div className="font-display text-[38px] leading-none text-shimmer" style={{ letterSpacing: "-0.03em" }}>
            {brl(numeroLiberdade)}
          </div>
          <p className="text-[12px] mt-3" style={{ color: "var(--text-secondary)" }}>
            Patrimônio necessário para viver de renda a {fire.safeWithdrawal}% ao ano.
          </p>

          <div className="mt-6">
            <div className="flex justify-between text-[11px] mb-2" style={{ color: "var(--text-muted)" }}>
              <span>Você já tem</span>
              <span className="font-mono-num font-semibold" style={{ color: "var(--gold-bright)" }}>{pct(progresso)}</span>
            </div>
            <div className="thermometer"><div className="thermometer-fill" style={{ width: `${progresso}%` }} /></div>
            <div className="mt-2 text-[12px] font-mono-num" style={{ color: "var(--text-secondary)" }}>
              {brl(fire.currentInvested)} <span style={{ color: "var(--text-muted)" }}>de {brl(numeroLiberdade)}</span>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-[var(--ink-line)] space-y-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <div className="flex justify-between"><span>Gasto mensal</span><span className="font-mono-num" style={{ color: "var(--text-primary)" }}>{brl(fire.monthlyExpenses)}</span></div>
            <div className="flex justify-between"><span>Aporte mensal</span><span className="font-mono-num" style={{ color: "var(--text-primary)" }}>{brl(fire.monthlyInvestment)}</span></div>
            <div className="flex justify-between"><span>Retorno esperado</span><span className="font-mono-num" style={{ color: "var(--text-primary)" }}>{fire.annualReturn}% a.a.</span></div>
          </div>
        </div>
      </div>

      {/* Alertas + Regra 50/30/20 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <div className="card-premium p-6" data-testid="regra-503020">
          <div className="kpi-label mb-4">Regra 50 · 30 · 20</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart
                data={[
                  { cat: "Necessidades", ideal: totalReceita * 0.5, real: gastosNec },
                  { cat: "Desejos", ideal: totalReceita * 0.3, real: gastosDes },
                  { cat: "Investimentos", ideal: totalReceita * 0.2, real: investimentos },
                ]}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="cat" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1000).toFixed(1)}k`} />
                <Tooltip content={<TooltipDark />} />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--text-secondary)" }} />
                <Bar dataKey="ideal" name="Ideal" fill="rgba(201,169,97,0.25)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="real" name="Real" fill="var(--gold-bright)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex justify-between text-[12px]" style={{ color: "var(--text-secondary)" }}>
            <span>Taxa de poupança atual</span>
            <span className="font-mono-num font-semibold" style={{ color: "var(--gold-bright)" }}>{pct(taxaPoupanca)}</span>
          </div>
        </div>

        <div className="card-premium p-6" data-testid="alertas">
          <div className="kpi-label mb-4">Alertas Inteligentes</div>
          {needsIncomeSetup ? (
            <div className="p-5 rounded-xl" style={{ background: "rgba(201,169,97,0.08)", border: "1px solid rgba(201,169,97,0.25)" }}>
              <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--gold-bright)" }}>
                Defina sua renda para ativar os alertas
              </div>
              <p className="text-[13px] leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>
                Sem renda e orçamento planejado, não dá para saber se um gasto estourou. Configure no Orçamento 50/30/20.
              </p>
              <button
                type="button"
                className="btn-gold"
                style={{ fontSize: 13, padding: "10px 16px" }}
                onClick={() => nav("/app/orcamento")}
                data-testid="cta-definir-renda"
              >
                Definir renda mensal
              </button>
            </div>
          ) : overspent.length === 0 ? (
            <div className="p-6 text-center">
              <div className="text-[13px]" style={{ color: "var(--success)" }}>Nenhum gasto acima do planejado. Impecável.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {overspent.map((it) => {
                const excesso = it.actual - it.planned;
                const p = it.planned > 0 ? ((excesso / it.planned) * 100).toFixed(0) : "0";
                return (
                  <div
                    key={it.id}
                    className="flex items-center justify-between p-3 rounded-lg"
                    style={{ background: "rgba(212,106,106,0.06)", border: "1px solid rgba(212,106,106,0.2)" }}
                  >
                    <div>
                      <div className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>{it.name}</div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Estourou o planejado em {p}%</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[13px] font-mono-num font-semibold" style={{ color: "var(--danger)" }}>+{brl(excesso)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-5 pt-5 border-t border-[var(--ink-line)]">
            <div className="kpi-label mb-3">Sugestão do Sistema</div>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {needsIncomeSetup
                ? "Primeiro passo: informe sua renda líquida. Depois o sistema monta a regra 50/30/20 e as sugestões passam a fazer sentido."
                : saldo > 0
                  ? <>Redirecionar {brl(Math.min(saldo, 500))} do saldo deste mês para <span style={{ color: "var(--gold-bright)" }} className="font-semibold">Reserva de Emergência</span> ajuda a acelerar sua primeira meta financeira.</>
                  : totalGastos > 0
                    ? "Seu mês está no vermelho agora. Revise desejos no Orçamento e priorize o essencial antes de aumentar aportes."
                    : "Comece registrando gastos no app ou pelo WhatsApp. Com dados reais, as sugestões ficam precisas."}
            </p>
          </div>
        </div>
      </div>

      {showShare && (
        <ShareStory
          onClose={() => setShowShare(false)}
          stats={{
            investido: investimentos,
            saldo: saldo,
            taxaPoupanca: taxaPoupanca,
            metas: goals.length,
            fireProgress: progresso,
            pct: {
              n: totalReceita > 0 ? (gastosNec / totalReceita) * 100 : 0,
              d: totalReceita > 0 ? (gastosDes / totalReceita) * 100 : 0,
              i: totalReceita > 0 ? (investimentos / totalReceita) * 100 : 0,
            },
          }}
        />
      )}
    </div>
  );
}
