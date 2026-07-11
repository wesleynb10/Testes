# PRD — FinPremium (Infoproduto de Finanças Pessoais)

## Problema
Usuário quer criar um infoproduto de Finanças Pessoais para vender via tráfego pago Meta/Instagram, com estética "premium dark mode" (dourado + preto), seguindo a metodologia de grandes influenciadores. Precisa de: (1) escopo completo do produto e (2) protótipo web funcional.

## Personas
- **Comprador final**: 25-45 anos, CLT ou autônomo, ganha entre R$ 3-15k/mês, quer organizar as finanças.
- **Infoprodutor (usuário do escopo)**: creator que quer vender uma planilha ou app no-code.

## Requisitos (estáticos)
1. Documento de escopo detalhado em 4 pilares.
2. Protótipo web em React funcional single-user (localStorage, sem auth).
3. Idioma: Português (BR).
4. Estética: Dark Mode Premium (dourado + obsidiana).
5. Integrações reais: PDF export, gráficos interativos, cálculos automáticos.

## Arquitetura
- Frontend: React 19 + React Router + Recharts + jsPDF + Tailwind + Canvas API.
- Backend: FastAPI (não usado — dados via localStorage).
- Persistência: `localStorage` chave `finpremium_v1` + `finpremium_leads`.
- Alias `@/*` → `src/*`.

## Telas implementadas
| Rota | Tela | Testids principais |
|------|------|--------------------|
| `/` | Dashboard | dashboard-page, kpi-{tipo}, chart-*, fire-card, open-share-story |
| `/orcamento` | Orçamento 50/30/20 | budget-page, income-input, open-csv-import |
| `/dividas` | Controle de Dívidas | debts-page, strategy-*, extra-payment-input |
| `/metas` | Metas & Liberdade | goals-page, fire-* |
| `/calculadora` | **Calculadora Pública (lead magnet)** | calculator-page, calc-*, lead-* |
| `/bonus` | Bônus Premium | bonus-page, cta-btn |
| `/escopo` | Escopo do Produto | scope-page, download-md, download-pdf |

## Features implementadas (v1.1)
### v1.0 (sessão anterior)
- Dashboard executivo com 4 KPIs, pie chart, evolução 6m, termômetro de metas, regra 50/30/20, alertas, Número da Liberdade.
- Orçamento 50/30/20 com edição inline.
- Simulador de dívidas (Snowball/Avalanche).
- Metas FIRE com fórmula regra 4%.
- Página de Bônus com 6 cards.
- Escopo do produto com download MD + PDF.

### v1.1 (esta sessão)
- **Importação de CSV de extrato bancário** com auto-categorização inteligente via regex (bancos: Nubank, Itaú, Bradesco, Santander, Inter, C6). Componente `CSVImport.jsx` + `lib/csvImport.js`. Modal review para confirmar antes de aplicar.
- **Calculadora Pública de Juros Compostos** (rota pública `/calculadora`, sem sidebar) — lead magnet com email capture (armazenado em localStorage `finpremium_leads`). Ideal para tráfego pago.
- **Widget de Instagram Story** — gera PNG 1080×1920 via Canvas com stats do usuário + branding + CTA. Componente `ShareStory.jsx`.

## Design System
- Cores: Void #07060A, Surface #131218, Elevated #1B1A22, Dourado #C9A961, Bright #E8CE87, Deep #8B7A3E.
- Fontes: Fraunces (display serif) + Manrope (body).
- Componentes: card-premium (backdrop-blur + gradient superior dourado), btn-gold (pill), thermometer, chip.
- Micro-interações: fade-up, shimmer, grão SVG.

## Bugs corrigidos
- v1.0 → Simulador de dívidas com juros astronômicos quando parcelas < juros (baseline não convergia). Fix: exibir "—" e aviso.
- v1.1 → Auto-categorização classificava "XP Investimentos" como Necessidades porque "invesTIMentos" continha "tim" (operadora). Fix: word boundaries + reordenar regras (investimentos primeiro).

## Backlog / próximas iterações
- P2: Twilio WhatsApp — notificação quando categoria estoura 90% (exige API keys do usuário).
- P2: Backend FastAPI + MongoDB para sync multi-device (opcional, contraria escolha single-user).
- P2: Comparativo mensal (M-1 vs M) com histórico persistido.
- P3: Modo família / multi-perfil.
- P3: Integração com bancos via Open Finance (versão pro).

