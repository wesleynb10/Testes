import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { brl } from "@/lib/format";
import {
  ChevronRight,
  Check,
  Gem,
  Sparkles,
  Zap,
  Shield,
  Star,
  Award,
  TrendingUp,
  Users,
  Lock,
  Clock,
  Play,
  X,
} from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PAINS = [
  "Você chega no fim do mês e não sabe pra onde foi o dinheiro.",
  "Vive no vermelho, pagando juros absurdos de cartão e cheque especial.",
  "Sabe que precisa investir mas não faz ideia por onde começar.",
  "Tem sonhos grandes (casa, viagem, aposentadoria) que parecem impossíveis.",
  "Já tentou planilhas de Excel e desistiu — chatas, complicadas, sem visual.",
];

const SOLUTIONS = [
  { icon: TrendingUp, title: "Dashboard Executivo", desc: "Visão 360° do seu mês em uma tela. Igual ao de um investidor profissional." },
  { icon: Zap, title: "Regra 50/30/20 Automática", desc: "Sistema divide seu dinheiro entre Necessidades, Desejos e Investimentos automaticamente." },
  { icon: Shield, title: "Simulador Bola de Neve", desc: "Descubra a data exata em que você fica livre das dívidas — e economize milhares em juros." },
  { icon: Award, title: "Número da Liberdade", desc: "Calcule quanto você precisa para viver de renda passiva. Sua aposentadoria antecipada começa aqui." },
];

const BONUSES = [
  { title: "Calculadora de Juros Compostos Premium", value: 47 },
  { title: "Minicurso 1º Milhão em 7 Passos", value: 197 },
  { title: "E-book As 30 Perguntas dos Ricos", value: 37 },
  { title: "Simulador de Aposentadoria Antecipada", value: 57 },
  { title: "Guia dos 10 Livros que Mudam Sua Vida", value: 27 },
  { title: "Comunidade Privada no Telegram", value: 97 },
];

const TESTIMONIALS = [
  { name: "Marina S., 32", role: "Analista, SP", text: "Em 4 meses saí do vermelho e comecei a investir R$ 800 por mês. O simulador de dívidas me mostrou que economizei R$ 3.400 em juros." },
  { name: "Rafael T., 41", role: "Autônomo, RJ", text: "Nunca fui bom com Excel. O FinPremium é intuitivo, bonito e me deu clareza que 15 anos de tentativa e erro não deram." },
  { name: "Camila L., 28", role: "Servidora, MG", text: "O 'Número da Liberdade' me deu um choque produtivo. Descobri que com R$ 900/mês investidos eu me aposento com 47 anos." },
];

const FAQ = [
  { q: "Funciona em Mac, Windows e celular?", a: "Sim. É 100% web — abre em qualquer navegador moderno, incluindo smartphone. Não precisa instalar nada." },
  { q: "E se eu não entender de Excel?", a: "Perfeito, esse é o público. O FinPremium foi feito pra ser MAIS SIMPLES que Excel. Você preenche os campos e o sistema faz todo o cálculo automaticamente." },
  { q: "Recebo atualizações?", a: "Sim, todas as futuras atualizações da plataforma são inclusas no seu acesso vitalício sem custo adicional." },
  { q: "E se eu não gostar?", a: "Você tem 7 dias de garantia incondicional. Se não gostar por qualquer motivo, devolvemos 100% do valor sem perguntas." },
  { q: "Meus dados ficam seguros?", a: "Sim. Todos os dados são salvos no seu próprio navegador — nós não temos acesso a nada. Você tem controle total." },
  { q: "Preciso pagar mensalidade?", a: "Não. Pagamento único, acesso vitalício. Sem taxas escondidas, sem renovação." },
];

