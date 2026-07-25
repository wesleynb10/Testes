# Integração Direct Data — Análise de Crédito (próximos passos)

> Documento de engenharia. Objetivo: transformar a aba **Análise de Crédito / Rating Avançado**
> (serviço avulso pago) em algo funcional, plugando a **Direct Data** como provedor de dados de
> crédito (Score, SCR/BACEN e negativações PEFIN/REFIN).

Status atual: **planejamento**. Nada de código de crédito ainda no backend. Este doc lista o que
falta, em ordem de execução, com os pontos de decisão sinalizados.

---

## 1. Contexto — como o app está hoje

- **Backend** (`backend/server.py`, FastAPI): todas as rotas ficam sob `api_router` (prefixo `/api`).
- **Pagamento**: fluxo Stripe já existente — `POST /api/checkout/session`, webhook `POST /api/webhook/stripe`,
  status `GET /api/checkout/status/{session_id}`, persistido na coleção `payment_transactions`.
  Pacotes definidos no dict `PACKAGES`.
- **Integrações externas** seguem um padrão consistente (ver `backend/receipt_vision.py`):
  módulo próprio, `httpx.AsyncClient`, credenciais via `os.environ`, exceção dedicada
  (ex.: `ReceiptVisionError`), validação/normalização do retorno antes de devolver ao app.
- **Frontend** (React): páginas em `frontend/src/pages/*.jsx`, rotas em `frontend/src/App.js`,
  navegação em `frontend/src/components/Sidebar.jsx`, estado global em `FinanceContext`.
- **Mongo**: acesso via `db` (motor). Coleções atuais: `users`, `transactions`, `leads`,
  `payment_transactions`, etc.

O plano abaixo **reaproveita** esses padrões — não inventa arquitetura nova.

---

## 2. O que a Direct Data entrega (confirmado)

Autenticação: **token único** por conta (query param `Token`/`token`) + **saldo em créditos**
(cada consulta debita créditos). Retorno em JSON; APIs "Online" demoram mais que as "Base".
Suporte a `enviarCallback` (assíncrono) e `gerarComprovante` (PDF em `urlComprovante`).

### 2.1 Consultas que compõem o relatório (integradas)

Todos os endpoints abaixo estão implementados em `backend/credit_provider.py` e podem ser
desligados individualmente por env. Preços do cardápio V5.3.

| Dado | Endpoint | Custo | Observações |
|---|---|---|---|
| **Score de crédito (QUOD)** | `GET /api/Score?CPF={cpf}&CNPJ={cnpj}&Token={token}` | R$ 1,98 | Faixas: 0–600 alto risco · 601–700 médio · 701–1000 baixo. Retorna score, faixa, motivos, perfil. **Obrigatório** — se falhar, o relatório não é gerado. |
| **SCR BACEN Detalhada** | `GET /api/SCRBacenDetalhada?CPF={cpf}&CNPJ={cnpj}&MESANO={mesano}&Token={token}` | R$ 4,90 | Retorna `score`, `faixaRisco`, `carteiraCredito`, responsabilidade total, operações, qtd instituições. Gera comprovante PDF. |
| **Detalhamento Negativo (QUOD)** | `GET /api/DetalhamentoNegativo?CPF={cpf}&CNPJ={cnpj}&Token={token}` | R$ 2,38 | É a fonte de PEFIN/REFIN. Devolve buckets separados: `pendenciaFinanceira`, `protestos`, `acoesJudiciais`, `recuperacoesJudiciais`, `falencias`, `chequesSemFundo`. ⚠️ **Protestos só de SP.** |
| **Cadastro PF Plus (renda)** | `GET /api/CadastroPessoaFisicaPlus?CPF={cpf}&Token={token}` | R$ 0,36 | Renda estimada, renda domiciliar/per capita, faixa salarial, classe social, situação cadastral, óbito. **Só PF** — pulado automaticamente em CNPJ. Alimenta o CTA de orçamento. |
| **PGFN — Lista de Devedores da União** | `GET /api/PGFNListaDevedoresUniao?Cpf={cpf}&Cnpj={cnpj}&Token={token}` | R$ 0,36 | Dívida ativa federal (Receita/PGFN). Não aparece no SCR nem nos bureaus — dívida que o cliente costuma desconhecer. |

