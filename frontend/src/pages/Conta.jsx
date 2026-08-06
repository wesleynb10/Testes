import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Phone, Check, AlertCircle, ExternalLink } from "lucide-react";
import { useAuth, formatApiError } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";

const SANDBOX_NUMBER = "+1 415 523 8886";

function formatPhoneDisplay(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  return raw.startsWith("+") ? raw : `+${raw}`;
}

export default function Conta() {
  const { user, setPhone: savePhone } = useAuth();
  const { syncChecklistFromFacts } = useFinance();
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const linked = formatPhoneDisplay(user?.phone);

  useEffect(() => {
    setPhone(linked || "+55");
  }, [linked]);

  useEffect(() => {
    if (linked) {
      syncChecklistFromFacts({ whatsapp: true });
    }
  }, [linked, syncChecklistFromFacts]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setOk("");
    try {
      const data = await savePhone(phone.trim());
      setOk(`WhatsApp vinculado: ${formatPhoneDisplay(data.phone)}`);
      syncChecklistFromFacts({ whatsapp: true });
    } catch (err) {
      setError(formatApiError(err?.response?.data?.detail) || "Não foi possível vincular.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl space-y-6" data-testid="conta-page">
      <div>
        <div className="eyebrow mb-2">Conta</div>
        <h1 className="font-display text-[36px] leading-tight" style={{ letterSpacing: "-0.03em" }}>
          Vincular WhatsApp
        </h1>
        <p className="mt-3 text-[14px]" style={{ color: "var(--text-secondary)" }}>
          Use o mesmo número do celular para lançar gastos por texto, foto ou áudio no WhatsApp.
        </p>
      </div>

      <section className="card-premium p-6 space-y-5" data-testid="whatsapp-link-card">
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(201,169,97,0.2), rgba(139,122,62,0.08))",
              border: "1px solid rgba(201,169,97,0.3)",
            }}
          >
            <MessageCircle className="w-5 h-5" style={{ color: "var(--gold-bright)" }} />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-[22px]" style={{ letterSpacing: "-0.02em" }}>
              Seu número
            </h2>
            {linked ? (
              <p className="mt-1 text-[13px] flex items-center gap-1.5" style={{ color: "var(--success)" }}>
                <Check className="w-3.5 h-3.5" /> Vinculado: <span className="font-mono-num">{linked}</span>
              </p>
            ) : (
              <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
                Ainda não há WhatsApp nesta conta.
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.14em] flex items-center gap-1.5 mb-2" style={{ color: "var(--text-muted)" }}>
              <Phone className="w-3.5 h-3.5" /> WhatsApp com DDI
            </span>
            <input
              data-testid="conta-phone-input"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input-premium font-mono-num"
              placeholder="+55 85 99999-9999"
              autoComplete="tel"
            />
          </label>

          {error && (
            <div
              className="p-3 rounded-lg flex items-start gap-2 text-[13px]"
              style={{ background: "rgba(212,106,106,0.08)", border: "1px solid rgba(212,106,106,0.3)", color: "var(--danger)" }}
              data-testid="conta-phone-error"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {ok && (
            <div
              className="p-3 rounded-lg flex items-start gap-2 text-[13px]"
              style={{ background: "rgba(127,176,105,0.1)", border: "1px solid rgba(127,176,105,0.3)", color: "var(--success)" }}
              data-testid="conta-phone-success"
            >
              <Check className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{ok}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="btn-gold"
            data-testid="conta-phone-save"
            style={{ opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Salvando..." : linked ? "Atualizar WhatsApp" : "Vincular WhatsApp"}
          </button>
        </form>
      </section>

      <section className="card-premium p-6 space-y-3" data-testid="whatsapp-howto">
        <h2 className="font-display text-[20px]" style={{ letterSpacing: "-0.02em" }}>
          Como testar
        </h2>
        <ol className="space-y-2 text-[13px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          <li>
            1. No WhatsApp, envie o código <code className="font-mono-num">join …</code> do Twilio Sandbox para{" "}
            <strong style={{ color: "var(--text-primary)" }}>{SANDBOX_NUMBER}</strong>.
          </li>
          <li>2. Vincule acima o <strong style={{ color: "var(--text-primary)" }}>mesmo número</strong> do seu celular.</li>
          <li>
            3. Envie no sandbox: <em>Almoço R$ 42,50 no pix</em> e confirme com <strong>SIM</strong>.
          </li>
          <li>
            4. Veja o lançamento em{" "}
            <Link to="/app/lancamentos" className="inline-flex items-center gap-1" style={{ color: "var(--gold-bright)" }}>
              Lançamentos <ExternalLink className="w-3 h-3" />
            </Link>
            .
          </li>
        </ol>
      </section>
    </div>
  );
}
