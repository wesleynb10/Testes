#!/usr/bin/env bash
# Sobe a API FastAPI em http://127.0.0.1:8000
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend"

if [[ ! -f .env ]]; then
  echo "Falta backend/.env. Rode antes: ./scripts/setup-local.sh" >&2
  exit 1
fi

if [[ ! -d .venv ]]; then
  echo "Falta backend/.venv. Rode antes: ./scripts/setup-local.sh" >&2
  exit 1
fi

# shellcheck disable=SC1091
source .venv/bin/activate

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8000}"

echo "API → http://${HOST}:${PORT}  (docs em /docs)"
exec uvicorn server:app --host "$HOST" --port "$PORT" --reload