**Custo por relatório**: PF ≈ **R$ 9,98** · PJ ≈ **R$ 9,62** (sem renda).
Com venda a R$ 39,90, margem bruta ≈ R$ 28 por consulta (antes da taxa de pagamento).

Flags de env (todas default `true`): `DIRECTD_PENDENCIAS_ENABLED`, `DIRECTD_RENDA_ENABLED`,
`DIRECTD_DIVIDA_ATIVA_ENABLED`. Cada path também aceita override via
`DIRECTD_<NOME>_ENDPOINT` sem mexer no código.

### 2.2 Candidatas para as próximas fases (não integradas)

| Dado | Endpoint | Custo | Quando faz sentido |
|---|---|---|---|
| **Protestos nacionais (IEPTB)** | `/api/Protestos` | ~R$ 2,50 | Fechar a lacuna dos protestos fora de SP. Prioridade alta se a base do cliente for nacional. |
| **CADIN** | a confirmar | ~R$ 0,36 | Pendências com órgãos federais, complementa a PGFN. |
| **Cadastro PJ Plus / Score PJ** | `/api/CadastroPessoaJuridicaPlus` | a confirmar | Quando a "Visão Empresa" (PJ) sair do mockup. |
| **Dossiê Direct Data** | a confirmar | pacote | Vale comparar: se o pacote sair abaixo de R$ 9,98, substitui as chamadas avulsas. |

**Notas operacionais**: sem rate limit nas APIs. Sufixos úteis: `&async=habilitar` (assíncrono)
e `&GerarComprovante=habilitar` (PDF).

### Decisões de mapeamento (importante)
- **"Rating BACEN" (letra AA–H)** do MVP: o SCR **não** retorna a letra, nem por operação —
  `modalidades[]` só traz valores (`aVencer`/`vencido`/`prejuizo`) e descrição. A letra é
  **derivada** por nós de `faixaRisco` e, na falta dela, do `score`. Sempre rotular como
  "rating derivado" na UI.
- **Score exibido**: usar QUOD (`Score`) como número principal; o `score` do SCR é complementar.

### Armadilhas do payload real (validadas em produção)
Confirmadas em consulta real (24/07/2026) e cobertas por teste. Todas custaram crédito para
descobrir — não regredir:

| Armadilha | Sintoma | Forma correta |
| --- | --- | --- |
| Score aninhado por tipo de pessoa | Score "Indisponível" mesmo com a consulta paga e OK | `retorno.pessoaFisica.score` (ou `pessoaJuridica`), com `faixaScore` |
| `pendenciaFinanceira` é *container*, não ocorrência | Negativação fantasma "Não Consta Pendência · R$ 0,00" para ficha limpa | Ler `status`/`totalPendencia` e iterar `protestos`, `acoesJudiciais`, `recuperacoesJudiciaisFalencia`, `chequesSemFundo` — cada um com nomes de campo próprios |
| `carteiraCredito` é objeto, não lista | Carteira sempre vazia | `{total, limite, prejuizo, vencer, vencido}` |
| `modalidades` (não `operacoes`); valores em blocos | Nenhuma operação detectada | `modalidades[].aVencer.total` etc.; usar `quantidadeOperacoes` do retorno |
| `urlComprovante` vive em `metaDados` | Comprovante sempre nulo | Ler de `metaDados`, não de `retorno` |
| `MESANO` do mês corrente | SCR recusado e **não** cobrado → relatório sem BACEN | Omitir `MESANO` (é opcional) e deixar a Direct Data usar a última competência fechada. `DIRECTD_SCR_MESANO` força uma competência |
| `faixaRisco` vem como "Risco Baixo" | Rating "D" ao lado do texto "Risco Baixo" (a chave não casava e caía no fallback por score) | Normalizar removendo acento e a palavra "risco" antes de mapear |
| `responsabilidadeTotal` pode vir vazio | "Responsabilidade total R$ 0,00" com 7 instituições e 45 operações | Cair para `riscoTotal` e depois `carteiraCredito.total` |
| `carteiraCredito.total` inclui limite não usado | Dívida superestimada (total = saldo + limite) | Dívida = `vencer + vencido + prejuizo`; `limite` é crédito disponível |

