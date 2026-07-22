import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api.js";

const empty = {
  name: "",
  niche: "casa",
  price: 49.9,
  affiliate_url: "",
  supplier_url: "",
  pain: "",
  hook_visual: "",
  benefits: "Rápido. Barato. Cabe no dia a dia.",
  researcher: "",
  score_hook: 2,
  score_price: 2,
  score_problem: 2,
  score_margin: 1,
  score_social: 1,
  notes: "",
};

export default function Products({ onChanged }) {
  const [form, setForm] = useState(empty);
  const [products, setProducts] = useState([]);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .products()
      .then(setProducts)
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  const scoreTotal = useMemo(
    () =>
      Number(form.score_hook) +
      Number(form.score_price) +
      Number(form.score_problem) +
      Number(form.score_margin) +
      Number(form.score_social),
    [form]
  );

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createProduct({
        ...form,
        price: Number(form.price),
        score_hook: Number(form.score_hook),
        score_price: Number(form.score_price),
        score_problem: Number(form.score_problem),
        score_margin: Number(form.score_margin),
        score_social: Number(form.score_social),
      });
      setForm(empty);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    setError("");
    try {
      const data = await api.previewScore({
        ...form,
        price: Number(form.price),
        score_hook: Number(form.score_hook),
        score_price: Number(form.score_price),
        score_problem: Number(form.score_problem),
        score_margin: Number(form.score_margin),
        score_social: Number(form.score_social),
      });
      setPreview(data);
    } catch (err) {
      setError(err.message);
    }
  };

  const generate = async (id) => {
    setBusy(true);
    setError("");
    try {
      await api.generateScripts(id);
      onChanged?.();
      alert("5 hooks gerados — veja a Fila Kanban");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="panel">
        <h2>Scorecard do Researcher</h2>
        <p className="sub">
          Cada critério 0–2. Produzir só se total ≥ 7. Você (Closer) só veta
          compliance/margem.
        </p>
        <form className="form-grid" onSubmit={submit}>
          <label>
            Produto
            <input
              required
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
            />
          </label>
          <label>
            Nicho
            <input
              value={form.niche}
              onChange={(e) => setField("niche", e.target.value)}
            />
          </label>
          <label>
            Preço
            <input
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setField("price", e.target.value)}
            />
          </label>
          <label>
            Researcher
            <input
              value={form.researcher}
              onChange={(e) => setField("researcher", e.target.value)}
              placeholder="nome do researcher"
            />
          </label>
          <label className="full">
            Dor
            <input
              value={form.pain}
              onChange={(e) => setField("pain", e.target.value)}
            />
          </label>
          <label className="full">
            Hook visual (1 frase)
            <input
              value={form.hook_visual}
              onChange={(e) => setField("hook_visual", e.target.value)}
            />
          </label>
          <label className="full">
            Benefícios
            <textarea
              value={form.benefits}
              onChange={(e) => setField("benefits", e.target.value)}
            />
          </label>
          <label className="full">
            Link afiliado
            <input
              value={form.affiliate_url}
              onChange={(e) => setField("affiliate_url", e.target.value)}
            />
          </label>
          <label className="full">
            Link fornecedor
            <input
              value={form.supplier_url}
              onChange={(e) => setField("supplier_url", e.target.value)}
            />
          </label>

          {[
            ["score_hook", "Hook visual"],
            ["score_price", "Preço impulso"],
            ["score_problem", "Problema claro"],
            ["score_margin", "Margem"],
            ["score_social", "Prova social"],
          ].map(([key, label]) => (
            <label key={key}>
              {label} (0–2)
              <select
                value={form[key]}
                onChange={(e) => setField(key, e.target.value)}
              >
                <option value={0}>0</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </label>
          ))}

          <div className="full">
            <p className="muted">
              Score parcial: <strong>{scoreTotal}</strong> / 10 —{" "}
              {scoreTotal >= 7 ? "PRODUZIR" : "ARQUIVAR"}
            </p>
            {preview && (
              <p className="muted">
                Preview API: {preview.score}/10 → {preview.decision}
              </p>
            )}
            {error && <p className="error">{error}</p>}
            <div className="actions">
              <button type="button" className="btn btn-ghost" onClick={runPreview}>
                Preview score
              </button>
              <button className="btn btn-primary" disabled={busy}>
                Salvar ficha
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="panel">
        <h2>Pipeline de produtos</h2>
        <p className="sub">Ranqueado por score — gere 5 hooks nos ≥7</p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Produto</th>
                <th>Researcher</th>
                <th>Score</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <div className="muted">{p.pain || "—"}</div>
                  </td>
                  <td>{p.researcher || "—"}</td>
                  <td>{p.score}/10</td>
                  <td>
                    <span className={`badge badge-${p.status}`}>{p.status}</span>
                  </td>
                  <td>
                    <button
                      className="btn btn-teal"
                      disabled={busy || (p.score < 7 && p.status !== "produce")}
                      onClick={() => generate(p.id)}
                    >
                      Gerar 5 hooks
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    Nenhuma ficha ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
