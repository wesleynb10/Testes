# FinPremium — Plano de implementação (handoff)

**Para:** time de desenvolvimento  
**Atualizado:** 17 Jul 2026  
**Contexto:** QA de usabilidade + pesquisa de mercado (Gemini 2.5 Flash) cruzada com o estado atual do código  
**Repo:** `wesleynb10/Testes` · branch sugerida de trabalho: `main` ou feature por sprint  

Este documento é o contrato de prioridade entre produto e eng. **Não misturar Sprint 5 com Sprints 0–2.**

---

## 1. Posicionamento (não negociar no curto prazo)

- **Não** virar clone do Mobills (Open Banking não é P0).
- **Wedge atual:** WhatsApp + OCR (Gemini) para lançar gastos; cockpit 50/30/20 + dívidas + FIRE.
- **Modelo:** lifetime como âncora; anual opcional só depois (Sprint 5).
- **ICP:** BR 25–45 que desistiu de planilha; quer clareza, não corretora no MVP.

---

## 2. O que já está no produto (não reinventar)

| Área | Status |
|------|--------|
| Funil landing + calculadora + leads | OK |
| Auth cliente (`/app/entrar`) + JWT cookies | OK |
| Onboarding renda → objetivo → dívida (`/app/onboarding`) | OK (recente) |
| Dashboard KPIs + 50/30/20 + alertas (sem `Infinity%`) | OK |
| Lançamentos manuais + WhatsApp + OCR recibo | OK |
| Orçamento, dívidas snowball/avalanche, metas FIRE | OK |
| Persistência `financial_states` (Mongo) | OK |
| Erro de checkout **visível** na landing (503 se Stripe off) | OK |
| Checkout Stripe **real** | OK em **modo teste** (`sk_test_`) — ver `docs/FinPremium_Stripe_Setup.md` |

---

## 3. Ordem dos sprints

```
Sprint 0  Checkout que vende          ← bloqueio de receita
Sprint 1  Funil / confiança           ← quick wins (pode ir em paralelo ao 0)
Sprint 2  Checklist D1–D7             ← retenção 1ª semana
Sprint 3  What-if + alertas proativos
Sprint 4  PWA mobile-first
Sprint 5  Escala (Open Banking, anual, nativo)  ← só depois de pagar + retenção
```

Sugestão prática: **Sprint 1 agora** (não depende de chave) + dono coloca Stripe → **Sprint 0** em paralelo.

---

## 4. Sprint 0 — Checkout que vende

**Objetivo:** lead clica e paga (URL real Stripe) + `/obrigado` confirma.

### Arquivos

| Arquivo | Trabalho |
|---------|----------|
| `backend/emergentintegrations/payments/stripe/checkout.py` | Substituir stub por Stripe SDK (`checkout.Session.create`, status, webhook) |
| `backend/server.py` | Já tem rotas `/checkout/session`, status, webhook — validar com SDK real |
| `backend/.env` | `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` (**não commitar segredos**) |
| `frontend/src/pages/SalesPage.jsx` | Erro já renderiza; reforçar garantia 7 dias no fluxo |
| `frontend/src/pages/ThankYou.jsx` | Polling de status pós-pago estável |

### Dependência externa

- Conta Stripe + chave de teste/produção.
- **Pix:** decidir Stripe (se disponível na conta) vs Mercado Pago em follow-up — não bloquear card-only no MVP de pagamento.

### Done when

- [x] `POST /api/checkout/session` retorna `url` começando com `https://checkout.stripe.com/`
- [x] Pagamento teste → `/obrigado?session_id=...` → status `paid`
- [x] Sem chave: UI continua mostrando mensagem clara (já existe)
- [ ] Webhook local com `stripe listen` + `STRIPE_WEBHOOK_SECRET` (opcional enquanto em teste)
- [ ] Modo live (`sk_live_`) + KYC + payout bancário

> **Pix:** fora da Sprint 0 — permanece aberto na **Sprint 5**.

---

## 5. Sprint 1 — Funil sem promessa falsa

**Objetivo:** confiança + menos atrito lead → conta.

### Arquivos

| Arquivo | Trabalho |
|---------|----------|
| `frontend/public/index.html` | `<title>FinPremium · Wealth OS</title>` |
| `frontend/src/lib/leadEmail.js` | Persistência do e-mail do lead |
| `frontend/src/pages/Calculator.jsx` | Copy honesta + salvar e-mail |
| `frontend/src/pages/ClientAuth.jsx` | Prefill e-mail do lead |
| `frontend/src/pages/SalesPage.jsx` | CTA visitante vs logado |

### Done when

- [x] Título da aba = FinPremium
- [x] Email do lead pré-preenche `/app/entrar`
- [x] Zero promessa de “PDF no email” sem entrega confiável

---

## 6. Sprint 2 — Checklist D1–D7

