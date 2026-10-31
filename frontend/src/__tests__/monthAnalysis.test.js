import { analyzeMonth } from '../utils/monthAnalysis.js'

const e = (category, amount, type = 'expense') => ({ type, category, amount })
const MONTH = [e('fixed', 5080), e('food', 1000), e('food', 165), e('transport', 575), e('shopping', 350), e('health', 130), e('income', 9999, 'income')]
const SUMMARY = { salary: 5000, totalIncome: 1500 }

describe('analyzeMonth', () => {
  it('soma por categoria só de saídas, do maior pro menor', () => {
    const a = analyzeMonth(MONTH, SUMMARY)
    expect(a.categories.map(c => [c.category, c.amount])).toEqual([['fixed', 5080], ['food', 1165], ['transport', 575], ['shopping', 350], ['health', 130]])
    expect(a.total).toBe(7300)
    expect(a.variableTotal).toBe(2220)
  })

  it('o % de cada categoria é sobre a renda do mês (salário + entradas); sem renda, sobre os gastos', () => {
    const withIncome = analyzeMonth(MONTH, SUMMARY)
    expect(withIncome.base).toBe(6500)
    expect(withIncome.categories.map(c => c.pctOfBase)).toEqual([78, 18, 9, 5, 2])
    const noIncome = analyzeMonth(MONTH, { salary: 0, totalIncome: 0 })
    expect(noIncome.base).toBe(7300)
    expect(noIncome.categories[0].pctOfBase).toBe(70)
  })

  it('a barra é proporcional à maior categoria (a maior ocupa 100%, as pequenas nunca somem)', () => {
    const a = analyzeMonth([e('fixed', 1000), e('food', 1), e('home', 500)], SUMMARY)
    expect(a.categories.map(c => c.barPct)).toEqual([100, 50, 2])
  })

  it('"maior gasto variável" ignora Contas fixas e mostra a fatia dos gastos variáveis', () => {
    const a = analyzeMonth(MONTH, SUMMARY)
    expect(a.top).toEqual({ category: 'food', amount: 1165, pctOfVariable: 52 })
  })

  it('só contas fixas: não há gasto variável (sem cartão do topo nem sugestão de corte)', () => {
    const a = analyzeMonth([e('fixed', 3000)], SUMMARY)
    expect(a.top).toBeNull()
    expect(a.cutTarget).toBe(0)
  })

  it('meta de corte: 15% dos gastos variáveis em múltiplos de R$ 50 (mínimo 50), e nada abaixo de R$ 100 variáveis', () => {
    expect(analyzeMonth(MONTH, SUMMARY).cutTarget).toBe(350)           // 15% de 2220 = 333 → 350
    expect(analyzeMonth([e('food', 200)], SUMMARY).cutTarget).toBe(50) // 15% de 200 = 30 → mínimo 50
    expect(analyzeMonth([e('food', 99)], SUMMARY).cutTarget).toBe(0)
  })

  it('sem transações: tudo zerado e sem erro; valores como string (Decimal da API) funcionam', () => {
    const empty = analyzeMonth([], null)
    expect(empty).toMatchObject({ total: 0, variableTotal: 0, categories: [], top: null, cutTarget: 0 })
    expect(analyzeMonth([{ type: 'expense', category: 'food', amount: '120.50' }], null).total).toBeCloseTo(120.5)
  })
})
