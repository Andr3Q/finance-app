'use strict'
const {
  buildMonthlyRecap, computeScore, shiftMonth, nextGoalStep, suggestGoalAmount,
} = require('../src/services/monthlyRecap')

const tx = (month, type, amount, category = 'food', extra = {}) =>
  ({ month, year: 2026, type, amount, category, budgetId: null, ...extra })

const OCT = { month: 10, year: 2026 }
const budgets = [{ id: 'b1', amount: 1000 }, { id: 'b2', amount: 500 }]

describe('shiftMonth', () => {
  test('atravessa a virada de ano nos dois sentidos', () => {
    expect(shiftMonth({ month: 1, year: 2026 }, -1)).toEqual({ month: 12, year: 2025 })
    expect(shiftMonth({ month: 12, year: 2026 }, 1)).toEqual({ month: 1, year: 2027 })
    expect(shiftMonth({ month: 10, year: 2026 }, -11)).toEqual({ month: 11, year: 2025 })
  })
})

describe('computeScore', () => {
  test('null sem base de cálculo', () => {
    expect(computeScore({ totalAvailable: 0, totalExpenses: 0, balance: 0 })).toBeNull()
  })
  test('mesma fórmula do Início: 60 pts do orçamento + 40 pts do saldo', () => {
    // gastou 20% → 48 pts; sobrou 80% → 32 pts
    expect(computeScore({ totalAvailable: 1000, totalExpenses: 200, balance: 800 })).toBe(80)
  })
})

describe('buildMonthlyRecap', () => {
  const base = [
    tx(8,  'expense', 2000), tx(8,  'income', 500),
    tx(9,  'expense', 2500, 'transport'), tx(9, 'income', 500),
    tx(10, 'expense', 1000, 'food'), tx(10, 'expense', 500, 'fixed', { budgetId: 'b1' }),
    tx(10, 'expense', 500, 'fixed', { budgetId: 'b2' }), tx(10, 'income', 1000),
  ]
  const recap = (txs = base, o = {}) =>
    buildMonthlyRecap({ target: OCT, transactions: txs, budgets, goals: [], salary: 6000, ...o })

  test('saldo do mês, melhor mês do ano e variação sobre o mês anterior', () => {
    const r = recap()
    // out: 6000 + 1000 − 0 não pagas − 2000 gastos = 5000; set: 6000+500−(1500 não pagas)−2500 = 2500
    expect(r.saved).toBe(5000)
    expect(r.isBestOfYear).toBe(true)
    expect(r.savedDeltaPct).toBe(100)
    expect(r.prevMonth).toBe(9)
  })

  test('não é melhor mês quando outro mês do ano foi maior', () => {
    const r = recap([...base, tx(3, 'income', 20000)])
    expect(r.isBestOfYear).toBe(false)
  })

  test('sem outros meses com movimento não afirma "melhor mês do ano"', () => {
    const r = recap(base.filter(t => t.month === 10))
    expect(r.isBestOfYear).toBe(false)
    expect(r.savedDeltaPct).toBeNull()
    expect(r.prevMonth).toBeNull()
  })

  test('maiores gastos ordenados e fatia das contas fixas', () => {
    const r = recap()
    expect(r.topExpenses.map(e => e.category)).toEqual(['food', 'fixed'])
    expect(r.totalExpenses).toBe(2000)
    expect(r.fixedSharePct).toBe(50)
  })

  test('contas fixas pagas contam só as quitadas por budgetId', () => {
    expect(recap().fixedPaid).toBe(2)
    expect(recap().fixedTotal).toBe(2)
    const parcial = recap(base.filter(t => t.budgetId !== 'b2'))
    expect(parcial.fixedPaid).toBe(1)
  })

  test('categoria abaixo da média dos meses anteriores', () => {
    const r = recap([...base, tx(10, 'expense', 500, 'transport')])
    // média anterior de transporte = (0 + 2500)/2 = 1250 → 500 é 60% abaixo
    expect(r.belowAverage).toEqual({ category: 'transport', label: 'Transporte', pct: 60 })
  })

  test('queda de score é refletida (score do mês < score anterior)', () => {
    const r = recap([tx(9, 'income', 4000), tx(10, 'expense', 6000)])
    expect(r.scorePrev).toBeGreaterThan(r.score)
  })

  test('scoreNext só existe quando o mês seguinte já tem movimento', () => {
    const set = buildMonthlyRecap({ target: { month: 9, year: 2026 }, transactions: base, budgets, goals: [], salary: 6000 })
    expect(set.scoreNext).toEqual(expect.any(Number))
    expect(recap().scoreNext).toBeNull() // novembro ainda não tem movimento
  })

  test('mês sem movimento: hasData=false', () => {
    expect(recap([tx(9, 'expense', 100)]).hasData).toBe(false)
  })

  test('meses arquivados entram igual (a rota não filtra archived)', () => {
    // buildMonthlyRecap não conhece "archived" — garante que não depende dele
    expect(recap(base.map(t => ({ ...t, archived: true }))).saved).toBe(5000)
  })
})

describe('suggestGoalAmount', () => {
  test('média arredondada pra baixo a múltiplos de 100', () => {
    expect(suggestGoalAmount([{ balance: 1050 }, { balance: 1000 }])).toBe(1000)
  })
  test('null quando a média não é positiva ou não há meses', () => {
    expect(suggestGoalAmount([{ balance: -300 }, { balance: 100 }])).toBeNull()
    expect(suggestGoalAmount([])).toBeNull()
  })
})

describe('nextGoalStep', () => {
  test('sobe a meta mais adiantada pro próximo múltiplo de 10%', () => {
    const goals = [
      { title: 'Viagem', targetAmount: 1000, currentAmount: 100 },
      { title: 'Reserva', targetAmount: 1000, currentAmount: 610 },
    ]
    expect(nextGoalStep(goals)).toEqual({ goalTitle: 'Reserva', currentPct: 61, targetPct: 70 })
  })
  test('ignora metas concluídas e retorna null sem metas em andamento', () => {
    expect(nextGoalStep([{ title: 'X', targetAmount: 100, currentAmount: 100 }])).toBeNull()
    expect(nextGoalStep([])).toBeNull()
  })
})
