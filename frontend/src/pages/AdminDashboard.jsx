import React, { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { brl, pct } from "@/lib/format";
import {
  Gem, LogOut, TrendingUp, Users, DollarSign, Percent, Calendar, Mail,
  Loader2, RefreshCw, ArrowUpRight, ShoppingBag, ChevronRight, ExternalLink,
  Send, Zap, Play, XCircle, CheckCircle2, Clock,
} from "lucide-react";

const TABS = [
  { id: "overview", label: "Visão geral" },
  { id: "leads", label: "Leads" },
  { id: "sales", label: "Vendas" },
  { id: "drip", label: "Sequência de Emails" },
];

function KPI({ label, value, icon: Icon, tone = "default", subtitle }) {
  const color = { gold: "var(--gold-bright)", success: "var(--success)", danger: "var(--danger)", default: "var(--text-primary)" }[tone];
  return (
    <div className="card-premium p-6 fade-up">
      <div className="flex items-start justify-between mb-4">
        <div className="kpi-label">{label}</div>
        {Icon && (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(201,169,97,0.1)", border: "1px solid rgba(201,169,97,0.2)" }}>
            <Icon className="w-4 h-4" style={{ color: "var(--gold-bright)" }} strokeWidth={1.75} />
          </div>
        )}
      </div>
      <div className="kpi-value" style={{ color }}>{value}</div>
      {subtitle && <div className="text-[12px] mt-2" style={{ color: "var(--text-muted)" }}>{subtitle}</div>}
    </div>
  );
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export default function AdminDashboard() {
  const nav = useNavigate();
  const { user, loading: authLoading, logout, api } = useAuth();
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [drip, setDrip] = useState({ queue: [], summary: {} });
  const [firing, setFiring] = useState(null);

  const loadAll = async () => {
    setRefreshing(true);
    try {
      const [s, l, t, d] = await Promise.all([
        api.get("/admin/dashboard"),
        api.get("/admin/leads?limit=200"),
        api.get("/admin/transactions?limit=200"),
        api.get("/admin/drip?limit=300"),
      ]);
      setStats(s.data);
      setLeads(l.data.leads);
      setSales(t.data.transactions);
      setDrip(d.data);
    } catch (e) {
      console.error(e);
      if (e.response?.status === 401) nav("/admin/login");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fireNext = async (email) => {
    setFiring(email);
    try {
      await api.post("/admin/drip/fire-next", { email });
      await loadAll();
    } catch (e) {
      alert("Erro ao disparar: " + (e.response?.data?.detail || e.message));
    } finally {
      setFiring(null);
    }
  };

  const runNow = async () => {
    setRefreshing(true);
    try {
      await api.post("/admin/drip/run-now");
      await loadAll();
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (user && user.role === "admin") loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (authLoading) {
    return (
      <div className="grain min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "var(--gold-bright)" }} />
      </div>
    );
  }
  if (!user || user.role !== "admin") return <Navigate to="/admin/login" replace />;

  const totalRevenue = stats?.revenue || 0;
  const paidTx = stats?.paid_transactions || 0;
  const totalLeads = stats?.total_leads || 0;
  const conversion = stats?.conversion_rate || 0;
  const avgTicket = paidTx > 0 ? totalRevenue / paidTx : 0;

  const paidSales = sales.filter((s) => s.payment_status === "paid");

  return (
    <div className="grain min-h-screen" data-testid="admin-dashboard-page">
      {/* Header */}
      <header className="border-b border-[var(--ink-line)] sticky top-0 z-40" style={{ background: "rgba(7,6,10,0.85)", backdropFilter: "blur(16px)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--gold-bright), var(--gold-deep))" }}>
              <Gem className="w-4 h-4" style={{ color: "var(--ink-void)" }} />
            </div>
            <div>
              <div className="font-display text-[18px] leading-none">FinPremium <span style={{ color: "var(--gold-bright)" }}>Admin</span></div>
              <div className="text-[9px] uppercase tracking-[0.24em]" style={{ color: "var(--gold)" }}>{user.email}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button data-testid="refresh-btn" onClick={loadAll} disabled={refreshing} className="btn-ghost" style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 16px", fontSize: 12 }}>
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
            </button>
            <button data-testid="goto-app-btn" onClick={() => nav("/app")} className="btn-ghost" style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 16px", fontSize: 12 }}>
              <ExternalLink className="w-3.5 h-3.5" /> Ir para app
            </button>
            <button data-testid="logout-btn" onClick={async () => { await logout(); nav("/admin/login"); }} className="btn-ghost" style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 16px", fontSize: 12, color: "var(--danger)" }}>
              <LogOut className="w-3.5 h-3.5" /> Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <div className="eyebrow mb-2">Painel de controle</div>
          <h1 className="h-display">Seu <span className="text-shimmer">negócio</span>, em tempo real.</h1>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 animate-spin mx-auto" style={{ color: "var(--gold-bright)" }} />
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-[var(--ink-line)]" data-testid="admin-tabs">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  data-testid={`tab-${t.id}`}
                  onClick={() => setTab(t.id)}
                  className="px-5 py-3 text-[13px] font-semibold relative"
                  style={{
                    color: tab === t.id ? "var(--gold-bright)" : "var(--text-secondary)",
                    borderBottom: tab === t.id ? "2px solid var(--gold)" : "2px solid transparent",
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Overview */}
            {tab === "overview" && (
              <div data-testid="tab-content-overview">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
                  <KPI label="Receita total" value={brl(totalRevenue)} icon={DollarSign} tone="gold" subtitle={`${paidTx} vendas confirmadas`} />
                  <KPI label="Leads capturados" value={totalLeads} icon={Users} subtitle={`${stats?.leads_last_7d || 0} nos últimos 7 dias`} />
                  <KPI label="Taxa de conversão" value={pct(conversion, 1)} icon={Percent} tone={conversion >= 2 ? "success" : "default"} subtitle="vendas / leads" />
                  <KPI label="Ticket médio" value={brl(avgTicket)} icon={TrendingUp} tone="gold" subtitle="por venda confirmada" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="card-premium p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="kpi-label">Últimos 5 leads</div>
                      <button onClick={() => setTab("leads")} className="text-[11px] flex items-center gap-1" style={{ color: "var(--gold-bright)" }}>
                        Ver todos <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {leads.slice(0, 5).map((l) => (
                        <div key={l.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "rgba(11,10,15,0.5)", border: "1px solid var(--ink-line)" }}>
                          <div>
                            <div className="text-[13px] font-semibold">{l.email}</div>
                            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{l.source} · {formatDate(l.created_at)}</div>
                          </div>
                          <Mail className="w-4 h-4" style={{ color: "var(--gold)" }} />
                        </div>
                      ))}
                      {leads.length === 0 && <div className="text-[13px] py-4 text-center" style={{ color: "var(--text-muted)" }}>Nenhum lead ainda.</div>}
                    </div>
                  </div>

                  <div className="card-premium p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="kpi-label">Últimas 5 vendas</div>
                      <button onClick={() => setTab("sales")} className="text-[11px] flex items-center gap-1" style={{ color: "var(--gold-bright)" }}>
                        Ver todas <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      {paidSales.slice(0, 5).map((s) => (
                        <div key={s.id} className="flex items-center justify-between p-3 rounded-lg" style={{ background: "rgba(201,169,97,0.06)", border: "1px solid rgba(201,169,97,0.25)" }}>
                          <div>
                            <div className="text-[13px] font-semibold">{s.email || "—"}</div>
                            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{s.metadata?.package_name || s.package_id} · {formatDate(s.created_at)}</div>
                          </div>
                          <div className="text-[14px] font-mono-num font-semibold" style={{ color: "var(--gold-bright)" }}>{brl(s.amount)}</div>
                        </div>
                      ))}
                      {paidSales.length === 0 && <div className="text-[13px] py-4 text-center" style={{ color: "var(--text-muted)" }}>Nenhuma venda confirmada ainda.</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Leads */}
            {tab === "leads" && (
              <div className="card-premium p-6" data-testid="tab-content-leads">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="kpi-label mb-1">Leads capturados</div>
                    <div className="font-display text-[22px]">{leads.length} contatos</div>
                  </div>
                </div>
                {leads.length === 0 ? (
                  <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Nenhum lead capturado ainda.</div>
                ) : (
                  <table className="table-premium">
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th style={{ width: 130 }}>Origem</th>
                        <th style={{ width: 240 }}>Simulação</th>
                        <th style={{ width: 160 }}>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((l) => (
                        <tr key={l.id} data-testid={`lead-row-${l.id}`}>
                          <td>
                            <a href={`mailto:${l.email}`} className="text-[13px]" style={{ color: "var(--text-primary)" }}>{l.email}</a>
                          </td>
                          <td>
                            <span className="chip" style={{ fontSize: 10 }}>{l.source}</span>
                          </td>
                          <td className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                            {l.metadata && Object.keys(l.metadata).length > 0
                              ? Object.entries(l.metadata).map(([k, v]) => `${k}: ${v}`).join(" · ")
                              : "—"}
                          </td>
                          <td className="text-[12px]" style={{ color: "var(--text-muted)" }}>{formatDate(l.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Sales */}
            {tab === "sales" && (
              <div className="card-premium p-6" data-testid="tab-content-sales">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="kpi-label mb-1">Transações</div>
                    <div className="font-display text-[22px]">{sales.length} sessões · {paidSales.length} pagas</div>
                  </div>
                </div>
                {sales.length === 0 ? (
                  <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Nenhuma transação ainda.</div>
                ) : (
                  <table className="table-premium">
                    <thead>
                      <tr>
                        <th>Cliente</th>
                        <th style={{ width: 160 }}>Pacote</th>
                        <th style={{ width: 120 }}>Valor</th>
                        <th style={{ width: 120 }}>Status</th>
                        <th style={{ width: 160 }}>Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map((s) => {
                        const isPaid = s.payment_status === "paid";
                        return (
                          <tr key={s.id} data-testid={`sale-row-${s.id}`}>
                            <td className="text-[13px]">{s.email || "—"}</td>
                            <td className="text-[12px]">{s.metadata?.package_name || s.package_id}</td>
                            <td className="font-mono-num text-[13px] font-semibold" style={{ color: isPaid ? "var(--gold-bright)" : "var(--text-secondary)" }}>{brl(s.amount)}</td>
                            <td>
                              <span className={`chip ${isPaid ? "gold" : ""}`} style={{ fontSize: 10 }}>
                                {isPaid ? "PAGO" : s.payment_status || "pendente"}
                              </span>
                            </td>
                            <td className="text-[12px]" style={{ color: "var(--text-muted)" }}>{formatDate(s.created_at)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Drip / Sequência de Emails */}
            {tab === "drip" && (
              <div data-testid="tab-content-drip">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="card-premium p-5">
                    <div className="kpi-label mb-2">Agendados</div>
                    <div className="kpi-value gold font-mono-num">{drip.summary.pending || 0}</div>
                  </div>
                  <div className="card-premium p-5">
                    <div className="kpi-label mb-2">Enviados</div>
                    <div className="kpi-value success font-mono-num">{drip.summary.sent || 0}</div>
                  </div>
                  <div className="card-premium p-5">
                    <div className="kpi-label mb-2">Cancelados (comprou)</div>
                    <div className="kpi-value font-mono-num">{drip.summary.cancelled || 0}</div>
                  </div>
                  <div className="card-premium p-5">
                    <div className="kpi-label mb-2">Falhas</div>
                    <div className="kpi-value danger font-mono-num">{drip.summary.failed || 0}</div>
                  </div>
                </div>

                <div className="card-premium p-6">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <div className="kpi-label mb-1">Fila de envio</div>
                      <div className="font-display text-[22px]">Sequência automática de 5 emails</div>
                      <div className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
                        Cada lead que preenche a calculadora recebe: dia 1 (relatório), dia 3 (case), dia 5 (cupom SAVE20), dia 9 (última chance), dia 14 (feedback).
                      </div>
                    </div>
                    <button data-testid="drip-run-now" onClick={runNow} disabled={refreshing} className="btn-ghost" style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 14px", fontSize: 12 }}>
                      <Zap className="w-3.5 h-3.5" /> Verificar fila agora
                    </button>
                  </div>

                  {drip.queue.length === 0 ? (
                    <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
                      Nenhum email na fila ainda. Capture um lead na <a href="/calculadora" className="underline" style={{ color: "var(--gold-bright)" }}>calculadora</a> para ver a sequência aparecer aqui.
                    </div>
                  ) : (
                    <table className="table-premium">
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>Nº</th>
                          <th>Destinatário</th>
                          <th>Assunto</th>
                          <th style={{ width: 130 }}>Envio</th>
                          <th style={{ width: 110 }}>Status</th>
                          <th style={{ width: 130 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {drip.queue.map((q) => {
                          const statusColor = {
                            pending: "var(--gold-bright)",
                            sent: "var(--success)",
                            cancelled: "var(--text-muted)",
                            failed: "var(--danger)",
                          }[q.status] || "var(--text-primary)";
                          const StatusIcon = { pending: Clock, sent: CheckCircle2, cancelled: XCircle, failed: XCircle }[q.status] || Clock;
                          return (
                            <tr key={q.id} data-testid={`drip-row-${q.id}`}>
                              <td className="font-mono-num" style={{ color: "var(--gold)" }}>{q.step}</td>
                              <td className="text-[13px]">{q.lead_email}</td>
                              <td className="text-[12px]" style={{ color: "var(--text-secondary)" }}>{q.subject}</td>
                              <td className="text-[11px] font-mono-num" style={{ color: "var(--text-muted)" }}>
                                {formatDate(q.send_at)}
                              </td>
                              <td>
                                <span className="chip" style={{ fontSize: 10, color: statusColor, borderColor: statusColor }}>
                                  <StatusIcon className="w-3 h-3" /> {q.status}
                                </span>
                              </td>
                              <td>
                                {q.status === "pending" && (
                                  <button
                                    data-testid={`drip-fire-${q.id}`}
                                    onClick={() => fireNext(q.lead_email)}
                                    disabled={firing === q.lead_email}
                                    className="btn-ghost"
                                    style={{ padding: "6px 12px", fontSize: 11, display: "flex", gap: 4, alignItems: "center" }}
                                  >
                                    <Play className="w-3 h-3" /> Enviar agora
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