function PackageCard({ pkg, featured, onSelect, loading }) {
  return (
    <div
      className={`card-premium p-8 flex flex-col relative fade-up ${featured ? "card-gold" : ""}`}
      style={{
        border: featured ? "2px solid var(--gold)" : "1px solid var(--ink-line)",
        transform: featured ? "scale(1.02)" : "none",
      }}
      data-testid={`pkg-${pkg.id}`}
    >
      {featured && (
        <div
          className="absolute -top-3 left-1/2 -translate-x-1/2 chip gold"
          style={{ padding: "6px 14px", fontSize: 11 }}
        >
          <Star className="w-3 h-3" /> Mais escolhido
        </div>
      )}
      <div className="text-center">
        <div className="text-[13px] font-semibold uppercase tracking-[0.14em] mb-2" style={{ color: featured ? "var(--gold-bright)" : "var(--text-secondary)" }}>
          {pkg.name}
        </div>
        <div className="mt-4 mb-2">
          <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>R$</span>
          <span className="font-display text-[64px] font-mono-num" style={{ letterSpacing: "-0.04em", color: featured ? "var(--gold-bright)" : "var(--text-primary)" }}>
            {pkg.amount.toFixed(0)}
          </span>
          <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>,00</span>
        </div>
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Pagamento único · Acesso vitalício
        </div>
        <p className="mt-5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {pkg.description}
        </p>
      </div>
      <button
        data-testid={`btn-buy-${pkg.id}`}
        onClick={() => onSelect(pkg.id)}
        disabled={loading}
        className={featured ? "btn-gold" : "btn-ghost"}
        style={{ marginTop: 24, opacity: loading ? 0.5 : 1, display: "flex", justifyContent: "center", alignItems: "center", gap: 8 }}
      >
        {loading ? "Redirecionando..." : "Quero esse plano"}
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function SalesPage() {
  const nav = useNavigate();
  const [packages, setPackages] = useState({});
  const [loading, setLoading] = useState(null);
  const [email, setEmail] = useState("");
  const [openFaq, setOpenFaq] = useState(null);
  const [timeLeft, setTimeLeft] = useState({ h: 47, m: 59, s: 59 });

  useEffect(() => {
    axios.get(`${API}/packages`).then((r) => setPackages(r.data)).catch(() => {});
  }, []);

  // Countdown timer (48h)
  useEffect(() => {
    const t = setInterval(() => {
      setTimeLeft((prev) => {
        let { h, m, s } = prev;
        s--;
        if (s < 0) { s = 59; m--; }
        if (m < 0) { m = 59; h--; }
        if (h < 0) { h = 47; m = 59; s = 59; }
        return { h, m, s };
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const totalBonusValue = BONUSES.reduce((s, b) => s + b.value, 0);

  const handleBuy = async (packageId) => {
    setLoading(packageId);
    try {
      const { data } = await axios.post(`${API}/checkout/session`, {
        package_id: packageId,
        origin_url: window.location.origin,
        email: email || null,
      });
      window.location.href = data.url;
    } catch (e) {
      alert("Erro ao iniciar checkout. Tente novamente.");
      console.error(e);
      setLoading(null);
    }
  };

  const scrollToPricing = () => {
    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="grain min-h-screen" data-testid="sales-page">
      {/* HEADER */}
      <header className="border-b border-[var(--ink-line)] sticky top-0 z-40" style={{ background: "rgba(7,6,10,0.85)", backdropFilter: "blur(16px)" }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))" }}>
              <Gem className="w-4 h-4" style={{ color: "var(--ink-void)" }} />
            </div>
            <div>
              <div className="font-display text-[18px] leading-none">FinPremium</div>
              <div className="text-[9px] uppercase tracking-[0.24em]" style={{ color: "var(--gold)" }}>Wealth OS</div>
            </div>
          </div>
          <button data-testid="header-cta" onClick={scrollToPricing} className="btn-gold" style={{ padding: "8px 20px", fontSize: 13 }}>
            Quero começar
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center" data-testid="hero-section">
        <div className="eyebrow mb-4 fade-up">Sistema de gestão financeira · Premium Edition</div>
        <h1 className="font-display text-[68px] leading-[1.02] max-w-4xl mx-auto fade-up" style={{ letterSpacing: "-0.03em" }}>
          Do caos financeiro ao <span className="text-shimmer">controle absoluto</span> em 30 dias.
        </h1>
        <p className="mt-8 text-[17px] max-w-2xl mx-auto fade-up" style={{ color: "var(--text-secondary)" }}>
          O dashboard financeiro premium que <strong style={{ color: "var(--gold-bright)" }}>+3.000 brasileiros</strong> estão usando para sair das dívidas, começar a investir e planejar a liberdade financeira. Sem planilha chata, sem curso de 40 horas.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4 flex-wrap fade-up">
          <button data-testid="hero-cta" onClick={scrollToPricing} className="btn-gold" style={{ fontSize: 15, padding: "14px 28px" }}>
            Ver planos <ChevronRight className="w-4 h-4 inline ml-1" />
          </button>
          <button onClick={() => nav("/calculadora")} className="btn-ghost" data-testid="try-calc" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Play className="w-4 h-4" /> Testar calculadora grátis
          </button>
        </div>
        <div className="mt-8 flex items-center justify-center gap-6 text-[11px] flex-wrap" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} /> 7 dias de garantia</span>
          <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} /> Pagamento seguro Stripe</span>
          <span className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} /> +3.000 alunos ativos</span>
        </div>
      </section>

      {/* PAINS */}
      <section className="max-w-4xl mx-auto px-6 py-16" data-testid="pains-section">
        <div className="eyebrow mb-4 text-center">Você se identifica?</div>
        <h2 className="font-display text-[38px] text-center mb-10" style={{ letterSpacing: "-0.03em" }}>
          Se pelo menos <span className="text-shimmer">2 destes 5</span> pontos são você...
        </h2>
        <div className="space-y-3">
          {PAINS.map((p, i) => (
            <div key={i} className="card-premium p-5 flex items-start gap-4 fade-up">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-display font-semibold"
                style={{ background: "rgba(212,106,106,0.12)", color: "var(--danger)", border: "1px solid rgba(212,106,106,0.3)" }}
              >
                {i + 1}
              </div>
              <p className="text-[15px] pt-1" style={{ color: "var(--text-primary)" }}>{p}</p>
            </div>
          ))}
        </div>
        <div className="text-center mt-10">
          <p className="font-display text-[24px]" style={{ color: "var(--gold-bright)", letterSpacing: "-0.02em" }}>
            ...o FinPremium foi feito exatamente pra você.
          </p>
        </div>
      </section>

      {/* SOLUTIONS */}
      <section className="max-w-6xl mx-auto px-6 py-16" data-testid="solutions-section">
        <div className="text-center mb-12">
          <div className="eyebrow mb-3">A solução</div>
          <h2 className="font-display text-[44px]" style={{ letterSpacing: "-0.03em" }}>
            4 pilares que <span className="text-shimmer">transformam</span> sua vida financeira.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SOLUTIONS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="card-premium p-6 fade-up">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: "linear-gradient(135deg, rgba(201,169,97,0.15), rgba(139,122,62,0.05))", border: "1px solid rgba(201,169,97,0.25)" }}
                >
                  <Icon className="w-5 h-5" style={{ color: "var(--gold-bright)" }} strokeWidth={1.75} />
                </div>
                <h3 className="font-display text-[22px] mb-2" style={{ letterSpacing: "-0.02em" }}>{s.title}</h3>
                <p className="text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>{s.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* SOCIAL PROOF */}
      <section className="max-w-6xl mx-auto px-6 py-16" data-testid="testimonials-section">
        <div className="text-center mb-12">
          <div className="eyebrow mb-3">Depoimentos</div>
          <h2 className="font-display text-[38px]" style={{ letterSpacing: "-0.03em" }}>Quem já entrou não sai mais.</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <div key={i} className="card-premium p-6 fade-up">
              <div className="flex gap-1 mb-4">
                {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-current" style={{ color: "var(--gold-bright)" }} />)}
              </div>
              <p className="text-[14px] leading-relaxed italic mb-4" style={{ color: "var(--text-primary)" }}>
                “{t.text}”
              </p>
              <div className="pt-4 border-t border-[var(--ink-line)]">
                <div className="font-semibold text-[13px]">{t.name}</div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BONUSES */}
      <section className="max-w-5xl mx-auto px-6 py-16" data-testid="bonuses-section">
        <div className="text-center mb-8">
          <div className="chip gold" style={{ padding: "6px 14px", fontSize: 11 }}>
            <Sparkles className="w-3 h-3" /> Bônus exclusivos
          </div>
          <h2 className="font-display text-[42px] mt-4" style={{ letterSpacing: "-0.03em" }}>
            <span className="line-through" style={{ color: "var(--text-muted)" }}>R$ {totalBonusValue}</span> <br />
            <span className="text-shimmer">Grátis</span> se você entrar hoje.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {BONUSES.map((b, i) => (
            <div key={i} className="card-premium p-4 flex items-center gap-4 fade-up">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))" }}>
                <Check className="w-4 h-4" style={{ color: "var(--ink-void)" }} strokeWidth={3} />
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>{b.title}</div>
              </div>
              <div className="text-right">
                <div className="text-[11px] line-through" style={{ color: "var(--text-muted)" }}>R$ {b.value}</div>
                <div className="text-[12px] font-semibold" style={{ color: "var(--gold-bright)" }}>Grátis</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* URGENCY BAR */}
      <section className="max-w-4xl mx-auto px-6 py-8" data-testid="urgency">
        <div className="card-gold p-6 text-center">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Clock className="w-4 h-4" style={{ color: "var(--gold-bright)" }} />
            <div className="eyebrow" style={{ margin: 0 }}>Oferta especial encerra em</div>
          </div>
          <div className="flex items-center justify-center gap-4 font-mono-num font-display" style={{ fontSize: 42, letterSpacing: "-0.03em" }}>
            <div>
              <div className="text-shimmer">{String(timeLeft.h).padStart(2, "0")}</div>
              <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>horas</div>
            </div>
            <div style={{ color: "var(--text-muted)" }}>:</div>
            <div>
              <div className="text-shimmer">{String(timeLeft.m).padStart(2, "0")}</div>
              <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>min</div>
            </div>
            <div style={{ color: "var(--text-muted)" }}>:</div>
            <div>
              <div className="text-shimmer">{String(timeLeft.s).padStart(2, "0")}</div>
              <div className="text-[10px] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>seg</div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 py-16" data-testid="pricing-section">
        <div className="text-center mb-12">
          <div className="eyebrow mb-3">Escolha seu plano</div>
          <h2 className="font-display text-[46px]" style={{ letterSpacing: "-0.03em" }}>
            Investimento único. <span className="text-shimmer">Retorno vitalício.</span>
          </h2>
        </div>

        <div className="max-w-md mx-auto mb-8">
          <label className="text-[11px] uppercase tracking-[0.14em] block mb-2" style={{ color: "var(--text-muted)" }}>
            Seu melhor email (opcional)
          </label>
          <input
            data-testid="checkout-email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-premium"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {Object.entries(packages).map(([id, pkg]) => (
            <PackageCard key={id} pkg={pkg} featured={id === "complete"} onSelect={handleBuy} loading={loading === id} />
          ))}
        </div>

        <div className="mt-10 text-center">
          <div className="chip" style={{ padding: "8px 16px" }}>
            <Shield className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />
            Garantia incondicional de 7 dias · devolvemos 100% sem perguntas
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-16" data-testid="faq-section">
        <div className="text-center mb-10">
          <div className="eyebrow mb-3">Dúvidas frequentes</div>
          <h2 className="font-display text-[38px]" style={{ letterSpacing: "-0.03em" }}>Antes de decidir, saiba isto.</h2>
        </div>
        <div className="space-y-3">
          {FAQ.map((f, i) => (
            <div key={i} className="card-premium overflow-hidden">
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full p-5 text-left flex items-center justify-between"
                data-testid={`faq-${i}`}
              >
                <span className="font-semibold text-[15px]" style={{ color: "var(--text-primary)" }}>{f.q}</span>
                <ChevronRight className={`w-4 h-4 transition-transform ${openFaq === i ? "rotate-90" : ""}`} style={{ color: "var(--gold)" }} />
              </button>
              {openFaq === i && (
                <div className="px-5 pb-5 text-[14px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {f.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="max-w-4xl mx-auto px-6 py-16" data-testid="final-cta">
        <div className="card-gold p-10 text-center">
          <Award className="w-10 h-10 mx-auto mb-4" style={{ color: "var(--gold-bright)" }} />
          <h2 className="font-display text-[42px] mb-4 text-shimmer" style={{ letterSpacing: "-0.03em" }}>
            A decisão que separa você da liberdade financeira.
          </h2>
          <p className="text-[15px] mb-8 max-w-lg mx-auto" style={{ color: "var(--text-secondary)" }}>
            Você pode fechar essa página e continuar exatamente onde está. Ou clicar no botão abaixo e mudar sua história financeira em 30 dias.
          </p>
          <button onClick={scrollToPricing} className="btn-gold" data-testid="final-cta-btn" style={{ fontSize: 16, padding: "16px 36px" }}>
            Ver planos agora <ChevronRight className="w-4 h-4 inline ml-1" />
          </button>
          <div className="mt-5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            🔒 Pagamento seguro Stripe · 7 dias de garantia
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--ink-line)] py-8 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
        FinPremium · Wealth OS · © 2026 · <button onClick={() => nav("/")} className="underline">Voltar ao app</button>
      </footer>
    </div>
  );
}
