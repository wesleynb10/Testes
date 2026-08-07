#!/usr/bin/env bash
# Garante backend/.env e frontend/.env a partir de variáveis de ambiente
# já injetadas (Cursor Cloud Environment Secrets / CI / shell local).
# NÃO contém segredos — só monta os arquivos se as vars existirem.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_ENV="$ROOT/backend/.env"
FRONTEND_ENV="$ROOT/frontend/.env"

# Se backend/.env já existe, não sobrescreve (dev local com arquivo próprio).
if [[ -f "$BACKEND_ENV" ]]; then
  echo "· backend/.env já existe — mantido"
else
  if [[ -z "${MONGO_URL:-}" || -z "${JWT_SECRET:-}" ]]; then
    echo "⚠ MONGO_URL/JWT_SECRET ausentes e sem backend/.env."
    echo "  Copie backend/.env.example → backend/.env ou defina os secrets no ambiente."
    exit 0
  fi

  cat > "$BACKEND_ENV" <<EOF
# Gerado por scripts/write-env-from-environ.sh — NÃO commitar
MONGO_URL=${MONGO_URL}
DB_NAME=${DB_NAME:-finpremium}
FRONTEND_URL=${FRONTEND_URL:-http://127.0.0.1:3000}
CORS_ORIGINS=${CORS_ORIGINS:-http://127.0.0.1:3000,http://localhost:3000}
JWT_SECRET=${JWT_SECRET}
ADMIN_EMAIL=${ADMIN_EMAIL:-}
ADMIN_PASSWORD=${ADMIN_PASSWORD:-}
COOKIE_SECURE=${COOKIE_SECURE:-false}
RESEND_API_KEY=${RESEND_API_KEY:-}
SENDER_EMAIL=${SENDER_EMAIL:-onboarding@resend.dev}
OWNER_EMAIL=${OWNER_EMAIL:-}
STRIPE_API_KEY=${STRIPE_API_KEY:-}
STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-}
TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID:-}
TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN:-}
TWILIO_WHATSAPP_FROM=${TWILIO_WHATSAPP_FROM:-}
TWILIO_PHONE_NUMBER=${TWILIO_PHONE_NUMBER:-}
TWILIO_SMS_NUMBER=${TWILIO_SMS_NUMBER:-}
EMERGENT_AI_URL=${EMERGENT_AI_URL:-}
EMERGENT_AI_API_KEY=${EMERGENT_AI_API_KEY:-}
GEMINI_API_KEY=${GEMINI_API_KEY:-}
GEMINI_VISION_MODEL=${GEMINI_VISION_MODEL:-gemini-2.5-flash}
OPENAI_API_KEY=${OPENAI_API_KEY:-}
OPENAI_VISION_MODEL=${OPENAI_VISION_MODEL:-gpt-4.1-mini}
TWILIO_WEBHOOK_PUBLIC_URL=${TWILIO_WEBHOOK_PUBLIC_URL:-}
CREDIT_PROVIDER=${CREDIT_PROVIDER:-directdata}
DIRECTD_TOKEN=${DIRECTD_TOKEN:-}
DIRECTD_BASE_URL=${DIRECTD_BASE_URL:-https://apiv3.directd.com.br}
DIRECTD_TIMEOUT=${DIRECTD_TIMEOUT:-45}
REQUIRE_CPF_ON_REGISTER=${REQUIRE_CPF_ON_REGISTER:-true}
EOF
  chmod 600 "$BACKEND_ENV"
  echo "✓ backend/.env gerado a partir das variáveis de ambiente"
fi

if [[ ! -f "$FRONTEND_ENV" ]]; then
  echo "REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL:-http://127.0.0.1:8000}" > "$FRONTEND_ENV"
  chmod 600 "$FRONTEND_ENV"
  echo "✓ frontend/.env gerado"
else
  echo "· frontend/.env já existe — mantido"
fi
