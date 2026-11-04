import { analyzePurchase, parseNum } from '../utils/purchaseAnalysis.js'

// o cenário do design: renda 15.000, fixas 5.127, parcelas 1.000/mês, variável 2.220, saldo 23.500, saúde 79
const BASE = { income: 15000, fixedTotal: 5127, installmentsMonthly: 1000, variableAvg: 2220, monthlyCost: 7347, leftover: 6653, balance: 23500, score: 79 }
const run = (over = {}, base = BASE) => analyzePurchase(base, { item: 'Celular novo', price: '7.000', discount: '5', rate: '0', mode: 'cN', parcelas: 10, ...over })

describe('parseNum', () => {
  it.each([['7.000', 7000], ['1.234,56', 1234.56], ['85.000', 85000], ['12,5', 12.5], ['R$ 3.200', 3200], ['', 0], [undefined, 0], ['abc', 0]])('%s → %s', (t, n) => expect(parseNum(t)).toBe(n))
})

describe('analyzePurchase — valor', () => {
  it('sem valor positivo não há análise', () => {
    expect(run({ price: '' })).toBeNull()
    expect(run({ price: '0' })).toBeNull()
    expect(run({ price: '-5' })).toBeNull()
  })
})

describe('analyzePurchase — a forma recomendada', () => {
  it('compra que cabe no saldo e tem desconto no Pix: pagar à vista no Pix', () => {
    const r = run()
    expect(r.verdict.title).toBe('Pague à vista no Pix')
    expect(r.rec).toMatchObject({ k: 'pix', n: 1, pv: 6650 })
    expect(r.verdict.sub).toContain('R$ 6.650,00 com 5% de desconto')
    expect(r.registerLabel).toBe('Registrar compra no Pix')
    expect(r.options.find(o => o.k === 'pix').tag).toBe('Recomendado')
  })

  it('sem desconto no Pix e cabendo na sobra: crédito à vista em 1x', () => {
    const r = run({ discount: '0', price: '3.200' })
    expect(r.verdict.title).toBe('Crédito à vista (1x)')
    expect(r.verdict.sub).toMatch(/^Sem desconto no Pix, vale passar em 1x/)
    expect(r.registerLabel).toBe('Registrar no crédito 1x')
  })

  it('compra que não cabe à vista mas cabe parcelada sem juros: parcelado, sem juros', () => {
    // 20.000 passa da sobra (6.653) e o saldo livre (23.500 - 7.347 = 16.153): só parcelando
    const r = run({ price: '20.000', discount: '0' })
    expect(r.verdict.title).toMatch(/^Crédito parcelado em \d+x sem juros$/)
    expect(r.rec.n).toBeGreaterThan(1)
    expect(r.registerLabel).toBe(`Registrar em ${r.rec.n}x no crédito`)
    expect(r.rec.pv * r.rec.n).toBeCloseTo(20000, 1)
  })

  it('compra grande demais: "Não compre agora", com em quantos meses cabe guardando metade da sobra', () => {
    const r = run({ price: '85.000', discount: '0' })
    expect(r.verdict.title).toBe('Não compre agora')
    expect(r.rec).toBeNull()
    expect(r.months).toBe(Math.ceil(85000 / (6653 * 0.5)))
    expect(r.verdict.sub).toContain(`em ${r.months} meses`)
    expect(r.registerLabel).toBe('Guardar para comprar depois')
    expect(r.verdict.delta).toBe('mantém 79')
    expect(r.options.some(o => o.tag === 'Recomendado')).toBe(false)
  })

  it('com juros altos, parcelado deixa de ser recomendado e o aviso soma os juros em 12x', () => {
    const r = run({ price: '20.000', discount: '0', rate: '5' })
    expect(r.reasons.some(x => !x.ok && /Os juros do cartão somam R\$ [\d.]+,\d\d a mais em 12x/.test(x.text))).toBe(true)
  })

  it('o desconto e os juros ficam nos limites (30% e 15% ao mês)', () => {
    const r = run({ discount: '90' })
    expect(r.options.find(o => o.k === 'pix').pv).toBeCloseTo(7000 * 0.7, 5)
    const j = run({ price: '10.000', discount: '0', rate: '99' })
    const j15 = run({ price: '10.000', discount: '0', rate: '15' })
    expect(j.options.find(o => o.k === 'c12').pv).toBeCloseTo(j15.options.find(o => o.k === 'c12').pv, 5)
  })
})

