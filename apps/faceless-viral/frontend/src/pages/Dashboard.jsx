import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .dashboard()
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Carregando dashboard…</p>;

  const kpis = [
    { label: "Produtos", value: data.products_total },
    { label: "Em produção+", value: data.products_produce },
    { label: "Posts", value: data.posts_total },
    { label: "Views", value: data.views_total },
    { label: "Cliques", value: data.clicks_total },
    { label: "Pedidos", value: data.orders_total },
    { label: "Receita", value: `R$ ${data.revenue_total.toFixed(2)}` },
    { label: "Ret. 3s méd.", value: `${(data.avg_retention_3s * 100).toFixed(0)}%` },
  ];

  return (
    <>
      <div className="grid-kpi">
        {kpis.map((kpi) => (
          <div className="kpi" key={kpi.label}>
            <div className="label">{kpi.label}</div>
            <div className="value">{kpi.value}</div>
          </div>
        ))}
      </div>

      <section className="panel">
        <h2>Fila por status</h2>
        <p className="sub">Roteiro → edição → pronto → postado (TikTok)</p>
        <div className="grid-kpi">
          {Object.entries(data.scripts_by_status).map(([status, count]) => (
            <div className="kpi" key={status}>
              <div className="label">{status}</div>
              <div className="value">{count}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Alerts kill / scale</h2>
        <p className="sub">Regras do playbook — Researcher e Closer revisam</p>
        {data.alerts.length === 0 ? (
          <p className="muted">Nenhum alerta ainda. Importe métricas ou registre posts.</p>
        ) : (
          <div className="alerts">
            {data.alerts.map((alert, idx) => (
              <div className={`alert ${alert.level}`} key={idx}>
                <strong>{alert.type}</strong> — {alert.message}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