## Datas
- 2026-01-11 — MVP v1.0 (6 telas + escopo).
- 2026-01-11 — v1.1 (CSV import + calculadora pública + share story).

## v1.2 (2026-01-11) — Monetização Ativada
- **Landing de vendas `/venda`** — hero + dor + solução + depoimentos + bônus (com valor riscado) + contador de urgência 48h + 3 pacotes (Starter R$47, Completo R$97 destaque, Plus R$297) + FAQ + CTA final.
- **Checkout Stripe integrado** — backend endpoints `/api/packages`, `/api/checkout/session`, `/api/checkout/status/{id}`, `/api/webhook/stripe`. PACKAGES é server-side (nunca aceita amount do frontend).
- **Página `/obrigado`** — polling do status Stripe (até 8x/2s), estados: checking → paid/pending/expired/error.
- **Lead capture no backend** — calculadora pública agora persiste em MongoDB (`db.leads`) via POST `/api/leads`, além do localStorage.
- **CTA da página Bônus** — agora navega para `/venda` (era botão morto).
- Config: STRIPE_API_KEY=sk_test_emergent no `backend/.env` (test key Emergent, sem custo).
- Testado: 8/8 backend + 100% frontend flows.

## v1.3 (2026-01-11) — Autoresponder Resend
- **Email transacional pós-compra** — quando `/api/checkout/status/{id}` detecta payment_status=paid pela primeira vez, dispara:
  - Email de boas-vindas para o cliente (template HTML dark premium com CTA, lista de bônus e próximos passos).
  - Notificação de venda para o owner (wesleynb10@gmail.com) com valor + email do comprador.
- **Notificação de lead** — cada POST /api/leads dispara email pro owner com dados da simulação da calculadora.
- **Endpoint de teste** POST /api/test/email — envia email de teste ao OWNER_EMAIL.
- Módulo: `/app/backend/email_service.py` — templates HTML inline + `send_email` async via `asyncio.to_thread`.
- Config `.env`: RESEND_API_KEY, SENDER_EMAIL, OWNER_EMAIL.
- ⚠️ Test mode do Resend: emails só chegam em endereços verificados na conta. Owner recebe sempre (é o dono da conta). Emails para clientes precisam domínio verificado para ir em produção.

## v1.4 (2026-01-11) — Painel Admin com Auth JWT
- **Autenticação completa**: bcrypt + JWT (access 12h + refresh 30d) + cookies httpOnly Secure SameSite=none. Endpoints /api/auth/login, /logout, /me.
- **Admin seeding** idempotente via ADMIN_EMAIL/ADMIN_PASSWORD do .env — cria/atualiza usuário no startup.
- **Brute force protection**: 5 tentativas falhas em `{X-Forwarded-For:email}` → bloqueio de 15 min.
- **Painel /admin** com login `/admin/login` — 3 tabs (Visão geral / Leads / Vendas), 4 KPIs (Receita, Leads, Conversão, Ticket médio), lista de leads da calculadora e transações Stripe.
- **CORS explícito** — allow_origins=[FRONTEND_URL] (não `*`) para permitir cookies com credentials.
- **Índices MongoDB** criados no startup: users.email (unique), login_attempts.identifier, leads.created_at, payment_transactions.created_at.
- Config: JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, FRONTEND_URL no `.env`.
- Credenciais: wesleynb10@gmail.com / FinPremium2026! (documentadas em `/app/memory/test_credentials.md`).

## Bugs corrigidos v1.4
- Brute force não travava por trás do ingress Kubernetes (IP mudava entre pods). Fix: usar X-Forwarded-For como identificador de IP real.
- `check_lockout` crashava com `TypeError: can't subtract offset-naive and offset-aware datetimes` — MongoDB retorna datetime naive. Fix: normalizar para UTC-aware antes de subtrair.
- SalesPage.jsx tinha resíduo duplicado pós-search_replace anterior — truncado.

## Backlog restante
- P2: Sequência de nutrição de 5 emails via Resend (drip campaign).
- P2: Order bump no checkout.
- P2: Verificação de domínio Resend para envio real a clientes.
- P3: Assinatura recorrente Pro R$ 19,90/mês.
- P3: Rate limit refinado (email-only para IP anônimo).
