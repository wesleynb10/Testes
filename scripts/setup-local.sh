#!/usr/bin/env bash
# Prepara o FinPremium para rodar na sua máquina (dev local).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> FinPremium — setup local"
echo "    pasta: $ROOT"
echo

# --- Backend .env ---
if [[ ! -f backend/.env ]]; then
  cp backend/.env.local.example backend/.env
  SECRET="dev-local-$(openssl rand -hex 16 2>/dev/null || echo finpremium-dev-secret)"
  # macOS sed vs GNU sed
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" backend/.env
  else
    sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" backend/.env
  fi
  echo "✓ backend/.env criado a partir de .env.local.example (USE_MOCK_DB=1, CREDIT_PROVIDER=mock)"
else
  echo "· backend/.env já existe — não sobrescrevi"
fi

# --- Frontend .env ---
if [[ ! -f frontend/.env ]]; then
  cp frontend/.env.example frontend/.env
  echo "✓ frontend/.env criado"
else
  echo "· frontend/.env já existe — não sobrescrevi"
fi

# --- Python venv ---
if [[ ! -d backend/.venv ]]; then
  echo "==> Criando venv Python em backend/.venv"
  python3 -m venv backend/.venv
fi
# shellcheck disable=SC1091
source backend/.venv/bin/activate
echo "==> Instalando dependências Python"
pip install -q --upgrade pip
# emergentintegrations é privado (PyPI); o repo já traz a cópia em backend/
grep -vE '^emergentintegrations(==|$)' backend/requirements.txt > /tmp/finpremium-req.txt
pip install -q -r /tmp/finpremium-req.txt
rm -f /tmp/finpremium-req.txt
echo "✓ backend OK (emergentintegrations local em backend/)"

# --- Node ---
echo "==> Instalando dependências Node (frontend)"
# Peer deps conflitantes (date-fns / react-day-picker) — legacy-peer-deps evita ERESOLVE.
if command -v yarn >/dev/null 2>&1 && [[ -f frontend/yarn.lock ]]; then
  (cd frontend && yarn install --silent)
elif [[ -f frontend/package-lock.json ]]; then
  (cd frontend && npm ci --legacy-peer-deps --silent 2>/dev/null \
    || npm install --legacy-peer-deps --silent)
else
  (cd frontend && npm install --legacy-peer-deps --silent)
fi
echo "✓ frontend OK"

echo
echo "Pronto. Em dois terminais:"
echo "  1) ./scripts/start-backend.sh"
echo "  2) ./scripts/start-frontend.sh"
echo
echo "App:   http://127.0.0.1:3000"
echo "API:   http://127.0.0.1:8000/docs"
echo "Admin: http://127.0.0.1:3000/admin/login"
echo "       (ADMIN_EMAIL / ADMIN_PASSWORD em backend/.env)"
