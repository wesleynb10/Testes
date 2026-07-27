import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFinance } from "@/context/FinanceContext";
import { brl, brlShort, parseNum } from "@/lib/format";
import { deriveBaseline, buildProjection, summarizeProjection, expandEvents } from "@/lib/projection";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  TrendingUp,
  ArrowRight,
  Plus,
  Trash2,
  CalendarClock,
  Wallet,
  AlertTriangle,
  Sparkles,
  Repeat,
} from "lucide-react";

const STORAGE_KEY = "finpremium_projection_v1";
const HORIZONS = [6, 12, 24];

const DEFAULT_SETTINGS = {
  horizon: 12,
  startingCash: 0,
  incomeGrowthAnnual: 0,
  expenseGrowthAnnual: 0,
  events: [],
  auto13: true,
  auto13Mode: "split",
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      events: Array.isArray(parsed.events) ? parsed.events : [],
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function monthLabel(offset) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + (offset - 1), 1);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" })
    .format(d)
    .replace(".", "");
}

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
      {label && (
        <div style={{ color: "var(--gold-bright)", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      )}
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

function StatCard({ label, value, tone = "default", icon: Icon, hint }) {
  return (
    <div className="card-premium p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="kpi-label">{label}</div>
        {Icon && (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(201,169,97,0.1)", border: "1px solid rgba(201,169,97,0.2)" }}
          >
            <Icon className="w-4 h-4" style={{ color: "var(--gold-bright)" }} strokeWidth={1.75} />
          </div>
        )}
      </div>
      <div className={`kpi-value ${tone}`} style={{ fontSize: 26 }}>{value}</div>
      {hint && (
        <div className="text-[12px] mt-2" style={{ color: "var(--text-muted)" }}>{hint}</div>
      )}
    </div>
  );
}

export default function Projection() {
  const nav = useNavigate();
  const { state } = useFinance();
  const [settings, setSettings] = useState(loadSettings);
  const [newEvent, setNewEvent] = useState({ month: 1, label: "", amount: "", type: "out", recurring: false });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore quota / private mode */
    }
  }, [settings]);

  const baseline = useMemo(() => deriveBaseline(state), [state]);
  const debts = useMemo(() => state?.debts || [], [state]);
  const creditInsight = useMemo(() => state?.creditInsight || {}, [state?.creditInsight]);
  const curvaScr = useMemo(
    () => (creditInsight.curva_vencimentos || []).filter((p) => Number(p?.valor || 0) > 0 || Number(p?.acumulado || 0) > 0),
    [creditInsight]
  );
  const curvaChart = useMemo(
    () =>
      (creditInsight.curva_vencimentos || []).map((p) => ({
        faixa: p.label || p.chave,
        Faixa: Math.round(Number(p.valor) || 0),
        Acumulado: Math.round(Number(p.acumulado) || 0),
      })),
    [creditInsight]
  );

  const expandedEvents = useMemo(
    () =>
      expandEvents({
        events: settings.events,
        horizon: settings.horizon,
        startMonthIndex: new Date().getMonth(),
        income: baseline.income,
        auto13: settings.auto13,
        auto13Mode: settings.auto13Mode,
      }),
    [settings.events, settings.horizon, settings.auto13, settings.auto13Mode, baseline.income]
  );

  const rows = useMemo(
    () =>
      buildProjection({
        income: baseline.income,
        monthlyExpenses: baseline.monthlyExpenses,
        monthlyInvest: baseline.monthlyInvest,
        debts,
        horizon: settings.horizon,
        startingCash: parseNum(settings.startingCash),
        incomeGrowthAnnual: parseNum(settings.incomeGrowthAnnual),
        expenseGrowthAnnual: parseNum(settings.expenseGrowthAnnual),
        events: expandedEvents,
      }),
    [baseline, debts, settings, expandedEvents]
  );

  const insights = useMemo(() => summarizeProjection(rows, debts), [rows, debts]);

  const chartData = rows.map((r) => ({
    mes: monthLabel(r.month),
    Entradas: Math.round(r.entradas),
    Saídas: Math.round(r.saidas),
    Caixa: Math.round(r.cash),
  }));

  const hasIncome = baseline.income > 0;

  const setField = (key) => (e) => setSettings((s) => ({ ...s, [key]: e.target.value }));

  const addEvent = () => {
    const amountRaw = parseNum(newEvent.amount);
    if (!amountRaw) return;
    const signed = newEvent.type === "in" ? Math.abs(amountRaw) : -Math.abs(amountRaw);
    setSettings((s) => ({
      ...s,
      events: [
        ...s.events,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          month: Number(newEvent.month) || 1,
          label: newEvent.label.trim() || (newEvent.type === "in" ? "Entrada" : "Saída"),
          amount: signed,
          recurring: !!newEvent.recurring,
        },
      ],
    }));
    setNewEvent({ month: 1, label: "", amount: "", type: "out", recurring: false });
  };

  const removeEvent = (id) =>
    setSettings((s) => ({ ...s, events: s.events.filter((e) => e.id !== id) }));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-full overflow-x-hidden" data-testid="projection-page">
      <header>
        <div className="eyebrow mb-3">Fluxo de Caixa · Olhe para frente</div>
        <h1 className="h-display">
          Para onde seu dinheiro <span className="text-shimmer">está indo?</span>
        </h1>
        <p className="mt-3 text-[15px] max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          Projeção dos próximos meses com base na sua renda, orçamento e dívidas. Veja quando as
          parcelas terminam, quanto de caixa você acumula e simule eventos futuros (13º, IPVA, viagem).
        </p>
      </header>

      {!hasIncome && (
        <div
          className="card-premium p-5 flex items-start gap-4 flex-wrap"
          style={{ borderColor: "rgba(201,169,97,0.3)" }}
        >
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(201,169,97,0.12)", border: "1px solid rgba(201,169,97,0.25)" }}
          >
            <Sparkles className="w-5 h-5" style={{ color: "var(--gold-bright)" }} />
          </div>
          <div className="flex-1 min-w-[220px]">
            <div className="text-[14px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              Defina sua renda para projetar
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              A projeção usa sua renda mensal e o orçamento 50/30/20. Configure no Orçamento para ver o fluxo.
            </p>
          </div>
          <button
            type="button"
            className="btn-gold"
            style={{ fontSize: 13, padding: "10px 16px" }}
            onClick={() => nav("/app/orcamento")}
          >
            Configurar orçamento
          </button>
        </div>
      )}

      {/* Premissas */}
      <div className="card-premium p-6" data-testid="projection-assumptions">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="kpi-label">Premissas da projeção</div>
          <div className="flex gap-2">
            {HORIZONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setSettings((s) => ({ ...s, horizon: h }))}
                data-testid={`horizon-${h}`}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors"
                style={
                  settings.horizon === h
                    ? { background: "var(--gold-bright)", color: "var(--ink-void)" }
                    : { background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)", border: "1px solid var(--ink-line)" }
                }
              >
                {h} meses
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-[12px] block mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Saldo em caixa hoje
            </label>
            <input
              type="number"
              data-testid="starting-cash"
              className="input-premium font-mono-num"
              value={settings.startingCash}
              onChange={setField("startingCash")}
            />
          </div>
          <div>
            <label className="text-[12px] block mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Reajuste de renda (% ao ano)
            </label>
            <input
              type="number"
              step="0.5"
              data-testid="income-growth"
              className="input-premium font-mono-num"
              value={settings.incomeGrowthAnnual}
              onChange={setField("incomeGrowthAnnual")}
            />
          </div>
          <div>
            <label className="text-[12px] block mb-1.5" style={{ color: "var(--text-secondary)" }}>
              Inflação dos gastos (% ao ano)
            </label>
            <input
              type="number"
              step="0.5"
              data-testid="expense-growth"
              className="input-premium font-mono-num"
              value={settings.expenseGrowthAnnual}
              onChange={setField("expenseGrowthAnnual")}
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          <span>Renda base: <span className="font-mono-num" style={{ color: "var(--text-primary)" }}>{brl(baseline.income)}</span></span>
          <span>Gastos recorrentes: <span className="font-mono-num" style={{ color: "var(--text-primary)" }}>{brl(baseline.monthlyExpenses)}</span></span>
          <span>Aporte mensal: <span className="font-mono-num" style={{ color: "var(--text-primary)" }}>{brl(baseline.monthlyInvest)}</span></span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard
          label="Sobra média / mês"
          value={brl(insights.avgSobra)}
          tone={insights.avgSobra >= 0 ? "success" : "danger"}
          icon={TrendingUp}
          hint="Após gastos, parcelas e aportes"
        />
        <StatCard
          label={`Caixa em ${settings.horizon} meses`}
          value={brl(insights.endCash)}
          tone={insights.endCash >= 0 ? "gold" : "danger"}
          icon={Wallet}
          hint="Saldo acumulado projetado"
        />
        <StatCard
          label="Primeiro mês no vermelho"
          value={insights.firstNegative ? monthLabel(insights.firstNegative) : "Nenhum"}
          tone={insights.firstNegative ? "danger" : "success"}
          icon={AlertTriangle}
          hint={insights.firstNegative ? "Caixa fica negativo" : "Caixa nunca fica negativo"}
        />
        <StatCard
          label="Última dívida quita"
          value={insights.lastDebtPayoff ? monthLabel(insights.lastDebtPayoff.month) : "—"}
          icon={CalendarClock}
          hint={
            insights.lastDebtPayoff
              ? `Libera ${brl(insights.freedByDebts)}/mês`
              : "Sem dívidas no horizonte"
          }
        />
      </div>

      {/* Gráfico */}
      <div className="card-premium p-6" data-testid="projection-chart">
        <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
          <div>
            <div className="kpi-label mb-1">Projeção de fluxo de caixa</div>
            <div className="font-display text-[22px]" style={{ letterSpacing: "-0.02em" }}>
              Próximos {settings.horizon} meses
            </div>
          </div>
          <div className="flex gap-4 text-[11px]">
            <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--gold-bright)" }} /> Entradas
            </span>
            <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--danger)" }} /> Saídas
            </span>
            <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--success)" }} /> Caixa acumulado
            </span>
          </div>
        </div>
        <div style={{ height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="caixaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--success)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="mes" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis
                stroke="var(--text-muted)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => brlShort(v)}
              />
              <Tooltip content={<TooltipDark />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Entradas" fill="var(--gold-bright)" radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Bar dataKey="Saídas" fill="var(--danger)" radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Area
                type="monotone"
                dataKey="Caixa"
                stroke="var(--success)"
                strokeWidth={2.5}
                fill="url(#caixaFill)"
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {insights.lastDebtPayoff && (
          <p className="text-[13px] mt-4" style={{ color: "var(--text-secondary)" }} data-testid="projection-debt-insight">
            <span style={{ color: "var(--gold-bright)" }} className="font-semibold">
              {insights.lastDebtPayoff.name}
            </span>{" "}
            quita em <span className="font-semibold">{monthLabel(insights.lastDebtPayoff.month)}</span>. A partir daí sua
            sobra sobe porque a parcela sai do orçamento.
          </p>
        )}
      </div>

      {curvaScr.length > 0 && (
        <div className="card-premium p-6" data-testid="projection-scr-curve">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
            <div>
              <div className="kpi-label mb-1">Pressão de vencimentos (SCR)</div>
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Quanto do saldo a vencer cai em cada faixa de prazo — não é amortização; é o estoque
                reportado ao BACEN no último import.
              </p>
            </div>
            {creditInsight.divida_atual > 0 && (
              <div className="text-right">
                <div className="kpi-label">Dívida SCR</div>
                <div className="font-mono-num text-[18px]" style={{ color: "var(--gold-bright)" }}>
                  {brl(creditInsight.divida_atual)}
                </div>
              </div>
            )}
          </div>
          <div className="h-56 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={curvaChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="faixa"
                  tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  angle={-20}
                  textAnchor="end"
                  height={48}
                />
                <YAxis
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => brlShort(v)}
                />
                <Tooltip content={<TooltipDark />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Faixa" fill="var(--gold-bright)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Line
                  type="monotone"
                  dataKey="Acumulado"
                  stroke="var(--success)"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "var(--success)" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          {creditInsight.importedAt && (
            <p className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>
              Importado em {new Date(creditInsight.importedAt).toLocaleString("pt-BR")}
              {creditInsight.faixa_risco ? ` · faixa ${creditInsight.faixa_risco}` : ""}
              {creditInsight.quantidade_instituicoes
                ? ` · ${creditInsight.quantidade_instituicoes} instituições`
                : ""}
            </p>
          )}
        </div>
      )}

      {/* Eventos futuros */}
      <div className="card-premium p-6" data-testid="projection-events">
        <div className="kpi-label mb-1">Eventos futuros</div>
        <p className="text-[13px] mb-4" style={{ color: "var(--text-secondary)" }}>
          Entradas ou saídas pontuais: 13º salário, restituição, IPVA, matrícula, viagem. Elas entram na projeção no mês escolhido.
        </p>

        {/* 13º automático */}
        <div
          className="p-4 rounded-xl mb-4 flex items-start gap-4 flex-wrap"
          style={{ background: "rgba(201,169,97,0.05)", border: "1px solid rgba(201,169,97,0.2)" }}
          data-testid="auto13-card"
        >
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              data-testid="auto13-toggle"
              checked={settings.auto13}
              onChange={(e) => setSettings((s) => ({ ...s, auto13: e.target.checked }))}
              style={{ width: 18, height: 18, accentColor: "var(--gold-bright)" }}
            />
            <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
              13º salário automático
            </span>
          </label>
          <div className="flex-1 min-w-[220px]">
            <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Gera o 13º a partir da sua renda ({brl(baseline.income)}) em todo nov/dez dentro do horizonte —
              sem precisar lançar manualmente. Ajuste a divisão ao lado.
            </p>
          </div>
          {settings.auto13 && (
            <select
              className="input-premium"
              data-testid="auto13-mode"
              style={{ width: "auto", minWidth: 190 }}
              value={settings.auto13Mode}
              onChange={(e) => setSettings((s) => ({ ...s, auto13Mode: e.target.value }))}
            >
              <option value="split">Metade nov + metade dez</option>
              <option value="dec">Integral em dezembro</option>
            </select>
          )}
        </div>

        <div className="space-y-2 mb-4">
          {settings.events.length === 0 && (
            <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Nenhum evento adicionado ainda.
            </div>
          )}
          {settings.events
            .slice()
            .sort((a, b) => a.month - b.month)
            .map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--ink-line)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="chip"
                    style={{ fontSize: 11 }}
                  >
                    {monthLabel(e.month)}
                  </span>
                  <span className="truncate text-[13px]" style={{ color: "var(--text-primary)" }}>{e.label}</span>
                  {e.recurring && (
                    <span
                      className="chip gold shrink-0"
                      style={{ fontSize: 10 }}
                      title="Repete todo ano dentro do horizonte"
                    >
                      <Repeat className="w-3 h-3" /> anual
                    </span>
                  )}
                  {e.month > settings.horizon && (
                    <span className="text-[10px] shrink-0" style={{ color: "var(--text-muted)" }}>
                      fora do horizonte
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="font-mono-num font-semibold text-[13px]"
                    style={{ color: e.amount >= 0 ? "var(--success)" : "var(--danger)" }}
                  >
                    {e.amount >= 0 ? "+" : "−"}{brl(Math.abs(e.amount))}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeEvent(e.id)}
                    className="p-1.5 rounded-md"
                    style={{ color: "var(--text-muted)" }}
                    data-testid={`event-remove-${e.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-3">
            <label className="text-[11px] block mb-1.5" style={{ color: "var(--text-muted)" }}>Mês</label>
            <select
              className="input-premium"
              data-testid="event-month"
              value={newEvent.month}
              onChange={(e) => setNewEvent({ ...newEvent, month: Number(e.target.value) })}
            >
              {Array.from({ length: settings.horizon }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-4">
            <label className="text-[11px] block mb-1.5" style={{ color: "var(--text-muted)" }}>Descrição</label>
            <input
              className="input-premium"
              data-testid="event-label"
              placeholder="Ex: 13º salário, IPVA, viagem"
              value={newEvent.label}
              onChange={(e) => setNewEvent({ ...newEvent, label: e.target.value })}
            />
          </div>
          <div className="lg:col-span-2">
            <label className="text-[11px] block mb-1.5" style={{ color: "var(--text-muted)" }}>Tipo</label>
            <select
              className="input-premium"
              data-testid="event-type"
              value={newEvent.type}
              onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value })}
            >
              <option value="out">Saída</option>
              <option value="in">Entrada</option>
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="text-[11px] block mb-1.5" style={{ color: "var(--text-muted)" }}>Valor</label>
            <input
              type="number"
              className="input-premium font-mono-num"
              data-testid="event-amount"
              placeholder="0"
              value={newEvent.amount}
              onChange={(e) => setNewEvent({ ...newEvent, amount: e.target.value })}
            />
          </div>
          <button
            type="button"
            onClick={addEvent}
            data-testid="event-add"
            className="btn-gold lg:col-span-1"
            style={{ display: "flex", justifyContent: "center", padding: "10px" }}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <label className="flex items-center gap-2 mt-3 cursor-pointer w-fit">
          <input
            type="checkbox"
            data-testid="event-recurring"
            checked={newEvent.recurring}
            onChange={(e) => setNewEvent({ ...newEvent, recurring: e.target.checked })}
            style={{ width: 16, height: 16, accentColor: "var(--gold-bright)" }}
          />
          <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            Repete todo ano (ex: IPVA, matrícula, PLR)
          </span>
        </label>
      </div>

      {/* Tabela mês a mês */}
      <div className="card-premium p-6" data-testid="projection-table">
        <div className="kpi-label mb-4">Detalhe mês a mês</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-[11px] uppercase tracking-[0.12em]">
                <th className="text-left py-2 pr-4 font-medium">Mês</th>
                <th className="text-right py-2 px-4 font-medium">Entradas</th>
                <th className="text-right py-2 px-4 font-medium">Gastos</th>
                <th className="text-right py-2 px-4 font-medium">Parcelas</th>
                <th className="text-right py-2 px-4 font-medium">Aporte</th>
                <th className="text-right py-2 px-4 font-medium">Sobra</th>
                <th className="text-right py-2 pl-4 font-medium">Caixa acum.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.month} style={{ borderTop: "1px solid var(--ink-line)" }}>
                  <td className="py-2 pr-4" style={{ color: "var(--text-primary)" }}>{monthLabel(r.month)}</td>
                  <td className="py-2 px-4 text-right font-mono-num" style={{ color: "var(--text-secondary)" }}>{brl(r.entradas)}</td>
                  <td className="py-2 px-4 text-right font-mono-num" style={{ color: "var(--text-secondary)" }}>{brl(r.expensesM + r.eventExpense)}</td>
                  <td className="py-2 px-4 text-right font-mono-num" style={{ color: r.debtM > 0 ? "var(--danger)" : "var(--text-muted)" }}>{brl(r.debtM)}</td>
                  <td className="py-2 px-4 text-right font-mono-num" style={{ color: "var(--text-secondary)" }}>{brl(r.investM)}</td>
                  <td className="py-2 px-4 text-right font-mono-num font-semibold" style={{ color: r.sobra >= 0 ? "var(--success)" : "var(--danger)" }}>{brl(r.sobra)}</td>
                  <td className="py-2 pl-4 text-right font-mono-num font-semibold" style={{ color: r.cash >= 0 ? "var(--gold-bright)" : "var(--danger)" }}>{brl(r.cash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="btn-ghost"
          style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}
          onClick={() => nav("/app/dividas")}
        >
          Ajustar dívidas e aportes <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
