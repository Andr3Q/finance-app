// Cálculos do "Resumo em stories" (tela 09 do Nancy 2). Funções puras — a
// rota só busca os dados e delega pra cá, o que deixa tudo testável sem banco.
//
// Aproximação assumida: salário e contas fixas não têm histórico (só o valor
// de hoje), então meses passados são calculados com os valores atuais. As
// transações, essas sim, são do mês real (inclusive as arquivadas pelo
// fechamento mensal).

const { CATEGORY_LABELS } = require('../utils/constants')
const { computeFixedCostsStatus } = require('../utils/helpers')

const key = (year, month) => `${year}-${month}`

// Mês (1-12) e ano deslocados em `offset` meses (negativo = passado).
function shiftMonth({ month, year }, offset) {
  const idx = year * 12 + (month - 1) + offset
  return { month: (idx % 12) + 1, year: Math.floor(idx / 12) }
}

// Mesma fórmula do score do Início (Dashboard.jsx): 60 pts pelo orçamento
// usado + 40 pts pela fração do disponível que sobrou. null quando não há base.
function computeScore({ totalAvailable, totalExpenses, balance }) {
  if (totalAvailable <= 0) return null
  const pct = Math.round((totalExpenses / totalAvailable) * 100)
  const budgetPts  = Math.round(Math.max(0, 60 * (1 - Math.min(pct, 100) / 100)))
  const balancePts = Math.round(40 * Math.max(0, Math.min(1, balance / totalAvailable)))
  return budgetPts + balancePts
}

// Métricas de um único mês a partir das transações dele.
function computeMonthMetrics({ transactions, budgets, salary }) {
  const expenses = transactions.filter(t => t.type === 'expense')
  const totalIncome   = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const totalExpenses = expenses.reduce((s, t) => s + Number(t.amount), 0)

  const { unpaidFixedCosts } = computeFixedCostsStatus({ budgets, transactions })
  const totalAvailable = salary + totalIncome - unpaidFixedCosts
  const balance = totalAvailable - totalExpenses

  const byCategory = {}
  for (const t of expenses) byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount)

  const paidBudgetIds = new Set(transactions.filter(t => t.budgetId).map(t => t.budgetId))
  const fixedPaid = budgets.filter(b => paidBudgetIds.has(b.id)).length

  return {
    active: transactions.length > 0,
    totalIncome, totalExpenses, balance, totalAvailable, byCategory,
    fixedPaid, fixedTotal: budgets.length,
    score: computeScore({ totalAvailable, totalExpenses, balance }),
  }
}

const pctChange = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null)

// Maior queda de uma categoria em relação à média dos meses anteriores
// (até 3, só os que tiveram movimento). null se não há base de comparação.
function categoryBelowAverage(current, previous) {
  if (previous.length === 0) return null
  let best = null
  for (const [category, amount] of Object.entries(current.byCategory)) {
    const avg = previous.reduce((s, m) => s + (m.byCategory[category] || 0), 0) / previous.length
    if (avg <= 0) continue
    const below = Math.round(((avg - amount) / avg) * 100)
    if (below > 0 && (!best || below > best.pct)) {
      best = { category, label: CATEGORY_LABELS[category] || category, pct: below }
    }
  }
  return best
}

// Meta sugerida pro mês seguinte: média do que sobrou nos últimos meses
// (até 3 com movimento), arredondada pra baixo ao múltiplo de 100 mais
// próximo. null se a média não for positiva — não sugerimos guardar o que o
// usuário não costuma conseguir guardar.
function suggestGoalAmount(recentMetrics) {
  if (recentMetrics.length === 0) return null
  const avg = recentMetrics.reduce((s, m) => s + m.balance, 0) / recentMetrics.length
  const rounded = Math.floor(avg / 100) * 100
  return rounded > 0 ? rounded : null
}

