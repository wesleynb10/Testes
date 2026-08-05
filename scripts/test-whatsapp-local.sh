#!/usr/bin/env bash
# Simula o fluxo WhatsApp (Twilio webhook) sem precisar do telefone/sandbox.
# Pré-requisito: API rodando em http://127.0.0.1:8000
set -euo pipefail

API="${API:-http://127.0.0.1:8000}"
PHONE="${PHONE:-+5511999887766}"
EMAIL="${EMAIL:-whatsapp.teste.$(date +%s)@finpremium.local}"
PASS="${PASS:-TesteWhatsApp123!}"
BODY_GASTO="${BODY_GASTO:-Almoço R$ 42,50}"
BODY_PAGAMENTO="${BODY_PAGAMENTO:-pix}"

echo "==> FinPremium — teste local WhatsApp"
echo "    API:   $API"
echo "    Phone: $PHONE"
echo

if ! curl -sf "$API/docs" >/dev/null; then
  echo "API não responde em $API. Suba o backend antes." >&2
  exit 1
fi

echo "==> 1) Cadastro com WhatsApp vinculado"
REG=$(curl -s -X POST "$API/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Tester WhatsApp\",\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"phone\":\"$PHONE\"}")
echo "$REG" | python3 -c 'import sys,json; d=json.load(sys.stdin); print("   ok:", d.get("email"), d.get("phone") or d)' 2>/dev/null || echo "   $REG"

extract_twiml() {
  python3 -c 'import sys,re; t=sys.stdin.read(); m=re.search(r"<Message>(.*?)</Message>", t, re.S); print((m.group(1) if m else t).strip())'
}

post_twilio() {
  local body="$1"
  curl -s -X POST "$API/api/integracao/twilio-webhook" \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode "From=whatsapp:$PHONE" \
    --data-urlencode "Body=$body" \
    --data-urlencode 'NumMedia=0' | extract_twiml
}

echo
echo "==> 2) Mensagem de gasto: $BODY_GASTO"
post_twilio "$BODY_GASTO" | sed 's/^/   /'

echo
echo "==> 3) Forma de pagamento: $BODY_PAGAMENTO"
post_twilio "$BODY_PAGAMENTO" | sed 's/^/   /'

echo
echo "==> 4) Confirmação: SIM"
post_twilio "SIM" | sed 's/^/   /'

COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

curl -s -c "$COOKIE_JAR" -X POST "$API/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" >/dev/null

echo
echo "==> 5) Lançamentos na conta"
curl -s -b "$COOKIE_JAR" "$API/api/transactions" | python3 -m json.tool

echo
echo "Pronto. Conta de teste:"
echo "  email: $EMAIL"
echo "  senha: $PASS"
echo "  whats: $PHONE"
echo
echo "Abra http://127.0.0.1:3000/app/entrar e veja em Lançamentos (source=whatsapp)."
echo "Para WhatsApp de verdade (sandbox Twilio), veja docs/teste-whatsapp.md"
