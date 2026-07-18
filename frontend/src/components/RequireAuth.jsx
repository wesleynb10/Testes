import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// Protege as rotas do app do cliente (/app/*).
// - user === null  → ainda verificando a sessão (mostra loader)
// - user === false → visitante (redireciona para /app/entrar)
// - object         → autenticado (renderiza a rota)
export default function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading || user === null) {
    return (
      <div className="grain min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--gold-bright)" }} />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/app/entrar" replace state={{ from: location.pathname }} />;
  }

  return children;
}
