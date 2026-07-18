import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { Check, Circle, X } from "lucide-react";
import { useFinance } from "@/context/FinanceContext";

const STEPS = [
  {
    key: "income",
    label: "Definir sua renda mensal",
    to: "/app/orcamento",
  },
  {
    key: "firstTx",
    label: "Registrar o primeiro lançamento",
    to: "/app/lancamentos",
  },
  {
    key: "budget",
    label: "Revisar o orçamento 50/30/20",
    to: "/app/orcamento",
  },
  {
    key: "goalDebt",
    label: "Cadastrar uma meta ou dívida",
    to: "/app/metas",
  },
  {
    key: "whatsapp",
    label: "Vincular WhatsApp (telefone na conta)",
    to: "/app/lancamentos",
  },
];

export default function FirstWeekChecklist() {
  const { state, dismissChecklist } = useFinance();
  const checklist = state?.profile?.firstWeekChecklist || {};

  const { doneCount, total, visible } = useMemo(() => {
    const totalSteps = STEPS.length;
    const done = STEPS.filter((s) => checklist[s.key]).length;
    const allDone = done === totalSteps;
    const show = !checklist.dismissed && !allDone;
    return { doneCount: done, total: totalSteps, visible: show };
  }, [checklist]);

  if (!visible) return null;

  const progress = Math.round((doneCount / total) * 100);

  return (
    <section
      className="card-premium p-6 fade-up"
      data-testid="first-week-checklist"
      style={{ borderColor: "rgba(201,169,97,0.35)" }}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="eyebrow mb-2">Primeira semana · {doneCount}/{total}</div>
          <h2 className="font-display text-[22px] leading-tight" style={{ color: "var(--text-primary)" }}>
            Seu caminho nos próximos 7 dias
          </h2>
          <p className="mt-2 text-[13px] max-w-lg" style={{ color: "var(--text-secondary)" }}>
            Complete estes passos para ativar o FinPremium de verdade. O progresso salva na sua conta.
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost p-2"
          onClick={dismissChecklist}
          title="Dispensar checklist"
          data-testid="checklist-dismiss"
          aria-label="Dispensar checklist"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div
        className="h-1.5 rounded-full mb-5 overflow-hidden"
        style={{ background: "rgba(255,255,255,0.06)" }}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${progress}%`,
            background: "linear-gradient(90deg, var(--gold-deep), var(--gold-bright))",
          }}
        />
      </div>

      <ul className="space-y-2">
        {STEPS.map((step) => {
          const done = !!checklist[step.key];
          return (
            <li key={step.key}>
              <Link
                to={step.to}
                data-testid={`checklist-step-${step.key}`}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
                style={{
                  background: done ? "rgba(127,176,105,0.08)" : "transparent",
                  border: `1px solid ${done ? "rgba(127,176,105,0.25)" : "var(--ink-line)"}`,
                  color: done ? "var(--text-secondary)" : "var(--text-primary)",
                  textDecoration: done ? "line-through" : "none",
                  opacity: done ? 0.75 : 1,
                }}
              >
                {done ? (
                  <Check className="w-4 h-4 shrink-0" style={{ color: "var(--success)" }} />
                ) : (
                  <Circle className="w-4 h-4 shrink-0" style={{ color: "var(--gold-bright)" }} />
                )}
                <span className="text-[14px]">{step.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
