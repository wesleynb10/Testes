import React, { useEffect, useState } from "react";
import { useAuth, formatApiError } from "@/context/AuthContext";
import { useFinance } from "@/context/FinanceContext";
import { brl } from "@/lib/format";
import {
  Plus, Loader2, Trash2, MessageCircle, Smartphone, AlertCircle, Receipt,
} from "lucide-react";

const CATEGORIES = [
  { id: "necessidades", label: "Necessidades" },
  { id: "desejos", label: "Desejos" },
  { id: "investimentos", label: "Investimentos" },
];

const CAT_COLOR = {
  necessidades: "var(--gold-bright)",
  desejos: "#7A9AB8",
  investimentos: "var(--success)",
};

const PAYMENTS = [
  { id: "", label: "—" },
  { id: "debito", label: "Débito" },
  { id: "credito", label: "Crédito" },
  { id: "pix", label: "Pix" },
  { id: "dinheiro", label: "Dinheiro" },
];

export default function Transactions() {
  const { api } = useAuth();
  const { refreshFinance, completeChecklistItem, syncChecklistFromFacts } = useFinance();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    amount: "", category: "necessidades", subcategory: "", description: "", payment_method: "",
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/transactions");
      const list = data.transactions || [];
      setItems(list);
      setTotal(data.total || 0);
      if (list.length > 0) {
        syncChecklistFromFacts({
          firstTx: true,
          whatsapp: list.some((t) => String(t.source || "").startsWith("whatsapp")),
        });
      }
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(String(form.amount).replace(",", "."));
    if (!amount || amount <= 0) { setError("Informe um valor válido."); return; }
    setBusy(true);
    setError(null);
    try {
      await api.post("/transactions", {
        amount,
        category: form.category,
        subcategory: form.subcategory.trim() || "Outros",
        description: form.description.trim() || "Lançamento",
        payment_method: form.payment_method || null,
      });
      setForm({ amount: "", category: "necessidades", subcategory: "", description: "", payment_method: "" });
      completeChecklistItem("firstTx");
      await Promise.all([load(), refreshFinance()]);
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/transactions/${id}`);
      setItems((prev) => {
        const removed = prev.find((t) => t.id === id);
        if (removed) setTotal((current) => Math.max(0, current - Number(removed.amount || 0)));
        return prev.filter((t) => t.id !== id);
      });
      await refreshFinance();
    } catch (err) {
      setError(formatApiError(err.response?.data?.detail) || err.message);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="p-8 space-y-8" data-testid="transactions-page">
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="eyebrow mb-3">Extrato · Lançamentos</div>
          <h1 className="h-display">
            Seus lançamentos. <span className="text-shimmer">Cada real rastreado.</span>
          </h1>
          <p className="mt-3 text-[15px] max-w-xl" style={{ color: "var(--text-secondary)" }}>
            Registros do app e os que você envia pelo WhatsApp, tudo no mesmo lugar.
          </p>
        </div>
        <div className="card-gold px-6 py-4 text-right">
          <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: "var(--ink-void)", opacity: 0.7 }}>Total lançado</div>
          <div className="font-display text-[26px] leading-none" style={{ color: "var(--ink-void)" }}>{brl(total)}</div>
        </div>
      </header>

      {/* Form de novo lançamento */}
      <form onSubmit={submit} className="card-premium p-6" data-testid="transaction-form">
        <div className="kpi-label mb-4">Novo lançamento</div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <div>
            <label className="text-[11px] uppercase tracking-[0.14em] block mb-2" style={{ color: "var(--text-muted)" }}>Valor (R$)</label>
            <input data-testid="tx-amount" className="input-premium" inputMode="decimal" placeholder="42,50" value={form.amount} onChange={set("amount")} />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[0.14em] block mb-2" style={{ color: "var(--text-muted)" }}>Categoria</label>
            <select data-testid="tx-category" className="input-premium" value={form.category} onChange={set("category")}>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[0.14em] block mb-2" style={{ color: "var(--text-muted)" }}>Subcategoria</label>
            <input data-testid="tx-subcategory" className="input-premium" placeholder="Supermercado" value={form.subcategory} onChange={set("subcategory")} />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[0.14em] block mb-2" style={{ color: "var(--text-muted)" }}>Descrição</label>
            <input data-testid="tx-description" className="input-premium" placeholder="Compras da semana" value={form.description} onChange={set("description")} />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-[0.14em] block mb-2" style={{ color: "var(--text-muted)" }}>Pagamento</label>
            <select data-testid="tx-payment" className="input-premium" value={form.payment_method} onChange={set("payment_method")}>
              {PAYMENTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg flex items-start gap-2 text-[13px]" style={{ background: "rgba(212,106,106,0.08)", border: "1px solid rgba(212,106,106,0.3)", color: "var(--danger)" }} data-testid="tx-error">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-5">
          <button type="submit" disabled={busy} className="btn-gold" data-testid="tx-submit"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", fontSize: 14, opacity: busy ? 0.6 : 1 }}>
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Plus className="w-4 h-4" /> Adicionar</>}
          </button>
        </div>
      </form>

      {/* Lista */}
      <div className="card-premium p-6" data-testid="transaction-list">
        <div className="flex items-center justify-between mb-4">
          <div className="kpi-label">Histórico</div>
          <div className="chip"><Receipt className="w-3 h-3" /> {items.length} registros</div>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--gold-bright)" }} /></div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-[14px]" style={{ color: "var(--text-muted)" }}>
            Nenhum lançamento ainda. Adicione acima ou mande uma mensagem no WhatsApp.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((t) => (
              <div key={t.id} className="flex items-center gap-4 p-4 rounded-xl group"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--ink-line)" }} data-testid="tx-row">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(201,169,97,0.1)", border: "1px solid rgba(201,169,97,0.2)" }}
                  title={t.source?.startsWith("whatsapp") ? "Recebido pelo WhatsApp" : "Lançado no app"}>
                  {t.source?.startsWith("whatsapp")
                    ? <MessageCircle className="w-4 h-4" style={{ color: "#7FB069" }} />
                    : <Smartphone className="w-4 h-4" style={{ color: "var(--gold-bright)" }} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>{t.description}</div>
                  <div className="text-[11px] flex items-center gap-2 flex-wrap" style={{ color: "var(--text-muted)" }}>
                    <span style={{ color: CAT_COLOR[t.category] || "var(--text-secondary)" }}>{t.category}</span>
                    <span>· {t.subcategory}</span>
                    {t.payment_method && <span>· {t.payment_method}</span>}
                    <span>· {new Date(t.occurred_at || t.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                </div>
                <div className="font-mono-num font-semibold text-[15px]" style={{ color: "var(--text-primary)" }}>{brl(t.amount)}</div>
                <button onClick={() => remove(t.id)} data-testid="tx-delete"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg"
                  style={{ color: "var(--danger)" }} title="Excluir">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
