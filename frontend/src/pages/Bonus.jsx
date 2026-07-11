import React, { useState } from "react";
import {
  BookOpen,
  Video,
  Table2,
  Download,
  Lock,
  PlayCircle,
  FileSpreadsheet,
  Sparkles,
  ChevronRight,
  Award,
} from "lucide-react";

const BONUSES = [
  {
    id: "b1",
    icon: FileSpreadsheet,
    tag: "PLANILHA EXTRA",
    title: "Calculadora de Juros Compostos Premium",
    subtitle: "Simule qualquer aporte, prazo e taxa. Descubra quanto R$ 100/mês vira em 30 anos.",
    value: "R$ 47",
    features: ["Cenários otimista/pessimista", "Comparativo Selic × IPCA × CDI", "Gráfico de bola de neve dos juros"],
  },
  {
    id: "b2",
    icon: Video,
    tag: "MINICURSO EM VÍDEO",
    title: "1ª Milhão em 7 Passos (aula gravada)",
    subtitle: "Aula executiva de 42 min mostrando o passo-a-passo real de quem chegou lá.",
    value: "R$ 197",
    features: ["7 vídeos objetivos", "Plano de ação semanal", "Certificado de conclusão"],
  },
  {
    id: "b3",
    icon: BookOpen,
    tag: "E-BOOK",
    title: "As 30 Perguntas que Todo Rico Faz Antes de Investir",
    subtitle: "Roteiro de decisão que os grandes gestores usam antes de qualquer aporte.",
    value: "R$ 37",
    features: ["30 perguntas categorizadas", "Templates prontos", "Checklist de due diligence"],
  },
  {
    id: "b4",
    icon: Table2,
    tag: "PLANILHA EXTRA",
    title: "Simulador de Aposentadoria Antecipada",
    subtitle: "Descubra em quantos anos você pode se aposentar considerando seus aportes atuais.",
    value: "R$ 57",
    features: ["Cálculo por regra dos 4%, 3.5% e 3%", "Ajuste por inflação", "Cenários com/sem previdência"],
  },
  {
    id: "b5",
    icon: Video,
    tag: "MINICURSO EM VÍDEO",
    title: "Como Sair das Dívidas em 12 Meses",
    subtitle: "Estratégia comprovada usada por 3.000+ alunos que quitaram cartão de crédito no vermelho.",
    value: "R$ 147",
    features: ["Negociação com bancos", "Roteiro para renegociar", "Bola de neve na prática"],
  },
  {
    id: "b6",
    icon: BookOpen,
    tag: "GUIA PDF",
    title: "Os 10 Livros que Mudam Sua Relação com Dinheiro",
    subtitle: "Lista curada + resumo executivo de cada livro. Economize 3 anos de leitura.",
    value: "R$ 27",
    features: [
      "Pai Rico, Pai Pobre — resumo essencial",
      "O Homem Mais Rico da Babilônia — 7 leis",
      "The Psychology of Money — os 20 erros",
      "Investidor Inteligente — margem de segurança",
      "+ 6 outros títulos essenciais",
    ],
  },
];

const RECOMMENDED_BOOKS = [
  { title: "Pai Rico, Pai Pobre", author: "Robert Kiyosaki", tag: "Mindset" },
  { title: "O Homem Mais Rico da Babilônia", author: "George S. Clason", tag: "Fundamentos" },
  { title: "The Psychology of Money", author: "Morgan Housel", tag: "Comportamento" },
  { title: "O Investidor Inteligente", author: "Benjamin Graham", tag: "Investimentos" },
  { title: "Casais Inteligentes Enriquecem Juntos", author: "Gustavo Cerbasi", tag: "Finanças a dois" },
  { title: "Do Mil ao Milhão", author: "Thiago Nigro", tag: "Nacional" },
];

