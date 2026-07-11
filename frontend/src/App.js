import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Sidebar from "@/components/Sidebar";
import Dashboard from "@/pages/Dashboard";
import Budget from "@/pages/Budget";
import Debts from "@/pages/Debts";
import Goals from "@/pages/Goals";
import Bonus from "@/pages/Bonus";
import Scope from "@/pages/Scope";
import Calculator from "@/pages/Calculator";
import SalesPage from "@/pages/SalesPage";
import ThankYou from "@/pages/ThankYou";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import { FinanceProvider } from "@/context/FinanceContext";
import { AuthProvider } from "@/context/AuthContext";

function Shell({ children }) {
  const location = useLocation();
  // Public routes have their own layout (no sidebar)
  const publicRoutes = ["/calculadora", "/venda", "/obrigado", "/admin", "/admin/login"];
  const isPublic = publicRoutes.some((r) => location.pathname === r || location.pathname.startsWith(r + "/"));
  if (isPublic) return <div className="grain min-h-screen">{children}</div>;
  return (
    <div className="grain flex" style={{ minHeight: "100vh" }}>
      <Sidebar />
      <main className="flex-1 min-w-0">{children}</main>
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
              <Route path="/" element={<Dashboard />} />
              <Route path="/orcamento" element={<Budget />} />
              <Route path="/dividas" element={<Debts />} />
              <Route path="/metas" element={<Goals />} />
              <Route path="/calculadora" element={<Calculator />} />
              <Route path="/venda" element={<SalesPage />} />
              <Route path="/obrigado" element={<ThankYou />} />
              <Route path="/bonus" element={<Bonus />} />
              <Route path="/escopo" element={<Scope />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<AdminDashboard />} />
            </Routes>
          </Shell>
        </BrowserRouter>
      </FinanceProvider>
    </AuthProvider>
  );
}

export default App;
