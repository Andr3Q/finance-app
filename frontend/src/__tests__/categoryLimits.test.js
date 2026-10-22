import { spentByCategory, limitStatus, LIMIT_CATEGORIES, WARN_PCT } from '../utils/categoryLimits.js'

describe('limites por categoria — gasto e situação', () => {
  it('soma só despesas, por categoria', () => {
    const tx = [
      { type: 'expense', category: 'food', amount: 100.5 },
      { type: 'expense', category: 'food', amount: 64.5 },
      { type: 'income',  category: 'food', amount: 900 },
      { type: 'expense', category: 'transport', amount: '575' },
    ]
    expect(spentByCategory(tx)).toEqual({ food: 165, transport: 575 })
    expect(spentByCategory()).toEqual({})
  })

  it('verde até 79%, amarelo de 80% pra cima, vermelho no teto ou acima', () => {
    expect(limitStatus(1500, 1165)).toMatchObject({ state: 'ok', used: 78, left: 335 })
    expect(limitStatus(500, 399).state).toBe('ok')
    expect(limitStatus(500, 400).state).toBe('warn')
    expect(limitStatus(600, 575)).toMatchObject({ state: 'warn', used: 96 })
    expect(limitStatus(600, 600)).toMatchObject({ state: 'over', over: 0, used: 100 })
    expect(limitStatus(600, 650.5)).toMatchObject({ state: 'over', over: 50.5, used: 108 })
  })

  it('nunca mostra 100% antes de estourar, e a largura da barra é exata', () => {
    const s = limitStatus(1000, 999.6)
    expect(s.state).toBe('warn')
    expect(s.used).toBe(99)
    expect(s.pct).toBeCloseTo(99.96, 2)
    expect(limitStatus(1500, 1165).pct).toBeCloseTo(77.667, 2)
  })

  it('gasto zero e teto zero não quebram', () => {
    expect(limitStatus(300, 0)).toMatchObject({ state: 'ok', used: 0, left: 300 })
    expect(limitStatus(0, 0).state).toBe('over')
  })

  it('constantes', () => {
    expect(WARN_PCT).toBe(80)
    expect(LIMIT_CATEGORIES.slice(0, 4)).toEqual(['food', 'transport', 'shopping', 'health'])
    expect(new Set(LIMIT_CATEGORIES).size).toBe(8)
  })
})
