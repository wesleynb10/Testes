export const brl = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(n);
};

export const brlShort = (n) => {
  if (n === null || n === undefined || isNaN(n)) return "R$ 0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}R$ ${(abs / 1_000).toFixed(1)}k`;
  return `${sign}R$ ${abs.toFixed(0)}`;
};

export const pct = (n, digits = 1) => {
  if (n === null || n === undefined || isNaN(n)) return "0%";
  return `${n.toFixed(digits)}%`;
};

export const parseNum = (v) => {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const clean = String(v).replace(/[^\d,-]/g, "").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
};
