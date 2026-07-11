import React, { useEffect, useRef, useState } from "react";
import { brl, pct } from "@/lib/format";
import { Download, X, Instagram, RefreshCw } from "lucide-react";

/**
 * Generates a 1080x1920 Instagram Story image with the user's financial highlights.
 * Uses HTML5 Canvas.
 */
export default function ShareStory({ stats, onClose }) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = 1080;
    const H = 1920;

    // Background: deep obsidian gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#0B0A0F");
    bg.addColorStop(0.5, "#131218");
    bg.addColorStop(1, "#07060A");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Ambient gold glow (top-left)
    const g1 = ctx.createRadialGradient(W * 0.15, 0, 0, W * 0.15, 0, 800);
    g1.addColorStop(0, "rgba(201, 169, 97, 0.25)");
    g1.addColorStop(1, "rgba(201, 169, 97, 0)");
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);

    // Bottom-right subtle blue
    const g2 = ctx.createRadialGradient(W, H, 0, W, H, 900);
    g2.addColorStop(0, "rgba(122, 154, 184, 0.15)");
    g2.addColorStop(1, "rgba(122, 154, 184, 0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);

    // Grain overlay (subtle)
    for (let i = 0; i < 6000; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.015})`;
      ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }

    // ==================== HEADER ====================
    // Gold diamond icon (simple polygon)
    const cx = 130;
    const cy = 180;
    ctx.save();
    const iconGrad = ctx.createLinearGradient(cx - 40, cy - 40, cx + 40, cy + 40);
    iconGrad.addColorStop(0, "#E8CE87");
    iconGrad.addColorStop(1, "#8B7A3E");
    ctx.fillStyle = iconGrad;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 45);
    ctx.lineTo(cx + 40, cy);
    ctx.lineTo(cx, cy + 45);
    ctx.lineTo(cx - 40, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(11,10,15,0.4)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Brand text
    ctx.fillStyle = "#F5F0E1";
    ctx.font = 'italic 600 58px "Fraunces", Georgia, serif';
    ctx.textBaseline = "middle";
    ctx.fillText("FinPremium", 200, 165);

    ctx.fillStyle = "#C9A961";
    ctx.font = "600 22px Manrope, Arial, sans-serif";
    const eyebrow = "W E A L T H   O S";
    ctx.fillText(eyebrow, 200, 210);

    // ==================== EYEBROW ====================
    ctx.fillStyle = "#C9A961";
    ctx.font = "600 26px Manrope, Arial, sans-serif";
    ctx.letterSpacing = "5px";
    ctx.fillText("MEU JANEIRO NO CONTROLE", 90, 380);

    // ==================== HERO STAT ====================
    ctx.fillStyle = "#F5F0E1";
    ctx.font = 'italic 500 90px "Fraunces", Georgia, serif';
    ctx.fillText("Investi", 90, 500);

    // Highlighted value in gold
    const goldGrad = ctx.createLinearGradient(90, 580, 900, 640);
    goldGrad.addColorStop(0, "#8B7A3E");
    goldGrad.addColorStop(0.5, "#E8CE87");
    goldGrad.addColorStop(1, "#8B7A3E");
    ctx.fillStyle = goldGrad;
    ctx.font = 'italic 600 140px "Fraunces", Georgia, serif';
    ctx.fillText(brl(stats.investido), 90, 640);

    ctx.fillStyle = "#F5F0E1";
    ctx.font = 'italic 500 90px "Fraunces", Georgia, serif';
    ctx.fillText("neste mês.", 90, 780);

    // ==================== KPI CARDS ====================
    const drawCard = (x, y, w, h, label, value, valueColor = "#F5F0E1") => {
      ctx.save();
      // Card background
      ctx.fillStyle = "rgba(27, 26, 34, 0.7)";
      const r = 24;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      // Border
      ctx.strokeStyle = "#2A2833";
      ctx.lineWidth = 2;
      ctx.stroke();
      // Top gold gradient line
      const topGrad = ctx.createLinearGradient(x, y, x + w, y);
      topGrad.addColorStop(0, "rgba(201, 169, 97, 0)");
      topGrad.addColorStop(0.5, "rgba(201, 169, 97, 0.6)");
      topGrad.addColorStop(1, "rgba(201, 169, 97, 0)");
      ctx.strokeStyle = topGrad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.stroke();

      // Label
      ctx.fillStyle = "#6E6A5F";
      ctx.font = "700 22px Manrope, Arial, sans-serif";
      ctx.fillText(label, x + 36, y + 60);

      // Value
      ctx.fillStyle = valueColor;
      ctx.font = 'italic 500 62px "Fraunces", Georgia, serif';
      ctx.fillText(value, x + 36, y + 130);
      ctx.restore();
    };

    const cardY = 900;
    const cardH = 210;
    const cardW = 440;
    drawCard(90, cardY, cardW, cardH, "TAXA DE POUPANÇA", pct(stats.taxaPoupanca, 0), "#E8CE87");
    drawCard(550, cardY, cardW, cardH, "SOBRA DO MÊS", brl(stats.saldo), stats.saldo >= 0 ? "#7FB069" : "#D46A6A");
    drawCard(90, cardY + 240, cardW, cardH, "METAS ATIVAS", `${stats.metas}`, "#F5F0E1");
    drawCard(550, cardY + 240, cardW, cardH, "PROGRESSO FIRE", pct(stats.fireProgress, 1), "#E8CE87");

    // ==================== FOOTER STRIP ====================
    // "Regra 50/30/20" strip
    ctx.fillStyle = "rgba(201, 169, 97, 0.08)";
    ctx.fillRect(0, 1550, W, 130);
    ctx.strokeStyle = "rgba(201, 169, 97, 0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 1550);
    ctx.lineTo(W, 1550);
    ctx.moveTo(0, 1680);
    ctx.lineTo(W, 1680);
    ctx.stroke();

    ctx.fillStyle = "#C9A961";
    ctx.font = "600 24px Manrope, Arial, sans-serif";
    ctx.fillText("REGRA 50 · 30 · 20", 90, 1585);

    ctx.fillStyle = "#F5F0E1";
    ctx.font = "500 32px Manrope, Arial, sans-serif";
    ctx.fillText(
      `Necessidades ${pct(stats.pct.n, 0)}  ·  Desejos ${pct(stats.pct.d, 0)}  ·  Investimentos ${pct(stats.pct.i, 0)}`,
      90, 1640
    );

    // ==================== BOTTOM CTA ====================
    ctx.fillStyle = "#ADA79A";
    ctx.font = "500 26px Manrope, Arial, sans-serif";
    ctx.fillText("Faça a sua no FinPremium", 90, 1780);

    ctx.fillStyle = "#E8CE87";
    ctx.font = 'italic 600 40px "Fraunces", Georgia, serif';
    ctx.fillText("finpremium.com.br  →", 90, 1840);

    setReady(true);
  };

  useEffect(() => {
    // Wait for fonts to load before drawing
    if (document.fonts) {
      document.fonts.ready.then(() => draw());
    } else {
      setTimeout(draw, 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `finpremium-story-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(7, 6, 10, 0.9)", backdropFilter: "blur(12px)" }}
      data-testid="share-story-modal"
    >
      <div
        className="card-premium max-w-3xl w-full max-h-[92vh] flex flex-col fade-up"
        style={{ background: "linear-gradient(180deg, #1B1A22, #131218)" }}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--ink-line)]">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))" }}
            >
              <Instagram className="w-5 h-5" style={{ color: "var(--ink-void)" }} />
            </div>
            <div>
              <div className="eyebrow">Compartilhar</div>
              <div className="font-display text-[18px]" style={{ letterSpacing: "-0.02em" }}>Instagram Story · 1080×1920</div>
            </div>
          </div>
          <button
            data-testid="share-close"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[rgba(212,106,106,0.1)]"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={1080}
            height={1920}
            style={{
              width: "min(340px, 100%)",
              height: "auto",
              borderRadius: 20,
              border: "1px solid var(--ink-line)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            }}
            data-testid="share-canvas"
          />
        </div>

        <div className="flex items-center justify-between gap-4 p-5 border-t border-[var(--ink-line)]">
          <button onClick={() => draw()} className="btn-ghost" data-testid="share-regenerate" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <RefreshCw className="w-4 h-4" /> Regenerar
          </button>
          <button
            onClick={handleDownload}
            className="btn-gold"
            disabled={!ready}
            data-testid="share-download"
            style={{ display: "flex", gap: 8, alignItems: "center", opacity: ready ? 1 : 0.5 }}
          >
            <Download className="w-4 h-4" /> Baixar PNG para Story
          </button>
        </div>
      </div>
    </div>
  );
}