O fallback do rating por score do SCR é grosseiro de propósito: a escala do score do SCR **não** é
a do QUOD (um caso real veio com score 575 classificado como "Risco Baixo" pelo próprio provedor).
A faixa do provedor sempre tem precedência.

### Renda presumida: tratar como sugestão, nunca como fato
`rendaEstimada` do Cadastro PF Plus é **inferência estatística** (perfil, região, domicílio), não
renda declarada. Num caso real veio R$ 4.605,21 — exatamente 3,03× o salário mínimo, coerente com a
faixa "3 salários mínimos" e com um domicílio modelado de 4 moradores — e ainda assim estava longe da
renda verdadeira do titular. Não existe campo "melhor" a mapear: é o único de renda individual.

Consequência de produto: o cliente **sabe** a própria renda, então um número errado apresentado como
fato queima a credibilidade do relatório inteiro. Por isso o CTA do orçamento mostra o valor como
"o bureau presume", junto de `confiabilidade` e da composição do domicílio, num campo editável — o
valor que vai para o orçamento é o que o usuário confirma. Vale como âncora ("é isso mesmo?"),
não como verdade.

Consulta recusada **não é cobrada** (confirmado no extrato: o SCR falhou e não apareceu na fatura),
então diagnosticar falha de parâmetro é de graço. A mensagem real do erro vem em
`metaDados.mensagem` e é registrada em log a cada HTTP >= 400.

**Fonte da doc**: central de ajuda (posts "SCR Detalhada - Resumo BACEN", "Score de Crédito - QUOD",
"Detalhamento Negativo QUOD") — os exemplos de resposta de lá são a referência dos parsers.

---

## 3. Pré-requisitos (fora do código)

- [x] Criar/validar conta na Direct Data e **gerar o Token** na plataforma.
- [ ] **Colocar saldo em créditos** (sandbox/teste primeiro) — o saldo aparece no campo
      `saldoEmCreditos` do `metaDados` de qualquer consulta bem-sucedida.
- [x] Levantar o **custo em créditos** de cada produto → base do preço de venda (ver §2.1).
- [x] Confirmar endpoint e payload de **PEFIN/REFIN** → `/api/DetalhamentoNegativo`.
- [x] Token gerado e validado (`python scripts/validar_directdata.py --probe`).
- [ ] Conferir os **parsers contra o retorno real** — os nomes de campo foram inferidos da
      central de ajuda. Rode `python scripts/validar_directdata.py SEU_CPF`: o script mostra
      custo, saldo e quantos campos cada parser extraiu.
- [ ] **Allowlist de IP**: o erro de auth da Direct Data é `IP ou Token inválido`. Confirmar no
      painel se a conta restringe IP e liberar o IP do servidor de produção.
- [ ] **Base legal LGPD**: definir termo de consentimento e finalidade (ver §8).

---

## 4. Variáveis de ambiente novas

Adicionar ao `backend/.env` (e ao `backend/.env.example` com placeholder):

```env
# --- Direct Data (Análise de Crédito) ---
CREDIT_PROVIDER=directdata            # pluggable: directdata | mock
DIRECTD_TOKEN=xxxxxxxx
DIRECTD_BASE_URL=https://apiv3.directd.com.br
DIRECTD_TIMEOUT=45
# Consultas opcionais do relatório (default true). Os paths têm default no código;
# preencha o *_ENDPOINT só para sobrescrever.
DIRECTD_PENDENCIAS_ENABLED=true
DIRECTD_RENDA_ENABLED=true
DIRECTD_DIVIDA_ATIVA_ENABLED=true
# Preço de venda do serviço avulso (em BRL), definido a partir do custo em créditos
CREDIT_REPORT_PRICE_BRL=39.90
```

