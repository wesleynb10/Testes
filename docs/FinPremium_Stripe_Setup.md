# Stripe — setup FinPremium (teste → produção)

**Atualizado:** 17 Jul 2026  
**Repo:** `wesleynb10/Testes`

---

## Status atual (Sprint 0)

| Item | Status |
|------|--------|
| Checkout Session (SDK real) | OK em modo **teste** |
| Página `/obrigado` + polling | OK (valor em reais) |
| E-mail welcome + aviso de venda (Resend) | OK se `RESEND_API_KEY` preenchida |
| Captura de e-mail da página Stripe | OK |
| Webhook `/api/webhook/stripe` | Código pronto — precisa `STRIPE_WEBHOOK_SECRET` |
| Modo live (`sk_live_`) + payout bancário | Pendente (KYC Stripe) |
| Pix | **Aberto na Sprint 5** (Stripe ou Mercado Pago) |

---

## Variáveis no `backend/.env`

```bash
STRIPE_API_KEY=sk_test_...          # depois: sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...     # do CLI local ou Dashboard
FRONTEND_URL=http://localhost:3000
RESEND_API_KEY=re_...
SENDER_EMAIL=onboarding@resend.dev  # depois: noreply@seudominio.com
OWNER_EMAIL=seu@gmail.com
```

**Nunca commitar** o `.env`.

---

## Fluxo técnico

```text
Landing "Quero esse plano"
  → POST /api/checkout/session
  → redirect checkout.stripe.com
  → sucesso → /obrigado?session_id=cs_...
  → GET /api/checkout/status/{id}  (polling)
  → se paid: e-mails (1x) + marca tx no Mongo

Paralelo (produção / CLI):
  Stripe → POST /api/webhook/stripe
  → mesma fulfilmment (idempotente via emails_sent_at)
```

Cartão de teste: `4242 4242 4242 4242` · validade futura · CVC qualquer.

---

## Webhook no Mac (recomendado)

1. Instalar CLI:  
   `brew install stripe/stripe-cli/stripe`
2. Login:  
   `stripe login`
3. Encaminhar eventos:  
   `stripe listen --forward-to localhost:8000/api/webhook/stripe`
4. Copiar o `whsec_...` impresso → `STRIPE_WEBHOOK_SECRET` no `.env`
5. Reiniciar o backend
6. Fazer um pagamento teste e ver no terminal do `listen` o evento `checkout.session.completed`

Sem webhook, o fluxo ainda funciona via polling do `/obrigado`.

---

## Ir para produção (receber dinheiro de verdade)

1. Dashboard Stripe → completar verificação (CPF/CNPJ, endereço, **conta bancária BRL**).
2. Developers → API keys → copiar **Secret key live** (`sk_live_...`).
3. No `.env` (ou secrets do host): trocar `STRIPE_API_KEY` para live.
4. Criar webhook no Dashboard apontando para:
   `https://SEU_DOMINIO/api/webhook/stripe`  
   Eventos: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`.
5. Colar o signing secret live em `STRIPE_WEBHOOK_SECRET`.
6. Fazer **uma compra real pequena** e confirmar:
   - `/obrigado` verde
   - e-mail welcome
   - pagamento no Dashboard (Live)
   - payout agendado para o banco

Taxas e prazos de repasse aparecem no Dashboard (Payouts).

---

## Resend + Stripe juntos

- Com `onboarding@resend.dev`, e-mails só chegam no e-mail da conta Resend (em geral o `OWNER_EMAIL`).
- Para welcome ir a **qualquer** comprador: verificar domínio no Resend e mudar `SENDER_EMAIL`.

---

## Checklist rápido antes de anunciar venda

- [ ] `sk_live_` no servidor
- [ ] Webhook HTTPS configurado
- [ ] Conta bancária verificada no Stripe
- [ ] Compra teste live OK
- [ ] Domínio de e-mail (ou aceitar limitação do resend.dev)
- [ ] URL do app no e-mail = produção (`FRONTEND_URL`)
