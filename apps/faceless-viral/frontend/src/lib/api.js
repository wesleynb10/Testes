const BASE = "";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || JSON.stringify(data);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) return res.json();
  return res.text();
}

export const api = {
  health: () => request("/api/health"),
  dashboard: () => request("/api/dashboard"),
  products: (status) =>
    request(`/api/products${status ? `?status=${status}` : ""}`),
  createProduct: (body) =>
    request("/api/products", { method: "POST", body: JSON.stringify(body) }),
  updateProduct: (id, body) =>
    request(`/api/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  previewScore: (body) =>
    request("/api/products/scorecard", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  kanban: () => request("/api/scripts/kanban"),
  generateScripts: (productId) =>
    request(`/api/scripts/generate/${productId}`, { method: "POST" }),
  updateScript: (id, status) =>
    request(`/api/scripts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  createPost: (body) =>
    request("/api/posts", { method: "POST", body: JSON.stringify(body) }),
  checklist: () => request("/api/metrics/checklist"),
  importCsv: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request("/api/metrics/import-csv", { method: "POST", body: fd });
  },
};
