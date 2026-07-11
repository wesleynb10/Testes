import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth, formatApiError } from "@/context/AuthContext";
import { Gem, Lock, Loader2, AlertCircle } from "lucide-react";

export default function AdminLogin() {
  const nav = useNavigate();
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user && user.role === "admin") return <Navigate to="/admin" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      nav("/admin");
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grain min-h-screen flex items-center justify-center px-6" data-testid="admin-login-page">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))", boxShadow: "0 8px 30px rgba(201,169,97,0.35)" }}
          >
            <Gem className="w-7 h-7" style={{ color: "var(--ink-void)" }} />
          </div>
          <div className="font-display text-[28px]" style={{ letterSpacing: "-0.02em" }}>
            FinPremium <span style={{ color: "var(--gold-bright)" }}>Admin</span>
          </div>
          <div className="text-[11px] uppercase tracking-[0.24em] mt-1" style={{ color: "var(--gold)" }}>
            Painel do Infoprodutor
          </div>
        </div>

        <form onSubmit={submit} className="card-premium p-8 fade-up" data-testid="admin-login-form">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="w-4 h-4" style={{ color: "var(--gold)" }} />
            <div className="eyebrow" style={{ margin: 0 }}>Área restrita</div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-[0.14em] block mb-2" style={{ color: "var(--text-muted)" }}>
                Email
              </label>
              <input
                data-testid="login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-premium"
                placeholder="seu@email.com"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-[0.14em] block mb-2" style={{ color: "var(--text-muted)" }}>
                Senha
              </label>
              <input
                data-testid="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-premium"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div
                className="p-3 rounded-lg flex items-start gap-2 text-[13px]"
                style={{ background: "rgba(212,106,106,0.08)", border: "1px solid rgba(212,106,106,0.3)", color: "var(--danger)" }}
                data-testid="login-error"
              >
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn-gold w-full"
              data-testid="login-submit"
              style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, padding: "14px", fontSize: 14, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</> : "Entrar"}
            </button>
          </div>
        </form>

        <div className="text-center mt-6 text-[11px]" style={{ color: "var(--text-muted)" }}>
          🔒 Sessão segura com cookie httpOnly · JWT 12h
        </div>

        <div className="text-center mt-2">
          <button onClick={() => nav("/")} className="text-[12px] underline" style={{ color: "var(--text-secondary)" }} data-testid="back-to-app">
            ← Voltar para o app
          </button>
        </div>
      </div>
    </div>
  );
}
