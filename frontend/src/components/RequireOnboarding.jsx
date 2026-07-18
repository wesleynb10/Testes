import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useFinance } from "@/context/FinanceContext";

// Redireciona contas novas (sem onboarding) para /app/onboarding antes do app.
export default function RequireOnboarding({ children }) {
  const { state, loading } = useFinance();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grain min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--gold-bright)" }} />
      </div>
    );
  }

  const completed = !!state?.profile?.onboardingCompleted;
  if (!completed && location.pathname !== "/app/onboarding") {
    return <Navigate to="/app/onboarding" replace />;
  }

  return children;
}