**Objetivo:** primeira semana com caminho claro (retenção).

### Arquivos

| Arquivo | Trabalho |
|---------|----------|
| `backend/financial_state.py` | Campo em `profile` (ex.: `firstWeekChecklist`) |
| `frontend/src/context/FinanceContext.jsx` | Helpers para marcar itens |
| `frontend/src/components/FirstWeekChecklist.jsx` | **Novo** — card no topo |
| `frontend/src/pages/Dashboard.jsx` | Exibir enquanto incompleto |
| `frontend/src/pages/Transactions.jsx` (+ fluxo WhatsApp) | Marcar “1º lançamento” / “WhatsApp ok” |

### Itens sugeridos do checklist

1. Renda definida (quase sempre já vem do onboarding)  
2. Primeiro lançamento (app ou WhatsApp)  
3. Revisar Orçamento 50/30/20  
4. Meta **ou** dívida cadastrada  
5. Enviar 1 mensagem no WhatsApp vinculado  

### Done when

- [x] Progresso persiste no Atlas
- [x] Checklist some ao completar 100%

---

## 7. Sprint 3 — Proativo (what-if + alertas)

### Arquivos

| Arquivo | Trabalho |
|---------|----------|
| `frontend/src/pages/Debts.jsx` | Expor better what-if (aporte extra → meses/juros) — simulação já existe |
| `frontend/src/pages/Goals.jsx` | “Se aportar +R$ X, antecipa Y meses” |
| `frontend/src/pages/Dashboard.jsx` | Sugestões por `profile.primaryGoal` |
| Opcional: `backend/twilio_webhook.py` + job | Lembrete semanal WhatsApp (**opt-in**) |

### Done when

- [ ] Usuário muda um número e vê impacto sem sair da tela

---

## 8. Sprint 4 — PWA mobile-first

### Arquivos

| Arquivo | Trabalho |
|---------|----------|
| `frontend/public/manifest.json` | **Novo** |
| `frontend/src/index.js` (+ SW) | Instalável |
| `frontend/src/components/MobileNav.jsx` | **Novo** — bottom nav |
| `frontend/src/components/Sidebar.jsx` + `App.js` | Sidebar só desktop |
| `frontend/src/App.css` | Safe-area, touch targets |

### Done when

- [ ] “Adicionar à tela inicial” funciona
- [ ] Navegação principal usável com o polegar

---

## 9. Sprint 5 — Escala (depois)

Não começar antes de ter pagamento + checklist validados com usuários reais.

- **Pix no checkout** (Stripe se a conta liberar, senão Mercado Pago) — **em aberto**  
- Open Banking (Belvo / Klavi) — projeto separado  
- Plano anual opcional ao lado do lifetime  
- App nativo iOS/Android — só se PWA saturar  
- Webhook Stripe em produção + `sk_live_`  

---

## 10. Fora de escopo (agora)

- Redesign completo via v0 / “UI genérica de IA” como projeto paralelo  
- Substituir lifetime por SaaS puro  
- Open Banking como P0  
- Broker / corretora no MVP  
- Pix na Sprint 0/1 (adiado → Sprint 5)  

---

## 11. Ambiente local (lembrete)

| Serviço | URL típica |
|---------|------------|
| Frontend | `http://localhost:3000` |
| Backend | `http://localhost:8000` |
| Cookie auth | Preferir `localhost` (não misturar com `127.0.0.1`) |

WhatsApp inbound: tunnel Cloudflare → `POST /api/integracao/twilio-webhook`.  
Visão de recibos: `GEMINI_API_KEY` no `backend/.env`.

**Nunca commitar** `.env` com chaves.

---

## 12. Contatos / decisões abertas

| Decisão | Owner | Status |
|---------|-------|--------|
| Stripe key + webhook | Produto / DevOps | Teste OK; live/webhook depois |
| Pix: Stripe vs Mercado Pago | Produto | **Aberto na Sprint 5** |
| Lead magnet: email real vs download | Produto | Resolvido: copy honesta (sem PDF) |
| Próximo sprint a puxar | Time | Sprint 1 feita → Sprint 2 |

---

## 13. Referência da pesquisa

Síntese visual (Cursor Canvas, máquina local do autor — não versionada no repo):

- Pesquisa Gemini + gaps UI/UX: canvas `finpremium-market-ux` no projeto Cursor  

Principais conclusões Gemini (filtradas por viabilidade):

1. Mercado BR: bancos = espelho; Mobills/Organizze = reativo; gap em planejamento (dívida/FIRE) + automação leve.  
2. Lifetime faz sentido para o ICP; risco é caixa → híbrido depois.  
3. WhatsApp é diferencial BR se for API oficial + opt-out.  
4. Open Banking é paridade futura, não MVP.  

---

*Documento gerado para handoff entre devs. Atualizar checkboxes conforme os sprints forem fechados.*
