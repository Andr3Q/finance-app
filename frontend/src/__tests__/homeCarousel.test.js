import { carouselSlides, healthTag, healthNote, CAROUSEL_MS } from '../utils/homeCarousel.js'

const RECAP = (o = {}) => ({
  hasData: true, month: 10, year: 2026, prevMonth: 9, saved: 9500, totalIncome: 10800, totalExpenses: 7300,
  topExpenses: [{ category: 'fixed', label: 'Aluguel', amount: 3500 }, { category: 'food', label: 'Alimentação', amount: 1165 }],
  fixedTotal: 6, fixedPaid: 6, score: 79, scorePrev: 75, suggestedGoal: 2000, savedDeltaPct: 32, expensesDeltaPct: -3,
  fixedSharePct: 70, isBestOfYear: true, nextStep: null, belowAverage: null, ...o,
})

describe('carrossel de resumos do Início desktop', () => {
  it('cada slide do resumo do mês vira o cartão do design (etiqueta em caixa alta, título, valor e subtítulo)', () => {
    const s = carouselSlides(RECAP())
    expect(s.map(x => x.id)).toEqual(['intro', 'saved', 'spending', 'win', 'health', 'goal'])
    expect(s[0]).toMatchObject({ k: 'RESUMO DE OUTUBRO', t: 'Seu mês em 6 histórias.', v: '', s: 'Passe o mouse para pausar · clique para avançar' })
    expect(s[1]).toMatchObject({ k: 'VOCÊ GUARDOU', t: 'Seu melhor mês do ano.', v: 'R$ 9.500' })
    expect(s[1].s).toContain('32% a mais que setembro')
    expect(s[2]).toMatchObject({ k: 'PARA ONDE FOI', t: 'Seus maiores gastos', v: 'R$ 3.500' }) // valor do maior gasto
    expect(s[3]).toMatchObject({ k: 'MAIOR VITÓRIA', t: 'Tudo em dia', v: '6/6' })
    expect(s[4]).toMatchObject({ k: 'SAÚDE FINANCEIRA', t: 'Subiu 4 pontos.', v: '79' }) // pontuação
    expect(s[5]).toMatchObject({ k: 'META DE NOVEMBRO', t: 'Bora guardar' })
  })

  it('cada slide tem o seu degradê do design', () => {
    const bg = Object.fromEntries(carouselSlides(RECAP()).map(x => [x.id, x.bg]))
    expect(bg.intro).toBe('linear-gradient(120deg,#1546FF,#0A2A9E)')
    expect(bg.saved).toBe('linear-gradient(120deg,#1546FF,#12C985)')
    expect(bg.spending).toBe('linear-gradient(120deg,#0A2A9E,#1546FF)')
    expect(bg.win).toBe('linear-gradient(120deg,#0E9A69,#12C985)')
    expect(bg.health).toBe('linear-gradient(120deg,#1546FF,#6A9BFF)')
    expect(bg.goal).toBe('linear-gradient(120deg,#071330,#1546FF)')
  })

  it('com "ocultar valores" nenhum valor em reais aparece em nenhum slide', () => {
    const s = carouselSlides(RECAP(), { hidden: true })
    const texto = s.map(x => `${x.t} ${x.v} ${x.s}`).join(' ')
    expect(texto).not.toMatch(/R\$ \d/)
    expect(s[1].v).toBe('R$ ••••')
    expect(s[2].v).toBe('R$ ••••')
  })

  it('sem resumo (mês sem dados) ou ainda não carregado não há slides', () => {
    expect(carouselSlides(null)).toEqual([])
    expect(carouselSlides(undefined)).toEqual([])
    expect(carouselSlides({ hasData: false })).toEqual([])
  })

  it('slides que dependem dos dados só entram quando há dado (sem maiores gastos / sem meta sugerida)', () => {
    const s = carouselSlides(RECAP({ topExpenses: [], suggestedGoal: null, fixedPaid: 4, expensesDeltaPct: 5 }))
    expect(s.map(x => x.id)).toEqual(['intro', 'saved', 'health'])
    expect(s[0].t).toBe('Seu mês em 3 histórias.')
  })

  it('resumo incompleto ou de formato antigo NÃO quebra: simplesmente não há carrossel', () => {
    expect(carouselSlides({ hasData: true, saved: 100, totalIncome: 5000, totalExpenses: 120 })).toEqual([]) // sem o mês
    expect(carouselSlides({ ...RECAP(), month: 13 })).toEqual([])
    expect(carouselSlides({ ...RECAP(), month: 'x' })).toEqual([])
    expect(carouselSlides({ ...RECAP(), topExpenses: undefined })).toEqual([]) // sem a lista de gastos
    expect(carouselSlides({ hasData: true, month: 10 })).toEqual([])
  })

  it('cada slide dura 4 segundos, como no protótipo', () => { expect(CAROUSEL_MS).toBe(4000) })
})

describe('saúde financeira do Início desktop', () => {
  it('selo curto do anel por faixa de pontuação', () => {
    expect([100, 80, 79, 60, 59, 40, 39, 20, 19, 0].map(healthTag)).toEqual(
      ['Excelente', 'Excelente', 'Saudável', 'Saudável', 'Atenção', 'Atenção', 'Cuidado', 'Cuidado', 'Crítico', 'Crítico'])
    expect(healthTag(null)).toBe('—')
  })

  const summary = { salary: 15000, totalIncome: 1800, totalExpenses: 7300 }
  it('frase do design: variação do mês, contas em dia e % da renda poupada (9.500 de 16.800 = 56%)', () => {
    expect(healthNote({ summary, unpaidCount: 0, recap: RECAP() })).toBe('+4 pontos vs setembro. Contas em dia e 57% da renda poupada.')
  })
  it('sem o resumo do mês não inventa a variação; conta pendente e mês no vermelho', () => {
    expect(healthNote({ summary, unpaidCount: 2, recap: null })).toBe('2 contas a pagar e 57% da renda poupada.')
    expect(healthNote({ summary, unpaidCount: 1, recap: null })).toBe('1 conta a pagar e 57% da renda poupada.')
    expect(healthNote({ summary: { salary: 1000, totalIncome: 0, totalExpenses: 2000 }, unpaidCount: 0, recap: null })).toBe('Contas em dia.')
  })
  it('mês anterior inválido no resumo não quebra a frase (só some a variação)', () => {
    expect(healthNote({ summary, unpaidCount: 0, recap: RECAP({ prevMonth: 13 }) })).toBe('Contas em dia e 57% da renda poupada.')
    expect(healthNote({ summary, unpaidCount: 0, recap: RECAP({ prevMonth: undefined }) })).toBe('Contas em dia e 57% da renda poupada.')
  })
  it('variação negativa, de um ponto e igual', () => {
    expect(healthNote({ summary, unpaidCount: 0, recap: RECAP({ score: 70, scorePrev: 75 }) })).toMatch(/^−5 pontos vs setembro\./)
    expect(healthNote({ summary, unpaidCount: 0, recap: RECAP({ score: 76, scorePrev: 75 }) })).toMatch(/^\+1 ponto vs setembro\./)
    expect(healthNote({ summary, unpaidCount: 0, recap: RECAP({ score: 75, scorePrev: 75 }) })).toMatch(/^Igual a setembro\./)
  })
})
