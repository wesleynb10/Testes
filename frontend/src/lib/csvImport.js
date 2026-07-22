/**
 * Auto-categorização de transações via regex de palavras-chave.
 * Retorna: "necessidades" | "desejos" | "investimentos" | null (sem match)
 */

const RULES = [
  // Investimentos (specific brands — check FIRST to avoid false positives)
  { cat: "investimentos", subcat: "Renda variável", regex: /\b(xp\s?inv|xp\s?investim|nuinvest|rico|clear|modalmais|inter\s?dtvm|btg\s?pactual|itau\s?corretor|toro|investim)/i },
  { cat: "investimentos", subcat: "Reserva de emergência", regex: /\b(cdb|tesouro|selic|poupanc|renda\s?fixa)\b/i },
  { cat: "investimentos", subcat: "Previdência / LT", regex: /\b(previd|pgbl|vgbl)\b/i },

  // Necessidades
  { cat: "necessidades", subcat: "Aluguel", regex: /alugu|imob|condom|iptu/i },
  { cat: "necessidades", subcat: "Supermercado", regex: /mercad|super|carrefour|extra|assai|atacad|\bdia\b|pao\s?de\s?a[cç]|hortifr|sacol[aã]o/i },
  { cat: "necessidades", subcat: "Contas (luz/água/net)", regex: /enel|light|cemig|cpfl|sabesp|copasa|vivo|claro|\btim\b|\boi\b|\bnet\b|internet|energia|\bagua\b|\bgas\b|comgas/i },
  { cat: "necessidades", subcat: "Transporte", regex: /uber|99app|99\s?taxi|metro|cptm|onibus|combust|posto|shell|ipiranga|petrobr|estacion/i },
  { cat: "necessidades", subcat: "Plano de saúde", regex: /unimed|amil|bradesco\s?sa[uú]|hapvida|sulamerica|prevent|farm[aá]ci|drogar|drogasil/i },
  { cat: "necessidades", subcat: "Educação", regex: /escola|colegio|universid|faculd|curso|udemy|coursera/i },

  // Desejos
  { cat: "desejos", subcat: "Restaurantes", regex: /ifood|rappi|uber\s?eats|restaur|lanchon|pizza|hamburg|starbucks|mcdon|burger|kfc|subway|coffee|caf[eé]/i },
  { cat: "desejos", subcat: "Streaming & Assinaturas", regex: /netflix|spotify|amazon\s?prime|disney|hbo|paramount|globopla|youtube\s?prem|apple\s?(tv|music|one)/i },
  { cat: "desejos", subcat: "Compras / Lazer", regex: /magalu|magazine\s?luiza|americanas|shopee|aliexp|shein|renner|zara|c&a|riachuelo|amazon|mercadoliv|steam|playstation|xbox|nintendo|cinema|show|ingresso/i },
  { cat: "desejos", subcat: "Beleza & Bem-estar", regex: /salao|barbear|\bspa\b|academi|smartfit|bio\s?ritmo|beleza|manicur/i },
];

/**
 * Retorna a categoria e subcategoria sugerida (ou null).
 * @param {string} description
 */
export function classify(description) {
  if (!description) return null;
  for (const rule of RULES) {
    if (rule.regex.test(description)) {
      return { category: rule.cat, subcategory: rule.subcat };
    }
  }
  return null;
}

/**
 * Simple CSV parser (RFC 4180 minimal — no quoted-in-quoted).
 * Supports , ; and tab delimiters, auto-detects header row.
 */
export function parseCSV(text) {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { rows: [], headers: [] };

  const sample = lines[0];
  const counts = {
    ";": (sample.match(/;/g) || []).length,
    ",": (sample.match(/,/g) || []).length,
    "\t": (sample.match(/\t/g) || []).length,
  };
  const delim = Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ",");

  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (c === '"') { inQuote = !inQuote; continue; }
      if (c === delim && !inQuote) { out.push(cur); cur = ""; continue; }
      cur += c;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };

  const rows = lines.map(parseLine);
  const headers = rows[0].map((h) => h.toLowerCase());
  return { headers, rows: rows.slice(1), delim };
}

