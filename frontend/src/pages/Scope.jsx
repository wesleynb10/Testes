import React, { useState } from "react";
import { jsPDF } from "jspdf";
import { Download, FileText, Package, Palette, Cog, Gift, ChevronRight } from "lucide-react";
import { SCOPE_MD, SCOPE_SECTIONS } from "@/lib/scope";

export default function Scope() {
  const [active, setActive] = useState("arquitetura");
  const section = SCOPE_SECTIONS.find((s) => s.id === active);

  const downloadMD = () => {
    const blob = new Blob([SCOPE_MD], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "FinPremium_Escopo_Completo.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPDF = () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    const width = doc.internal.pageSize.getWidth() - margin * 2;
    let y = margin;

    // Cover
    doc.setFillColor(11, 10, 15);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), "F");
    doc.setTextColor(232, 206, 135);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(32);
    doc.text("FinPremium", margin, 180);
    doc.setFontSize(14);
    doc.setTextColor(201, 169, 97);
    doc.text("ESCOPO COMPLETO DO INFOPRODUTO", margin, 210);
    doc.setTextColor(245, 240, 225);
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const cover = "Blueprint executivo para construir e vender um Gestor Financeiro Premium via tráfego pago (Meta Ads/Instagram). Inclui arquitetura, design, mecânicas de automação e gatilhos de conversão.";
    const lines = doc.splitTextToSize(cover, width);
    doc.text(lines, margin, 250);

    // Content pages
    SCOPE_SECTIONS.forEach((sec) => {
      doc.addPage();
      doc.setFillColor(11, 10, 15);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), "F");
      y = margin;

      doc.setTextColor(201, 169, 97);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(sec.eyebrow.toUpperCase(), margin, y);
      y += 24;
      doc.setTextColor(232, 206, 135);
      doc.setFontSize(22);
      doc.text(sec.title, margin, y);
      y += 30;

      doc.setTextColor(245, 240, 225);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const bodyLines = doc.splitTextToSize(sec.plain, width);
      bodyLines.forEach((ln) => {
        if (y > doc.internal.pageSize.getHeight() - margin) {
          doc.addPage();
          doc.setFillColor(11, 10, 15);
          doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), "F");
          doc.setTextColor(245, 240, 225);
          y = margin;
        }
        doc.text(ln, margin, y);
        y += 14;
      });
    });

    doc.save("FinPremium_Escopo_Completo.pdf");
  };

  const iconMap = { arquitetura: Package, design: Palette, automacao: Cog, gatilhos: Gift };

  return (
    <div className="p-8 space-y-6" data-testid="scope-page">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-3">Escopo Completo · Blueprint do Infoproduto</div>
          <h1 className="h-display">
            De ideia a <span className="text-shimmer">produto vendável.</span>
          </h1>
          <p className="mt-3 text-[15px] max-w-2xl" style={{ color: "var(--text-secondary)" }}>
            O documento completo para você construir o produto agora. Arquitetura, design, mecânicas de automação e gatilhos de venda.
          </p>
        </div>
        <div className="flex gap-3">
          <button data-testid="download-md" onClick={downloadMD} className="btn-ghost" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <FileText className="w-4 h-4" /> Baixar Markdown
          </button>
          <button data-testid="download-pdf" onClick={downloadPDF} className="btn-gold" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Download className="w-4 h-4" /> Baixar PDF
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sidebar TOC */}
        <div className="card-premium p-3 lg:col-span-1 self-start sticky top-6" data-testid="scope-toc">
          {SCOPE_SECTIONS.map((s) => {
            const Icon = iconMap[s.id] || FileText;
            const isActive = active === s.id;
            return (
              <button
                key={s.id}
                data-testid={`scope-tab-${s.id}`}
                onClick={() => setActive(s.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all ${isActive ? "" : ""}`}
                style={{
                  background: isActive ? "linear-gradient(90deg, rgba(201,169,97,0.14), transparent)" : "transparent",
                  color: isActive ? "var(--gold-bright)" : "var(--text-secondary)",
                  border: isActive ? "1px solid rgba(201,169,97,0.22)" : "1px solid transparent",
                }}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
                <div className="flex-1">
                  <div className="text-[10px] tracking-[0.16em] uppercase" style={{ color: isActive ? "var(--gold)" : "var(--text-muted)" }}>
                    {s.number}
                  </div>
                  <div className="text-[13px] font-semibold leading-tight">{s.title}</div>
                </div>
                <ChevronRight className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="card-premium p-8 lg:col-span-3 fade-up" data-testid="scope-content">
          <div className="eyebrow mb-3">{section.eyebrow}</div>
          <h2 className="font-display text-[32px] mb-6" style={{ letterSpacing: "-0.03em" }}>{section.title}</h2>
          <div className="space-y-6">
            {section.blocks.map((block, i) => (
              <div key={i}>
                {block.heading && (
                  <h3 className="font-display text-[20px] mb-3" style={{ letterSpacing: "-0.02em", color: "var(--gold-bright)" }}>
                    {block.heading}
                  </h3>
                )}
                {block.paragraphs?.map((p, j) => (
                  <p key={j} className="text-[14px] leading-relaxed mb-3" style={{ color: "var(--text-secondary)" }}>
                    {p}
                  </p>
                ))}
                {block.list && (
                  <ul className="space-y-2 mt-3">
                    {block.list.map((item, k) => (
                      <li key={k} className="flex items-start gap-3 text-[14px]" style={{ color: "var(--text-secondary)" }}>
                        <span className="w-1.5 h-1.5 rounded-full mt-2 shrink-0" style={{ background: "var(--gold)" }} />
                        <span dangerouslySetInnerHTML={{ __html: item }} />
                      </li>
                    ))}
                  </ul>
                )}
                {block.code && (
                  <pre
                    className="p-4 rounded-lg text-[12px] mt-3 overflow-x-auto"
                    style={{
                      background: "rgba(7,6,10,0.7)",
                      border: "1px solid var(--ink-line)",
                      fontFamily: "Menlo, Monaco, monospace",
                      color: "var(--gold-bright)",
                    }}
                  >
                    <code>{block.code}</code>
                  </pre>
                )}
                {block.table && (
                  <table className="table-premium mt-4">
                    <thead>
                      <tr>{block.table.headers.map((h, x) => <th key={x}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {block.table.rows.map((row, r) => (
                        <tr key={r}>{row.map((c, y) => <td key={y}>{c}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
