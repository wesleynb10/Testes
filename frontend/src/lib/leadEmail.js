const LEAD_EMAIL_KEY = "finpremium_lead_email";

export function saveLeadEmail(email) {
  const value = String(email || "").trim().toLowerCase();
  if (!value || !value.includes("@")) return;
  try {
    localStorage.setItem(LEAD_EMAIL_KEY, value);
  } catch {
    // ignore quota / private mode
  }
}

export function readLeadEmail() {
  try {
    const fromStorage = (localStorage.getItem(LEAD_EMAIL_KEY) || "").trim().toLowerCase();
    if (fromStorage.includes("@")) return fromStorage;
  } catch {
    // ignore
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = (params.get("email") || "").trim().toLowerCase();
    if (fromQuery.includes("@")) {
      saveLeadEmail(fromQuery);
      return fromQuery;
    }
  } catch {
    // ignore
  }
  return "";
}
