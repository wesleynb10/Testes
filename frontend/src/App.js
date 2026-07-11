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
import { FinanceProvider } from "@/context/FinanceContext";

function Shell({ children }) {
  const location = useLocation();
  // Calculator is a public landing page — hide sidebar
  const isPublic = location.pathname === "/calculadora";
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
    <FinanceProvider>
      <BrowserRouter>
        <Shell>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orcamento" element={<Budget />} />
            <Route path="/dividas" element={<Debts />} />
            <Route path="/metas" element={<Goals />} />
            <Route path="/calculadora" element={<Calculator />} />
            <Route path="/bonus" element={<Bonus />} />
            <Route path="/escopo" element={<Scope />} />
          </Routes>
        </Shell>
      </BrowserRouter>
    </FinanceProvider>
  );
}

export default App;