// Próximo marco de uma meta em andamento (maior progresso < 100%): sobe pro
// próximo múltiplo de 10%. null se não há metas em andamento.
function nextGoalStep(goals) {
  const open = goals
    .map(g => ({ title: g.title, pct: Number(g.targetAmount) > 0 ? Math.floor((Number(g.currentAmount) / Number(g.targetAmount)) * 100) : 0 }))
    .filter(g => g.pct < 100)
    .sort((a, b) => b.pct - a.pct)
  if (open.length === 0) return null
  const g = open[0]
  return { goalTitle: g.title, currentPct: g.pct, targetPct: Math.min(100, (Math.floor(g.pct / 10) + 1) * 10) }
}

/**
 * @param {object}   p
 * @param {{month:number,year:number}} p.target   mês do resumo
 * @param {Array}    p.transactions  transações desde janeiro do ano anterior ao alvo
 * @param {Array}    p.budgets       contas fixas atuais
 * @param {Array}    p.goals         metas atuais
 * @param {number}   p.salary
 */
function buildMonthlyRecap({ target, transactions, budgets, goals, salary }) {
  const byMonth = {}
  for (const t of transactions) (byMonth[key(t.year, t.month)] ||= []).push(t)
  const metricsOf = (ym) => computeMonthMetrics({ transactions: byMonth[key(ym.year, ym.month)] || [], budgets, salary })

  const current = metricsOf(target)
  const prevYm  = shiftMonth(target, -1)
  const prev    = metricsOf(prevYm)
  const next    = metricsOf(shiftMonth(target, 1)) // mês seguinte (vazio se ainda não aconteceu)

  // Meses anteriores com movimento, do mais recente pro mais antigo (até 3).
  const priorActive = []
  for (let i = 1; i <= 12 && priorActive.length < 3; i++) {
    const m = metricsOf(shiftMonth(target, -i))
    if (m.active) priorActive.push(m)
  }

  // "Melhor mês do ano": só vale com pelo menos 2 meses com movimento neste
  // ano e saldo positivo estritamente maior que todos os outros.
  const otherThisYear = []
  for (let m = 1; m <= 12; m++) {
    if (m === target.month) continue
    const met = metricsOf({ month: m, year: target.year })
    if (met.active) otherThisYear.push(met)
  }
  const isBestOfYear = current.active && current.balance > 0 && otherThisYear.length >= 1 &&
    otherThisYear.every(m => current.balance > m.balance)

  const topExpenses = Object.entries(current.byCategory)
    .sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([category, amount]) => ({ category, label: CATEGORY_LABELS[category] || category, amount }))
  const fixedAmount = current.byCategory.fixed || 0

  return {
    month: target.month,
    year:  target.year,
    hasData: current.active,
    // Salário usado na conta do saldo: as telas somam salário + totalIncome pra mostrar "Entradas" (como o Início), senão o
    // cartão do Extrato / Balanço mensal não fecha (Entradas − Saídas ≠ Resultado) e diverge do Início.
    salary: Number(salary) || 0,
    saved: current.balance,
    savedDeltaPct: prev.active ? pctChange(current.balance, prev.balance) : null,
    prevMonth: prev.active ? prevYm.month : null,
    isBestOfYear,
    belowAverage: categoryBelowAverage(current, priorActive),
    topExpenses,
    totalIncome:   current.totalIncome,
    totalExpenses: current.totalExpenses,
    fixedSharePct: current.totalExpenses > 0 ? Math.round((fixedAmount / current.totalExpenses) * 100) : 0,
    fixedPaid:  current.fixedPaid,
    fixedTotal: current.fixedTotal,
    expensesDeltaPct: prev.active ? pctChange(current.totalExpenses, prev.totalExpenses) : null,
    score: current.score,
    scorePrev: prev.active ? prev.score : null,
    scoreNext: next.active ? next.score : null,
    nextStep: nextGoalStep(goals),
    suggestedGoal: suggestGoalAmount([current, ...priorActive].filter(m => m.active).slice(0, 3)),
  }
}

module.exports = { buildMonthlyRecap, computeMonthMetrics, computeScore, shiftMonth, nextGoalStep, suggestGoalAmount, categoryBelowAverage }
