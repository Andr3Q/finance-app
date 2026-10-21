import {
  projectGoalMonth, pickGoal, buildGoalSlides, buildTipSlides, moneyGoal, money, healthWord,
  maskAmounts, maskSlides, HIDDEN_AMOUNT,
} from '../utils/storySlides.js'

const NOW = new Date('2026-10-21T15:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString()

const goal = (over = {}) => ({
  title: 'Reserva de emergência', targetAmount: 29500, currentAmount: 17900,
  createdAt: daysAgo(100), deadline: null, ...over,
})

describe('formatação', () => {
  it('money: com e sem casas, e sinal de menos', () => {
    expect(money(9500)).toBe('R$ 9.500,00')
    expect(money(7160, 0)).toBe('R$ 7.160')
    expect(money(-300)).toBe('−R$ 300,00')
  })
  it('moneyGoal: "mil" só quando redondo', () => {
    expect(moneyGoal(10000)).toBe('R$ 10 mil')
    expect(moneyGoal(10500)).toBe('R$ 10.500')
  })
  it('healthWord cobre toda a escala', () => {
    expect([85, 70, 50, 25, 5].map(healthWord)).toEqual(['Excelente.', 'Estável.', 'Fique de olho.', 'Atenção.', 'Momento crítico.'])
  })
})

describe('projectGoalMonth', () => {
  it('projeta pelo ritmo médio desde a criação', () => {
    // 3.000 em 100 dias = 30/dia; faltam 7.000 → ~233 dias → junho/2027
    expect(projectGoalMonth(goal({ targetAmount: 10000, currentAmount: 3000 }), NOW)).toEqual({ month: 6, year: 2027 })
  })
  it('não projeta com menos de 30 dias de meta', () => {
    expect(projectGoalMonth(goal({ createdAt: daysAgo(20) }), NOW)).toBeNull()
  })
  it('não projeta sem nada guardado ou com a meta já concluída', () => {
    expect(projectGoalMonth(goal({ currentAmount: 0 }), NOW)).toBeNull()
    expect(projectGoalMonth(goal({ currentAmount: 29500 }), NOW)).toBeNull()
  })
  it('não projeta mais de 5 anos pra frente', () => {
    expect(projectGoalMonth(goal({ targetAmount: 1_000_000, currentAmount: 1, createdAt: daysAgo(60) }), NOW)).toBeNull()
  })
  it('aceita valores como string (Decimal serializado)', () => {
    expect(projectGoalMonth(goal({ targetAmount: '10000', currentAmount: '3000' }), NOW)).toEqual({ month: 6, year: 2027 })
  })
})

describe('pickGoal', () => {
  it('escolhe a de maior valor-alvo entre as não concluídas', () => {
    const goals = [
      goal({ title: 'Viagem', targetAmount: 5000, currentAmount: 100 }),
      goal({ title: 'Reserva', targetAmount: 30000, currentAmount: 100 }),
      goal({ title: 'Carro (pronta)', targetAmount: 90000, currentAmount: 90000 }),
    ]
    expect(pickGoal(goals).title).toBe('Reserva')
  })
  it('null sem metas ou com todas concluídas', () => {
    expect(pickGoal([])).toBeNull()
    expect(pickGoal([goal({ currentAmount: 29500 })])).toBeNull()
  })
})

describe('buildGoalSlides', () => {
  it('quanto falta em % e em reais, com a projeção do ritmo', () => {
    const [s] = buildGoalSlides([goal({ targetAmount: 8000, currentAmount: 5000 })], NOW)
    expect(s).toMatchObject({ id: 'goal', theme: 'mix', eyebrow: 'Reserva de emergência', headline: 'Faltam 38%.', big: 'R$ 3.000' })
    // 5.000 em 100 dias = 50/dia; faltam 3.000 → 60 dias → dezembro de 2026
    expect(s.sub).toBe('No ritmo atual, você chega lá em dezembro.')
  })

  it('mesmos números do design: faltam 39% / R$ 11.600', () => {
    const [s] = buildGoalSlides([goal()], NOW)
    expect(s.headline).toBe('Faltam 39%.')
    expect(s.big).toBe('R$ 11.600')
  })

  it('projeção no próprio mês e em outro ano', () => {
    expect(buildGoalSlides([goal({ targetAmount: 5200, currentAmount: 5000, createdAt: daysAgo(100) })], NOW)[0].sub)
      .toBe('No ritmo atual, você chega lá ainda este mês.')
    expect(buildGoalSlides([goal({ targetAmount: 10000, currentAmount: 3000 })], NOW)[0].sub)
      .toBe('No ritmo atual, você chega lá em junho de 2027.')
  })

  it('projeção que passa do prazo avisa o prazo', () => {
    const [s] = buildGoalSlides([goal({ targetAmount: 8000, currentAmount: 5000, deadline: '2026-11-15T12:00:00Z' })], NOW)
    expect(s.sub).toBe('No ritmo atual, você chega lá em dezembro. O prazo é em novembro.')
  })

  it('sem projeção possível, usa o prazo; prazo vencido é dito como vencido', () => {
    const young = { createdAt: daysAgo(5) }
    expect(buildGoalSlides([goal({ ...young, deadline: '2026-12-15T12:00:00Z' })], NOW)[0].sub).toBe('Seu prazo é em dezembro.')
    expect(buildGoalSlides([goal({ ...young, deadline: '2026-03-15T12:00:00Z' })], NOW)[0].sub).toBe('O prazo era em março.')
    expect(buildGoalSlides([goal({ ...young, deadline: '2027-03-15T12:00:00Z' })], NOW)[0].sub).toBe('Seu prazo é em março de 2027.')
  })

  it('sem projeção nem prazo, não inventa frase', () => {
    expect(buildGoalSlides([goal({ createdAt: daysAgo(5) })], NOW)[0].sub).toBeNull()
  })

  it('valor com centavos mostra os centavos; nunca "Faltam 0%"', () => {
    const [a] = buildGoalSlides([goal({ targetAmount: 1000, currentAmount: 400.5 })], NOW)
    expect(a.big).toBe('R$ 599,50')
    const [b] = buildGoalSlides([goal({ targetAmount: 100000, currentAmount: 99999 })], NOW)
    expect(b.headline).toBe('Faltam 1%.')
  })

  it('sem meta em andamento não há slide', () => {
    expect(buildGoalSlides([], NOW)).toEqual([])
  })
})

describe('buildTipSlides', () => {
  const tip  = { tip: 'Planeje as refeições. Voltar à média poupa cerca de R$ 90 por mês.', label: 'Alimentação', pct: 18 }
  const subs = [
    { description: 'Netflix', amount: 55.9 },
    { description: 'Spotify', amount: 21.9 },
    { description: 'Academia', amount: 41.2 },
  ]

  it('dica (verde) e assinaturas (azul) com os números reais, nessa ordem', () => {
    const [a, b] = buildTipSlides({ tip, subs })
    expect(a).toMatchObject({ id: 'tip', theme: 'green', eyebrow: 'Dica da semana', headline: 'Alimentação está 18% acima da média.', sub: tip.tip })
    expect(b).toMatchObject({ id: 'subs', theme: 'blue', eyebrow: 'Assinaturas', headline: '3 assinaturas somam R$ 119/mês.' })
    expect(b.sub).toBe('A maior é Netflix (R$ 56/mês). Quer revisar?')
    expect(b.cta).toEqual({ kind: 'open-chat', label: 'Revisar com a Nancy' })
  })

  it('não afirma "não é usada há N dias" (o app não sabe o uso)', () => {
    const [, b] = buildTipSlides({ tip, subs })
    expect(b.sub).not.toMatch(/usada/i)
  })

  it('uma só assinatura usa o singular', () => {
    const [s] = buildTipSlides({ tip: null, subs: [{ description: 'Netflix', amount: 55.9 }] })
    expect(s.headline).toBe('1 assinatura custa R$ 56/mês.')
    expect(s.sub).toBe('É Netflix. Quer revisar?')
  })

  it('cada slide só entra se tiver dado real', () => {
    expect(buildTipSlides({ tip, subs: [] }).map(s => s.id)).toEqual(['tip'])
    expect(buildTipSlides({ tip: { tip: null }, subs }).map(s => s.id)).toEqual(['subs'])
    expect(buildTipSlides({ tip: null, subs: [] })).toEqual([])
    expect(buildTipSlides({ tip: null, subs: undefined })).toEqual([])
  })

  it('nome de assinatura muito longo é cortado', () => {
    const [s] = buildTipSlides({ tip: null, subs: [{ description: 'x'.repeat(100), amount: 10 }] })
    expect(s.sub).toBe(`É ${'x'.repeat(40)}. Quer revisar?`)
  })

  it('soma com milhar usa separador pt-BR', () => {
    const [s] = buildTipSlides({ tip: null, subs: [{ description: 'A', amount: 1000 }, { description: 'B', amount: 234.4 }] })
    expect(s.headline).toBe('2 assinaturas somam R$ 1.234/mês.')
  })
})

describe('ocultar valores', () => {
  it('maskAmounts troca valores em reais de qualquer formato e preserva o resto', () => {
    expect(maskAmounts('R$ 9.500,00')).toBe(HIDDEN_AMOUNT)
    expect(maskAmounts('−R$ 300,00')).toBe(HIDDEN_AMOUNT)
    expect(maskAmounts('R$ 10 mil?')).toBe(`${HIDDEN_AMOUNT}?`)
    expect(maskAmounts('3 assinaturas somam R$ 119/mês.')).toBe(`3 assinaturas somam ${HIDDEN_AMOUNT}/mês.`)
    expect(maskAmounts('A maior é Netflix (R$ 56/mês). Quer revisar?')).toBe(`A maior é Netflix (${HIDDEN_AMOUNT}/mês). Quer revisar?`)
    expect(maskAmounts('Voltar à média poupa cerca de R$ 1.280 por mês.')).toBe(`Voltar à média poupa cerca de ${HIDDEN_AMOUNT} por mês.`)
  })

  it('percentuais, contagens e texto sem valor ficam como estão', () => {
    for (const t of ['32% a mais que setembro. Continue assim!', '9/9', 'Faltam 39%.', 'Subiu 6 pontos.', 'Tudo em dia']) {
      expect(maskAmounts(t)).toBe(t)
    }
  })

  it('maskAmounts aceita undefined/null sem quebrar (slide sem subtítulo)', () => {
    expect(maskAmounts(undefined)).toBeUndefined()
    expect(maskAmounts(null)).toBeNull()
  })

  it('maskSlides mascara título, número grande, subtítulo e as barras de gastos', () => {
    const [s1, s2] = maskSlides([
      { id: 'a', headline: 'Seu melhor mês do ano.', big: 'R$ 9.500,00', sub: '32% a mais que setembro.' },
      { id: 'b', headline: 'Seus maiores gastos', bars: [{ label: 'Alimentação', amount: 1165, pct: 20 }], sub: null },
    ])
    expect(s1).toMatchObject({ headline: 'Seu melhor mês do ano.', big: HIDDEN_AMOUNT, sub: '32% a mais que setembro.' })
    expect(s2.bars[0]).toMatchObject({ label: 'Alimentação', hidden: true })
    expect(s2.sub).toBeNull()
  })

  it('não altera os slides originais (função pura)', () => {
    const original = [{ id: 'a', headline: 'h', big: 'R$ 1,00', bars: [{ label: 'x', amount: 1, pct: 1 }] }]
    maskSlides(original)
    expect(original[0].big).toBe('R$ 1,00')
    expect(original[0].bars[0].hidden).toBeUndefined()
  })
})
