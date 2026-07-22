import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

const COLUMNS = [
  { id: "roteiro", label: "Roteiro" },
  { id: "edicao", label: "Edição" },
  { id: "pronto", label: "Pronto" },
  { id: "postado", label: "Postado" },
];

const NEXT = {
  roteiro: "edicao",
  edicao: "pronto",
  pronto: "postado",
};

export default function Kanban({ onChanged }) {
  const [board, setBoard] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .kanban()
      .then(setBoard)
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const advance = async (script) => {
    const next = NEXT[script.status];
    if (!next) return;
    setBusy(true);
    setError("");
    try {
      await api.updateScript(script.id, next);
      if (next === "postado") {
        await api.createPost({
          script_id: script.id,
          product_id: script.product_id,
          platform: "tiktok",
          account: "tiktok-1",
        });
      }
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !board) return <p className="error">{error}</p>;
  if (!board) return <p className="muted">Carregando fila…</p>;

  return (
    <section className="panel">
      <h2>Fila de produção</h2>
      <p className="sub">
        TikTok-first. Avançar card = mudar status. Em “Pronto → Postado” cria
        post TikTok.
      </p>
      {error && <p className="error">{error}</p>}
      <div className="kanban">
        {COLUMNS.map((col) => (
          <div className="column" key={col.id}>
            <h3>
              {col.label} ({board[col.id]?.length || 0})
            </h3>
            {(board[col.id] || []).map((script) => (
              <div className="card-item" key={script.id}>
                <h4>
                  {script.product_name} · {script.hook_type}
                </h4>
                <p>{script.body}</p>
                <div className="row">
                  {NEXT[script.status] && (
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => advance(script)}
                    >
                      → {NEXT[script.status]}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