> Manter o padrão: `.env` real **não** vai pro git; só o `.env.example` com placeholders.

---

## 5. Arquitetura proposta

### 5.1 Backend — provider plugável

Criar `backend/credit_provider.py` (espelhando o estilo de `receipt_vision.py`):

```python
class CreditProviderError(Exception): ...

class CreditReport(BaseModel):        # retorno normalizado, agnóstico de provedor
    documento: str                     # CPF/CNPJ (mascarado ao persistir/logar)
    tipo: str                          # "pf" | "pj"
    score: int | None
    score_faixa: str                   # "alto" | "medio" | "baixo"
    rating_bacen: str | None           # letra derivada (AA..H) — ver §2
    scr: dict                          # resumo SCR normalizado
    pendencias: list[dict]             # PEFIN/REFIN normalizadas
    consultado_em: str
    fonte: str = "directdata"

async def gerar_relatorio(documento: str, tipo: str) -> CreditReport: ...
```

- Um `directdata` provider que chama Score + SCR + PEFIN/REFIN (em paralelo com `asyncio.gather`),
  normaliza cada retorno e monta o `CreditReport`.
- Um `mock` provider (payloads fixos) para desenvolver o front sem gastar crédito.
- Selecionado por `CREDIT_PROVIDER` (igual ao fallback de visão em `receipt_vision.py`).
- **Nunca** logar CPF/CNPJ completo nem o payload cru (mascarar: `***.***.***-xx`).

### 5.2 Backend — rotas (sob `api_router`)

| Rota | Função |
|---|---|
| `POST /api/credit/checkout` | Cria a cobrança avulsa (Pix). Guarda CPF/CNPJ + consentimento LGPD na `credit_orders` com status `pending`. |
| `GET /api/credit/status/{order_id}` | Polling do pagamento (espelha `GET /api/checkout/status`). |
| `POST /api/webhook/...` (ou reuso do de pagamento) | Ao confirmar pago → dispara `gerar_relatorio`, salva em `credit_reports`, marca `order` como `ready`. |
| `GET /api/credit/report/{order_id}` | Devolve o relatório normalizado (só se pago e do próprio usuário). |

> **Ordem importa**: só chamar a Direct Data **após** pagamento confirmado (crédito custa dinheiro).
> O disparo ideal é no **webhook** (não depender do polling do front).

### 5.3 Pagamento Pix — ponto de decisão

- **Opção A (menor esforço)**: reusar o Stripe já integrado, adicionando um item em `PACKAGES`
  (ex.: `credito_avulso`) e habilitando **Pix no Stripe BR**. Reaproveita webhook, status e
  `payment_transactions`. → **Recomendado para o MVP.**
- **Opção B**: provedor Pix dedicado (Mercado Pago / Asaas / Efí) com QR Code dinâmico e webhook
  próprio. Mais trabalho, porém Pix nativo e taxas menores.

Decidir A vs B antes da Sprint 2.

### 5.4 Modelo de dados (Mongo)

```text
credit_orders:
  id, user_id (opcional), documento_masked, documento_hash (sha256), tipo,
  consent: { aceito: true, texto_versao, ip, user_agent, timestamp },
  payment: { provider, session_id, status },
  status: pending | paid | processing | ready | error,
  report_id, created_at, updated_at

credit_reports:
  id, order_id, payload_normalizado (CreditReport), provider_meta,
  comprovante_url (PDF Direct Data, se houver), created_at, expires_at
```

- **Guardar consentimento é obrigatório** (LGPD): versão do texto + IP + timestamp.
- Persistir **CPF/CNPJ hasheado** para deduplicar/rate-limit sem armazenar em claro; exibir mascarado.
- Definir **retenção/expiração** do relatório (ex.: 30–90 dias) e política de descarte.

