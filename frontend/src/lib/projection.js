// Motor de projeção de fluxo de caixa (olhar para frente).
// Tudo aqui é puro/determinístico para facilitar teste e memoização.

/**
 * Quantos meses até a dívida quitar, a partir de hoje.
 * - termMonths informado vence: é o prazo contratual.
 * - Senão amortiza pelo saldo, taxa e parcela mínima.
 * - Retorna Infinity quando a parcela não cobre os juros (nunca quita).
 */
export function monthsUntilPaidOff(debt) {
  const balance = Number(debt?.balance) || 0;
  if (balance <= 0) return 0;

  const term = Math.floor(Number(debt?.termMonths) || 0);
  if (term > 0) return term;

  const min = Number(debt?.minPayment) || 0;
  if (min <= 0) return Infinity;

  const ratePct = Number(debt?.rate) || 0;
  const monthlyRate = debt?.ratePeriod === "aa" ? ratePct / 100 / 12 : ratePct / 100;

  if (monthlyRate <= 0) return Math.ceil(balance / min);

  const firstInterest = balance * monthlyRate;
  if (min <= firstInterest) return Infinity;

  const n = -Math.log(1 - (monthlyRate * balance) / min) / Math.log(1 + monthlyRate);
  return Math.max(1, Math.ceil(n));
}

/**
 * Soma "planejado" quando houver, senão cai no "real" (gasto recorrente
 * que existe mesmo sem ter sido orçado).
 */
export function sumBudgetForward(items = []) {
  return items.reduce((total, item) => {
    const planned = Number(item?.planned) || 0;
    const actual = Number(item?.actual) || 0;
    return total + (planned > 0 ? planned : actual);
  }, 0);
}

/**
 * Deriva as premissas base a partir do estado financeiro salvo.
 */
export function deriveBaseline(state) {
  const profile = state?.profile || {};
  const budget = state?.budget || {};
  const fire = state?.fire || {};

  const income = Number(profile.monthlyIncome) || 0;
  const expensesNec = sumBudgetForward(budget.necessidades);
  const expensesDes = sumBudgetForward(budget.desejos);
  const monthlyExpenses = expensesNec + expensesDes;

  const budgetInvest = sumBudgetForward(budget.investimentos);
  const monthlyInvest = budgetInvest > 0 ? budgetInvest : Number(fire.monthlyInvestment) || 0;

  return { income, monthlyExpenses, monthlyInvest };
}

/**
 * Expande a configuração de eventos em ocorrências concretas por mês.
 *
 * - Eventos manuais com `recurring: true` repetem a cada 12 meses dentro do horizonte.
 * - `auto13` gera o 13º salário a partir da renda, respeitando o calendário real:
 *     mode "split" = metade em novembro + metade em dezembro (padrão CLT);
 *     mode "dec"   = valor integral em dezembro.
 *
 * startMonthIndex = mês de calendário (0-11) correspondente ao offset 1 da projeção.
 */
export function expandEvents({
  events = [],
  horizon = 12,
  startMonthIndex = 0,
  income = 0,
  auto13 = false,
  auto13Mode = "split",
}) {
  const out = [];

  for (const e of events) {
    const base = Math.floor(Number(e.month) || 0);
    const amount = Number(e.amount) || 0;
    if (!amount || base < 1) continue;
    if (e.recurring) {
      for (let m = base; m <= horizon; m += 12) {
        out.push({ month: m, amount, label: e.label });
      }
    } else if (base <= horizon) {
      out.push({ month: base, amount, label: e.label });
    }
  }

  if (auto13 && income > 0) {
    for (let m = 1; m <= horizon; m++) {
      const calMonth = (startMonthIndex + (m - 1)) % 12; // 0 = jan ... 11 = dez
      if (auto13Mode === "dec") {
        if (calMonth === 11) out.push({ month: m, amount: income, label: "13º salário" });
      } else {
        if (calMonth === 10) out.push({ month: m, amount: income * 0.5, label: "13º (1ª parcela)" });
        if (calMonth === 11) out.push({ month: m, amount: income * 0.5, label: "13º (2ª parcela)" });
      }
    }
  }

  return out;
}

