import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, Users, LayoutDashboard, Lock, X } from "lucide-react";

// Seletor de visão para TESTES — permite ao dono pular entre as três
// superfícies do produto (Funil / App / Admin) sem decorar URLs.
// Só aparece em ambiente local (localhost / 127.0.0.1).
const IS_DEV =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

const SURFACES = [
  { id: "funil", label: "Funil", to: "/", icon: Users, hint: "Visão do lead" },
  { id: "app", label: "App", to: "/app", icon: LayoutDashboard, hint: "Produto do cliente" },
  { id: "admin", label: "Admin", to: "/admin", icon: Lock, hint: "Painel do dono" },
];

export default function ViewSwitcher() {
  const nav = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(true);

  if (!IS_DEV) return null;

  const path = location.pathname;
  const active =
    path === "/app" || path.startsWith("/app/")
      ? "app"
      : path.startsWith("/admin")
        ? "admin"
        : "funil";
  const horizontalPosition = active === "app" ? { left: 276 } : { right: 16 };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-testid="viewswitcher-open"
        title="Seletor de visão (teste)"
        style={{
          position: "fixed", ...horizontalPosition, bottom: 16, zIndex: 9999,
          width: 44, height: 44, borderRadius: 999,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))",
          color: "var(--ink-void)", border: "none", cursor: "pointer",
          boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
        }}
      >
        <Eye className="w-5 h-5" strokeWidth={2} />
      </button>
    );
  }

  return (
    <div
      data-testid="viewswitcher"
      style={{
        position: "fixed", ...horizontalPosition, bottom: 16, zIndex: 9999,
        background: "rgba(19,18,24,0.92)", backdropFilter: "blur(16px)",
        border: "1px solid var(--ink-line)", borderRadius: 14,
        padding: 10, minWidth: 190,
        boxShadow: "0 10px 40px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingLeft: 4 }}>
        <span style={{ fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--gold)" }}>
          Visão · teste
        </span>
        <button
          onClick={() => setOpen(false)}
          data-testid="viewswitcher-close"
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", display: "flex" }}
          title="Ocultar"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {SURFACES.map(({ id, label, to, icon: Icon, hint }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => nav(to)}
              data-testid={`viewswitcher-${id}`}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 9, cursor: "pointer",
                border: `1px solid ${isActive ? "var(--gold-deep)" : "transparent"}`,
                background: isActive ? "rgba(201,169,97,0.12)" : "transparent",
                color: isActive ? "var(--gold-bright)" : "var(--text-secondary)",
                textAlign: "left", width: "100%",
              }}
            >
              <Icon className="w-4 h-4" strokeWidth={1.75} />
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
