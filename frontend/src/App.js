import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import ViewSwitcher from "@/components/ViewSwitcher";
import RequireAuth from "@/components/RequireAuth";
import RequireOnboarding from "@/components/RequireOnboarding";
import FinanceStatus from "@/components/FinanceStatus";
import Dashboard from "@/pages/Dashboard";
import Budget from "@/pages/Budget";
import Debts from "@/pages/Debts";
import Goals from "@/pages/Goals";
import Bonus from "@/pages/Bonus";
import Scope from "@/pages/Scope";
import Transactions from "@/pages/Transactions";
import ClientAuth from "@/pages/ClientAuth";
import Onboarding from "@/pages/Onboarding";
import Calculator from "@/pages/Calculator";
import SalesPage from "@/pages/SalesPage";
import ThankYou from "@/pages/ThankYou";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import { FinanceProvider } from "@/context/FinanceContext";
import { AuthProvider } from "@/context/AuthContext";

// The product app (client area) is the only surface that uses the sidebar.
// Funnel (landing/calculadora/venda/obrigado/bonus) and Admin have their own layouts.
function Shell({ children }) {
  const location = useLocation();
  const isApp =
    (location.pathname === "/app" || location.pathname.startsWith("/app/")) &&
    location.pathname !== "/app/entrar" &&
    location.pathname !== "/app/onboarding";
  if (!isApp) return <div className="grain min-h-screen">{children}</div>;
  return (
    <div className="grain flex" style={{ minHeight: "100vh" }}>
      <Sidebar />
      <main className="flex-1 min-w-0">
        <FinanceStatus />
        {children}
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <FinanceProvider>
        <BrowserRouter>
          <Shell>
            <Routes>
              {/* ---------- Funil público (visão do lead) ---------- */}
              <Route path="/" element={<SalesPage />} />
              <Route path="/venda" element={<SalesPage />} />
              <Route path="/calculadora" element={<Calculator />} />
              <Route path="/obrigado" element={<ThankYou />} />
              <Route path="/bonus" element={<Bonus />} />

              {/* ---------- App do cliente (produto) ---------- */}
              <Route path="/app/entrar" element={<ClientAuth />} />
              <Route path="/app/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
              <Route path="/app" element={<RequireAuth><RequireOnboarding><Dashboard /></RequireOnboarding></RequireAuth>} />
              <Route path="/app/lancamentos" element={<RequireAuth><RequireOnboarding><Transactions /></RequireOnboarding></RequireAuth>} />
              <Route path="/app/orcamento" element={<RequireAuth><RequireOnboarding><Budget /></RequireOnboarding></RequireAuth>} />
              <Route path="/app/dividas" element={<RequireAuth><RequireOnboarding><Debts /></RequireOnboarding></RequireAuth>} />
              <Route path="/app/metas" element={<RequireAuth><RequireOnboarding><Goals /></RequireOnboarding></RequireAuth>} />
              <Route path="/app/escopo" element={<RequireAuth><RequireOnboarding><Scope /></RequireOnboarding></RequireAuth>} />

              {/* ---------- Admin (dono) ---------- */}
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminDashboard />} />

              {/* ---------- Redirects de compatibilidade ---------- */}
              <Route path="/orcamento" element={<Navigate to="/app/orcamento" replace />} />
              <Route path="/dividas" element={<Navigate to="/app/dividas" replace />} />
              <Route path="/metas" element={<Navigate to="/app/metas" replace />} />
              <Route path="/escopo" element={<Navigate to="/app/escopo" replace />} />
              <Route path="/dashboard" element={<Navigate to="/app" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Shell>
          <ViewSwitcher />
        </BrowserRouter>
      </FinanceProvider>
    </AuthProvider>
  );
}

export default App;