export default function Bonus() {
  const [expanded, setExpanded] = useState(null);
  const totalValue = BONUSES.reduce((s, b) => s + parseInt(b.value.replace(/\D/g, "")), 0);

  return (
    <div className="p-8 space-y-8" data-testid="bonus-page">
      <header>
        <div className="eyebrow mb-3">Bônus Exclusivos · Página de Vendas</div>
        <h1 className="h-display">
          Mais de <span className="text-shimmer">R$ {totalValue}</span> em bônus. <br />
          Inclusos na sua compra hoje.
        </h1>
        <p className="mt-3 text-[15px] max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          Estes são os gatilhos de conversão para o tráfego pago. Cada bônus resolve uma dor específica e amplia o valor percebido do infoproduto.
        </p>
      </header>

      {/* Grid de bonuses */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {BONUSES.map((b) => {
          const Icon = b.icon;
          const isOpen = expanded === b.id;
          return (
            <div
              key={b.id}
              data-testid={`bonus-${b.id}`}
              className="card-premium p-6 flex flex-col relative overflow-hidden fade-up"
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, rgba(201,169,97,0.15), rgba(139,122,62,0.05))",
                    border: "1px solid rgba(201,169,97,0.25)",
                  }}
                >
                  <Icon className="w-5 h-5" style={{ color: "var(--gold-bright)" }} strokeWidth={1.75} />
                </div>
                <div className="text-right">
                  <div className="text-[10px] tracking-[0.2em] uppercase" style={{ color: "var(--text-muted)" }}>Valor</div>
                  <div className="font-display text-[20px] line-through" style={{ color: "var(--text-muted)" }}>
                    {b.value}
                  </div>
                  <div className="chip gold" style={{ marginTop: 4 }}>Grátis</div>
                </div>
              </div>

              <div className="chip mb-3" style={{ alignSelf: "flex-start" }}>{b.tag}</div>

              <h3 className="font-display text-[20px] leading-tight mb-2" style={{ letterSpacing: "-0.02em" }}>
                {b.title}
              </h3>
              <p className="text-[13px] leading-relaxed mb-4 flex-1" style={{ color: "var(--text-secondary)" }}>
                {b.subtitle}
              </p>

              <button
                data-testid={`bonus-expand-${b.id}`}
                onClick={() => setExpanded(isOpen ? null : b.id)}
                className="flex items-center justify-between text-[12px] font-semibold pt-4 border-t border-[var(--ink-line)]"
                style={{ color: "var(--gold-bright)" }}
              >
                {isOpen ? "Ocultar detalhes" : "Ver o que inclui"}
                <ChevronRight className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`} />
              </button>

              {isOpen && (
                <ul className="mt-3 space-y-1.5 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {b.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Sparkles className="w-3 h-3 mt-0.5 shrink-0" style={{ color: "var(--gold)" }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Book recommendations */}
      <div className="card-premium p-6" data-testid="recommended-books">
        <div className="flex items-center gap-2 mb-5">
          <Award className="w-5 h-5" style={{ color: "var(--gold-bright)" }} />
          <div>
            <div className="kpi-label mb-1">Leituras Recomendadas</div>
            <div className="font-display text-[22px]" style={{ letterSpacing: "-0.02em" }}>
              A biblioteca do investidor consciente
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {RECOMMENDED_BOOKS.map((b, i) => (
            <div key={i} className="p-4 rounded-lg flex items-start gap-3"
              style={{ background: "rgba(11,10,15,0.5)", border: "1px solid var(--ink-line)" }}>
              <BookOpen className="w-4 h-4 mt-1 shrink-0" style={{ color: "var(--gold)" }} />
              <div>
                <div className="font-semibold text-[14px]" style={{ color: "var(--text-primary)" }}>{b.title}</div>
                <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>{b.author}</div>
                <div className="chip mt-2" style={{ fontSize: 10 }}>{b.tag}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA final */}
      <div className="card-gold p-8 text-center" data-testid="cta-final">
        <div className="eyebrow mb-3">Oferta Completa</div>
        <h2 className="font-display text-[36px] mb-3 text-shimmer" style={{ letterSpacing: "-0.03em" }}>
          De R$ {totalValue + 297} por apenas R$ 97
        </h2>
        <p className="text-[14px] mb-6 max-w-xl mx-auto" style={{ color: "var(--text-secondary)" }}>
          Planilha Premium + 6 bônus + acesso vitalício + atualizações gratuitas + comunidade privada.
        </p>
        <button className="btn-gold" data-testid="cta-btn" style={{ fontSize: 15, padding: "14px 32px" }}>
          Quero o Kit Completo
          <ChevronRight className="w-4 h-4 inline ml-2" />
        </button>
        <div className="mt-4 text-[11px]" style={{ color: "var(--text-muted)" }}>
          🔒 Pagamento seguro · Garantia incondicional de 7 dias
        </div>
      </div>
    </div>
  );
}
