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
  let clean = String(v).trim().replace(/[^\d,.-]/g, "");
  const comma = clean.lastIndexOf(",");
  const dot = clean.lastIndexOf(".");

  if (comma >= 0 && dot >= 0) {
    // The last separator is the decimal separator; the other is thousands.
    clean =
      comma > dot
        ? clean.replace(/\./g, "").replace(",", ".")
        : clean.replace(/,/g, "");
  } else if (comma >= 0) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if ((clean.match(/\./g) || []).length > 1) {
    const last = clean.lastIndexOf(".");
    clean = `${clean.slice(0, last).replace(/\./g, "")}${clean.slice(last)}`;
  }
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
};
