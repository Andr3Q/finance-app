'use strict'
const { parseDateInput, partsBrasilia, computeFixedCostsStatus } = require('../src/utils/helpers')

describe('parseDateInput', () => {
  test('"YYYY-MM-DD" vira meia-noite de Brasília (03:00 UTC), não meia-noite UTC', () => {
    expect(parseDateInput('2026-09-25').toISOString()).toBe('2026-09-25T03:00:00.000Z')
  })

  test('dia 1º do mês fica no mês certo em Brasília', () => {
    const d = parseDateInput('2026-09-01')
    expect(partsBrasilia(d)).toEqual({ day: 1, month: 9, year: 2026 })
  })

  test('ISO com hora é um instante real e passa inalterado', () => {
    expect(parseDateInput('2026-09-17T22:13:33.000Z').toISOString()).toBe('2026-09-17T22:13:33.000Z')
  })

  test('rejeita dia inexistente e lixo', () => {
    expect(parseDateInput('2026-02-31')).toBeNull()
    expect(parseDateInput('2026-13-01')).toBeNull()
    expect(parseDateInput('not-a-date')).toBeNull()
    expect(parseDateInput(20260925)).toBeNull()
    expect(parseDateInput(undefined)).toBeNull()
  })
})

describe('partsBrasilia', () => {
  test('instante de madrugada UTC ainda é o dia anterior em Brasília', () => {
    expect(partsBrasilia(new Date('2026-10-01T01:30:00.000Z'))).toEqual({ day: 30, month: 9, year: 2026 })
  })
})

describe('computeFixedCostsStatus', () => {
  const b1 = { id: 'b1', amount: 1200 }
  const b2 = { id: 'b2', amount: 120 }

  test('nenhuma conta paga: desconta o total (mesmo resultado do autoLaunched=false de antes)', () => {
    const result = computeFixedCostsStatus({ budgets: [b1, b2], transactions: [] })
    expect(result).toEqual({ totalFixedCosts: 1320, unpaidFixedCosts: 1320, unpaidBudgetIds: ['b1', 'b2'] })
  })

  test('pagamento parcial: só desconta a conta sem transação vinculada', () => {
    const transactions = [{ type: 'expense', amount: 1200, budgetId: 'b1' }]
    const result = computeFixedCostsStatus({ budgets: [b1, b2], transactions })
    expect(result.unpaidFixedCosts).toBe(120)
    expect(result.unpaidBudgetIds).toEqual(['b2'])
  })

  test('todas pagas: não desconta nada (mesmo resultado do autoLaunched=true de antes)', () => {
    const transactions = [
      { type: 'expense', amount: 1200, budgetId: 'b1' },
      { type: 'expense', amount: 120,  budgetId: 'b2' },
    ]
    const result = computeFixedCostsStatus({ budgets: [b1, b2], transactions })
    expect(result.unpaidFixedCosts).toBe(0)
    expect(result.unpaidBudgetIds).toEqual([])
  })

  test('transação com budgetId de OUTRA conta não quita a conta errada', () => {
    const transactions = [{ type: 'expense', amount: 999, budgetId: 'budget-de-outro-mes-ou-conta' }]
    const result = computeFixedCostsStatus({ budgets: [b1, b2], transactions })
    expect(result.unpaidFixedCosts).toBe(1320)
  })

  test('transação sem budgetId (avulsa) não quita nenhuma conta fixa', () => {
    const transactions = [{ type: 'expense', amount: 1200, budgetId: null }]
    const result = computeFixedCostsStatus({ budgets: [b1, b2], transactions })
    expect(result.unpaidFixedCosts).toBe(1320)
  })

  test('legacyAllLaunched força desconto zero, ignorando transações reais (transição pré-migration)', () => {
    const result = computeFixedCostsStatus({ budgets: [b1, b2], transactions: [], legacyAllLaunched: true })
    expect(result.unpaidFixedCosts).toBe(0)
    expect(result.unpaidBudgetIds).toEqual([])
    expect(result.totalFixedCosts).toBe(1320)
  })

  test('sem contas fixas cadastradas: tudo zero', () => {
    const result = computeFixedCostsStatus({ budgets: [], transactions: [] })
    expect(result).toEqual({ totalFixedCosts: 0, unpaidFixedCosts: 0, unpaidBudgetIds: [] })
  })
})
