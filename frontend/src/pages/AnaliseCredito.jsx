import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth, formatApiError } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { brl } from "@/lib/format";
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
} from "lucide-react";

// ---------------------------------------------------------------------------
// Máscara e validação de CPF (consulta amarrada ao CPF da conta)
// ---------------------------------------------------------------------------
const onlyDigits = (v) => (v || "").replace(/\D/g, "");

function maskCpf(value) {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function cpfValido(value) {
  const cpf = onlyDigits(value);
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

function RatingCard({ rating, scr, explicacao }) {
  const [open, setOpen] = useState(false);
  const detail = explicacao?.detalhe || (
    "Classificação consolidada a partir do SCR (faixa de risco e/ou pior operação)."
  );
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
        <button
          type="button"
          className="text-[12px] mt-2 underline-offset-2 hover:underline"
          style={{ color: "var(--text-muted)", background: "none", border: 0, cursor: "pointer" }}
          onClick={() => setOpen((v) => !v)}
          data-testid="credit-rating-details-toggle"
        >
          Classificação consolidada a partir do SCR — {open ? "ocultar detalhes" : "ver detalhes"}
        </button>
        {open && (
          <div
            className="mt-3 text-left text-[12px] p-3 rounded-lg space-y-1"
            style={{ background: "rgba(11,10,15,0.45)", border: "1px solid var(--ink-line)", color: "var(--text-secondary)" }}
            data-testid="credit-rating-details"
          >
            <div>{detail}</div>
            {explicacao?.faixa_risco ? <div>Faixa SCR: {explicacao.faixa_risco}</div> : null}
            {explicacao?.score_scr != null ? <div>Score SCR: {explicacao.score_scr}</div> : null}
            {explicacao?.fonte ? <div>Fonte da regra: {explicacao.fonte}</div> : null}
          </div>
        )}
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

/** Mesma regra do backend (`merge_scr_import`) para idempotência por código. */
function modalityCodigo(m) {
  return (m?.codigo || `m${(m?.modalidade || "op").slice(0, 40)}`).trim();
}

function CtaImportarPlano({ report, orderId }) {
  const nav = useNavigate();
  const { api } = useAuth();
  const { refreshFinance, state: financeState } = useFinance();
  const modalidades = useMemo(
    () => (report?.scr?.modalidades || []).filter((m) => Number(m?.saldo || 0) > 0),
    [report]
  );
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() =>
    Object.fromEntries(modalidades.map((m) => [modalityCodigo(m), true]))
  );
  const [extras, setExtras] = useState({});
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  const [replaceManual, setReplaceManual] = useState(!!report?.scr?.legado_consolidado);
  const manualDebtTotal = (financeState?.debts || [])
    .filter((d) => (d.source || "manual") === "manual")
    .reduce((s, d) => s + (Number(d.balance) || 0), 0);

  useEffect(() => {
    setSelected(Object.fromEntries(modalidades.map((m) => [modalityCodigo(m), true])));
  }, [modalidades]);

  const selectedCount = modalidades.filter((m) => selected[modalityCodigo(m)]).length;
  const selectedTotal = modalidades.reduce(
    (sum, m) => (selected[modalityCodigo(m)] ? sum + Number(m.saldo || 0) : sum),
    0
  );

  if (!modalidades.length) {
    return (
      <div className="card-gold p-6 flex items-center justify-between flex-wrap gap-4" data-testid="credit-cta">
        <div>
          <div className="font-display text-[20px]" style={{ letterSpacing: "-0.02em" }}>
            Transforme esse diagnóstico em um plano.
          </div>
          <div className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            Este relatório não trouxe operações SCR. Monte o orçamento com o que você já sabe.
          </div>
        </div>
        <button
          onClick={() => nav("/app/orcamento")}
          className="btn-gold"
          data-testid="credit-goto-budget"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, padding: "14px 28px" }}
        >
          Ir para Orçamento <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const setExtra = (codigo, field, value) => {
    setExtras((prev) => ({
      ...prev,
      [codigo]: { ...(prev[codigo] || {}), [field]: value },
    }));
  };

  const handleImport = async () => {
    if (!orderId) {
      setError("Pedido não encontrado. Recarregue o relatório.");
      return;
    }
    const payload = modalidades
      .map((m) => {
        const codigo = modalityCodigo(m);
        if (!selected[codigo]) return null;
        const ex = extras[codigo] || {};
        return {
          codigo,
          rate: Number(ex.rate) || 0,
          ratePeriod: ex.ratePeriod === "aa" ? "aa" : "am",
          minPayment: Number(ex.minPayment) || 0,
          termMonths: Number(ex.termMonths) || 0,
        };
      })
      .filter(Boolean);
    if (!payload.length) {
      setError("Selecione ao menos uma operação para importar.");
      return;
    }
    setImporting(true);
    setError("");
    try {
      const { data } = await api.post(`/credit/report/${orderId}/import`, {
        modalidades: payload,
        replace_manual: !!replaceManual,
      });
      await refreshFinance();
      setDone({
        imported: data.imported,
        total: selectedTotal,
      });
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail) || "Não foi possível importar.");
    } finally {
      setImporting(false);
    }
  };

  if (done) {
    return (
      <div className="card-gold p-6 space-y-4" data-testid="credit-cta-done">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-6 h-6 shrink-0" style={{ color: "var(--success)" }} />
          <div>
            <div className="font-display text-[20px]" style={{ letterSpacing: "-0.02em" }}>
              {done.imported} {done.imported === 1 ? "dívida importada" : "dívidas importadas"} · {brl(done.total)}
            </div>
            <div className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
              Complete taxa, parcela e prazo nas Dívidas para simular a bola de neve. A curva de vencimentos já está na Projeção.
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => nav("/app/dividas")}
            className="btn-gold"
            data-testid="credit-goto-debts"
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            Ver Dívidas <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => nav("/app/projecao")}
            className="btn-ghost"
            data-testid="credit-goto-projection"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px" }}
          >
            Ver curva na Projeção
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-gold p-6 space-y-4" data-testid="credit-cta">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="font-display text-[20px]" style={{ letterSpacing: "-0.02em" }}>
            Importar para o meu plano
          </div>
          <div className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            {report?.scr?.legado_consolidado
              ? `${brl(report.scr.divida_atual || 0)} consolidados do SCR (relatório antigo). Importe agora; uma nova consulta traz o detalhe por modalidade.`
              : report?.scr?.divida_atual > 0
                ? `${brl(report.scr.divida_atual)} em operações SCR → Dívidas e Projeção.`
                : "Leve as operações do SCR para o seu plano de dívidas."}
          </div>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="btn-gold"
            data-testid="credit-import-open"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, padding: "14px 28px" }}
          >
            Escolher operações <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-3 pt-2 border-t border-[var(--ink-line)]" data-testid="credit-import-wizard">
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Taxa, parcela e prazo são opcionais agora — o SCR não traz esses campos. Você completa depois nas Dívidas.
          </div>
          {manualDebtTotal > 0 && (
            <label
              className="flex items-start gap-2 text-[13px] cursor-pointer p-3 rounded-lg"
              style={{ background: "rgba(201,169,97,0.08)", border: "1px solid rgba(201,169,97,0.25)", color: "var(--text-secondary)" }}
              data-testid="credit-import-replace-manual"
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={replaceManual}
                onChange={(e) => setReplaceManual(e.target.checked)}
              />
              <span>
                Remover dívidas manuais ({brl(manualDebtTotal)}) ao importar — evita somar em dobro com o SCR
                {report?.scr?.legado_consolidado ? " consolidado" : ""}.
              </span>
            </label>
          )}
          {modalidades.map((m) => {
            const codigo = modalityCodigo(m);
            const checked = !!selected[codigo];
            const ex = extras[codigo] || {};
            return (
              <div
                key={codigo}
                className="rounded-lg p-3 space-y-2"
                style={{ background: "rgba(11,10,15,0.45)", border: "1px solid var(--ink-line)" }}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setSelected((prev) => ({ ...prev, [codigo]: e.target.checked }))
                    }
                    data-testid={`credit-import-check-${codigo}`}
                    className="mt-1"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-3">
                      <span className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        {m.modalidade || "Operação SCR"}
                      </span>
                      <span className="font-mono-num shrink-0" style={{ color: "var(--gold-bright)" }}>
                        {brl(m.saldo || 0)}
                      </span>
                    </div>
                    {(m.vencido > 0 || m.codigo) && (
                      <div className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {[m.codigo && `cód. ${m.codigo}`, m.vencido > 0 && `vencido ${brl(m.vencido)}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                  </div>
                </label>
                {checked && (
                  <div className="grid grid-cols-3 gap-2 pl-7">
                    <input
                      className="input-premium text-[12px]"
                      placeholder="Taxa % a.m."
                      inputMode="decimal"
                      value={ex.rate ?? ""}
                      onChange={(e) => setExtra(codigo, "rate", e.target.value)}
                      data-testid={`credit-import-rate-${codigo}`}
                    />
                    <input
                      className="input-premium text-[12px]"
                      placeholder="Parcela mín."
                      inputMode="decimal"
                      value={ex.minPayment ?? ""}
                      onChange={(e) => setExtra(codigo, "minPayment", e.target.value)}
                      data-testid={`credit-import-min-${codigo}`}
                    />
                    <input
                      className="input-premium text-[12px]"
                      placeholder="Prazo (meses)"
                      inputMode="numeric"
                      value={ex.termMonths ?? ""}
                      onChange={(e) => setExtra(codigo, "termMonths", e.target.value)}
                      data-testid={`credit-import-term-${codigo}`}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {error && (
            <div className="text-[13px] flex items-center gap-2" style={{ color: "var(--danger)" }}>
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {selectedCount} selecionada{selectedCount === 1 ? "" : "s"} · {brl(selectedTotal)}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: "10px 16px", fontSize: 13 }}
                onClick={() => setOpen(false)}
                disabled={importing}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-gold"
                data-testid="credit-import-confirm"
                onClick={handleImport}
                disabled={importing || selectedCount === 0}
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Importando…
                  </>
                ) : (
                  <>
                    Confirmar importação <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
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
  const { api, user, setCpf } = useAuth();
  const [params, setParams] = useSearchParams();
  const orderId = params.get("order_id");
  const canceled = params.get("canceled");

  const hasCpf = Boolean(user?.has_cpf || user?.cpf_masked);
  const [cpfInput, setCpfInput] = useState("");
  const [consent, setConsent] = useState(false);
  const [apisCatalog, setApisCatalog] = useState([]);
  const [selectedApis, setSelectedApis] = useState(["score", "scr", "pendencias", "divida_ativa"]);
  const [quote, setQuote] = useState(null);
  const [remaining, setRemaining] = useState(user?.credit_reports_remaining || 0);
  const [consentVersion, setConsentVersion] = useState("v1");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // "form" | "processing" | "report" | "error"
  const [phase, setPhase] = useState(orderId ? "processing" : "form");
  const [statusMsg, setStatusMsg] = useState("");
  const [report, setReport] = useState(null);
  const [orders, setOrders] = useState([]);
  const pollRef = useRef(null);

  const loadOrders = useCallback(() => {
    api.get("/credit/orders").then(({ data }) => {
      setOrders(data.orders || []);
    }).catch(() => setOrders([]));
  }, [api]);

  useEffect(() => {
    api.get("/credit/price").then(({ data }) => {
      setConsentVersion(data.consent_version || "v1");
      setApisCatalog(data.apis || []);
      setRemaining(data.credit_reports_remaining ?? user?.credit_reports_remaining ?? 0);
      if (data.apis?.length) {
        setSelectedApis(data.apis.map((a) => a.id));
      }
    }).catch(() => {});
    loadOrders();
  }, [api, user?.credit_reports_remaining, loadOrders]);

  useEffect(() => {
    if (!selectedApis.length) return;
    api.post("/credit/quote", { apis: selectedApis }).then(({ data }) => {
      setQuote(data);
      setRemaining(data.credit_reports_remaining ?? remaining);
    }).catch(() => {});
  }, [api, selectedApis]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleApi = (id, required) => {
    if (required) return;
    setSelectedApis((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

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
    if (!consent) {
      setFormError("É necessário aceitar o termo de consentimento.");
      return;
    }
    setSubmitting(true);
    try {
      // Se a conta ainda não tem CPF, vincula agora (set-once) antes do checkout.
      if (!hasCpf) {
        if (!cpfValido(cpfInput)) {
          setFormError("Informe um CPF válido para vincular à sua conta.");
          setSubmitting(false);
          return;
        }
        await setCpf(onlyDigits(cpfInput));
      }
      // Sempre o CPF da conta; o usuário só escolhe quais fontes consultar.
      const { data } = await api.post("/credit/checkout", {
        origin_url: window.location.origin,
        consent: true,
        consent_text_version: consentVersion,
        apis: selectedApis,
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
          em um único relatório — direto das fontes oficiais. A consulta usa
          <span style={{ color: "var(--gold-bright)" }}> apenas o CPF da sua conta</span>.
        </p>
      </header>

      {phase === "form" && (
        <div className="max-w-2xl fade-up space-y-6">
          {orders.some((o) => o.status === "ready" && o.report?.available) && (
            <div className="card-premium p-5 space-y-3" data-testid="credit-history">
              <div className="kpi-label">Meus relatórios</div>
              {orders
                .filter((o) => o.status === "ready" && o.report?.available)
                .slice(0, 5)
                .map((o) => (
                  <button
                    key={o.order_id}
                    type="button"
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-lg text-left"
                    style={{ background: "rgba(11,10,15,0.45)", border: "1px solid var(--ink-line)" }}
                    onClick={() => setParams({ order_id: o.order_id }, { replace: true })}
                    data-testid={`credit-history-open-${o.order_id}`}
                  >
                    <div>
                      <div className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        Score {o.report?.score ?? "—"}
                        {o.report?.rating_bacen ? ` · Rating ${o.report.rating_bacen}` : ""}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {o.documento || "CPF"} · {o.created_at ? new Date(o.created_at).toLocaleString("pt-BR") : ""}
                        {o.report?.divida_atual != null ? ` · SCR ${brl(o.report.divida_atual)}` : ""}
                        {o.report?.legado_consolidado ? " · consolidado" : ""}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "var(--gold-bright)" }} />
                  </button>
                ))}
            </div>
          )}

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
            <div className="kpi-label mb-2">CPF do titular</div>
            {hasCpf ? (
              <>
                <div
                  className="input-premium font-mono-num text-[20px] flex items-center"
                  data-testid="credit-cpf-locked"
                  style={{ opacity: 0.95 }}
                >
                  {user.cpf_masked}
                </div>
                <p className="mt-2 text-[12px] flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                  <Lock className="w-3.5 h-3.5" /> CPF vinculado à sua conta — não é possível consultar o de terceiros.
                </p>
              </>
            ) : (
              <>
                <input
                  data-testid="credit-cpf-input"
                  className="input-premium font-mono-num text-[20px]"
                  placeholder="000.000.000-00"
                  value={cpfInput}
                  onChange={(e) => setCpfInput(maskCpf(e.target.value))}
                  inputMode="numeric"
                />
                <p className="mt-2 text-[12px] flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                  <Lock className="w-3.5 h-3.5" /> Este CPF será vinculado à sua conta e não poderá ser alterado.
                </p>
              </>
            )}

            <div className="mt-6 pt-5 border-t border-[var(--ink-line)]">
              <div className="kpi-label mb-3">Quais consultas fazer</div>
              <div className="space-y-2" data-testid="credit-apis">
                {(apisCatalog.length
                  ? apisCatalog
                  : [
                      { id: "score", label: "Score de crédito (QUOD)", required: true },
                      { id: "scr", label: "SCR / BACEN", required: false },
                      { id: "pendencias", label: "Negativações (PEFIN/REFIN)", required: false },
                      { id: "divida_ativa", label: "Dívida ativa da União (PGFN)", required: false },
                    ]
                ).map((apiItem) => {
                  const checked = selectedApis.includes(apiItem.id);
                  return (
                    <label
                      key={apiItem.id}
                      className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-lg"
                      style={{
                        background: checked ? "rgba(201,169,97,0.08)" : "transparent",
                        border: "1px solid var(--ink-line)",
                        opacity: apiItem.required ? 0.95 : 1,
                      }}
                      data-testid={`credit-api-${apiItem.id}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={apiItem.required}
                        onChange={() => toggleApi(apiItem.id, apiItem.required)}
                        className="w-4 h-4 accent-[var(--gold-bright)]"
                      />
                      <span className="text-[13px] flex-1" style={{ color: "var(--text-primary)" }}>
                        {apiItem.label}
                        {apiItem.required ? (
                          <span className="text-[11px] ml-2" style={{ color: "var(--text-muted)" }}>obrigatório</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              {remaining > 0 && (
                <p className="mt-3 text-[12px]" style={{ color: "var(--success)" }} data-testid="credit-remaining">
                  Você tem {remaining} consulta{remaining > 1 ? "s" : ""} inclusa{remaining > 1 ? "s" : ""} no plano — esta não será cobrada.
                </p>
              )}
            </div>

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
                <div className="kpi-label mb-1">
                  {quote?.payment === "included" ? "Inclusa no seu plano" : "Valor desta consulta"}
                </div>
                <div className="font-display font-mono-num text-[26px]" style={{ color: "var(--gold-bright)" }}>
                  {quote?.payment === "included" ? "R$ 0,00" : (quote != null ? brl(quote.amount) : "—")}
                </div>
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {quote?.payment === "included"
                    ? "Consumirá 1 consulta do plano"
                    : "Pagamento único via cartão (Stripe) · preço conforme as fontes marcadas"}
                </div>
              </div>
              <button
                onClick={handleSubmit}
                disabled={submitting || selectedApis.length === 0}
                className="btn-gold"
                data-testid="credit-submit"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 15, padding: "14px 28px", opacity: submitting ? 0.6 : 1 }}
              >
                {submitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {quote?.payment === "included" ? "Gerando..." : "Redirecionando..."}</>
                  : <><ShieldCheck className="w-4 h-4" /> Consultar meu crédito</>}
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
            <RatingCard
              rating={report.rating_bacen}
              scr={report.scr}
              explicacao={report.rating_explicacao}
            />
          </div>

          <PendenciasCard
            pendencias={report.pendencias || []}
            temPendencias={report.tem_pendencias}
            resumo={report.pendencias_resumo}
          />

          {report.divida_ativa && Object.keys(report.divida_ativa).length > 0 && (
            <DividaAtivaCard dividaAtiva={report.divida_ativa} />
          )}

          <CtaImportarPlano report={report} orderId={orderId} />
          <button
            type="button"
            className="btn-ghost text-[13px]"
            style={{ padding: "8px 0" }}
            onClick={() => { setReport(null); setPhase("form"); setParams({}, { replace: true }); loadOrders(); }}
            data-testid="credit-back-to-form"
          >
            ← Voltar / nova consulta
          </button>

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
