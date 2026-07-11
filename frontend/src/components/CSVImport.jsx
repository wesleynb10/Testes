import React, { useRef, useState } from "react";
import { parseCSV, normalizeTransactions } from "@/lib/csvImport";
import { useFinance } from "@/context/FinanceContext";
import { brl } from "@/lib/format";
import { Upload, FileSpreadsheet, Check, X, Sparkles, ChevronRight } from "lucide-react";

const CAT_LABELS = {
  necessidades: "Necessidades",
  desejos: "Desejos",
  investimentos: "Investimentos",
};

export default function CSVImport({ onClose }) {
  const inputRef = useRef();
  const { state, updateBudgetItem, addBudgetItem } = useFinance();
  const [step, setStep] = useState("upload"); // upload | review | done
  const [transactions, setTransactions] = useState([]);
  const [imported, setImported] = useState(0);

  const handleFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCSV(text);
    const tx = normalizeTransactions(parsed).map((t, i) => ({
      ...t,
      id: `tx${i}`,
      selected: !!t.suggestion,
      // allow user to override
      category: t.suggestion?.category || "desejos",
      subcategory: t.suggestion?.subcategory || "Compras / Lazer",
    }));
    setTransactions(tx);
    setStep("review");
  };

  const toggle = (id) =>
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t)));

  const setCategory = (id, category) =>
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, category } : t)));

  const applyImport = () => {
    // Aggregate selected transactions by (category, subcategory)
    const grouped = {};
    transactions
      .filter((t) => t.selected && t.value !== 0)
      .forEach((t) => {
        const key = `${t.category}::${t.subcategory}`;
        grouped[key] = (grouped[key] || 0) + Math.abs(t.value);
      });

    let count = 0;
    Object.entries(grouped).forEach(([key, sum]) => {
      const [cat, subcat] = key.split("::");
      const existing = state.budget[cat]?.find((it) => it.name.toLowerCase() === subcat.toLowerCase());
      if (existing) {
        updateBudgetItem(cat, existing.id, { actual: existing.actual + sum });
      } else {
        addBudgetItem(cat, { name: subcat, planned: sum, actual: sum });
      }
      count++;
    });

    setImported(transactions.filter((t) => t.selected).length);
    setStep("done");
  };

  const totalSelected = transactions.filter((t) => t.selected).length;
  const totalValue = transactions.filter((t) => t.selected).reduce((s, t) => s + Math.abs(t.value), 0);
  const autoMatched = transactions.filter((t) => t.suggestion).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(7, 6, 10, 0.85)", backdropFilter: "blur(8px)" }}
      data-testid="csv-import-modal"
    >
      <div
        className="card-premium max-w-4xl w-full max-h-[85vh] flex flex-col fade-up"
        style={{ background: "linear-gradient(180deg, #1B1A22, #131218)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--ink-line)]">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))" }}
            >
              <FileSpreadsheet className="w-5 h-5" style={{ color: "var(--ink-void)" }} />
            </div>
            <div>
              <div className="eyebrow">Importar Extrato Bancário</div>
              <div className="font-display text-[20px]" style={{ letterSpacing: "-0.02em" }}>
                {step === "upload" && "Selecione um arquivo CSV"}
                {step === "review" && "Revise & categorize"}
                {step === "done" && "Importação concluída"}
              </div>
            </div>
          </div>
          <button
            data-testid="csv-close"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgba(212,106,106,0.1)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
          {step === "upload" && (
            <div
              className="border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors"
              style={{ borderColor: "rgba(201,169,97,0.3)", background: "rgba(201,169,97,0.03)" }}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFile(e.dataTransfer.files?.[0]);
              }}
              data-testid="csv-dropzone"
            >
              <Upload className="w-12 h-12 mx-auto mb-4" style={{ color: "var(--gold-bright)" }} strokeWidth={1.5} />
              <div className="font-display text-[20px] mb-2" style={{ color: "var(--text-primary)" }}>
                Arraste seu CSV aqui
              </div>
              <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                ou clique para selecionar do computador
              </div>
              <div className="text-[11px] mt-4" style={{ color: "var(--text-muted)" }}>
                Suporta extratos de Nubank, Itaú, Bradesco, Santander, Inter, C6 (formato CSV)
              </div>
              <input
                data-testid="csv-input"
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
            </div>
          )}

          {step === "review" && (
            <div data-testid="csv-review">
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="p-4 rounded-lg" style={{ background: "rgba(11,10,15,0.5)", border: "1px solid var(--ink-line)" }}>
                  <div className="kpi-label mb-1">Transações</div>
                  <div className="font-display text-[24px] font-mono-num">{transactions.length}</div>
                </div>
                <div className="p-4 rounded-lg" style={{ background: "rgba(201,169,97,0.06)", border: "1px solid rgba(201,169,97,0.25)" }}>
                  <div className="kpi-label mb-1">Auto-categorizadas</div>
                  <div className="font-display text-[24px] font-mono-num" style={{ color: "var(--gold-bright)" }}>
                    {autoMatched}
                  </div>
                </div>
                <div className="p-4 rounded-lg" style={{ background: "rgba(11,10,15,0.5)", border: "1px solid var(--ink-line)" }}>
                  <div className="kpi-label mb-1">Total selecionado</div>
                  <div className="font-display text-[24px] font-mono-num">{brl(totalValue)}</div>
                </div>
              </div>

              <table className="table-premium">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}></th>
                    <th>Descrição</th>
                    <th style={{ width: 120 }}>Valor</th>
                    <th style={{ width: 200 }}>Categoria</th>
                    <th style={{ width: 120 }}>Match</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={t.selected}
                          onChange={() => toggle(t.id)}
                          data-testid={`csv-check-${t.id}`}
                          style={{ accentColor: "var(--gold)" }}
                        />
                      </td>
                      <td className="text-[13px]">{t.description}</td>
                      <td className="font-mono-num text-[13px]">{brl(Math.abs(t.value))}</td>
                      <td>
                        <select
                          value={t.category}
                          onChange={(e) => setCategory(t.id, e.target.value)}
                          className="input-premium"
                          style={{ padding: "6px 10px", fontSize: 12 }}
                          data-testid={`csv-cat-${t.id}`}
                        >
                          <option value="necessidades">Necessidades</option>
                          <option value="desejos">Desejos</option>
                          <option value="investimentos">Investimentos</option>
                        </select>
                      </td>
                      <td>
                        {t.suggestion ? (
                          <span className="chip gold" style={{ fontSize: 10 }}>
                            <Sparkles className="w-3 h-3" /> auto
                          </span>
                        ) : (
                          <span className="chip" style={{ fontSize: 10, color: "var(--text-muted)" }}>manual</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {step === "done" && (
            <div className="text-center py-8" data-testid="csv-done">
              <div
                className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))",
                  boxShadow: "0 4px 30px rgba(201,169,97,0.4)",
                }}
              >
                <Check className="w-8 h-8" style={{ color: "var(--ink-void)" }} strokeWidth={2.5} />
              </div>
              <div className="font-display text-[28px] mb-2">Pronto!</div>
              <p className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
                <span className="font-mono-num font-semibold" style={{ color: "var(--gold-bright)" }}>{imported}</span> transações importadas e categorizadas com sucesso.
              </p>
              <button onClick={onClose} className="btn-gold mt-6" data-testid="csv-finish">
                Ver Orçamento Atualizado
                <ChevronRight className="w-4 h-4 inline ml-1" />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "review" && (
          <div className="flex items-center justify-between p-5 border-t border-[var(--ink-line)]">
            <div className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              <span className="font-mono-num font-semibold" style={{ color: "var(--gold-bright)" }}>{totalSelected}</span> de {transactions.length} selecionadas
            </div>
            <div className="flex gap-3">
              <button onClick={onClose} className="btn-ghost" data-testid="csv-cancel">Cancelar</button>
              <button
                onClick={applyImport}
                className="btn-gold"
                disabled={totalSelected === 0}
                data-testid="csv-apply"
                style={{ opacity: totalSelected === 0 ? 0.4 : 1 }}
              >
                Importar {totalSelected} transações
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
