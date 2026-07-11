import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Wallet,
  TrendingDown,
  Target,
  Gift,
  FileText,
  Gem,
  Calculator as CalcIcon,
  ShoppingBag,
} from "lucide-react";

const items = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, id: "nav-dashboard" },
  { to: "/orcamento", label: "Orçamento 50/30/20", icon: Wallet, id: "nav-orcamento" },
  { to: "/dividas", label: "Controle de Dívidas", icon: TrendingDown, id: "nav-dividas" },
  { to: "/metas", label: "Metas & Liberdade", icon: Target, id: "nav-metas" },
  { to: "/calculadora", label: "Calculadora Pública", icon: CalcIcon, id: "nav-calculadora" },
  { to: "/venda", label: "Landing de Vendas", icon: ShoppingBag, id: "nav-venda" },
  { to: "/bonus", label: "Bônus Premium", icon: Gift, id: "nav-bonus" },
  { to: "/escopo", label: "Escopo do Produto", icon: FileText, id: "nav-escopo" },
];

export default function Sidebar() {
  return (
    <aside
      data-testid="app-sidebar"
      className="w-[260px] shrink-0 border-r border-[var(--ink-line)] h-screen sticky top-0 flex flex-col"
      style={{ background: "rgba(11, 10, 15, 0.6)", backdropFilter: "blur(20px)" }}
    >
      {/* Brand */}
      <div className="px-6 pt-8 pb-6 border-b border-[var(--ink-line)]">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))",
              boxShadow: "0 4px 18px rgba(201,169,97,0.35)",
            }}
          >
            <Gem className="w-5 h-5" style={{ color: "var(--ink-void)" }} />
          </div>
          <div>
            <div className="font-display text-[20px] leading-none" style={{ letterSpacing: "-0.02em" }}>
              FinPremium
            </div>
            <div className="text-[10px] uppercase tracking-[0.22em]" style={{ color: "var(--gold)" }}>
              Wealth OS
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map(({ to, label, icon: Icon, id }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            data-testid={id}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-6 py-5 border-t border-[var(--ink-line)]">
        <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--text-muted)" }}>
          v1.1 · Premium Edition
        </div>
        <div className="mt-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          Feito para quem <span className="text-shimmer font-semibold">domina o próprio dinheiro.</span>
        </div>
      </div>
    </aside>
  );
}
