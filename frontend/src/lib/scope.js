/**
 * Escopo completo do infoproduto FinPremium.
 * Estruturado em objetos para renderização + string Markdown única para download.
 */

export const SCOPE_SECTIONS = [
  {
    id: "arquitetura",
    number: "01",
    eyebrow: "Arquitetura do Produto",
    title: "O que o cliente recebe",
    plain:
      "A planilha/app é estruturada em 4 abas essenciais mais uma capa/onboarding, no total 5 telas. Cada aba resolve uma dor específica e conecta com a próxima em um funil de organização financeira. Dashboard Principal: visao 360 do mes atual - KPIs de receita, gastos, investido, saldo, grafico de pizza de despesas por categoria, termometro de metas ativas e alertas de gastos estourados. Orcamento 50/30/20: tabela editavel com Necessidades, Desejos e Investimentos - o usuario define Planejado x Real, o sistema calcula desvio e status por cor. Controle de Dividas: cadastro de credores com saldo, taxa e parcela minima. Simulador Bola de Neve (menor divida primeiro) ou Avalanche (maior taxa primeiro). Mostra meses economizados e juros que voce nao paga. Metas & Numero da Liberdade: metas de curto/longo prazo com barras de progresso + calculadora FIRE baseada na regra dos 4 por cento - qual patrimonio voce precisa para viver de renda passiva.",
    blocks: [
      {
        heading: "Estrutura macro (5 telas)",
        list: [
          "<strong>Onboarding/Capa</strong> — Tela de boas-vindas com brief do método, foto premium e CTA para começar a preencher.",
          "<strong>Dashboard Principal</strong> — Visão 360º do mês, com 4 KPIs, gráfico de pizza de despesas, termômetro de metas, evolução de 6 meses e alertas de gastos.",
          "<strong>Orçamento Mensal (50/30/20)</strong> — Tabela editável com Necessidades, Desejos e Investimentos.",
          "<strong>Controle de Dívidas</strong> — Cadastro de credores + Simulador Bola de Neve/Avalanche.",
          "<strong>Metas & Número da Liberdade</strong> — Metas com deadline + calculadora FIRE (Regra dos 4%).",
        ],
      },
      {
        heading: "01.1 · Dashboard Principal",
        paragraphs: [
          "Objetivo: gerar o efeito 'UAU' em 5 segundos. É a primeira tela que o cliente vê após preencher os dados. Deve parecer um cockpit de investidor.",
        ],
        list: [
          "<strong>KPI Row</strong>: 4 cards em linha — Receita, Gastos, Investido, Saldo. Cada card mostra valor grande em fonte serif + delta % vs mês anterior + ícone dourado.",
          "<strong>Gráfico de Pizza (Distribuição de Despesas)</strong>: donut chart com 6-8 categorias em tons de dourado + neutros. Legenda com % ao lado.",
          "<strong>Gráfico de Linhas (Evolução 6 meses)</strong>: 3 séries — Receita, Gastos, Investido. Estilo minimalista com grid pontilhado.",
          "<strong>Termômetro de Metas</strong>: barras horizontais com preenchimento dourado gradiente. Mostra progresso % de cada meta ativa.",
          "<strong>Card Regra 50/30/20</strong>: gráfico de barras comparando Ideal x Real para cada pilar.",
          "<strong>Alertas Inteligentes</strong>: lista de itens que estouraram +5% do planejado, em vermelho suave.",
          "<strong>Card Número da Liberdade</strong> em destaque: quanto falta para independência financeira, com barra dourada.",
        ],
      },
      {
        heading: "01.2 · Orçamento Mensal 50/30/20",
        paragraphs: [
          "Baseado na regra popularizada por Elizabeth Warren: 50% Necessidades / 30% Desejos / 20% Investimentos. Cada bloco mostra ideal x real com termômetro colorido (verde/amarelo/vermelho).",
        ],
        table: {
          headers: ["Categoria", "% Ideal", "Exemplos de itens", "Regra de status"],
          rows: [
            ["Necessidades", "50%", "Aluguel, mercado, contas, transporte, saúde", "≤ 50% verde / até 55% amarelo / > 55% vermelho"],
            ["Desejos", "30%", "Restaurantes, lazer, assinaturas, hobbies", "≤ 30% verde / até 33% amarelo / > 33% vermelho"],
            ["Investimentos", "20%", "Reserva, ações, FIIs, previdência", "≥ 20% verde / entre 15-20% amarelo / < 15% vermelho"],
          ],
        },
        list: [
          "Cada item tem 4 campos: Nome, Planejado, Real e Δ (diferença calculada).",
          "Botão + para adicionar novos itens em qualquer categoria.",
          "Renda mensal editável no topo — recalcula automaticamente os limites ideais.",
        ],
      },
      {
        heading: "01.3 · Controle de Dívidas",
        paragraphs: [
          "Módulo de maior impacto emocional. Quem está endividado sente alívio ao ver luz no fim do túnel — data exata da liberdade.",
        ],
        list: [
          "<strong>Cadastro</strong>: Nome do credor, Saldo devedor, Taxa mensal, Parcela mínima.",
          "<strong>Simulador Bola de Neve</strong>: prioriza menor saldo — vitórias rápidas mantêm motivação.",
          "<strong>Simulador Avalanche</strong>: prioriza maior taxa — economia matemática máxima.",
          "<strong>Aporte Extra</strong>: campo onde o cliente informa quanto pode pagar a mais por mês.",
          "<strong>Outputs em tempo real</strong>: meses até quitação, meses economizados vs cenário mínimo, juros que deixa de pagar.",
          "<strong>Ordem de Ataque</strong>: lista numerada de qual dívida atacar primeiro (com dívida #1 destacada em dourado).",
        ],
      },
      {
        heading: "01.4 · Metas & Número da Liberdade",
        paragraphs: [
          "A cereja do bolo. Aqui o cliente para de pensar em curto prazo e visualiza a aposentadoria antecipada — o sonho que ele foi vendido no ad.",
        ],
        list: [
          "<strong>Metas de Longo Prazo</strong>: nome, valor alvo, valor atual, deadline. Sistema calcula aporte mensal necessário para bater a meta no prazo.",
          "<strong>Calculadora FIRE (Financial Independence Retire Early)</strong>: baseado no Trinity Study — patrimônio × 25 = renda vitalícia (regra dos 4%).",
          "<strong>Inputs</strong>: gasto mensal desejado, taxa de retirada segura (SWR), patrimônio atual, aporte mensal, retorno real esperado.",
          "<strong>Outputs</strong>: Número da Liberdade (R$), % de progresso, anos até FIRE (usando fórmula de juros compostos).",
        ],
        code: "// Fórmula do Número da Liberdade\nNúmero_Liberdade = (Gasto_Mensal × 12) / (SWR / 100)\n\n// Exemplo: gasto de R$ 4.200/mês com SWR de 4%\n// = (4200 × 12) / 0.04 = R$ 1.260.000\n\n// Tempo até FIRE (fórmula de valor futuro):\n// n = log((FV + PMT/r) / (PV + PMT/r)) / log(1 + r)",
      },
    ],
  },
  {
    id: "design",
    number: "02",
    eyebrow: "Diferenciais Visuais & UX",
    title: "Como parecer software caro",
    plain:
      "A diferenca entre uma planilha 'chata do Excel' e um Gestor Financeiro Premium esta em 5 pilares visuais: paleta escura de alto contraste, tipografia serif elegante, iconografia consistente (Lucide/Feather), espacamento generoso (2-3x mais que confortavel), e micro-interacoes. Paleta: fundo obsidiana #0A0908, dourado envelhecido #C9A961 como acento (nao amarelo garrido), tipos em Fraunces (display serif) e Manrope (body). Nada de gradientes purpura, nada de fontes genericas tipo Inter/Roboto, nada de emojis. Botoes pill dourado com sombra suave, cards com backdrop-blur e borda com highlight superior dourado degrade, tabelas com hover sutil dourado.",
    blocks: [
      {
        heading: "02.1 · Paleta de cores (copie e cole)",
        table: {
          headers: ["Token", "Valor HEX", "Uso"],
          rows: [
            ["Fundo Void", "#07060A", "Background raiz"],
            ["Fundo Abyss", "#0B0A0F", "App shell"],
            ["Surface", "#131218", "Cards base"],
            ["Elevated", "#1B1A22", "Cards elevados"],
            ["Line/Border", "#2A2833", "Bordas sutis"],
            ["Dourado", "#C9A961", "Cor primária (ações e valores)"],
            ["Dourado Bright", "#E8CE87", "Highlights, textos hero"],
            ["Dourado Deep", "#8B7A3E", "Estados hover, gradientes"],
            ["Text Primary", "#F5F0E1", "Textos principais (warm white)"],
            ["Text Secondary", "#ADA79A", "Textos secundários"],
            ["Success", "#7FB069", "Ganhos, metas batidas"],
            ["Danger", "#D46A6A", "Alertas, dívidas"],
            ["Warning", "#E4C87E", "Estouros leves"],
          ],
        },
      },
      {
        heading: "02.2 · Tipografia",
        list: [
          "<strong>Display (títulos, KPIs)</strong>: Fraunces — serif contemporâneo com opticals. Peso 500-600, letter-spacing -0.02em a -0.03em.",
          "<strong>Body (textos, tabelas)</strong>: Manrope — geométrica limpa, alta legibilidade em interfaces densas. Peso 400 body, 600 semibold.",
          "<strong>Números</strong>: use tabular-nums (font-feature-settings: 'tnum') para alinhar valores em tabelas.",
          "<strong>Hierarquia</strong>: Eyebrow (11px, tracking 0.24em uppercase, dourado) → H1 (42px display) → H2 (22-24px display) → Body (14-15px) → Micro (11-12px).",
        ],
      },
      {
        heading: "02.3 · Ícones e imagens",
        list: [
          "Use Lucide-react (ou versão SVG estática no Google Sheets via ImageURL) — ícones stroke-width 1.75, minimalistas.",
          "NUNCA use emojis coloridos (🤖💰📊). Quebram o clima premium.",
          "Fotos hero: pessoas de terno, gráficos em telas grandes, mesas de mogno, notebooks Mac. Preto e branco com um único acento dourado.",
        ],
      },
      {
        heading: "02.4 · Componentes premium (regras)",
        list: [
          "<strong>Cards</strong>: background gradient linear(180deg, rgba(27,26,34,0.72), rgba(19,18,24,0.72)), border 1px sólida escura, backdrop-blur 20px, borda superior dourada gradiente (::before).",
          "<strong>Botões primários</strong>: pill (border-radius 999px), fundo gradient dourado, texto preto, sombra inset branca no topo (aparência de 'lâmina'). Hover: translateY -1px + brightness 1.06.",
          "<strong>Termômetros</strong>: barras horizontais height 10px, background escuro, fill com gradient dourado + box-shadow 0 0 12px rgba dourado (glow sutil).",
          "<strong>Tabelas</strong>: header em 11px uppercase tracking 0.14em (kpi-label style), linhas com hover dourado 4% opacity.",
          "<strong>Espaçamento</strong>: padding cards 24-32px, gap entre cards 20px, gap entre seções 32-40px. Se parece 'muito espaço', está certo.",
        ],
      },
      {
        heading: "02.5 · Micro-interações essenciais",
        list: [
          "Fade-up em cards ao carregar (opacity + translateY 12px → 0, easing cubic-bezier(0.22, 1, 0.36, 1), 600ms).",
          "Shimmer sutil em textos hero dourados (background gradient animado 4s linear).",
          "Termômetros preenchem em 800ms com easing cubic-bezier de saída suave.",
          "Hover cards: border-color transita de escuro para dourado 28% em 400ms.",
          "Grão sutil (grain overlay) via SVG turbulence em opacity 3-5% — dá textura fotográfica ao dark mode.",
        ],
      },
    ],
  },
  {
    id: "automacao",
    number: "03",
    eyebrow: "Mecânicas de Automatização",
    title: 'Fórmulas & scripts para o efeito "Uau!"',
    plain:
      "As mecanicas essenciais que fazem um cliente pensar 'isso vale muito mais do que paguei'. Preenchimento automatico via listas dinamicas e SUMIFS, alertas condicionais em vermelho quando gasto > planejado, calculo automatico de bola de neve de dividas via App Script, geracao de PDF do dashboard em 1 clique, envio de email semanal com resumo, importacao automatica de extrato bancario via CSV, dashboard responsivo mobile-first, integracao com Open Finance (para versao pro), backup em nuvem, deteccao inteligente de categoria por palavra-chave, projecao FIRE com juros compostos, calculo de 13o e ferias automatico.",
    blocks: [
      {
        heading: "03.1 · Google Sheets — Fórmulas essenciais",
        list: [
          "<strong>Total por categoria dinâmico</strong>: <code>=SUMIFS(Transacoes!C:C, Transacoes!B:B, \"Necessidades\", Transacoes!D:D, \">=\"&$A$1)</code>",
          "<strong>Alerta condicional (formatação)</strong>: Regra 'Fórmula personalizada' → <code>=$D2>$C2*1.05</code> → preencher célula em vermelho.",
          "<strong>Porcentagem 50/30/20</strong>: <code>=(SUMIF(...))/RendaMensal</code> formatado como porcentagem.",
          "<strong>Bola de neve (menor dívida)</strong>: <code>=INDEX(A:A, MATCH(MINIFS(B:B, B:B, \">0\"), B:B, 0))</code>",
          "<strong>Data de quitação estimada</strong>: <code>=TODAY() + (SaldoDevedor / AporteMensal) * 30</code>",
          "<strong>Número da Liberdade</strong>: <code>=(GastoMensal*12)/(SWR/100)</code>",
          "<strong>Anos até FIRE</strong>: <code>=NPER(Retorno/12, -Aporte, -PatrimonioAtual, NumeroLiberdade)/12</code>",
        ],
      },
      {
        heading: "03.2 · Google Apps Script — Automações avançadas",
        paragraphs: [
          "Cole os scripts abaixo em Extensões → Apps Script. Cada um resolve uma dor específica e vira gatilho de venda ('planilha que envia email? absurdo!').",
        ],
        code: `// 1) Enviar resumo semanal por email (agendar via Trigger toda segunda 08h)
function enviarResumoSemanal() {
  const ss = SpreadsheetApp.getActive();
  const dash = ss.getSheetByName("Dashboard");
  const receita = dash.getRange("B4").getValue();
  const gastos  = dash.getRange("B5").getValue();
  const saldo   = dash.getRange("B6").getValue();
  const email   = Session.getActiveUser().getEmail();
  const corpo = \`Seu resumo da semana:
- Receita: R$ \${receita.toFixed(2)}
- Gastos: R$ \${gastos.toFixed(2)}
- Saldo: R$ \${saldo.toFixed(2)}\`;
  MailApp.sendEmail(email, "Resumo Financeiro Semanal", corpo);
}

// 2) Exportar Dashboard como PDF em 1 clique
function exportarDashboardPDF() {
  const ss = SpreadsheetApp.getActive();
  const url = ss.getUrl().replace(/edit$/, '');
  const params = "export?format=pdf&size=A4&portrait=true&scale=2&gid=" 
                 + ss.getSheetByName("Dashboard").getSheetId();
  const token = ScriptApp.getOAuthToken();
  const blob = UrlFetchApp.fetch(url + params, {
    headers: { Authorization: "Bearer " + token }
  }).getBlob().setName("Relatorio_" + new Date().toISOString().slice(0,10) + ".pdf");
  DriveApp.createFile(blob);
}

// 3) Categorizar transações automaticamente por palavra-chave
function categorizarAuto() {
  const sh = SpreadsheetApp.getActive().getSheetByName("Transacoes");
  const data = sh.getRange(2, 1, sh.getLastRow()-1, 5).getValues();
  const regras = {
    "iFood|Uber Eats": "Desejos",
    "Uber|99|Metro": "Necessidades",
    "Aluguel|Condominio": "Necessidades",
    "XP|NuInvest|Rico": "Investimentos"
  };
  data.forEach((row, i) => {
    if (!row[1]) {
      for (let regex in regras) {
        if (new RegExp(regex, "i").test(row[0])) {
          sh.getRange(i+2, 2).setValue(regras[regex]);
          break;
        }
      }
    }
  });
}

// 4) Simulador Bola de Neve — quantos meses até zerar
function simularBolaDeNeve() {
  const sh = SpreadsheetApp.getActive().getSheetByName("Dividas");
  const dividas = sh.getRange(2, 1, sh.getLastRow()-1, 4).getValues()
                    .filter(r => r[1] > 0)
                    .sort((a,b) => a[1] - b[1]); // menor saldo primeiro
  const extra = sh.getRange("F1").getValue();
  let mes = 0;
  while (dividas.some(d => d[1] > 0) && mes < 600) {
    mes++;
    dividas.forEach(d => { d[1] *= (1 + d[2]/100); d[1] -= d[3]; });
    const alvo = dividas.find(d => d[1] > 0);
    if (alvo) alvo[1] -= extra;
  }
  sh.getRange("F2").setValue(mes);
}`,
      },
      {
        heading: "03.3 · No-code app (versão web) — automações extras",
        list: [
          "<strong>Import CSV de extrato bancário</strong>: usuário arrasta arquivo .csv do banco → sistema mapeia colunas → categoriza automaticamente.",
          "<strong>Notificação Push/WhatsApp</strong> quando gasto de uma categoria ultrapassa 90% do orçamento (via Twilio ou webhooks).",
          "<strong>PDF download em 1 clique</strong>: usar jsPDF + html2canvas para gerar relatório mensal estilizado.",
          "<strong>Dark mode + Light mode toggle</strong>: (opcional, mas o cliente ama sentir controle).",
          "<strong>Sincronização entre dispositivos</strong>: dados financeiros persistidos por usuário no MongoDB Atlas, com sessão autenticada e atualização automática.",
          "<strong>Widgets de resumo</strong>: mini-cards com KPIs para o cliente compartilhar no Instagram (com watermark seu).",
        ],
      },
    ],
  },
  {
    id: "gatilhos",
    number: "04",
    eyebrow: "Gatilhos de Venda",
    title: "Bônus para maximizar conversão",
    plain:
      "Para tráfego pago no Meta/Instagram, o preço percebido precisa parecer 5-10x maior que o preço cobrado. Os 3 bônus estratégicos abaixo são de baixo custo de produção e altíssimo valor percebido. Bônus 1: Planilha de Juros Compostos Premium - valor R$ 47 - simulador com cenarios otimista/pessimista, comparativo Selic vs CDI vs IPCA, grafico visual do efeito bola de neve dos juros. Bonus 2: Minicurso em video 1o Milhao em 7 Passos - valor R$ 197 - aula executiva de 42min com tela e case real, entregue via link Vimeo/Kiwify. Bonus 3: Ebook As 30 Perguntas que Todo Rico Faz - valor R$ 37 - PDF com roteiro de due diligence para qualquer investimento. Total percebido R$ 281 em bonus + planilha principal R$ 197 = valor total R$ 478 vendido por R$ 97-127. Copy tipico: 'De R$ 478 por apenas R$ 97 - somente hoje'. Estrutura de landing: hero com dashboard mockup, 3 secoes de dor, 3 secoes de solucao com prints, secao de bonus com valor riscado, garantia de 7 dias, CTA amarelo dourado no final, badge de seguranca.",
    blocks: [
      {
        heading: "04.1 · Os 3 Bônus Estratégicos (baixo custo, alto valor percebido)",
        table: {
          headers: ["Bônus", "Formato", "Valor percebido", "Custo real de produção"],
          rows: [
            ["Calculadora de Juros Compostos Premium", "Planilha extra", "R$ 47", "2h de trabalho"],
            ["Minicurso 1º Milhão em 7 Passos", "6 vídeos de 5-8min", "R$ 197", "1 fim de semana gravando"],
            ["E-book 30 Perguntas dos Ricos Antes de Investir", "PDF 22 páginas", "R$ 37", "1 dia escrevendo"],
          ],
        },
        paragraphs: [
          "Total percebido: R$ 281 em bônus + planilha principal R$ 197 = R$ 478 de valor total. Vendido por R$ 97-127. Percepção de desconto de 75-80%.",
        ],
      },
      {
        heading: "04.2 · Bônus 1 — Calculadora de Juros Compostos Premium",
        list: [
          "3 cenários lado a lado: pessimista (5%), realista (8%), otimista (12%).",
          "Comparativo Selic × IPCA × CDI com dados atualizáveis.",
          "Gráfico do 'efeito bola de neve' — mostra visualmente o momento em que juros ultrapassam aportes.",
          "Copy da página de vendas: <em>'Descubra em segundos quanto R$ 100 por mês vira em 30 anos (a resposta vai te chocar).'</em>",
        ],
      },
      {
        heading: "04.3 · Bônus 2 — Minicurso em vídeo",
        list: [
          "6-7 vídeos de 5-8 min cada. Grava no celular com iluminação decente.",
          "Estrutura: (1) Mentalidade → (2) Auditoria → (3) Reserva → (4) Dívidas → (5) Investimento inicial → (6) Renda variável → (7) Aceleração.",
          "Entregue via link Vimeo/Kiwify com senha ou hospedado em área de membros simples.",
          "Copy: <em>'A aula executiva que trabalhadores CLT usam para chegar ao 1º milhão em 8 anos (mesmo ganhando 4k/mês).'</em>",
        ],
      },
      {
        heading: "04.4 · Bônus 3 — E-book 30 Perguntas dos Ricos",
        list: [
          "22 páginas em PDF diagramado (use Canva Pro).",
          "30 perguntas em 5 categorias: mentalidade, análise de ativo, timing, gestão de risco, mindset pós-compra.",
          "Bônus dentro do bônus: template printável para tomada de decisão.",
          "Copy: <em>'O checklist que separa investidor amador do profissional. Nenhum aporte é feito sem passar por essas 30 perguntas.'</em>",
        ],
      },
      {
        heading: "04.5 · Estrutura da Landing Page de Alta Conversão",
        list: [
          "<strong>Hero</strong>: título de dor + mockup do dashboard em laptop + CTA dourado imediato. <em>'Do caos financeiro ao controle total em 30 dias — sem precisar entender de Excel.'</em>",
          "<strong>Prova social imediata</strong>: 3-4 depoimentos com foto + resultado (evite fakes; use beta testers reais).",
          "<strong>Seção 'Você se identifica?'</strong>: 3-5 dores em bullets (não sabe quanto gasta, vive no vermelho, quer investir mas não sabe começar).",
          "<strong>Apresentação do produto</strong>: 4 cards mostrando as 4 abas com screenshots reais do dashboard.",
          "<strong>Bônus com valor riscado</strong>: 'De R$ 478 por apenas R$ 97'. Timer de escassez (48h).",
          "<strong>Garantia incondicional 7 dias</strong>: badge de 'satisfação ou dinheiro de volta'.",
          "<strong>FAQ</strong>: 5-7 perguntas cobrindo objeções ('funciona no Mac?', 'preciso saber Excel?', 'e se eu já uso outra planilha?').",
          "<strong>CTA final</strong>: botão dourado grande + '🔒 Compra segura via Kiwify/Hotmart' + logos de bandeiras.",
        ],
      },
      {
        heading: "04.6 · Criativos para Meta Ads (5 formatos que convertem)",
        list: [
          "<strong>Vídeo demo 15s</strong>: screencast do dashboard sendo preenchido em tempo real (efeito UAU).",
          "<strong>Carrossel 'antes vs depois'</strong>: 5 slides mostrando planilhas caóticas do concorrente vs FinPremium.",
          "<strong>Depoimento em vídeo</strong>: cliente real (ou você mesmo) contando resultado em 30s.",
          "<strong>Story 9:16 com contagem regressiva</strong>: 'só hoje R$ 97 (de R$ 478)'.",
          "<strong>Reels educativo</strong>: 30s ensinando a regra 50/30/20 → 'quer a planilha pronta? link na bio'.",
        ],
      },
      {
        heading: "04.7 · Métricas para acompanhar (Meta Ads)",
        table: {
          headers: ["Métrica", "Meta saudável", "Se estiver abaixo…"],
          rows: [
            ["CTR (Click-through rate)", "> 1.5%", "Refazer criativo/copy do anúncio"],
            ["CPC (Custo por clique)", "R$ 0,50 – R$ 1,50", "Refinar público ou testar novos anúncios"],
            ["Taxa de conversão da landing", "1.5% – 4%", "Otimizar hero e CTA da página"],
            ["CAC (Custo de aquisição)", "≤ 30% do ticket", "Escalar apenas conjuntos com CAC saudável"],
            ["ROAS (Retorno sobre gasto)", "≥ 2.5x", "Pausar conjuntos abaixo e escalar os acima de 4x"],
          ],
        },
      },
    ],
  },
];

// Markdown export (used for download)
export const SCOPE_MD = `# FinPremium — Escopo Completo do Infoproduto
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
- Fórmula: \`Número_Liberdade = (Gasto_Mensal × 12) / (SWR / 100)\`
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
\`\`\`
Total por categoria: =SUMIFS(Transacoes!C:C, Transacoes!B:B, "Necessidades")
Alerta condicional: =$D2>$C2*1.05  (formata em vermelho)
% 50/30/20: =(SUMIF(...))/RendaMensal
Data quitação: =TODAY() + (SaldoDevedor / AporteMensal) * 30
Número Liberdade: =(GastoMensal*12)/(SWR/100)
Anos até FIRE: =NPER(Retorno/12, -Aporte, -PatrimonioAtual, NumeroLiberdade)/12
\`\`\`

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
`;
