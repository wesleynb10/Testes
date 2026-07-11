import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { brl } from "@/lib/format";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Sparkles, ChevronRight, Gem, Mail, TrendingUp } from "lucide-react";

export default function Calculator() {
  const nav = useNavigate();
  const [initial, setInitial] = useState(1000);
  const [monthly, setMonthly] = useState(500);
  const [years, setYears] = useState(20);
  const [rate, setRate] = useState(0.9); // % ao mês
  const [showLead, setShowLead] = useState(false);
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  const projection = useMemo(() => {
    const r = rate / 100;
    const months = years * 12;
    const data = [];
    let balance = initial;
    let contributed = initial;
    for (let m = 0; m <= months; m++) {
      if (m > 0) {
        balance = balance * (1 + r) + monthly;
        contributed += monthly;
      }
      if (m % 12 === 0) {
        data.push({
          ano: m / 12,
          patrimonio: Math.round(balance),
          investido: Math.round(contributed),
          juros: Math.round(balance - contributed),
        });
      }
    }
    return data;
  }, [initial, monthly, years, rate]);

  const final = projection[projection.length - 1];
  const totalJuros = final ? final.juros : 0;
  const totalInvestido = final ? final.investido : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email && email.includes("@")) {
      // Store lead in localStorage (in real app, POST to backend/CRM)
      const leads = JSON.parse(localStorage.getItem("finpremium_leads") || "[]");
      leads.push({ email, date: new Date().toISOString(), source: "calculadora" });
      localStorage.setItem("finpremium_leads", JSON.stringify(leads));
      setSubscribed(true);
    }
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div
        style={{
          background: "rgba(7,6,10,0.95)",
          border: "1px solid var(--ink-line)",
          borderRadius: 10,
          padding: "10px 14px",
          fontSize: 12,
        }}
      >
        <div style={{ color: "var(--gold-bright)", fontWeight: 600, marginBottom: 4 }}>Ano {label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ width: 8, height: 8, background: p.color, borderRadius: 2 }} />
            <span style={{ color: "var(--text-secondary)" }}>{p.name}:</span>
            <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{brl(p.value)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="grain min-h-screen" data-testid="calculator-page">
      {/* Public header */}
      <header className="border-b border-[var(--ink-line)]" style={{ background: "rgba(11,10,15,0.6)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))" }}
            >
              <Gem className="w-4 h-4" style={{ color: "var(--ink-void)" }} />
            </div>
            <div>
              <div className="font-display text-[18px] leading-none">FinPremium</div>
              <div className="text-[9px] uppercase tracking-[0.24em]" style={{ color: "var(--gold)" }}>Wealth OS</div>
            </div>
          </div>
          <button onClick={() => nav("/")} className="btn-ghost" data-testid="back-to-app">
            Voltar ao app
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12 fade-up">
          <div className="eyebrow mb-4">Calculadora gratuita · Sem cadastro</div>
          <h1 className="font-display text-[52px] leading-[1.05] mb-4" style={{ letterSpacing: "-0.03em" }}>
            Quanto <span className="text-shimmer">R$ {monthly}/mês</span> vira <br />
            em {years} anos?
          </h1>
          <p className="text-[16px] max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
            Descubra o poder dos juros compostos. Ajuste os valores abaixo e veja seu patrimônio crescer em tempo real.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inputs */}
          <div className="card-premium p-6 space-y-5 lg:col-span-1" data-testid="calculator-inputs">
            <div>
              <label className="text-[11px] uppercase tracking-[0.14em] block mb-2" style={{ color: "var(--text-muted)" }}>
                Aporte inicial
              </label>
              <input
                data-testid="calc-initial"
                type="number"
                value={initial}
                onChange={(e) => setInitial(Number(e.target.value) || 0)}
                className="input-premium font-mono-num font-display text-[22px]"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.14em] block mb-2" style={{ color: "var(--text-muted)" }}>
                Aporte mensal
              </label>
              <input
                data-testid="calc-monthly"
                type="number"
                value={monthly}
                onChange={(e) => setMonthly(Number(e.target.value) || 0)}
                className="input-premium font-mono-num font-display text-[22px]"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.14em] block mb-2 flex justify-between" style={{ color: "var(--text-muted)" }}>
                <span>Período (anos)</span>
                <span className="font-mono-num" style={{ color: "var(--gold-bright)" }}>{years}</span>
              </label>
              <input
                data-testid="calc-years"
                type="range"
                min="1"
                max="40"
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--gold)" }}
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.14em] block mb-2 flex justify-between" style={{ color: "var(--text-muted)" }}>
                <span>Rendimento (% ao mês)</span>
                <span className="font-mono-num" style={{ color: "var(--gold-bright)" }}>{rate.toFixed(2)}%</span>
              </label>
              <input
                data-testid="calc-rate"
                type="range"
                min="0.1"
                max="2"
                step="0.05"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--gold)" }}
              />
              <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                Referências: Selic {(rate * 12).toFixed(1)}% a.a. · CDI ~1% a.m. · Ações ~1.2% a.m.
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card-gold p-8 text-center" data-testid="calc-result">
              <div className="eyebrow mb-2">Em {years} anos, você terá</div>
              <div className="font-display text-[56px] leading-none text-shimmer" style={{ letterSpacing: "-0.03em" }}>
                {brl(final?.patrimonio || 0)}
              </div>
              <div className="grid grid-cols-2 gap-6 mt-8 pt-6 border-t border-[rgba(201,169,97,0.25)]">
                <div>
                  <div className="kpi-label mb-1">Você investiu</div>
                  <div className="font-display text-[22px] font-mono-num" style={{ color: "var(--text-primary)" }}>
                    {brl(totalInvestido)}
                  </div>
                </div>
                <div>
                  <div className="kpi-label mb-1">Juros ganhos</div>
                  <div className="font-display text-[22px] font-mono-num" style={{ color: "var(--success)" }}>
                    {brl(totalJuros)}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: "var(--text-muted)" }}>
                    ({totalInvestido > 0 ? ((totalJuros / totalInvestido) * 100).toFixed(0) : 0}% do que aportou)
                  </div>
                </div>
              </div>
            </div>

            <div className="card-premium p-6">
              <div className="kpi-label mb-3">Evolução do patrimônio</div>
              <div style={{ height: 260 }}>
                <ResponsiveContainer>
                  <AreaChart data={projection}>
                    <defs>
                      <linearGradient id="grad-p" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E8CE87" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#E8CE87" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="grad-i" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7A9AB8" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#7A9AB8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="ano" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="investido" stroke="#7A9AB8" strokeWidth={2} fill="url(#grad-i)" name="Investido" />
                    <Area type="monotone" dataKey="patrimonio" stroke="#E8CE87" strokeWidth={2.5} fill="url(#grad-p)" name="Patrimônio" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex gap-4 text-[11px] mt-2 justify-center" style={{ color: "var(--text-secondary)" }}>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#E8CE87" }} /> Patrimônio total
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: "#7A9AB8" }} /> Total investido
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Lead capture */}
        <div className="mt-12 card-gold p-8 fade-up" data-testid="lead-magnet">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4" style={{ color: "var(--gold-bright)" }} />
                <div className="eyebrow">Bônus grátis</div>
              </div>
              <h3 className="font-display text-[28px] mb-3 text-shimmer" style={{ letterSpacing: "-0.03em" }}>
                Receba o simulador em PDF + planilha de bônus
              </h3>
              <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
                Enviamos direto no seu email: relatório personalizado + planilha de juros compostos + 7 dicas de investimento.
              </p>
            </div>
            {!subscribed ? (
              <form onSubmit={handleSubmit} className="space-y-3" data-testid="lead-form">
                <input
                  data-testid="lead-email"
                  type="email"
                  required
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-premium"
                  style={{ fontSize: 16, padding: "14px 16px" }}
                />
                <button
                  data-testid="lead-submit"
                  type="submit"
                  className="btn-gold w-full"
                  style={{ padding: "14px 20px", fontSize: 15, display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}
                >
                  <Mail className="w-4 h-4" /> Quero receber grátis
                </button>
                <div className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
                  🔒 Sem spam. Cancele quando quiser.
                </div>
              </form>
            ) : (
              <div className="text-center py-6" data-testid="lead-success">
                <div
                  className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))" }}
                >
                  <Sparkles className="w-6 h-6" style={{ color: "var(--ink-void)" }} />
                </div>
                <div className="font-display text-[22px] mb-1">Enviado!</div>
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  Confira sua caixa de entrada em 2 minutos.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* CTA to full app */}
        <div className="mt-12 text-center card-premium p-10" data-testid="cta-app">
          <TrendingUp className="w-8 h-8 mx-auto mb-4" style={{ color: "var(--gold-bright)" }} />
          <h3 className="font-display text-[32px] mb-3" style={{ letterSpacing: "-0.03em" }}>
            Gostou? Isso é apenas <span className="text-shimmer">1% do que o app faz.</span>
          </h3>
          <p className="text-[14px] mb-6 max-w-lg mx-auto" style={{ color: "var(--text-secondary)" }}>
            Dashboard executivo, orçamento inteligente, simulador de dívidas e Número da Liberdade. Tudo em Dark Mode Premium.
          </p>
          <button onClick={() => nav("/")} className="btn-gold" data-testid="explore-app-btn">
            Explorar o FinPremium <ChevronRight className="w-4 h-4 inline ml-1" />
          </button>
        </div>
      </main>

      <footer className="border-t border-[var(--ink-line)] py-6 mt-12 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
        FinPremium · Wealth OS · © 2026
      </footer>
    </div>
  );
}
