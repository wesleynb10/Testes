#!/usr/bin/env bash
# Sobe o React em http://127.0.0.1:3000
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"

if [[ ! -f .env ]]; then
  echo "Falta frontend/.env. Rode antes: ./scripts/setup-local.sh" >&2
  exit 1
fi

export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-3000}"
export BROWSER="${BROWSER:-none}"

echo "App → http://${HOST}:${PORT}"
if command -v yarn >/dev/null 2>&1 && [[ -f yarn.lock ]]; then
  exec yarn start
fi
exec npm start