describe('analyzePurchase — a tabela de formas de pagar', () => {
  it('7 formas na ordem do design, parcela, % da sobra e total pago', () => {
    const r = run({ price: '12.000', discount: '5' })
    expect(r.options.map(o => o.label)).toEqual(['Pix / débito', 'Crédito 1x', 'Crédito 2x', 'Crédito 3x', 'Crédito 6x', 'Crédito 10x', 'Crédito 12x'])
    const c10 = r.options.find(o => o.k === 'c10')
    expect(c10.pv).toBeCloseTo(1200, 5)
    expect(c10.pct).toBeCloseTo(1200 / 6653, 5)
    expect(c10.total).toBeCloseTo(12000, 5)
  })

  it('a opção que a pessoa pensou aparece como "Sua escolha" quando não é a recomendada', () => {
    const r = run({ mode: 'cN', parcelas: 10 })
    expect(r.chosenKey).toBe('c10')
    expect(r.options.find(o => o.k === 'c10').tag).toBe('Sua escolha')
    expect(r.reasons[0].text).toContain('Você pensou em crédito em 10x')
  })

  it('escolher o que a Nancy recomenda é elogiado', () => {
    const r = run({ mode: 'pix' })
    expect(r.reasons[0]).toEqual({ ok: true, text: 'Boa escolha: Pix / débito à vista é exatamente o que a Nancy recomenda.' })
  })

  it('a recomendada nunca tem nota menor que outra opção', () => {
    for (const price of ['500', '3.200', '7.000', '20.000', '40.000']) {
      const r = run({ price })
      if (!r.rec) continue
      const best = Math.max(...r.options.filter(o => o.tag !== 'Recomendado').map(o => o.score))
      expect(r.options.find(o => o.tag === 'Recomendado').score).toBeGreaterThan(best)
    }
  })

  it('notas ficam entre 15 e 100', () => {
    for (const price of ['100', '7.000', '85.000', '500.000']) {
      for (const o of run({ price }).options) { expect(o.score).toBeGreaterThanOrEqual(15); expect(o.score).toBeLessThanOrEqual(100) }
    }
  })
})

describe('analyzePurchase — bordas dos números reais', () => {
  it('sem saldo (zero ou negativo) não divide por zero nem dá nota inválida', () => {
    const r = run({ price: '1.000' }, { ...BASE, balance: 0 })
    for (const o of r.options) expect(Number.isFinite(o.score)).toBe(true)
    const neg = run({ price: '1.000' }, { ...BASE, balance: -500 })
    for (const o of neg.options) expect(Number.isFinite(o.score)).toBe(true)
    expect(neg.options.find(o => o.k === 'pix').tag).not.toBe('Possível') // sem saldo, à vista não cabe
  })

  it('renda zero não quebra (a página já pede o salário antes)', () => {
    const r = run({}, { ...BASE, income: 0, leftover: 1 })
    expect(r.options.every(o => Number.isFinite(o.pct) && Number.isFinite(o.score))).toBe(true)
  })

  it('o delta de saúde diz mantém / + / −', () => {
    expect(run({ price: '85.000', discount: '0' }).verdict.delta).toBe('mantém 79')
    expect(run().verdict.delta).toMatch(/^(\+|−)\d+ pontos$|^mantém 79$/)
  })

  it('"parcelando em Nx" usa 10x quando a pessoa pensou em pagar à vista e a recomendada não é parcelada', () => {
    const r = run({ mode: 'pix' })
    expect(r.reasons.some(x => x.text.startsWith('Parcelando em 10x'))).toBe(true)
  })
})
