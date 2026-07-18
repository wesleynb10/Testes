import React, { useState } from "react";
import { useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth, formatApiError } from "@/context/AuthContext";
import { readLeadEmail, saveLeadEmail } from "@/lib/leadEmail";
import { Gem, Loader2, AlertCircle, Mail, Lock, User, Phone } from "lucide-react";

// Tela única de entrada do cliente: alterna entre Entrar e Criar conta.
// No cadastro pedimos o WhatsApp para vincular os lançamentos recebidos por lá.
export default function ClientAuth() {
  const nav = useNavigate();
  const location = useLocation();
  const { user, login, register } = useAuth();

  const [mode, setMode] = useState("login"); // login | signup
  const [name, setName] = useState("");
  const [email, setEmail] = useState(() => readLeadEmail());
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const dest = location.state?.from && location.state.from !== "/app/entrar" ? location.state.from : "/app";

  if (user) return <Navigate to={dest} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        await register({ name: name.trim(), email: email.trim(), password, phone: phone.trim() });
      } else {
        await login(email.trim(), password);
      }
      saveLeadEmail(email.trim());
      nav(dest);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const isSignup = mode === "signup";

  return (
    <div className="grain min-h-screen flex items-center justify-center px-6" data-testid="client-auth-page">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))", boxShadow: "0 8px 30px rgba(201,169,97,0.35)" }}
          >
            <Gem className="w-7 h-7" style={{ color: "var(--ink-void)" }} />
          </div>
          <div className="font-display text-[28px]" style={{ letterSpacing: "-0.02em" }}>
            Fin<span style={{ color: "var(--gold-bright)" }}>Premium</span>
          </div>
          <div className="text-[11px] uppercase tracking-[0.24em] mt-1" style={{ color: "var(--gold)" }}>
            {isSignup ? "Crie sua conta" : "Acesse sua conta"}
          </div>
        </div>

        {/* Toggle */}
        <div className="flex gap-1 p-1 mb-5 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--ink-line)" }}>
          {[
            { id: "login", label: "Entrar" },
            { id: "signup", label: "Criar conta" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`auth-tab-${t.id}`}
              onClick={() => { setMode(t.id); setError(null); }}
              className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold transition-colors"
              style={{
                background: mode === t.id ? "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))" : "transparent",
                color: mode === t.id ? "var(--ink-void)" : "var(--text-secondary)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="card-premium p-8 fade-up" data-testid="client-auth-form">
          <div className="space-y-4">
            {isSignup && (
              <Field icon={User} label="Nome">
                <input
                  data-testid="auth-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-premium"
                  placeholder="Seu nome"
                />
              </Field>
            )}

            <Field icon={Mail} label="Email">
              <input
                data-testid="auth-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-premium"
                placeholder="seu@email.com"
              />
            </Field>

            <Field icon={Lock} label="Senha">
              <input
                data-testid="auth-password"
                type="password"
                required
                autoComplete={isSignup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-premium"
                placeholder={isSignup ? "Mínimo 6 caracteres" : "••••••••"}
              />
            </Field>

            {isSignup && (
              <Field icon={Phone} label="WhatsApp" hint="Para lançar gastos por mensagem">
                <input
                  data-testid="auth-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input-premium"
                  placeholder="+55 11 99999-9999"
                />
              </Field>
            )}

            {error && (
              <div
                className="p-3 rounded-lg flex items-start gap-2 text-[13px]"
                style={{ background: "rgba(212,106,106,0.08)", border: "1px solid rgba(212,106,106,0.3)", color: "var(--danger)" }}
                data-testid="auth-error"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn-gold w-full"
              data-testid="auth-submit"
              style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "14px", fontSize: 14, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {isSignup ? "Criando..." : "Entrando..."}</>
              ) : (
                isSignup ? "Criar conta" : "Entrar"
              )}
            </button>
          </div>
        </form>

        <div className="text-center mt-6 text-[12px]" style={{ color: "var(--text-muted)" }}>
          {isSignup ? "Já tem conta? " : "Ainda não tem conta? "}
          <button
            type="button"
            onClick={() => { setMode(isSignup ? "login" : "signup"); setError(null); }}
            className="underline"
            style={{ color: "var(--gold-bright)" }}
            data-testid="auth-switch"
          >
            {isSignup ? "Entrar" : "Criar agora"}
          </button>
        </div>

        <div className="text-center mt-3">
          <button onClick={() => nav("/")} className="text-[12px] underline" style={{ color: "var(--text-secondary)" }} data-testid="auth-back-home">
            ← Voltar para a página inicial
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, hint, children }) {
  return (
    <div>
      <label className="text-[11px] uppercase tracking-[0.14em] mb-2 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
        <Icon className="w-3.5 h-3.5" style={{ color: "var(--gold)" }} />
        {label}
        {hint && <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--text-muted)", opacity: 0.7 }}>· {hint}</span>}
      </label>
      {children}
    </div>
  );
}
