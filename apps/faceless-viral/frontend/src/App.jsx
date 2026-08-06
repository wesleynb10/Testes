import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard.jsx";
import Products from "./pages/Products.jsx";
import Kanban from "./pages/Kanban.jsx";
import Ops from "./pages/Ops.jsx";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "products", label: "Scorecard" },
  { id: "kanban", label: "Fila Kanban" },
  { id: "ops", label: "Checklist / CSV" },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    document.title = "Faceless Viral Ops";
  }, []);

  const refresh = () => setTick((t) => t + 1);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1 className="brand">
            Faceless <span>Viral</span>
          </h1>
          <p className="tagline">
            Ops TikTok-first — Researcher escolhe produtos, fila de roteiros e
            tracking afiliado → loja → ads.
          </p>
        </div>
        <nav className="nav">
          {TABS.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "active" : ""}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "dashboard" && <Dashboard key={`d-${tick}`} onRefresh={refresh} />}
      {tab === "products" && <Products key={`p-${tick}`} onChanged={refresh} />}
      {tab === "kanban" && <Kanban key={`k-${tick}`} onChanged={refresh} />}
      {tab === "ops" && <Ops key={`o-${tick}`} />}
    </div>
  );
}
