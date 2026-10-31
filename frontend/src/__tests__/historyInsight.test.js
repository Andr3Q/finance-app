import { fmtK, historyInsight } from '../utils/historyInsight.js'

const m = (month, saved, over = {}) => ({ month, year: 2026, saved, active: true, ...over })
const SIX = [m(5, 5200), m(6, 6100), m(7, 4800), m(8, 6900), m(9, 7200), m(10, 9500)]

describe('fmtK', () => {
  it('abrevia em milhares com uma casa (sem ",0") e mantém o sinal', () => {
    expect(fmtK(9500)).toBe('9.5k')
    expect(fmtK(5200)).toBe('5.2k')
    expect(fmtK(1000)).toBe('1k')
    expect(fmtK(880)).toBe('880')
    expect(fmtK(0)).toBe('0')
    expect(fmtK(-1200)).toBe('-1.2k')
    expect(fmtK(123456)).toBe('123k')
    expect(fmtK(undefined)).toBe('0')
  })
})

describe('historyInsight', () => {
  it('melhor mês do ano: supera a média dos anteriores (cálculo honesto, não a variação do mês passado)', () => {
    const i = historyInsight(SIX)
    expect(i).toMatchObject({ kind: 'best', title: 'Seu melhor mês do ano', pct: 57 }) // média dos 5 anteriores = 6.040
    expect(i.text).toBe('Outubro superou a média dos meses anteriores em 57%.')
  })

  it('melhor da janela mas sem meses anteriores no mesmo ano (ex.: janeiro): "melhor mês em N meses"', () => {
    const months = [m(8, 5000, { year: 2025 }), m(9, 5000, { year: 2025 }), m(10, 5000, { year: 2025 }), m(11, 5000, { year: 2025 }), m(12, 5000, { year: 2025 }), m(1, 9000)]
    expect(historyInsight(months).title).toBe('Seu melhor mês em 6 meses')
  })

  it('acima da média mas não o melhor: "Acima da média"', () => {
    const i = historyInsight([m(7, 9000), m(8, 5000), m(9, 5000), m(10, 7000)])
    expect(i).toMatchObject({ kind: 'above', title: 'Acima da média' })
  })

  it('abaixo da média: texto e tipo próprios', () => {
    const i = historyInsight([m(8, 8000), m(9, 8000), m(10, 6000)])
    expect(i).toMatchObject({ kind: 'below', title: 'Abaixo da média', pct: 25 })
    expect(i.text).toBe('Outubro ficou 25% abaixo da média dos meses anteriores.')
  })

  it('meses sem movimento não entram na média', () => {
    const i = historyInsight([m(5, 5000, { active: false }), m(6, 0, { active: false }), m(9, 5000), m(10, 10000)])
    expect(i).toMatchObject({ kind: 'best', pct: 100 })
  })

  it('sem base de comparação não há frase: 1 mês, mês atual sem movimento, média ou mês atual não positivos', () => {
    expect(historyInsight([m(10, 5000)])).toBeNull()
    expect(historyInsight([m(9, 5000), m(10, 5000, { active: false })])).toBeNull()
    expect(historyInsight([m(5, 5000, { active: false }), m(10, 5000)])).toBeNull()
    expect(historyInsight([m(9, -500), m(10, 5000)])).toBeNull()
    expect(historyInsight([m(9, 5000), m(10, -200)])).toBeNull()
    expect(historyInsight(null)).toBeNull()
  })
})
