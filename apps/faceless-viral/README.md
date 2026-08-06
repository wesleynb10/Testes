# Faceless Viral Commerce — Ops MVP

Sistema da fase 2 do playbook [`playbooks/faceless-viral-commerce.md`](../../playbooks/faceless-viral-commerce.md).

**TikTok-first.** Researcher usa o scorecard; roteiros (5 hooks) alimentam a fila Kanban; métricas entram via CSV; dashboard mostra KPIs e alerts kill/scale.

## Stack

- Backend: FastAPI + SQLite + SQLAlchemy
- Frontend: React + Vite

## Subir local

### API (porta 8010)

```bash
cd apps/faceless-viral/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

### UI (porta 5173)

```bash
cd apps/faceless-viral/frontend
npm install
npm run dev
```

Abra `http://127.0.0.1:5173`. O Vite faz proxy de `/api` → `8010`.

### Seed de exemplo

```bash
cd apps/faceless-viral/backend
python -m app.seed
```

## Fluxo

1. **Scorecard** — Researcher cadastra produto (critérios 0–2; ≥7 = produce)
2. **Gerar 5 hooks** — templates do playbook
3. **Kanban** — `roteiro → edicao → pronto → postado` (cria post TikTok)
4. **CSV** — importar views/CTR/vendas
5. **Dashboard** — KPIs + alerts

## API útil

| Método | Path |
|--------|------|
| GET | `/api/health` |
| GET/POST | `/api/products` |
| POST | `/api/products/scorecard` |
| POST | `/api/scripts/generate/{product_id}` |
| GET | `/api/scripts/kanban` |
| GET | `/api/dashboard` |
| POST | `/api/metrics/import-csv` |
| GET | `/api/metrics/checklist` |
