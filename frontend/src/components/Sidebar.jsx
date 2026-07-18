import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Wallet,
  TrendingDown,
  Target,
  FileText,
  Receipt,
  Gem,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// Área do cliente (produto). Funil e Admin ficam em superfícies separadas.
const items = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, id: "nav-dashboard" },
  { to: "/app/lancamentos", label: "Lançamentos", icon: Receipt, id: "nav-lancamentos" },
  { to: "/app/orcamento", label: "Orçamento 50/30/20", icon: Wallet, id: "nav-orcamento" },
  { to: "/app/dividas", label: "Controle de Dívidas", icon: TrendingDown, id: "nav-dividas" },
  { to: "/app/metas", label: "Metas & Liberdade", icon: Target, id: "nav-metas" },
  { to: "/app/escopo", label: "Escopo do Produto", icon: FileText, id: "nav-escopo" },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const handleLogout = async () => {
    await logout();
    nav("/app/entrar");
  };

  const displayName = user && typeof user === "object" ? (user.name || user.email) : "";
  const initial = (displayName || "?").trim().charAt(0).toUpperCase();

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
            end={to === "/app"}
            data-testid={id}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer — usuário logado */}
      <div className="px-4 py-4 border-t border-[var(--ink-line)]">
        {displayName && (
          <div className="flex items-center gap-3 px-2 py-2 mb-2" data-testid="sidebar-user">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-semibold text-[14px]"
              style={{ background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))", color: "var(--ink-void)" }}
            >
              {initial}
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{displayName}</div>
              {user?.email && <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{user.email}</div>}
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          data-testid="sidebar-logout"
          className="nav-item w-full"
          style={{ color: "var(--text-secondary)" }}
        >
          <LogOut className="w-[18px] h-[18px]" strokeWidth={1.75} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}
