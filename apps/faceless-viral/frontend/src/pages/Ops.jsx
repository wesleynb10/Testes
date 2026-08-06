import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

export default function Ops() {
  const [checklist, setChecklist] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadChecklist = () =>
    api
      .checklist()
      .then(setChecklist)
      .catch((err) => setError(err.message));

  useEffect(() => {
    loadChecklist();
  }, []);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setMessage("");
    try {
      const result = await api.importCsv(file);
      setMessage(
        `Importado: ${result.posts_created} posts, ${result.conversions_created} conversões`
      );
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <section className="panel">
        <h2>Checklist diário</h2>
        <p className="sub">Export markdown — Researcher / Editor / Poster / Closer</p>
        <div className="actions">
          <button className="btn btn-ghost" onClick={loadChecklist}>
            Atualizar
          </button>
          <a
            className="btn btn-primary"
            href="/api/metrics/checklist"
            download="checklist-diario.md"
          >
            Baixar .md
          </a>
        </div>
        <pre className="checklist" style={{ marginTop: 14 }}>
          {checklist || "…"}
        </pre>
      </section>

      <section className="panel">
        <h2>Import CSV de métricas</h2>
        <p className="sub">
          Enquanto APIs oficiais forem limitadas — cole views/CTR/vendas do
          TikTok.
        </p>
        <div className="actions">
          <a className="btn btn-ghost" href="/api/metrics/csv-template" download>
            Baixar template CSV
          </a>
          <label className="btn btn-teal" style={{ cursor: "pointer" }}>
            Enviar CSV
            <input type="file" accept=".csv,text/csv" hidden onChange={onFile} />
          </label>
        </div>
        {message && <p className="muted" style={{ marginTop: 12 }}>{message}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </>
  );
}
