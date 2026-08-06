/**
 * Ponte lead → WhatsApp (MVP de teste).
 * Número vem do backend (/public-config) ou de REACT_APP_WHATSAPP_LEAD_E164.
 */

const FALLBACK_E164 = (process.env.REACT_APP_WHATSAPP_LEAD_E164 || "").replace(/\D/g, "");

export function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

export function buildWhatsAppLeadUrl(e164, text) {
  const n = digitsOnly(e164) || FALLBACK_E164;
  if (!n) return null;
  const q = encodeURIComponent(String(text || "").trim());
  return `https://wa.me/${n}${q ? `?text=${q}` : ""}`;
}

export function buildLeadWhatsAppMessage({ monthly, years, patrimonio, email } = {}) {
  const parts = ["Oi! Simulei no FinPremium."];
  if (monthly != null && years != null) {
    parts.push(`Aporte de R$ ${Number(monthly).toLocaleString("pt-BR")}/mês por ${years} anos`);
  }
  if (patrimonio != null) {
    parts.push(
      `→ patrimônio estimado de R$ ${Number(patrimonio).toLocaleString("pt-BR", {
        maximumFractionDigits: 0,
      })}.`
    );
  } else {
    parts.push(".");
  }
  parts.push("Quero testar registrar gastos pelo WhatsApp (texto, foto ou áudio).");
  if (email) parts.push(`Meu e-mail: ${email}`);
  return parts.join(" ");
}

export async function fetchWhatsAppLeadConfig(apiBase) {
  try {
    const res = await fetch(`${apiBase}/public-config`, { credentials: "omit" });
    if (!res.ok) return { enabled: Boolean(FALLBACK_E164), e164: FALLBACK_E164 };
    const data = await res.json();
    const e164 = digitsOnly(data?.whatsapp_lead_e164) || FALLBACK_E164;
    return {
      enabled: Boolean(data?.whatsapp_lead_enabled && e164) || Boolean(e164),
      e164,
    };
  } catch {
    return { enabled: Boolean(FALLBACK_E164), e164: FALLBACK_E164 };
  }
}
