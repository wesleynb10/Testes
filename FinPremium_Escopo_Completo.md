# FinPremium — Escopo Completo do Infoproduto
> Blueprint executivo para construir e vender um Gestor Financeiro Premium via tráfego pago (Meta Ads/Instagram).

---

## 01 · ARQUITETURA DO PRODUTO

O produto é composto por **5 telas essenciais**:

1. **Onboarding/Capa** — boas-vindas, brief do método, CTA para começar.
2. **Dashboard Principal** — cockpit executivo (KPIs, gráficos, alertas).
3. **Orçamento Mensal 50/30/20** — tabela editável (Necessidades/Desejos/Investimentos).
4. **Controle de Dívidas** — cadastro + Simulador Bola de Neve/Avalanche.
5. **Metas & Número da Liberdade** — metas de longo prazo + calculadora FIRE.

### 1.1 Dashboard Principal
- **KPI Row**: 4 cards (Receita, Gastos, Investido, Saldo) com delta % vs mês anterior.
- **Gráfico de Pizza**: distribuição de despesas em tons dourados.
- **Evolução 6 meses** (line chart): receita, gastos, investido.
- **Termômetro de Metas**: barras horizontais com preenchimento dourado gradiente.
- **Regra 50/30/20** (bar chart): ideal x real.
- **Alertas**: itens que estouraram +5% do planejado.
- **Card Número da Liberdade** em destaque.

### 1.2 Orçamento 50/30/20

| Categoria       | % Ideal | Exemplos                                     | Status                |
|-----------------|---------|----------------------------------------------|------------------------|
| Necessidades    | 50%     | Aluguel, mercado, contas, transporte, saúde  | ≤50% verde / >55% vermelho |
| Desejos         | 30%     | Restaurantes, lazer, assinaturas             | ≤30% verde / >33% vermelho |
| Investimentos   | 20%     | Reserva, ações, FIIs, previdência            | ≥20% verde / <15% vermelho |

Cada item: Nome, Planejado, Real, Δ (diferença). Botão + para adicionar itens.

### 1.3 Controle de Dívidas
- Cadastro: Nome, Saldo devedor, Taxa (%/mês), Parcela mínima.
- Simulador **Bola de Neve** (menor saldo primeiro) ou **Avalanche** (maior taxa).
- Campo de aporte extra mensal.
- Outputs: meses até quitação, meses economizados, juros que deixa de pagar.
- Ordem de ataque numerada com dívida #1 destacada.

### 1.4 Metas & Número da Liberdade
- Metas: nome, alvo, atual, deadline, aporte mensal necessário calculado.
- Calculadora FIRE (Trinity Study / regra dos 4%).
- Fórmula: `Número_Liberdade = (Gasto_Mensal × 12) / (SWR / 100)`
- Anos até FIRE via fórmula de juros compostos.

---

## 02 · DIFERENCIAIS VISUAIS & UX

### 2.1 Paleta

| Token         | HEX      | Uso                              |
|---------------|----------|----------------------------------|
| Fundo Void    | #07060A  | Background raiz                  |
| Surface       | #131218  | Cards base                       |
| Elevated      | #1B1A22  | Cards elevados                   |
| Line          | #2A2833  | Bordas                           |
| Dourado       | #C9A961  | Cor primária                     |
| Dourado Bright| #E8CE87  | Highlights                       |
| Text Primary  | #F5F0E1  | Textos principais                |
| Text Secondary| #ADA79A  | Textos secundários               |
| Success       | #7FB069  | Ganhos                           |
| Danger        | #D46A6A  | Alertas                          |
| Warning       | #E4C87E  | Estouros leves                   |

### 2.2 Tipografia
- **Display**: Fraunces (serif contemporâneo, peso 500-600, letter-spacing -0.02 a -0.03em).
- **Body**: Manrope (geométrica limpa, peso 400 body, 600 semibold).
- **Números**: tabular-nums para alinhamento em tabelas.
- Hierarquia: Eyebrow (11px uppercase tracking 0.24em) → H1 42px → H2 22-24px → Body 14-15px → Micro 11-12px.

### 2.3 Ícones
- Lucide-react, stroke-width 1.75.
- **Proibido**: emojis coloridos, ícones flat coloridos.