/**
 * Maps CSV rows to normalized transactions.
 * Detects columns "data|date", "descri|hist|memo|desc", "valor|amount|value".
 */
export function normalizeTransactions({ headers, rows }) {
  const findIdx = (patterns) =>
    headers.findIndex((h) => patterns.some((p) => h.includes(p)));

  const descIdx = findIdx(["descri", "hist", "memo", "desc", "detal"]);
  const valIdx = findIdx(["valor", "amount", "value", "montan"]);
  const dateIdx = findIdx(["data", "date"]);

  return rows
    .map((r) => {
      const desc = descIdx >= 0 ? r[descIdx] : r[0] || "";
      let valRaw = valIdx >= 0 ? r[valIdx] : r[r.length - 1] || "0";
      // Brazilian format: 1.234,56 → 1234.56
      valRaw = String(valRaw).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
      const value = parseFloat(valRaw);
      const date = dateIdx >= 0 ? r[dateIdx] : "";
      const suggestion = classify(desc);
      return {
        description: desc,
        value: isNaN(value) ? 0 : value,
        date,
        suggestion,
      };
    })
    .filter((t) => t.description && t.value !== 0);
}

/** Converte valores numéricos em formato livre (BR/US) para Number. */
function toNumber(raw) {
  if (raw === null || raw === undefined) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    // O último separador é o decimal.
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  s = s.replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Normaliza data OFX/QIF (YYYYMMDD... ou DD/MM/YYYY) para YYYY-MM-DD. */
function normalizeDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const ofx = s.match(/^(\d{4})(\d{2})(\d{2})/); // 20260115 ou 20260115120000
  if (ofx) return `${ofx[1]}-${ofx[2]}-${ofx[3]}`;
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/); // 15/01/2026
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return "";
}

/**
 * Parser de OFX (Open Financial Exchange) — extratos .ofx/.qfx de bancos.
 * Formato SGML: blocos <STMTTRN> com <TRNAMT>, <DTPOSTED>, <NAME>/<MEMO>.
 */
export function parseOFX(text) {
  const out = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  const tag = (block, name) => {
    const m = block.match(new RegExp(`<${name}>([^<\r\n]*)`, "i"));
    return m ? m[1].trim() : "";
  };
  for (const block of blocks) {
    const value = toNumber(tag(block, "TRNAMT"));
    const desc = tag(block, "NAME") || tag(block, "MEMO") || "Lançamento OFX";
    const date = normalizeDate(tag(block, "DTPOSTED"));
    if (!value) continue;
    out.push({ description: desc, value, date, suggestion: classify(desc) });
  }
  return out;
}

/**
 * Parser de QIF (Quicken Interchange Format).
 * Linhas: D=data, T/U=valor, P=pagador, M=memo, ^=fim do registro.
 */
export function parseQIF(text) {
  const out = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  let cur = {};
  const push = () => {
    if (cur.value) {
      const desc = cur.payee || cur.memo || "Lançamento QIF";
      out.push({ description: desc, value: cur.value, date: cur.date || "", suggestion: classify(desc) });
    }
    cur = {};
  };
  for (const line of lines) {
    if (!line) continue;
    const code = line[0];
    const rest = line.slice(1).trim();
    if (code === "^") push();
    else if (code === "D") cur.date = normalizeDate(rest);
    else if (code === "T" || code === "U") cur.value = toNumber(rest);
    else if (code === "P") cur.payee = rest;
    else if (code === "M") cur.memo = rest;
  }
  push();
  return out;
}

/**
 * Detecta o formato do arquivo (por conteúdo/extensão) e devolve
 * a lista normalizada de transações. Aceita CSV, TXT, TSV, OFX/QFX e QIF.
 */
export function parseStatement(text, filename = "") {
  const ext = (filename.split(".").pop() || "").toLowerCase();
  const head = text.slice(0, 400).toUpperCase();

  if (ext === "ofx" || ext === "qfx" || head.includes("<OFX>") || head.includes("<STMTTRN>")) {
    return parseOFX(text);
  }
  if (ext === "qif" || head.trimStart().startsWith("!TYPE")) {
    return parseQIF(text);
  }
  // CSV / TXT / TSV
  return normalizeTransactions(parseCSV(text));
}
