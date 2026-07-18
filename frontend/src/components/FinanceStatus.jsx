import React, { useState } from "react";
import { AlertCircle, Check, Database, Loader2, X } from "lucide-react";
import { useFinance } from "@/context/FinanceContext";

export default function FinanceStatus() {
  const {
    loading,
    saving,
    error,
    hasLegacyData,
    importLegacyData,
    dismissLegacyData,
  } = useFinance();
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    setImporting(true);
    try {
      await importLegacyData();
    } catch {
      // The context exposes the API error in the status bar.
    } finally {
      setImporting(false);
    }
  };

  if (!loading && !saving && !error && !hasLegacyData) return null;

  if (hasLegacyData) {
    return (
      <div
        className="mx-8 mt-5 p-3 rounded-xl flex items-center gap-3 flex-wrap"
        style={{
          background: "rgba(201,169,97,0.08)",
          border: "1px solid rgba(201,169,97,0.3)",
          color: "var(--text-secondary)",
        }}
        data-testid="legacy-data-banner"
      >
        <Database className="w-4 h-4 shrink-0" style={{ color: "var(--gold-bright)" }} />
        <span className="text-[12px] flex-1 min-w-[220px]">
          Encontramos dados antigos salvos neste navegador. Importe apenas se forem seus dados reais.
        </span>
        <button
          type="button"
          className="btn-gold"
          style={{ padding: "7px 12px", fontSize: 11 }}
          onClick={handleImport}
          disabled={importing}
          data-testid="legacy-import"
        >
          {importing ? "Importando..." : "Importar dados locais"}
        </button>
        <button
          type="button"
          className="p-1"
          onClick={dismissLegacyData}
          title="Ignorar dados locais"
          data-testid="legacy-dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="mx-8 mt-4 flex items-center gap-2 text-[11px]"
      style={{ color: error ? "var(--danger)" : "var(--text-muted)" }}
      data-testid="finance-status"
    >
      {error ? (
        <AlertCircle className="w-3.5 h-3.5" />
      ) : loading || saving ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <Check className="w-3.5 h-3.5" />
      )}
      <span>{error || (loading ? "Carregando seus dados..." : "Salvando no FinPremium...")}</span>
    </div>
  );
}
