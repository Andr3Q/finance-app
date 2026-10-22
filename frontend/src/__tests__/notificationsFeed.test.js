import { buildNotifications, countUnread, readNotifIds, markNotifsRead } from '../utils/notificationsFeed.js'

// 20/out/2026 (terça), meio-dia local
const NOW = new Date(2026, 9, 20, 12)
const day = (d) => new Date(2026, 9, d, 12)

const bill = (over = {}) => ({ id: 'b1', name: 'Academia', amount: 200, dueDay: 20, endDate: null, ...over })
const build = (over = {}) => buildNotifications({
  now: NOW,
  summary: { unpaidBudgetIds: ['b1'], totalExpenses: 3000, totalIncome: 500 },
  budgets: [bill()], ...over,
})

beforeEach(() => { localStorage.clear() })

describe('contas fixas que vencem', () => {
  it('vence hoje e ainda não foi paga: aviso "vence hoje" com valor e "conta fixa"', () => {
    const [n] = build()
    expect(n).toMatchObject({ kind: 'bill', title: 'Academia vence hoje', body: 'R$ 200,00 · conta fixa', when: 'hoje', action: { type: 'route', to: '/contas-do-mes' } })
  })

  it('vence amanhã', () => {
    const [n] = build({ budgets: [bill({ dueDay: 21 })] })
    expect(n).toMatchObject({ title: 'Academia vence amanhã', when: 'amanhã' })
  })

  it('já paga (fora de unpaidBudgetIds) não gera aviso', () => {
    expect(build({ summary: { unpaidBudgetIds: [], totalExpenses: 1, totalIncome: 0 } }).filter(n => n.kind === 'bill')).toEqual([])
  })

  it('vence daqui a 2+ dias ou já venceu: sem aviso (só hoje e amanhã)', () => {
    expect(build({ budgets: [bill({ dueDay: 22 })] }).filter(n => n.kind === 'bill')).toEqual([])
    expect(build({ budgets: [bill({ dueDay: 15 })] }).filter(n => n.kind === 'bill')).toEqual([])
  })

  it('sem dia de vencimento ou com prazo já encerrado: sem aviso', () => {
    expect(build({ budgets: [bill({ dueDay: null })] }).filter(n => n.kind === 'bill')).toEqual([])
    expect(build({ budgets: [bill({ endDate: day(10).toISOString() })] }).filter(n => n.kind === 'bill')).toEqual([])
  })

  it('dia 31 num mês de 30 dias vence no último dia do mês', () => {
    const now = new Date(2026, 10, 30, 12) // 30/nov
    const out = buildNotifications({ now, summary: { unpaidBudgetIds: ['b1'] }, budgets: [bill({ dueDay: 31 })] })
    expect(out[0].title).toBe('Academia vence hoje')
  })

  it('o id leva o dia: amanhã o mesmo aviso volta a ser "novo"', () => {
    const a = buildNotifications({ now: NOW, summary: { unpaidBudgetIds: ['b1'] }, budgets: [bill()] })[0].id
    const b = buildNotifications({ now: day(21), summary: { unpaidBudgetIds: ['b1'] }, budgets: [bill({ dueDay: 21 })] })[0].id
    expect(a).not.toBe(b)
  })
})

