import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";
import { brl } from "@/lib/format";
import { CheckCircle2, Gem, Download, ChevronRight, Mail, AlertCircle, Loader2 } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function ThankYou() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState("checking"); // checking | paid | pending | expired | error
  const [details, setDetails] = useState(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }
    let cancelled = false;
    let currentAttempts = 0;
    const MAX = 8;

    const poll = async () => {
      if (cancelled || currentAttempts >= MAX) {
        if (!cancelled) setStatus((s) => (s === "paid" ? s : "pending"));
        return;
      }
      currentAttempts++;
      setAttempts(currentAttempts);
      try {
        const { data } = await axios.get(`${API}/checkout/status/${sessionId}`);
        setDetails(data);
        if (data.payment_status === "paid") {
          setStatus("paid");
          return;
        }
        if (data.status === "expired") {
          setStatus("expired");
          return;
        }
        setTimeout(poll, 2000);
      } catch (e) {
        console.error(e);
        if (currentAttempts >= MAX) setStatus("error");
        else setTimeout(poll, 2000);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [sessionId]);

  const renderBody = () => {
    if (status === "checking") {
      return (
        <div className="text-center" data-testid="status-checking">
          <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin" style={{ color: "var(--gold-bright)" }} />
          <h2 className="font-display text-[32px] mb-3" style={{ letterSpacing: "-0.03em" }}>Confirmando seu pagamento...</h2>
          <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
            Estamos verificando junto à Stripe (tentativa {attempts}/8).
          </p>
        </div>
      );
    }

    if (status === "paid") {
      // Backend já devolve amount_total em reais (não centavos).
      const total = details?.amount_total ?? 0;
      return (
        <div className="text-center fade-up" data-testid="status-paid">
          <div
            className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))",
              boxShadow: "0 8px 40px rgba(201,169,97,0.4)",
            }}
          >
            <CheckCircle2 className="w-10 h-10" style={{ color: "var(--ink-void)" }} strokeWidth={2.5} />
          </div>
          <div className="eyebrow mb-3">Pagamento aprovado</div>
          <h1 className="font-display text-[48px] mb-4 text-shimmer" style={{ letterSpacing: "-0.03em" }}>
            Bem-vindo ao FinPremium.
          </h1>
          <p className="text-[16px] max-w-xl mx-auto mb-8" style={{ color: "var(--text-secondary)" }}>
            Seu pagamento de <span className="font-mono-num font-semibold" style={{ color: "var(--gold-bright)" }}>{brl(total)}</span> foi confirmado.
            Você já tem acesso vitalício ao dashboard, aos 6 bônus e à comunidade privada.
          </p>

          <div className="card-premium p-6 max-w-xl mx-auto mb-8 text-left">
            <div className="kpi-label mb-3">Próximos passos</div>
            <div className="space-y-3">
              {[
                { icon: Mail, text: "Enviamos o link de acesso definitivo para seu email em até 5 minutos." },
                { icon: Download, text: "Faça o download dos bônus na área de membros (também enviado por email)." },
                { icon: Gem, text: "Comece agora mesmo: entre no app e configure seu primeiro orçamento." },
              ].map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(201,169,97,0.1)", border: "1px solid rgba(201,169,97,0.25)" }}
                    >
                      <Icon className="w-4 h-4" style={{ color: "var(--gold-bright)" }} />
                    </div>
                    <p className="text-[13px] pt-1.5" style={{ color: "var(--text-secondary)" }}>{step.text}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <button onClick={() => nav("/app")} className="btn-gold" data-testid="go-to-app" style={{ fontSize: 15, padding: "14px 28px" }}>
            Entrar no FinPremium <ChevronRight className="w-4 h-4 inline ml-1" />
          </button>

          <p className="mt-6 text-[11px]" style={{ color: "var(--text-muted)" }}>
            ID da transação: <span className="font-mono-num">{sessionId?.slice(0, 24)}...</span>
          </p>
        </div>
      );
    }

    if (status === "expired" || status === "error") {
      return (
        <div className="text-center" data-testid="status-error">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--danger)" }} />
          <h2 className="font-display text-[32px] mb-3" style={{ letterSpacing: "-0.03em" }}>
            {status === "expired" ? "Sessão expirada" : "Algo deu errado"}
          </h2>
          <p className="text-[14px] mb-6" style={{ color: "var(--text-secondary)" }}>
            {status === "expired"
              ? "Sua sessão de pagamento expirou. Tente novamente."
              : "Não conseguimos verificar seu pagamento. Se você já concluiu, aguarde alguns minutos e verifique seu email."}
          </p>
          <button onClick={() => nav("/venda")} className="btn-gold" data-testid="try-again">
            Tentar novamente
          </button>
        </div>
      );
    }

    // pending
    return (
      <div className="text-center" data-testid="status-pending">
        <Loader2 className="w-10 h-10 mx-auto mb-4 animate-spin" style={{ color: "var(--gold)" }} />
        <h2 className="font-display text-[32px] mb-3" style={{ letterSpacing: "-0.03em" }}>Aguardando confirmação...</h2>
        <p className="text-[14px] mb-6" style={{ color: "var(--text-secondary)" }}>
          Se você já concluiu o pagamento, ele chegará em breve. Verifique seu email nos próximos minutos.
        </p>
        <button onClick={() => window.location.reload()} className="btn-ghost">Verificar novamente</button>
      </div>
    );
  };

  return (
    <div className="grain min-h-screen flex flex-col" data-testid="thank-you-page">
      <header className="border-b border-[var(--ink-line)]" style={{ background: "rgba(11,10,15,0.6)", backdropFilter: "blur(12px)" }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))" }}>
              <Gem className="w-4 h-4" style={{ color: "var(--ink-void)" }} />
            </div>
            <div>
              <div className="font-display text-[18px] leading-none">FinPremium</div>
              <div className="text-[9px] uppercase tracking-[0.24em]" style={{ color: "var(--gold)" }}>Wealth OS</div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-2xl w-full">{renderBody()}</div>
      </main>
    </div>
  );
}
