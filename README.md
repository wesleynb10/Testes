# FinPremium (Wealth OS)

Infoproduto de finanças pessoais — React + FastAPI + MongoDB.

## Abrir e testar na sua máquina

### Pré-requisitos

- Node.js 18+ (npm ou yarn)
- Python 3.11+
- Git

MongoDB **não é obrigatório** no modo local rápido (`USE_MOCK_DB=1`).

### 1. Clonar e entrar na pasta

```bash
git clone https://github.com/wesleynb10/Testes.git
cd Testes
```

Se estiver testando este PR:

```bash
git fetch origin cursor/ambiente-teste-local-ad4d
git checkout cursor/ambiente-teste-local-ad4d
```

### 2. Setup (uma vez)

```bash
chmod +x scripts/*.sh
./scripts/setup-local.sh
```

Isso cria `backend/.env` e `frontend/.env`, instala dependências e ativa o modo local seguro:

- `USE_MOCK_DB=1` — Mongo em memória (não precisa Atlas)
- `CREDIT_PROVIDER=mock` — análise de crédito sem gastar Direct Data

### 3. Subir os serviços (dois terminais)

```bash
./scripts/start-backend.sh
```

```bash
./scripts/start-frontend.sh
```

| Serviço | URL |
|---------|-----|
| App | http://127.0.0.1:3000 |
| API (Swagger) | http://127.0.0.1:8000/docs |
| Admin | http://127.0.0.1:3000/admin/login |

Credenciais admin padrão (só local): veja `ADMIN_EMAIL` / `ADMIN_PASSWORD` em `backend/.env` (geradas pelo setup; por padrão as da documentação em `docs/FinPremium_Documentacao_Completa.md`).

### Abrir no Cursor / VS Code

```bash
cursor .    # ou: code .
```

### Mongo / integrações reais (opcional)

1. Edite `backend/.env`:
   - `USE_MOCK_DB=0` (ou remova)
   - `MONGO_URL=mongodb://127.0.0.1:27017` ou Atlas
   - `CREDIT_PROVIDER=directdata` + `DIRECTD_TOKEN=...`
   - chaves Stripe / Resend / Twilio conforme `backend/.env.example`
2. Suba o Mongo local se for o caso: `mongod --dbpath ./data/db --port 27017 --bind_ip 127.0.0.1`

Documentação completa: [`docs/FinPremium_Documentacao_Completa.md`](docs/FinPremium_Documentacao_Completa.md).
