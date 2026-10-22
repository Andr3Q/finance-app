import { buildNotifications, countUnread, readNotifIds, markNotifsRead, isTipFresh, PREV_RECAP_UNTIL_DAY } from '../utils/notificationsFeed.js'
import { prefsOf } from '../utils/notifPrefs.js'

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

  it('vence em 2 dias (antecedência padrão): "vence em 2 dias"', () => {
    const [n] = build({ budgets: [bill({ dueDay: 22 })] })
    expect(n).toMatchObject({ title: 'Academia vence em 2 dias', when: 'em 2 dias', body: 'R$ 200,00 · conta fixa' })
  })

  it('vence daqui a 3+ dias (fora da antecedência padrão) ou já venceu neste mês: sem aviso', () => {
    expect(build({ budgets: [bill({ dueDay: 23 })] }).filter(n => n.kind === 'bill')).toEqual([])
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

describe('lembretes de vencimento (tela Lembretes)', () => {
  const state = (bills = {}, custom = []) => ({ bills, custom })

  it('a antecedência escolhida vale: 5 dias antes avisa uma conta que vence daqui a 5', () => {
    const items = build({ budgets: [bill({ dueDay: 25 })], reminderState: state({ b1: { on: true, lead: 5 } }) })
    expect(items[0]).toMatchObject({ title: 'Academia vence em 5 dias', when: 'em 5 dias' })
    expect(build({ budgets: [bill({ dueDay: 26 })], reminderState: state({ b1: { on: true, lead: 5 } }) }).filter(n => n.kind === 'bill')).toEqual([])
  })

  it('"no dia" (0) só avisa quando vence hoje', () => {
    const st = state({ b1: { on: true, lead: 0 } })
    expect(build({ budgets: [bill({ dueDay: 21 })], reminderState: st }).filter(n => n.kind === 'bill')).toEqual([])
    expect(build({ budgets: [bill({ dueDay: 20 })], reminderState: st })[0].title).toBe('Academia vence hoje')
  })

  it('interruptor desligado: a conta não gera aviso', () => {
    expect(build({ reminderState: state({ b1: { on: false, lead: 2 } }) }).filter(n => n.kind === 'bill')).toEqual([])
  })

  it('conta que vence logo no começo do mês seguinte avisa mesmo sendo "nova" (sem depender do pago deste mês)', () => {
    const now = new Date(2026, 9, 30, 12) // 30/out; vence dia 1/nov = daqui a 2 dias
    const out = buildNotifications({ now, summary: { unpaidBudgetIds: [] }, budgets: [bill({ dueDay: 1 })] })
    expect(out[0]).toMatchObject({ title: 'Academia vence em 2 dias' })
  })

  it('lembrete avulso anual: aparece dentro da antecedência, com a data e o link pra tela', () => {
    const st = state({}, [{ id: 'c1', name: 'IPVA 2027', day: 27, month: 10, lead: 7, on: true }])
    const [n] = build({ budgets: [], reminderState: st })
    expect(n).toMatchObject({ kind: 'reminder', title: 'IPVA 2027 vence em 7 dias', body: '27 de outubro · lembrete seu', action: { type: 'route', to: '/lembretes' } })
  })

  it('lembrete avulso fora da antecedência, desligado ou de outro mês não avisa', () => {
    const st = (c) => state({}, [{ id: 'c1', name: 'IPVA', lead: 7, on: true, ...c }])
    expect(build({ budgets: [], reminderState: st({ day: 10, month: 1 }) })).toEqual([])           // janeiro: longe
    expect(build({ budgets: [], reminderState: st({ day: 25, month: 10, on: false }) })).toEqual([])
    expect(build({ budgets: [], reminderState: st({ day: 25, month: 10, lead: 2 }) })).toEqual([]) // daqui a 5, antecedência 2
  })

  it('lembrete avulso mensal (sem mês): avisa no dia certo de todo mês', () => {
    const [n] = build({ budgets: [], reminderState: state({}, [{ id: 'm', name: 'Condomínio', day: 21, month: null, lead: 2, on: true }]) })
    expect(n).toMatchObject({ title: 'Condomínio vence amanhã', body: 'Dia 21 · lembrete seu' })
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

  it('perto do limite (82%): quanto falta até o teto, sem centavos quando redondo', () => {
    const n = build({ budgets: [], limits, transactions: [tx('food', 1000), tx('food', 230)] }).find(x => x.kind === 'limit')
    expect(n).toMatchObject({ title: 'Alimentação em 82% do limite', body: 'Faltam R$ 270 até o teto do mês.', when: 'este mês', action: { type: 'route', to: '/goals' } })
  })

  it('centavos aparecem quando existem', () => {
    const n = build({ budgets: [], limits, transactions: [tx('food', 1229.6)] }).find(x => x.kind === 'limit')
    expect(n.body).toBe('Faltam R$ 270,40 até o teto do mês.')
  })

  it('o aviso começa em 80% do teto (os mesmos 80% do push do servidor): 79% não avisa, 80% avisa', () => {
    expect(build({ budgets: [], limits, transactions: [tx('food', 1185)] }).filter(x => x.kind === 'limit')).toEqual([])
    expect(build({ budgets: [], limits, transactions: [tx('food', 1200)] }).find(x => x.kind === 'limit').title).toBe('Alimentação em 80% do limite')
  })

  it('abaixo de 80% não avisa; só despesas da categoria contam (entrada e outras categorias não)', () => {
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

// ── Preferências (tela "Preferências"): cada interruptor manda nos avisos dele ─────────────────────
describe('preferências de notificação', () => {
  const SALARY = { status: 'today', msg: 'Hoje é dia de salário!' }
  const limits = [{ category: 'food', amount: 1000 }]
  const tx = [{ type: 'expense', category: 'food', amount: 900 }]
  const REM = { bills: {}, custom: [{ id: 'c1', name: 'IPVA', day: 28, month: null, lead: 2, on: true }] }
  const kinds = (items) => items.map(n => n.kind)
  const full = (over = {}) => build({
    now: day(26), budgets: [bill({ dueDay: 26 })], salaryNotif: SALARY, limits, transactions: tx, tipFresh: true, prevRecapSlides: null,
    reminderState: REM, ...over,
  })

  it('tudo ligado (ou sem preferências carregadas): todos os avisos aparecem', () => {
    for (const prefs of [undefined, null, {}, prefsOf({})]) {
      expect(kinds(full({ prefs })).sort()).toEqual(['bill', 'limit', 'recap', 'reminder', 'salary', 'tip'])
    }
  })

  it('prefsOf: campo ausente vale o padrão (tudo ligado, só o relatório por e-mail desligado)', () => {
    expect(prefsOf({})).toEqual({ salary: true, bills: true, limits: true, stories: true, tips: true, email: false })
    expect(prefsOf({ notifSalary: false, notifWeeklyEmail: true, notifTips: 'x' })).toMatchObject({ salary: false, email: true, tips: true })
    expect(prefsOf(null)).toEqual({ salary: true, bills: true, limits: true, stories: true, tips: true, email: false })
  })

  it.each([
    ['salary', 'salary'], ['bills', 'bill'], ['limits', 'limit'], ['stories', 'recap'], ['tips', 'tip'],
  ])('"%s" desligado tira só o aviso "%s"', (pref, kind) => {
    const all = kinds(full({ prefs: { [pref]: true } }))
    const off = kinds(full({ prefs: { [pref]: false } }))
    expect(all).toContain(kind)
    expect(off).not.toContain(kind)
    expect(off.length).toBe(all.length - 1)
  })

  it('o lembrete avulso criado pelo usuário (tela Lembretes) não depende de "Vencimento de contas"', () => {
    expect(kinds(full({ prefs: { bills: false } }))).toContain('reminder')
  })
})

describe('resumo do mês anterior (todo dia 1º)', () => {
  const prev = (d, slides = 6, prefs) => build({ now: day(d), budgets: [], prevRecapSlides: slides, prefs }).find(n => n.id === 'recap:2026-09')

  it('nos primeiros dias do mês avisa "Resumo de <mês anterior> pronto" com a quantidade de histórias', () => {
    expect(prev(1)).toMatchObject({ kind: 'recap', title: 'Resumo de setembro pronto', body: 'Veja seu mês em 6 histórias', when: 'hoje', action: { type: 'story', monthOffset: -1 } })
    expect(prev(3)).toMatchObject({ when: 'este mês' })
    expect(prev(1, 1).body).toBe('Veja seu mês em 1 história')
  })

  it(`some depois do dia ${PREV_RECAP_UNTIL_DAY}, sem dados do mês anterior ou com "Resumo mensal em stories" desligado`, () => {
    expect(prev(PREV_RECAP_UNTIL_DAY)).toBeDefined()
    expect(prev(PREV_RECAP_UNTIL_DAY + 1)).toBeUndefined()
    expect(prev(2, null)).toBeUndefined()
    expect(prev(2, 6, { stories: false })).toBeUndefined()
  })

  it('em janeiro o mês anterior é dezembro do ano passado', () => {
    const jan = buildNotifications({ now: new Date(2027, 0, 2, 12), budgets: [], prevRecapSlides: 4 }).find(n => n.kind === 'recap')
    expect(jan).toMatchObject({ id: 'recap:2026-12', title: 'Resumo de dezembro pronto' })
  })

  it('o resumo do mês corrente (fim do mês) continua aparecendo a partir do dia 25', () => {
    const items = build({ now: day(26), budgets: [] })
    expect(items.find(n => n.id === 'recap:2026-10')).toMatchObject({ title: 'Resumo de outubro pronto', action: { monthOffset: 0 } })
  })
})

describe('dica da semana da Nancy IA', () => {
  it('aparece uma vez por semana enquanto a dica não foi aberta, e leva ao story de dicas', () => {
    const n = build({ budgets: [], tipFresh: true }).find(x => x.kind === 'tip')
    expect(n).toMatchObject({ title: 'Dica da Nancy IA', body: 'Sua dica da semana está pronta.', when: 'esta semana', action: { type: 'story', story: 'dicas' } })
    expect(n.id).toBe('tip:dicas:2026-W43')
    expect(build({ now: day(21), budgets: [], tipFresh: true }).find(x => x.kind === 'tip').id).toBe('tip:dicas:2026-W43')   // mesma semana, mesmo aviso
    expect(build({ now: day(27), budgets: [], tipFresh: true }).find(x => x.kind === 'tip').id).toBe('tip:dicas:2026-W44')   // semana seguinte volta a ser nova
  })

  it('sem dica nova ou com "Dicas da Nancy IA" desligado: nada', () => {
    expect(build({ budgets: [], tipFresh: false }).some(x => x.kind === 'tip')).toBe(false)
    expect(build({ budgets: [], tipFresh: true, prefs: { tips: false } }).some(x => x.kind === 'tip')).toBe(false)
  })

  it('isTipFresh: precisa de movimento no mês e da dica desta semana ainda não aberta', () => {
    const t = [{ type: 'expense', category: 'food', amount: 10 }]
    expect(isTipFresh(t, NOW, {})).toBe(true)
    expect(isTipFresh([], NOW, {})).toBe(false)
    expect(isTipFresh(t, NOW, { 'dicas:2026-W43': Date.now() })).toBe(false)
    expect(isTipFresh(t, day(27), { 'dicas:2026-W43': Date.now() })).toBe(true)   // outra semana
  })
})
