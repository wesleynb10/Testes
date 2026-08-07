# FinPremium

## Setup local (APIs reais)

1. Peça o `backend/.env` ao responsável (canal seguro) — **nunca** commitado.
   Espelho interno (gitignored): `memory/test_credentials.md`.
2. Frontend:
   ```bash
   cp frontend/.env.example frontend/.env
   ```
3. Se as variáveis já estiverem no ambiente (Cursor Cloud Secrets / shell):
   ```bash
   ./scripts/write-env-from-environ.sh
   ```

Arquivos ignorados pelo git (não aparecem no GitHub):
- `backend/.env`
- `frontend/.env`
- `memory/test_credentials.md`
