import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth, formatApiError } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { brl, parseNum, stripLeadingZeros } from "@/lib/format";
import {
  ShieldCheck,
  Loader2,
  AlertCircle,
  Gauge,
  Landmark,
  FileWarning,
  ChevronRight,
  Lock,
  CheckCircle2,
  ExternalLink,
  Scale,
  Wallet,
  BadgeCheck,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Máscara e detecção de CPF/CNPJ
// ---------------------------------------------------------------------------
const onlyDigits = (v) => (v || "").replace(/\D/g, "");

function maskDocumento(value) {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

function validaCPF(cpf) {
  cpf = onlyDigits(cpf);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += parseInt(cpf[i], 10) * (t + 1 - i);
    let d = (sum * 10) % 11;
    if (d === 10) d = 0;
    if (d !== parseInt(cpf[t], 10)) return false;
  }
  return true;
}

function validaCNPJ(cnpj) {
  cnpj = onlyDigits(cnpj);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (len) => {
    let sum = 0;
    let pos = len - 7;
    for (let i = len; i >= 1; i--) {
      sum += parseInt(cnpj[len - i], 10) * pos--;
      if (pos < 2) pos = 9;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(cnpj[12], 10) && calc(13) === parseInt(cnpj[13], 10);
}

function documentoValido(value) {
  const d = onlyDigits(value);
  if (d.length === 11) return validaCPF(d);
  if (d.length === 14) return validaCNPJ(d);
  return false;
}

const CONSENT_TEXT =
  "Autorizo a consulta dos meus dados de crédito (Score, SCR/BACEN e eventuais negativações) " +
  "junto a fontes oficiais via Direct Data, com a finalidade de dar transparência às minhas " +
  "dívidas para organização financeira. Estou ciente de que o relatório é gerado apenas após a " +
  "confirmação do pagamento e ficará disponível por tempo limitado.";

const FAIXA_META = {
  baixo: { label: "Baixo risco", color: "var(--success)" },
  medio: { label: "Médio risco", color: "var(--warning)" },
  alto: { label: "Alto risco", color: "var(--danger)" },
  indisponivel: { label: "Indisponível", color: "var(--text-muted)" },
};

// ---------------------------------------------------------------------------
// Sub-componentes de relatório
// ---------------------------------------------------------------------------
function ScoreCard({ score, faixa, motivos, capacidadePagamento, perfil }) {
  const meta = FAIXA_META[faixa] || FAIXA_META.indisponivel;
  const pctFill = score ? Math.min(100, Math.max(2, (score / 1000) * 100)) : 0;
  return (
    <div className="card-premium p-6" data-testid="credit-score-card">
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="w-[18px] h-[18px]" style={{ color: "var(--gold-bright)" }} />
        <div className="kpi-label">Score de crédito (QUOD)</div>
      </div>
      <div className="flex items-end justify-between mb-3">
        <div className="font-display font-mono-num" style={{ fontSize: 56, lineHeight: 1, color: meta.color }}>
          {score ?? "—"}
        </div>
        <div className="chip" style={{ color: meta.color, borderColor: meta.color }}>{meta.label}</div>
      </div>
      <div className="thermometer mb-2">
        <div className="thermometer-fill" style={{ width: `${pctFill}%`, background: meta.color }} />
      </div>
      <div className="flex justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
        <span>0</span><span>600</span><span>700</span><span>1000</span>
      </div>
      {(capacidadePagamento || perfil) && (
        <div className="mt-4 pt-4 border-t border-[var(--ink-line)] grid grid-cols-2 gap-3 text-[13px]">
          {capacidadePagamento && (
            <div>
              <div className="kpi-label mb-1">Capacidade de pagamento</div>
              <div style={{ color: "var(--text-primary)" }}>{capacidadePagamento}</div>
            </div>
          )}
          {perfil && (
            <div>
              <div className="kpi-label mb-1">Perfil</div>
              <div style={{ color: "var(--text-primary)" }}>{perfil}</div>
            </div>
          )}
        </div>
      )}
      {motivos?.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--ink-line)]">
          <div className="kpi-label mb-2">Principais fatores</div>
          <ul className="space-y-1.5">
            {motivos.map((m, i) => (
              <li key={i} className="text-[13px] flex items-start gap-2" style={{ color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--gold)" }}>•</span> {m}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RatingCard({ rating, scr }) {
  return (
    <div className="card-gold p-6" data-testid="credit-rating-card">
      <div className="flex items-center gap-2 mb-4">
        <Landmark className="w-[18px] h-[18px]" style={{ color: "var(--gold-bright)" }} />
        <div className="kpi-label">Rating BACEN (derivado)</div>
      </div>
      <div className="text-center py-2">
        <div className="font-display" style={{ fontSize: 72, lineHeight: 1, color: "var(--gold-bright)" }}>
          {rating || "—"}
        </div>
        <div className="text-[12px] mt-2" style={{ color: "var(--text-muted)" }}>
          Classificação consolidada a partir do SCR (regra derivada — ver detalhes).
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-[var(--ink-line)] grid grid-cols-2 gap-3 text-[13px]">
        <div>
          <div className="kpi-label mb-1">Score SCR</div>
          <div className="font-mono-num" style={{ color: "var(--text-primary)" }}>{scr?.score ?? "—"}</div>
        </div>
        <div>
          <div className="kpi-label mb-1">Faixa de risco</div>
          <div style={{ color: "var(--text-primary)" }}>{scr?.faixa_risco || "—"}</div>
        </div>
        <div>
          <div className="kpi-label mb-1">Responsabilidade total</div>
          <div className="font-mono-num" style={{ color: "var(--text-primary)" }}>{brl(scr?.responsabilidade_total || 0)}</div>
        </div>
        <div>
          <div className="kpi-label mb-1">Instituições</div>
          <div className="font-mono-num" style={{ color: "var(--text-primary)" }}>
            {scr?.quantidade_instituicoes ?? "—"}
            {scr?.quantidade_operacoes ? (
              <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                {" "}· {scr.quantidade_operacoes} operações
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {(scr?.divida_atual > 0 || scr?.carteira?.limite > 0) && (
        <div className="mt-4 pt-4 border-t border-[var(--ink-line)]">
          <div className="kpi-label mb-3">Composição da carteira</div>
          <div className="space-y-2 text-[13px]">
            <CarteiraLinha rotulo="A vencer" valor={scr?.carteira?.vencer} />
            <CarteiraLinha rotulo="Vencido" valor={scr?.carteira?.vencido} destaque="var(--danger)" />
            <CarteiraLinha rotulo="Prejuízo" valor={scr?.carteira?.prejuizo} destaque="var(--danger)" />
            <CarteiraLinha rotulo="Limite disponível" valor={scr?.carteira?.limite} />
            <div className="flex justify-between pt-2 border-t border-[var(--ink-line)]">
              <span style={{ color: "var(--text-secondary)" }}>Dívida atual</span>
              <span className="font-mono-num" style={{ color: "var(--gold-bright)" }}>
                {brl(scr?.divida_atual || 0)}
              </span>
            </div>
          </div>
          {scr?.data_inicio_relacionamento && (
            <div className="text-[11px] mt-3" style={{ color: "var(--text-muted)" }}>
              Relacionamento bancário desde {scr.data_inicio_relacionamento.split(" ")[0]}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CarteiraLinha({ rotulo, valor, destaque }) {
  const temValor = Number(valor) > 0;
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--text-muted)" }}>{rotulo}</span>
      <span
        className="font-mono-num"
        style={{ color: temValor && destaque ? destaque : "var(--text-primary)" }}
      >
        {brl(valor || 0)}
      </span>
    </div>
  );
}

// Fato verificável (Receita Federal), diferente da renda presumida do mesmo payload:
// CPF irregular barra crédito independente do score, então vem antes do resto.
function SituacaoCpfCard({ cadastro }) {
  const irregular = cadastro.obito || (cadastro.situacao_cadastral && !cadastro.regular);
  const cor = irregular ? "var(--danger)" : "var(--success)";
  return (
    <div className="card-premium p-6" data-testid="credit-cadastro-card">
      <div className="flex items-center gap-2 mb-4">
        <BadgeCheck className="w-[18px] h-[18px]" style={{ color: cor }} />
        <div className="kpi-label">Situação do CPF na Receita Federal</div>
      </div>
      <div className="flex items-center gap-3">
        {irregular ? (
          <AlertCircle className="w-6 h-6 shrink-0" style={{ color: cor }} />
        ) : (
          <CheckCircle2 className="w-6 h-6 shrink-0" style={{ color: cor }} />
        )}
        <div>
          <div className="font-display text-[18px]" style={{ color: cor }}>
            {cadastro.obito ? "Consta indicativo de óbito" : cadastro.situacao_cadastral || "—"}
          </div>
          <div className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {irregular
              ? "CPF irregular impede crédito e abertura de conta, mesmo com score bom — regularize antes."
              : "CPF apto para crédito e abertura de conta."}
            {cadastro.data_situacao ? ` Verificado em ${cadastro.data_situacao.split(" ")[0]}.` : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

// A renda do bureau é presumida (modelo estatístico) e erra com frequência, então
// entra como sugestão editável: o valor que segue para o orçamento é o confirmado.
function CtaOrcamento({ renda }) {
  const nav = useNavigate();
  const { state, updateProfile, completeChecklistItem } = useFinance();
  const rendaSalva = state?.profile?.monthlyIncome || 0;
  const presumida = renda?.renda_estimada || 0;
  const [valor, setValor] = useState(String(rendaSalva || presumida || ""));

  const confirmar = () => {
    const n = parseNum(valor);
    if (n > 0) {
      updateProfile({ monthlyIncome: n });
      completeChecklistItem?.("income");
    }
    nav("/app/orcamento");
  };

  const domicilio = [
    renda?.moradores ? `${renda.moradores} moradores` : null,
    renda?.classe_social ? `classe ${renda.classe_social}` : null,
    renda?.ocupacao,
  ].filter(Boolean).join(" · ");

  return (
    <div className="card-gold p-6" data-testid="credit-cta">
      <div className="font-display text-[20px]" style={{ letterSpacing: "-0.02em" }}>
        Transforme esse diagnóstico em um plano.
      </div>
      <div className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
        Organize suas dívidas e monte um orçamento que cabe no seu bolso.
      </div>

      <div className="mt-5 flex items-end gap-4 flex-wrap">
        <div style={{ minWidth: 200 }}>
          <div className="kpi-label mb-2">Sua renda mensal líquida</div>
          <input
            data-testid="credit-renda-input"
            className="input-premium font-mono-num"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(stripLeadingZeros(e.target.value))}
            placeholder="0,00"
          />
        </div>
        <button
          onClick={confirmar}
          className="btn-gold"
          data-testid="credit-goto-budget"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, padding: "14px 28px" }}
        >
          Montar Plano de Orçamento <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {presumida > 0 && (
        <div className="text-[12px] mt-3 flex items-start gap-2" style={{ color: "var(--text-muted)" }}>
          <Wallet className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            O bureau <strong>presume</strong> {brl(presumida)}/mês
            {renda?.faixa_salarial ? ` (${renda.faixa_salarial.toLowerCase()})` : ""}
            {renda?.confiabilidade ? ` · confiabilidade ${renda.confiabilidade.toLowerCase()}` : ""}
            . É uma estimativa estatística {domicilio ? `a partir do seu perfil (${domicilio})` : "de perfil"},
            não sua renda declarada — corrija acima se estiver diferente.
          </span>
        </div>
      )}
    </div>
  );
}

function PendenciasCard({ pendencias, temPendencias, resumo }) {
  return (
    <div className="card-premium p-6" data-testid="credit-pendencias-card">
      <div className="flex items-center gap-2 mb-4">
        <FileWarning className="w-[18px] h-[18px]" style={{ color: temPendencias ? "var(--danger)" : "var(--success)" }} />
        <div className="kpi-label">Negativações e restrições</div>
      </div>
      {!temPendencias ? (
        <div className="flex items-center gap-3 py-4">
          <CheckCircle2 className="w-6 h-6" style={{ color: "var(--success)" }} />
          <div className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            {resumo?.status || "Nenhuma pendência encontrada nas fontes consultadas."}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {pendencias.map((p, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-lg"
              style={{ background: "rgba(11,10,15,0.5)", border: "1px solid var(--ink-line)" }}
            >
              <div>
                <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {p.credor || "Credor não informado"}
                </div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {[p.tipo, p.data_ocorrencia, p.situacao, p.detalhe].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="font-mono-num font-semibold" style={{ color: "var(--danger)" }}>{brl(p.valor || 0)}</div>
            </div>
          ))}
        </div>
      )}
      <div className="text-[11px] mt-4" style={{ color: "var(--text-muted)" }}>
        PEFIN/REFIN, ações judiciais, falência e cheques sem fundo. Protestos cobrem o estado de SP.
      </div>
    </div>
  );
}

function DividaAtivaCard({ dividaAtiva }) {
  const possui = Boolean(dividaAtiva?.possui_divida);
  const itens = dividaAtiva?.itens || [];
  return (
    <div className="card-premium p-6" data-testid="credit-divida-ativa-card">
      <div className="flex items-center gap-2 mb-4">
        <Scale className="w-[18px] h-[18px]" style={{ color: possui ? "var(--danger)" : "var(--success)" }} />
        <div className="kpi-label">Dívida ativa da União (PGFN)</div>
      </div>
      {!possui ? (
        <div className="flex items-center gap-3 py-4">
          <CheckCircle2 className="w-6 h-6" style={{ color: "var(--success)" }} />
          <div className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            Nenhum débito inscrito na dívida ativa da União.
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {dividaAtiva.quantidade} inscrição(ões)
            </div>
            <div className="font-mono-num font-semibold text-[18px]" style={{ color: "var(--danger)" }}>
              {brl(dividaAtiva.valor_total || 0)}
            </div>
          </div>
          <div className="space-y-3">
            {itens.map((d, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-lg"
                style={{ background: "rgba(11,10,15,0.5)", border: "1px solid var(--ink-line)" }}
              >
                <div>
                  <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {d.natureza || "Débito federal"}
                  </div>
                  <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {d.orgao || "PGFN"} {d.situacao ? `· ${d.situacao}` : ""}
                  </div>
                </div>
                <div className="font-mono-num font-semibold" style={{ color: "var(--danger)" }}>{brl(d.valor || 0)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------
export default function AnaliseCredito() {
  const { api } = useAuth();
  const [params, setParams] = useSearchParams();
  const orderId = params.get("order_id");
  const canceled = params.get("canceled");

  const [documento, setDocumento] = useState("");
  const [consent, setConsent] = useState(false);
  const [price, setPrice] = useState(null);
  const [consentVersion, setConsentVersion] = useState("v1");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // "form" | "processing" | "report" | "error"
  const [phase, setPhase] = useState(orderId ? "processing" : "form");
  const [statusMsg, setStatusMsg] = useState("");
  const [report, setReport] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => {
    api.get("/credit/price").then(({ data }) => {
      setPrice(data.price);
      setConsentVersion(data.consent_version || "v1");
    }).catch(() => {});
  }, [api]);

  const loadReport = useCallback(async (id) => {
    try {
      const { data } = await api.get(`/credit/report/${id}`);
      setReport(data.report);
      setPhase("report");
    } catch (e) {
      setStatusMsg(formatApiError(e.response?.data?.detail));
      setPhase("error");
    }
  }, [api]);

  const pollStatus = useCallback(async (id) => {
    try {
      const { data } = await api.get(`/credit/status/${id}`);
      if (data.status === "ready") {
        await loadReport(id);
        return;
      }
      if (data.status === "error") {
        setStatusMsg(data.error || "Não foi possível gerar o relatório. Você não será cobrado.");
        setPhase("error");
        return;
      }
      if (data.payment_status === "paid" || data.status === "processing") {
        setStatusMsg("Pagamento confirmado — gerando seu relatório...");
      } else {
        setStatusMsg("Aguardando a confirmação do pagamento...");
      }
      pollRef.current = setTimeout(() => pollStatus(id), 2500);
    } catch (e) {
      setStatusMsg(formatApiError(e.response?.data?.detail));
      setPhase("error");
    }
  }, [api, loadReport]);

  useEffect(() => {
    if (orderId) {
      setPhase("processing");
      pollStatus(orderId);
    }
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [orderId, pollStatus]);

  const handleSubmit = async () => {
    setFormError("");
    if (!documentoValido(documento)) {
      setFormError("Informe um CPF ou CNPJ válido.");
      return;
    }
    if (!consent) {
      setFormError("É necessário aceitar o termo de consentimento.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/credit/checkout", {
        documento: onlyDigits(documento),
        origin_url: window.location.origin,
        consent: true,
        consent_text_version: consentVersion,
      });
      window.location.href = data.url;
    } catch (e) {
      setFormError(formatApiError(e.response?.data?.detail));
      setSubmitting(false);
    }
  };

  const resetToForm = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setReport(null);
    setPhase("form");
    setParams({}, { replace: true });
  };

  // ------------------------------- Render -------------------------------
  return (
    <div className="p-8 space-y-6" data-testid="credit-page">
      <header>
        <div className="eyebrow mb-3">Análise de Crédito · Rating Avançado</div>
        <h1 className="h-display">Saiba onde você está.</h1>
        <p className="mt-3 text-[15px] max-w-2xl" style={{ color: "var(--text-secondary)" }}>
          Consulte seu <span style={{ color: "var(--gold-bright)" }}>Score</span>, o resumo do
          <span style={{ color: "var(--gold-bright)" }}> SCR/BACEN</span> e eventuais negativações
          em um único relatório — direto das fontes oficiais.
        </p>
      </header>

      {phase === "form" && (
        <div className="max-w-2xl fade-up">
          {canceled && (
            <div
              className="card-premium p-4 mb-6 flex items-center gap-3"
              style={{ borderColor: "rgba(212,106,106,0.3)" }}
              data-testid="credit-canceled"
            >
              <AlertCircle className="w-5 h-5" style={{ color: "var(--warning)" }} />
              <span className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
                Pagamento cancelado. Você pode tentar novamente quando quiser.
              </span>
            </div>
          )}

          <div className="card-premium p-6">
            <div className="kpi-label mb-2">CPF ou CNPJ do titular</div>
            <input
              data-testid="credit-documento-input"
              className="input-premium font-mono-num text-[20px]"
              placeholder="000.000.000-00"
              value={documento}
              onChange={(e) => setDocumento(maskDocumento(e.target.value))}
              inputMode="numeric"
            />
            <p className="mt-2 text-[12px] flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
              <Lock className="w-3.5 h-3.5" /> Consulta apenas do próprio titular. Dados tratados com segurança (LGPD).
            </p>

            <label
              className="mt-5 flex items-start gap-3 cursor-pointer select-none"
              data-testid="credit-consent"
            >
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 w-4 h-4 shrink-0 accent-[var(--gold-bright)]"
                data-testid="credit-consent-checkbox"
              />
              <span className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                {CONSENT_TEXT}
              </span>
            </label>

            {formError && (
              <div className="mt-4 text-[13px] flex items-center gap-2" style={{ color: "var(--danger)" }} data-testid="credit-form-error">
                <AlertCircle className="w-4 h-4" /> {formError}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between flex-wrap gap-4 pt-5 border-t border-[var(--ink-line)]">
              <div>
                <div className="kpi-label mb-1">Valor do relatório</div>
                <div className="font-display font-mono-num text-[26px]" style={{ color: "var(--gold-bright)" }}>
                  {price != null ? brl(price) : "—"}
                </div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Pagamento único via Pix</div>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="btn-gold"
                data-testid="credit-submit"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, padding: "14px 28px", opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Redirecionando...</> : <><ShieldCheck className="w-4 h-4" /> Consultar meu crédito</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "processing" && (
        <div className="max-w-xl fade-up card-premium p-10 text-center" data-testid="credit-processing">
          <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin" style={{ color: "var(--gold-bright)" }} />
          <h2 className="font-display text-[26px] mb-2" style={{ letterSpacing: "-0.02em" }}>Preparando seu relatório</h2>
          <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            {statusMsg || "Confirmando o pagamento..."}
          </p>
          <p className="mt-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
            A consulta às fontes oficiais pode levar alguns instantes. Não feche esta página.
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="max-w-xl fade-up card-premium p-10 text-center" data-testid="credit-error">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--danger)" }} />
          <h2 className="font-display text-[26px] mb-3" style={{ letterSpacing: "-0.02em" }}>Não foi possível concluir</h2>
          <p className="text-[14px] mb-6" style={{ color: "var(--text-secondary)" }}>{statusMsg}</p>
          <button onClick={resetToForm} className="btn-gold" data-testid="credit-retry">Tentar novamente</button>
        </div>
      )}

      {phase === "report" && report && (
        <div className="space-y-6 fade-up" data-testid="credit-report">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="chip gold">Documento: {report.documento}</div>
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Consultado em {new Date(report.consultado_em).toLocaleString("pt-BR")} · fonte {report.fonte}
            </div>
          </div>

          {report.avisos?.length > 0 && (
            <div className="card-premium p-4" data-testid="credit-avisos">
              {report.avisos.map((a, i) => (
                <div key={i} className="text-[12px] flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
                  <AlertCircle className="w-3.5 h-3.5" /> {a}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ScoreCard
              score={report.score}
              faixa={report.score_faixa}
              motivos={report.score_motivos}
              capacidadePagamento={report.capacidade_pagamento}
              perfil={report.perfil}
            />
            <RatingCard rating={report.rating_bacen} scr={report.scr} />
          </div>

          <PendenciasCard
            pendencias={report.pendencias || []}
            temPendencias={report.tem_pendencias}
            resumo={report.pendencias_resumo}
          />

          {report.cadastro?.situacao_cadastral && <SituacaoCpfCard cadastro={report.cadastro} />}

          {report.divida_ativa && Object.keys(report.divida_ativa).length > 0 && (
            <DividaAtivaCard dividaAtiva={report.divida_ativa} />
          )}

          <CtaOrcamento renda={report.renda} />

          {report.comprovante_url && (
            <a
              href={report.comprovante_url}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost inline-flex items-center gap-2"
              style={{ padding: "10px 18px", fontSize: 13 }}
              data-testid="credit-comprovante"
            >
              <ExternalLink className="w-4 h-4" /> Baixar comprovante (PDF)
            </a>
          )}
        </div>
      )}
    </div>
  );
}