/**
 * Constrói a projeção mês a mês.
 *
 * events: [{ month: <offset 1..horizon>, amount: number, label: string }]
 *   amount > 0 = entrada extra (13º, bônus); amount < 0 = saída extra (IPVA, viagem).
 *   Já devem estar expandidos (ver expandEvents) — recorrência/13º não são tratados aqui.
 */
export function buildProjection({
  income = 0,
  monthlyExpenses = 0,
  monthlyInvest = 0,
  debts = [],
  horizon = 12,
  startingCash = 0,
  incomeGrowthAnnual = 0,
  expenseGrowthAnnual = 0,
  events = [],
}) {
  const incomeStep = Math.pow(1 + incomeGrowthAnnual / 100, 1 / 12);
  const expenseStep = Math.pow(1 + expenseGrowthAnnual / 100, 1 / 12);

  const debtPlan = debts.map((d) => ({
    name: d?.name || "Dívida",
    min: Number(d?.minPayment) || 0,
    endsMonth: monthsUntilPaidOff(d),
  }));

  let cash = startingCash;
  const rows = [];

  for (let m = 1; m <= horizon; m++) {
    const incomeM = income * Math.pow(incomeStep, m - 1);
    const expensesM = monthlyExpenses * Math.pow(expenseStep, m - 1);
    const debtM = debtPlan.reduce((s, d) => s + (m <= d.endsMonth ? d.min : 0), 0);
    const investM = monthlyInvest;

    const eventsM = events.filter((e) => Number(e.month) === m);
    const eventIncome = eventsM
      .filter((e) => Number(e.amount) > 0)
      .reduce((s, e) => s + Number(e.amount), 0);
    const eventExpense = eventsM
      .filter((e) => Number(e.amount) < 0)
      .reduce((s, e) => s + Math.abs(Number(e.amount)), 0);

    const entradas = incomeM + eventIncome;
    // Sobra operacional: antes de investir (o que "sobra" da vida corrente).
    const sobraOperacional = incomeM + eventIncome - expensesM - debtM - eventExpense;
    const saidas = expensesM + debtM + investM + eventExpense;
    const sobra = entradas - saidas; // após aportes → alimenta o caixa livre
    cash += sobra;

    rows.push({
      month: m,
      entradas,
      incomeM,
      expensesM,
      debtM,
      investM,
      eventIncome,
      eventExpense,
      saidas,
      sobraOperacional,
      sobra,
      cash,
    });
  }

  return rows;
}

/**
 * Resumo/insights derivados das linhas projetadas.
 */
export function summarizeProjection(rows, debts = []) {
  if (!rows.length) {
    return {
      avgSobra: 0,
      endCash: 0,
      firstNegative: null,
      lastDebtPayoff: null,
      freedByDebts: 0,
      totalInvested: 0,
    };
  }

  const avgSobra = rows.reduce((s, r) => s + r.sobra, 0) / rows.length;
  const endCash = rows[rows.length - 1].cash;
  const firstNegativeRow = rows.find((r) => r.cash < 0);
  const totalInvested = rows.reduce((s, r) => s + r.investM, 0);

  const payoffs = debts
    .map((d) => ({ name: d?.name || "Dívida", month: monthsUntilPaidOff(d), min: Number(d?.minPayment) || 0 }))
    .filter((d) => Number.isFinite(d.month) && d.month > 0 && d.month <= rows.length);

  let lastDebtPayoff = null;
  let freedByDebts = 0;
  if (payoffs.length) {
    lastDebtPayoff = payoffs.reduce((a, b) => (b.month > a.month ? b : a));
    freedByDebts = payoffs.reduce((s, d) => s + d.min, 0);
  }

  return {
    avgSobra,
    endCash,
    firstNegative: firstNegativeRow ? firstNegativeRow.month : null,
    lastDebtPayoff,
    freedByDebts,
    totalInvested,
  };
}