describe('salário e trial', () => {
  it('dia de salário: lembrete com ação de registrar a entrada', () => {
    const n = build({ budgets: [], salaryNotif: { status: 'today', msg: 'Hoje é dia de salário!' } }).find(x => x.kind === 'salary')
    expect(n).toMatchObject({ title: 'Lembrete de salário', body: 'Seu salário deve cair hoje. Quer registrar?', when: 'hoje', action: { type: 'new-transaction', transactionType: 'income' } })
  })

  it('amanhã e "em breve" usam o texto do app', () => {
    expect(build({ budgets: [], salaryNotif: { status: 'tomorrow', msg: 'x' } }).find(x => x.kind === 'salary')).toMatchObject({ body: 'Seu salário deve cair amanhã. Quer registrar?', when: 'amanhã' })
    expect(build({ budgets: [], salaryNotif: { status: 'soon', msg: 'Seu salário cai em breve: dia 23.' } }).find(x => x.kind === 'salary')).toMatchObject({ body: 'Seu salário cai em breve: dia 23.', when: 'em breve' })
  })

  it('trial vira aviso que leva aos planos', () => {
    const n = build({ budgets: [], trialNotif: { msg: 'Último dia do trial Pro! Assine agora.' } }).find(x => x.kind === 'trial')
    expect(n).toMatchObject({ title: 'Trial Pro', body: 'Último dia do trial Pro! Assine agora.', action: { type: 'route', to: '/planos' } })
  })
})

describe('limites por categoria', () => {
  const tx = (category, amount) => ({ type: 'expense', category, amount })
  const limits = [{ category: 'food', amount: 1500 }]

  it('perto do limite (78%): quanto falta até o teto, sem centavos quando redondo', () => {
    const n = build({ budgets: [], limits, transactions: [tx('food', 1000), tx('food', 170)] }).find(x => x.kind === 'limit')
    expect(n).toMatchObject({ title: 'Alimentação em 78% do limite', body: 'Faltam R$ 330 até o teto do mês.', when: 'este mês', action: { type: 'route', to: '/goals' } })
  })

  it('centavos aparecem quando existem', () => {
    const n = build({ budgets: [], limits, transactions: [tx('food', 1164.6)] }).find(x => x.kind === 'limit')
    expect(n.body).toBe('Faltam R$ 335,40 até o teto do mês.')
  })

  it('abaixo de 70% não avisa; só despesas da categoria contam (entrada e outras categorias não)', () => {
    expect(build({ budgets: [], limits, transactions: [tx('food', 1000), tx('transport', 5000), { type: 'income', category: 'food', amount: 9999 }] }).filter(x => x.kind === 'limit')).toEqual([])
  })

  it('estourou: "passou do limite" com o quanto passou', () => {
    const n = build({ budgets: [], limits, transactions: [tx('food', 1620)] }).find(x => x.kind === 'limit')
    expect(n).toMatchObject({ title: 'Alimentação passou do limite', body: 'R$ 120 acima do teto do mês.' })
  })

  it('exatamente no teto já conta como estourado; limite zerado/inválido é ignorado', () => {
    expect(build({ budgets: [], limits, transactions: [tx('food', 1500)] }).find(x => x.kind === 'limit').title).toBe('Alimentação passou do limite')
    expect(build({ budgets: [], limits: [{ category: 'food', amount: 0 }], transactions: [tx('food', 10)] }).filter(x => x.kind === 'limit')).toEqual([])
  })

  it('plano sem limites (lista vazia): nenhum aviso de limite', () => {
    expect(build({ budgets: [], limits: [], transactions: [tx('food', 99999)] }).filter(x => x.kind === 'limit')).toEqual([])
  })
})

describe('resumo do mês pronto', () => {
  it('a partir do dia 25, com movimento: convite pra ver as histórias (com a contagem quando conhecida)', () => {
    const now = day(25)
    const base = { now, summary: { totalExpenses: 100, totalIncome: 0, unpaidBudgetIds: [] } }
    expect(buildNotifications({ ...base, recapSlides: 6 }).find(x => x.kind === 'recap')).toMatchObject({
      title: 'Resumo de outubro pronto', body: 'Veja seu mês em 6 histórias', action: { type: 'story', monthOffset: 0 },
    })
    expect(buildNotifications(base).find(x => x.kind === 'recap').body).toBe('Veja seu mês em histórias')
    expect(buildNotifications({ ...base, recapSlides: 1 }).find(x => x.kind === 'recap').body).toBe('Veja seu mês em 1 história')
  })

  it('antes do dia 25, ou mês sem movimento, não aparece', () => {
    expect(buildNotifications({ now: day(24), summary: { totalExpenses: 100, totalIncome: 0 } }).filter(x => x.kind === 'recap')).toEqual([])
    expect(buildNotifications({ now: day(28), summary: { totalExpenses: 0, totalIncome: 0 } }).filter(x => x.kind === 'recap')).toEqual([])
  })
})

