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

// Remove zeros à esquerda mantendo o "0" antes do separador decimal (0,5 / 0.5)
// e o "0" isolado. Evita que campos exibam valores como "05000" ou "007".
export const stripLeadingZeros = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.replace(/^(-?)0+(\d)/, "$1$2");
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
    // pt-BR: vírgula decimal, pontos de milhar
    clean = clean.replace(/\./g, "").replace(",", ".");
  } else if (dot >= 0) {
    const dots = (clean.match(/\./g) || []).length;
    const afterLast = clean.slice(clean.lastIndexOf(".") + 1);
    // "10.000" / "1.000.000" → milhar; "10.5" / "10.50" → decimal
    if (dots > 1 || /^\d{3}$/.test(afterLast)) {
      clean = clean.replace(/\./g, "");
    }
  }
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
};

/**
 * Máscara de dinheiro pt-BR para inputs (sem "R$").
 * 10000 → "10.000" | "10.000,5" | preserva vírgula ao digitar ("10.000,").
 */
export const formatMoneyInput = (raw) => {
  if (raw === "" || raw === null || raw === undefined) return "";
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return "";
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: Number.isInteger(raw) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(raw);
  }
  const s = String(raw).trim();
  if (!s) return "";
  const cleaned = s.replace(/[^\d,]/g, "");
  if (!cleaned) return "";
  const hasComma = cleaned.includes(",");
  const [intRaw, ...decParts] = cleaned.split(",");
  const intDigits = (intRaw || "").replace(/\D/g, "");
  const intFormatted = intDigits
    ? Number(intDigits).toLocaleString("pt-BR")
    : hasComma
      ? "0"
      : "";
  if (!hasComma) return intFormatted;
  const dec = decParts.join("").replace(/\D/g, "").slice(0, 2);
  if (cleaned.endsWith(",") && dec === "") return `${intFormatted},`;
  return `${intFormatted},${dec}`;
};

/** Máscara de percentual pt-BR (até 3 casas). 2.5 → "2,5". */
export const formatPctInput = (raw) => {
  if (raw === "" || raw === null || raw === undefined) return "";
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return "";
    return String(raw).replace(".", ",");
  }
  const s = String(raw).trim().replace(/[^\d,.]/g, "").replace(".", ",");
  if (!s) return "";
  const hasComma = s.includes(",");
  const [intRaw, ...decParts] = s.split(",");
  const intDigits = (intRaw || "").replace(/\D/g, "");
  const intPart = intDigits ? stripLeadingZeros(intDigits) || "0" : hasComma ? "0" : "";
  if (!hasComma) return intPart;
  const dec = decParts.join("").replace(/\D/g, "").slice(0, 3);
  if (s.endsWith(",") && dec === "") return `${intPart},`;
  return `${intPart},${dec}`;
};

/** Inteiro positivo para prazos / contagens. */
export const formatIntInput = (raw) => {
  if (raw === "" || raw === null || raw === undefined) return "";
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return "";
    return String(Math.max(0, Math.round(raw)));
  }
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  return stripLeadingZeros(digits) || "0";
};
