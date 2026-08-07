# Testar integração WhatsApp (Twilio)

O FinPremium recebe mensagens pelo webhook:

`POST /api/integracao/twilio-webhook`

Fluxo: gasto → (forma de pagamento se faltar) → `SIM` / `NÃO` → grava em **Lançamentos**.

---

## A) Teste rápido sem telefone (recomendado primeiro)

Com a API em `http://127.0.0.1:8000`:

```bash
chmod +x scripts/test-whatsapp-local.sh
./scripts/test-whatsapp-local.sh
```

O script cadastra um usuário, simula 3 mensagens Twilio e lista a transação criada.

Mensagens úteis no simulador:

| Envio | O que acontece |
|-------|----------------|
| `Almoço R$ 42,50` | Detecta valor/categoria e pede forma de pagamento |
| `pix` / `débito` / `crédito` / `dinheiro` | Vai para confirmação |
| `SIM` | Grava o lançamento |
| `NÃO` | Cancela o pendente |

---

## B) WhatsApp de verdade (Twilio Sandbox)

### 1. Credenciais no `backend/.env`

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
FRONTEND_URL=http://127.0.0.1:3000

# Para foto/PDF/áudio de recibo:
GEMINI_API_KEY=xxxxxxxx
```

Texto puro funciona sem Gemini. Foto, PDF e áudio precisam de `GEMINI_API_KEY` (+ SID/token para baixar a mídia).

### 2. Subir API + frontend

```bash
./scripts/start-backend.sh   # se existir, ou uvicorn em :8000
./scripts/start-frontend.sh  # :3000
```

### 3. Expor o webhook (túnel HTTPS)

Twilio não chama `localhost`. Use Cloudflare Tunnel ou ngrok:

```bash
# Cloudflare (exemplo)
cloudflared tunnel --url http://127.0.0.1:8000

# ou ngrok
ngrok http 8000
```

URL pública do webhook:

`https://<seu-host>/api/integracao/twilio-webhook`

### 4. Configurar o Sandbox Twilio

1. [Twilio Console](https://console.twilio.com/) → Messaging → Try it out → **WhatsApp**
2. Em *Sandbox settings*, cole a URL acima no campo **When a message comes in** (método POST)
3. No celular, envie o código `join <palavra>` para o número do sandbox (ex.: `+1 415 523 8886`)

### 5. Vincular o mesmo número na conta FinPremium

1. Abra http://127.0.0.1:3000/app/entrar (ou cadastro)
2. No cadastro, informe o WhatsApp **igual** ao número que entrou no sandbox (E.164, ex. `+5511999999999`)
3. Envie no WhatsApp: `Almoço R$ 42,50 no pix`
4. Responda `SIM`
5. Confira em **Lançamentos** (`source` = `whatsapp`)

---

## Problemas comuns

| Sintoma | Causa provável |
|---------|----------------|
| Resposta pedindo cadastro / link | Número do WhatsApp ≠ `phone` da conta |
| Foto/áudio falha | Falta `TWILIO_*` ou `GEMINI_API_KEY` |
| Twilio “delivery error” | Túnel caiu ou URL do webhook errada |
| Dados sumiram após restart | `USE_MOCK_DB=1` (Mongo em memória) |

---

## Testes automatizados

```bash
cd backend && source .venv/bin/activate
pytest tests/test_twilio_flow.py -q
```