### 5.5 Frontend

- Nova página `frontend/src/pages/AnaliseCredito.jsx` com os **3 estados** já desenhados no MVP:
  1. **Pré-pagamento**: input CPF/CNPJ com máscara + checkbox de consentimento LGPD (obrigatório).
  2. **Processando**: loading enquanto confirma Pix e gera o relatório (polling em `/status`).
  3. **Relatório**: Score (barra), Rating BACEN (letra grande), lista PEFIN/REFIN + CTA
     **"Montar Plano de Orçamento"** → rota do orçamento existente.
- Registrar rota em `frontend/src/App.js` e item no `frontend/src/components/Sidebar.jsx`.
- Reusar o design system atual (`card-premium`, `btn-gold`, `chip`, termômetro).
- O MVP visual já existe em `proposta/mvp-app.html` (estados de consulta/relatório) — usar como referência.

---

## 6. Plano de execução (sprints)

### Sprint 0 — Fundação e sandbox
- [ ] Conta Direct Data + Token + saldo de teste.
- [ ] Coletar payloads reais (Score, SCR, PEFIN/REFIN) e salvar como fixtures de teste.
- [ ] Confirmar endpoint/custo de PEFIN/REFIN.
- [ ] Definir regra de derivação do **Rating BACEN (AA–H)**.

### Sprint 1 — Provider + normalização (sem pagamento)
- [ ] `credit_provider.py` com providers `directdata` e `mock`.
- [ ] Parsers + `CreditReport` normalizado + testes (usando fixtures, sem gastar crédito).
- [ ] Máscara de CPF/CNPJ em logs; tratamento de erro/timeout/saldo insuficiente.

### Sprint 2 — Pagamento + orquestração
- [ ] Decidir Pix (Opção A/B) e implementar `POST /api/credit/checkout`.
- [ ] Persistir `credit_orders` com consentimento.
- [ ] Webhook confirma pago → `gerar_relatorio` → `credit_reports` → `ready`.
- [ ] `GET /api/credit/status` e `GET /api/credit/report`.

### Sprint 3 — Frontend (3 estados)
- [ ] Página + rota + item no sidebar.
- [ ] Máscara CPF/CNPJ + validação + checkbox LGPD.
- [ ] Loading/polling + tela de relatório + CTA para orçamento.
- [ ] Estados de erro (pagamento falhou, documento sem dados, provedor fora do ar).

### Sprint 4 — Hardening
- [ ] Rate limit / anti-abuso por documento e por IP.
- [ ] Idempotência (não gerar relatório 2x pro mesmo pagamento).
- [ ] Observabilidade: métricas de custo por consulta vs. preço cobrado (margem).
- [ ] Retenção/expiração de relatórios + rotina de descarte (LGPD).

---

## 7. Segurança
- Chamar a Direct Data **somente server-side**; Token **nunca** no frontend.
- Só disparar consulta **após pagamento confirmado** (custo real por crédito).
- CPF/CNPJ: exibir mascarado, persistir hash; nunca logar em claro nem o payload cru.
- Idempotência no webhook (evitar cobrança dupla de crédito).
- Validar CPF/CNPJ (dígitos verificadores) antes de gastar crédito.

## 8. LGPD / Compliance
- **Base legal + finalidade**: o titular consulta os **próprios** dados → consentimento explícito
  + finalidade clara ("dar transparência às suas dívidas para organização financeira").
- Guardar **prova do consentimento** (texto versionado, IP, timestamp) na `credit_orders`.
- Deixar claro que os dados vêm de fontes oficiais (BACEN/SCR, bureaus) via Direct Data.
- **Retenção implementada**: cada relatório grava `expires_at_dt` (BSON Date) e a coleção
  `credit_reports` tem índice TTL (`expireAfterSeconds=0`) — o Mongo apaga o documento sozinho
  ao vencer `CREDIT_REPORT_RETENTION_DAYS` (90 por padrão), sem depender de worker de pé.
  O campo `expires_at` (string ISO) continua existindo só para a resposta da API, porque TTL
  não funciona sobre string. Ler relatório já expirado devolve **410** com mensagem própria,
  para o front distinguir "expirou" de "erro".