describe('lembretes de cancelar assinatura', () => {
  const reminders = [{ key: 'música', name: 'Música', amount: 21.9 }]

  it('uma assinatura marcada vira aviso do mês que leva à tela Assinaturas', () => {
    const [n] = build({ budgets: [], cancelReminders: reminders })
    expect(n).toMatchObject({ kind: 'cancel', title: 'Cancelar Música?', body: 'R$ 21,90/mês · você pediu pra ser lembrado', when: 'este mês', action: { type: 'route', to: '/assinaturas' } })
  })

  it('o id leva o mês: no mês seguinte o lembrete volta a ser novo', () => {
    const a = buildNotifications({ now: NOW, cancelReminders: reminders })[0].id
    const b = buildNotifications({ now: new Date(2026, 10, 20, 12), cancelReminders: reminders })[0].id
    expect(a).not.toBe(b)
  })

  it('valor redondo sai sem centavos e sem marcações não há aviso', () => {
    expect(build({ budgets: [], cancelReminders: [{ key: 'x', name: 'X', amount: 50 }] })[0].body).toBe('R$ 50/mês · você pediu pra ser lembrado')
    expect(build({ budgets: [], cancelReminders: [] }).filter(n => n.kind === 'cancel')).toEqual([])
  })
})

describe('ordem e "novas"', () => {
  it('ordem de importância: conta que vence hoje, salário, limite estourado, limite perto, resumo, conta de amanhã', () => {
    const out = buildNotifications({
      now: day(25),
      summary: { unpaidBudgetIds: ['b1', 'b2'], totalExpenses: 5000, totalIncome: 0 },
      budgets: [bill({ id: 'b2', name: 'Internet', dueDay: 26 }), bill({ dueDay: 25 })],
      salaryNotif: { status: 'today', msg: '' },
      limits: [{ category: 'food', amount: 1000 }, { category: 'transport', amount: 1000 }],
      transactions: [{ type: 'expense', category: 'food', amount: 800 }, { type: 'expense', category: 'transport', amount: 1200 }],
    })
    expect(out.map(n => n.kind + ':' + n.title)).toEqual([
      'bill:Academia vence hoje',
      'salary:Lembrete de salário',
      'limit:Transporte passou do limite',
      'limit:Alimentação em 80% do limite',
      'recap:Resumo de outubro pronto',
      'bill:Internet vence amanhã',
    ])
  })

  it('sem nada pra avisar: lista vazia', () => {
    expect(buildNotifications({ now: NOW })).toEqual([])
  })

  it('countUnread desconta o que já foi visto; marcar como visto persiste e é por id', () => {
    const items = build({ budgets: [bill(), bill({ id: 'b2', name: 'Internet', dueDay: 21 })], summary: { unpaidBudgetIds: ['b1', 'b2'], totalExpenses: 1, totalIncome: 0 } })
    expect(countUnread(items, readNotifIds())).toBe(2)
    markNotifsRead([items[0].id])
    expect(countUnread(items, readNotifIds())).toBe(1)
    markNotifsRead(items.map(i => i.id))
    expect(countUnread(items, readNotifIds())).toBe(0)
  })

  it('registros com mais de 60 dias são descartados e conteúdo corrompido vira vazio', () => {
    const day = 24 * 60 * 60 * 1000
    markNotifsRead(['velho'], 1000)
    markNotifsRead(['novo'], 1000 + 61 * day)
    expect(Object.keys(readNotifIds())).toEqual(['novo'])
    localStorage.setItem('nancy:notifs-read', '{quebrado')
    expect(readNotifIds()).toEqual({})
  })
})