### 2.4 Componentes
- **Cards**: backdrop-blur 20px, borda escura + highlight superior dourado (::before gradient).
- **Botões primários**: pill (border-radius 999px), gradient dourado, texto preto, sombra inset branca sutil.
- **Termômetros**: 10px altura, background escuro, fill dourado com glow.
- **Espaçamento**: padding cards 24-32px, gap seções 32-40px. "Se parece muito espaço, está certo."

### 2.5 Micro-interações
- Fade-up em cards (600ms cubic-bezier(0.22, 1, 0.36, 1)).
- Shimmer em textos hero dourados (gradient animado 4s).
- Grão sutil (SVG turbulence overlay 3-5%).
- Hover cards: border-color escura → dourada em 400ms.

---

## 03 · MECÂNICAS DE AUTOMATIZAÇÃO

### 3.1 Fórmulas essenciais (Google Sheets)
```
Total por categoria: =SUMIFS(Transacoes!C:C, Transacoes!B:B, "Necessidades")
Alerta condicional: =$D2>$C2*1.05  (formata em vermelho)
% 50/30/20: =(SUMIF(...))/RendaMensal
Data quitação: =TODAY() + (SaldoDevedor / AporteMensal) * 30
Número Liberdade: =(GastoMensal*12)/(SWR/100)
Anos até FIRE: =NPER(Retorno/12, -Aporte, -PatrimonioAtual, NumeroLiberdade)/12
```

### 3.2 Google Apps Script — 4 automações prontas
1. **enviarResumoSemanal()** — email automático toda segunda 08h com KPIs.
2. **exportarDashboardPDF()** — botão que gera PDF do dashboard em 1 clique.
3. **categorizarAuto()** — categoriza transações via regex de palavras-chave.
4. **simularBolaDeNeve()** — calcula meses até quitação de todas as dívidas.

### 3.3 Versão No-Code (web)
- Import CSV de extrato bancário.
- Notificação WhatsApp via Twilio quando categoria ultrapassa 90% do orçamento.
- PDF download com jsPDF + html2canvas.
- Widgets compartilháveis (Instagram Story) com watermark.

---

## 04 · GATILHOS DE VENDA (BÔNUS)

### 4.1 Os 3 bônus estratégicos

| Bônus                                          | Formato          | Valor percebido | Custo produção |
|------------------------------------------------|------------------|-----------------|----------------|
| Calculadora Juros Compostos Premium            | Planilha extra   | R$ 47           | 2h             |
| Minicurso 1º Milhão em 7 Passos                | 6-7 vídeos       | R$ 197          | 1 fim de semana|
| E-book 30 Perguntas dos Ricos Antes de Investir| PDF 22 páginas   | R$ 37           | 1 dia          |

**Total percebido**: R$ 478 (planilha R$ 197 + bônus R$ 281). Vendido por R$ 97-127.

### 4.2 Landing Page — estrutura
1. **Hero** com dor + mockup + CTA dourado.
2. Prova social (3-4 depoimentos reais).
3. Seção "Você se identifica?" (5 dores em bullets).
4. Apresentação do produto (4 cards com screenshots).
5. Bônus com valor riscado + timer de 48h.
6. Garantia 7 dias incondicional.
7. FAQ (5-7 objeções).
8. CTA final grande + selos de segurança.

### 4.3 Criativos para Meta Ads
- Vídeo demo 15s (screencast do dashboard).
- Carrossel antes vs depois.
- Depoimento 30s.
- Story 9:16 com contagem regressiva.
- Reels educativo (regra 50/30/20).

### 4.4 Métricas alvo

| Métrica         | Meta saudável        |
|-----------------|----------------------|
| CTR             | > 1.5%               |
| CPC             | R$ 0,50 – R$ 1,50    |
| Conversão landing| 1.5% – 4%           |
| CAC             | ≤ 30% do ticket      |
| ROAS            | ≥ 2.5x               |

---

## Anexo A · Livros recomendados
- Pai Rico, Pai Pobre — Robert Kiyosaki
- O Homem Mais Rico da Babilônia — George Clason
- The Psychology of Money — Morgan Housel
- O Investidor Inteligente — Benjamin Graham
- Casais Inteligentes Enriquecem Juntos — Gustavo Cerbasi
- Do Mil ao Milhão — Thiago Nigro

---

*Documento gerado pela plataforma FinPremium. Todos os direitos reservados.*
