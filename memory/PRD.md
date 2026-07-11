# PRD — FinPremium (Infoproduto de Finanças Pessoais)

## Problema
Usuário quer criar um infoproduto de Finanças Pessoais para vender via tráfego pago Meta/Instagram, com estética "premium dark mode" (dourado + preto), seguindo a metodologia de grandes influenciadores. Precisa de: (1) escopo completo do produto e (2) protótipo web funcional.

## Personas
- **Comprador final**: 25-45 anos, CLT ou autônomo, ganha entre R$ 3-15k/mês, quer organizar as finanças e sente vergonha da própria situação. Já viu conteúdo de Nathalia Arcuri, Thiago Nigro, Primo Rico.
- **Infoprodutor (usuário do escopo)**: profissional/creator que quer vender uma planilha ou app no-code e replicar o modelo.

## Requisitos (estáticos)
1. Documento de escopo detalhado em 4 pilares (Arquitetura, Design, Automação, Bônus).
2. Protótipo web em React funcional single-user (localStorage, sem auth).
3. Idioma: Português (BR).
4. Estética: Dark Mode Premium (dourado envelhecido + obsidiana).
5. Integrações reais: PDF export, gráficos interativos, cálculos automáticos.

## Arquitetura
- Frontend: React 19 + React Router + Recharts + jsPDF + Tailwind.
- Backend: FastAPI (não usado nesta iteração — dados via localStorage).
- Persistência: `localStorage` chave `finpremium_v1`.
- Alias `@/*` → `src/*` via craco/jsconfig.

## Telas implementadas (v1.0)
- `/` **Dashboard** — 4 KPIs, pie chart, evolução 6 meses, termômetro de metas, regra 50/30/20, alertas, Número da Liberdade.
- `/orcamento` **Orçamento 50/30/20** — 3 blocos categorizados, edição inline, cálculo automático de ideal/real.
- `/dividas` **Controle de Dívidas** — cadastro + simulador Bola de Neve/Avalanche + ordem de ataque + KPIs de impacto.
- `/metas` **Metas & FIRE** — metas com deadline + calculadora Número da Liberdade (regra 4%).
- `/bonus` **Bônus Premium** — 6 cards de bônus, biblioteca recomendada, CTA final.
- `/escopo` **Escopo do Produto** — documento navegável em 4 seções + download MD e PDF.

## Design System
- Cores: Void #07060A, Surface #131218, Elevated #1B1A22, Dourado #C9A961, Bright #E8CE87, Deep #8B7A3E, Text #F5F0E1.
- Fontes: Fraunces (display serif) + Manrope (body).
- Componentes: card-premium (backdrop-blur + borda superior dourada), btn-gold (pill gradient), thermometer, chip.
- Micro-interações: fade-up, shimmer em títulos hero, grão SVG, hover cards com border-color dourado.

## Automações implementadas
- Cálculo automático de saldo, delta%, taxa de poupança, distribuição por categoria.
- Alertas de estouro (>5% sobre planejado).
- Simulador de quitação (Snowball / Avalanche) com composto mensal.
- Cálculo FIRE via fórmula de valor futuro (log ratio).
- Export MD + PDF via jsPDF.

## Backlog / próximas iterações
- P1: Import CSV de extrato bancário com auto-categorização.
- P1: Backend FastAPI + MongoDB para multi-device sync (opcional).
- P2: Notificações WhatsApp via Twilio.
- P2: Modo de compartilhamento de widgets (Instagram Story).
- P2: Comparativo mensal (M-1 vs M) com histórico persistido.
- P2: Modo de família / multi-perfil.

## Melhorias implementadas nesta sessão
- Correção: baseline não convergente no simulador de dívidas (mostra "—" e aviso quando parcelas mínimas < juros).

## Datas
- 2026-01-11 — MVP v1.0 completo (6 telas + escopo).