- **Pedido abandonado**: `purge_abandoned_credit_documents()` dá `$unset` no `documento_enc` de
  pedidos `pending` com mais de `CREDIT_ORDER_DOC_TTL_HOURS` (48h). Roda de hora em hora via
  `credit_retention_worker_loop`. O `status` é mantido de propósito e o resto do pedido
  (hash, máscara, consentimento) fica como trilha de auditoria. Se um pagamento chegar depois
  da purga, `_generate_credit_report` marca o pedido como `error` com mensagem de estorno em
  vez de falhar silenciosamente.
- Canal para o titular solicitar remoção antecipada.
- ⚠️ Consultar **SCR de terceiro** exige autorização formal. O produto assume "consulta do próprio
  CPF/CNPJ"; qualquer consulta de terceiro (ex.: PJ analisando cliente) precisa de base legal própria.

## 9. Custos & precificação
- Custo por relatório já apurado em §2.1: **PF ≈ R$ 9,98 · PJ ≈ R$ 9,62**.
- `CREDIT_REPORT_PRICE_BRL` deve cobrir custo + taxa de pagamento + margem.
- Monitorar margem real (Sprint 4).

## 10. Riscos & mitigação
| Risco | Mitigação |
|---|---|
| API "Online" lenta / timeout | Chamar em paralelo; gerar relatório no webhook (assíncrono), não no request do usuário. |
| Saldo de créditos zera | Alerta de saldo baixo; erro amigável ("consulta indisponível, tente mais tarde"); não cobrar o cliente se falhar. |
| Documento sem dados no bureau | Estado de "sem pendências / dados insuficientes" no front (não é erro). |
| Cobrar e não entregar | Idempotência + reprocessamento; estorno se o relatório não gerar. |
| PEFIN/REFIN indisponível/caro | MVP pode ir ao ar só com Score + SCR e adicionar negativações depois. |
| CPF cifrado retido em pedido abandonado | **Resolvido**: varredura horária apaga o `documento_enc` de pedidos `pending` com mais de 48h (ver §8). Não virou TTL de coleção porque isso apagaria a prova de consentimento dos pedidos pagos, e o `status` não é alterado para não quebrar pagamento atrasado. |
| **Pedido travado em `processing`** | Se o processo morrer entre o claim (`paid` → `processing`) e a gravação do relatório, o pedido fica preso: nada reprocessa (o claim exige `status: paid`) e o cliente pagou sem receber. Também retém o `documento_enc`, que a varredura não toca por olhar só `pending`. Mitigação a implementar: na varredura, devolver para `paid` os pedidos em `processing` há mais de N minutos, para o fluxo normal tentar de novo. |

## 11. Definition of Done (MVP)
- [ ] Usuário paga via Pix, recebe relatório com Score + Rating + (PEFIN/REFIN se disponível).
- [ ] Relatório gerado só após pagamento, no server, com dados normalizados.
- [ ] Consentimento LGPD registrado; CPF/CNPJ mascarado/hasheado.
- [ ] CTA "Montar Plano de Orçamento" leva à aba de orçamento.
- [ ] Testes do provider com fixtures (sem gastar crédito) passando.

---

## Perguntas em aberto (resolver antes de codar)
1. Pix: **Opção A (Stripe)** ou **B (provedor dedicado)**?
2. Endpoint e custo exatos de **PEFIN/REFIN**.
3. Regra oficial de derivação do **Rating BACEN (AA–H)**.
4. Serviço é só para o **próprio** titular (PF) ou também consulta **PJ de terceiros** (muda a base legal LGPD)?
5. Tempo de **retenção** do relatório.
