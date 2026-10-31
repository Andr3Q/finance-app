import { monthGrowthPct, projectedBalance } from '../utils/homeMetrics.js'

const summary = (over = {}) => ({
  salary: 5000, totalIncome: 1500, totalFixedCosts: 2000, unpaidFixedCosts: 0,
  totalExpenses: 2840, currentBalance: 3660, ...over,
})

describe('monthGrowthPct (selo "+X% no mês")', () => {
  it('cresceu em relação ao início do mês (salário − contas fixas reservadas)', () => {
    // início: 5000 − 2000 = 3000; agora 3660 → +22%
    expect(monthGrowthPct(summary())).toBeCloseTo(22, 5)
  })

  it('encolheu: valor negativo', () => {
    expect(monthGrowthPct(summary({ currentBalance: 2400 }))).toBeCloseTo(-20, 5)
  })

  it('início do mês sem nenhum movimento: 0%', () => {
    expect(monthGrowthPct(summary({ currentBalance: 3000, totalIncome: 0, totalExpenses: 0 }))).toBe(0)
  })

  it('sem salário (ou contas fixas maiores que ele) não há base de comparação: null', () => {
    expect(monthGrowthPct(summary({ salary: 0 }))).toBeNull()
    expect(monthGrowthPct(summary({ salary: 2000, totalFixedCosts: 2500 }))).toBeNull()
  })

  it('sem resumo carregado: null', () => {
    expect(monthGrowthPct(null)).toBeNull()
  })
})

describe('projectedBalance (banner "No ritmo atual…")', () => {
  it('extrapola só o gasto variável (despesas − contas fixas já pagas) até o fim do mês', () => {
    // dia 10 de 30; fixas pagas 2000 → variável 840 → 84/dia × 20 dias restantes = 1680
    expect(projectedBalance(summary(), 10, 30)).toBe(1980)
  })

  it('conta fixa ainda não paga não entra no ritmo (já está reservada no saldo)', () => {
    // fixas 2000, não pagas 500 → pagas 1500; variável = 2840 − 1500 = 1340 → 134/dia
    expect(projectedBalance(summary({ unpaidFixedCosts: 500 }), 10, 30)).toBe(3660 - 134 * 20)
  })

  it('pode terminar negativo (o banner diz "no vermelho")', () => {
    expect(projectedBalance(summary({ currentBalance: 500 }), 10, 30)).toBe(-1180)
  })

  it('no último dia do mês a projeção é o saldo de hoje', () => {
    expect(projectedBalance(summary(), 30, 30)).toBe(3660)
  })

  it('antes do 3º dia ou sem nenhum movimento não projeta (ritmo seria ruído)', () => {
    expect(projectedBalance(summary(), 2, 30)).toBeNull()
    expect(projectedBalance(summary({ totalExpenses: 0, totalIncome: 0 }), 15, 30)).toBeNull()
  })

  it('despesas menores que as fixas pagas não geram ritmo negativo', () => {
    // variável = max(0, 1000 − 2000) = 0 → projeção = saldo atual
    expect(projectedBalance(summary({ totalExpenses: 1000 }), 10, 30)).toBe(3660)
  })

  it('arredonda a centavos (sem casas soltas na tela)', () => {
    const v = projectedBalance(summary({ totalExpenses: 2123.45 }), 7, 31)
    expect(String(v).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
  })

  it('sem resumo carregado: null', () => {
    expect(projectedBalance(null, 10, 30)).toBeNull()
  })
})
