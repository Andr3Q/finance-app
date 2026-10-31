'use strict'
const { Prisma } = require('@prisma/client')
const { buildMonthlyRecap, shiftMonth } = require('../src/services/monthlyRecap')
const { buildStoriesBundle, getStoriesBundle, loadStoriesRows } = require('../src/services/storiesBundle')

// O pacote dos stories (1 ida ao banco) TEM que dar os mesmos números das rotas antigas (monthly-recap ×2 e GET /goals):
// a pessoa não pode ver um número no story do pacote e outro no que vem da rota. Aqui o "antes" usa Decimal do Prisma (como
// as rotas antigas) e o "depois" usa os números puros que o SQL devolve em jsonb.
const D = (v) => new Prisma.Decimal(v)
const tx = (type, amount, category, month, year, budgetId = null) => ({ type, amount, category, month, year, budgetId })

const TXS = [
  tx('expense', '1200.00', 'home', 10, 2026, 'b1'), tx('expense', '350.40', 'food', 10, 2026), tx('expense', '89.90', 'leisure', 10, 2026),
  tx('income', '1500.00', 'income', 10, 2026), tx('expense', '980.00', 'food', 9, 2026), tx('expense', '1200.00', 'home', 9, 2026, 'b1'),
  tx('income', '800.00', 'income', 9, 2026), tx('expense', '410.00', 'transport', 8, 2026), tx('expense', '620.00', 'food', 12, 2025),
  tx('expense', '300.00', 'health', 11, 2025), tx('income', '2000.00', 'income', 1, 2025), tx('expense', '55.00', 'leisure', 6, 2024), // 2024: fora da janela
]
const BUDGETS = [{ id: 'b1', amount: '1200.00' }, { id: 'b2', amount: '150.00' }, { id: 'b3', amount: '600.00' }]
const GOALS = [
  { id: 'g1', title: 'Viagem', targetAmount: '5000.00', currentAmount: '1200.50', color: '#4ac46e', deadline: '2027-01-15T03:00:00.000Z', createdAt: '2026-09-02T12:00:00.000Z', userId: 'u1' },
  { id: 'g2', title: 'Reserva', targetAmount: '10000.00', currentAmount: '0', color: '#1C48FF', deadline: null, createdAt: '2026-06-01T09:30:00.000Z', userId: 'u1' },
]
const USER = { salary: '5000.00', autoLaunchMonth: null, autoLaunchYear: null }

// o que o SQL devolve: jsonb com números puros
const num = (rows, fields) => rows.map(r => ({ ...r, ...Object.fromEntries(fields.filter(f => r[f] !== undefined && r[f] !== null).map(f => [f, Number(r[f])])) }))
const rawRow = (user = USER) => ({
  user: { ...user, salary: Number(user.salary) },
  budgets: num(BUDGETS, ['amount']),
  goals: num(GOALS, ['targetAmount', 'currentAmount']),
  transactions: num(TXS, ['amount']),
})

// "antes": exatamente como a rota monthly-recap monta (Decimal do Prisma, filtro por year >= alvo-1)
function legacy(now, offset, user = USER) {
  const target = shiftMonth(now, offset)
  return buildMonthlyRecap({
    target,
    transactions: TXS.filter(t => t.year >= target.year - 1).map(t => ({ ...t, amount: D(t.amount) })),
    budgets: BUDGETS.map(b => ({ ...b, amount: D(b.amount) })),
    goals: GOALS.map(g => ({ title: g.title, targetAmount: D(g.targetAmount), currentAmount: D(g.currentAmount) })),
    salary: Number(D(user.salary)),
    autoLaunch: { month: user.autoLaunchMonth, year: user.autoLaunchYear },
  })
}

describe('buildStoriesBundle — idêntico às rotas antigas', () => {
  test.each([
    ['meio do ano', { month: 10, year: 2026 }],
    ['janeiro (o mês anterior é dezembro do ano passado)', { month: 1, year: 2026 }],
    ['dezembro', { month: 12, year: 2025 }],
  ])('os dois resumos batem com monthly-recap offset 0 e -1 — %s', (_, now) => {
    const bundle = buildStoriesBundle({ userId: 'u1', row: rawRow(), now })
    expect(bundle.resumo[0]).toEqual(legacy(now, 0))
    expect(bundle.resumo[1]).toEqual(legacy(now, -1))
  })

  test('com a flag antiga de "contas já lançadas" no mês, igual à rota (o resumo concorda com o Início)', () => {
    const user = { ...USER, autoLaunchMonth: 10, autoLaunchYear: 2026 }
    const now = { month: 10, year: 2026 }
    const bundle = buildStoriesBundle({ userId: 'u1', row: rawRow(user), now })
    expect(bundle.resumo[0]).toEqual(legacy(now, 0, user))
    expect(bundle.resumo[1]).toEqual(legacy(now, -1, user))
  })

  test('as metas saem como GET /goals: números, datas em ISO, mesma ordem e todos os campos', () => {
    const bundle = buildStoriesBundle({ userId: 'u1', row: rawRow(), now: { month: 10, year: 2026 } })
    expect(bundle.metas).toEqual(GOALS.map(g => ({ ...g, targetAmount: Number(g.targetAmount), currentAmount: Number(g.currentAmount) })))
    expect(bundle.metas[0].deadline).toBe('2027-01-15T03:00:00.000Z')
    expect(bundle.metas[1].deadline).toBeNull()
  })

  test('traz o id de quem pediu (o app guarda o resultado por usuário)', () => {
    expect(buildStoriesBundle({ userId: 'u1', row: rawRow(), now: { month: 10, year: 2026 } }).userId).toBe('u1')
  })

  test('sem movimento nenhum: os dois resumos dizem hasData=false e as metas vêm vazias', () => {
    const empty = { user: { salary: 0, autoLaunchMonth: null, autoLaunchYear: null }, budgets: [], goals: [], transactions: [] }
    const bundle = buildStoriesBundle({ userId: 'u1', row: empty, now: { month: 10, year: 2026 } })
    expect(bundle.resumo.map(r => r.hasData)).toEqual([false, false])
    expect(bundle.metas).toEqual([])
  })

  test('usuário que não existe devolve null', () => {
    expect(buildStoriesBundle({ userId: 'x', row: { user: null, budgets: [], goals: [], transactions: [] } })).toBeNull()
    expect(buildStoriesBundle({ userId: 'x', row: undefined })).toBeNull()
  })
})

describe('getStoriesBundle — uma consulta SQL, sempre do próprio usuário', () => {
  const prismaWith = (row) => ({ $queryRaw: jest.fn().mockResolvedValue([row]) })

  test('faz UMA chamada ao banco (não 3 rotas × várias consultas) e devolve o pacote pronto', async () => {
    const prisma = prismaWith(rawRow())
    const bundle = await getStoriesBundle(prisma, 'u1', { month: 10, year: 2026 })
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
    expect(bundle.resumo).toHaveLength(2)
    expect(bundle.metas).toHaveLength(2)
  })

  test('o SQL filtra pelo usuário em TODAS as tabelas, só com parâmetros ligados (nada concatenado)', async () => {
    const prisma = prismaWith(rawRow())
    await getStoriesBundle(prisma, 'u-1; DROP TABLE "User"', { month: 10, year: 2026 })
    const [strings, ...values] = prisma.$queryRaw.mock.calls[0]
    const sql = strings.join('?')
    expect(sql).toMatch(/FROM "User" WHERE "id" = \?/)
    expect(sql).toMatch(/FROM "Budget" WHERE "userId" = \?/)
    expect(sql).toMatch(/FROM "Goal" WHERE "userId" = \?/)
    expect(sql).toMatch(/FROM "Transaction" WHERE "userId" = \? AND "year" >= \?/)
    // 4 subconsultas, 4 vezes o mesmo usuário + o ano inicial; o texto do usuário nunca entra no SQL
    expect(values).toEqual(['u-1; DROP TABLE "User"', 'u-1; DROP TABLE "User"', 'u-1; DROP TABLE "User"', 'u-1; DROP TABLE "User"', 2025])
    expect(sql).not.toContain('DROP TABLE')
  })

  test('busca desde o ano anterior ao MAIS ANTIGO dos dois resumos (janeiro: dois anos atrás)', async () => {
    const prisma = prismaWith(rawRow())
    await getStoriesBundle(prisma, 'u1', { month: 1, year: 2026 })
    expect(prisma.$queryRaw.mock.calls[0].at(-1)).toBe(2024) // resumo -1 = dez/2025 -> desde 2024
    await getStoriesBundle(prisma, 'u1', { month: 10, year: 2026 })
    expect(prisma.$queryRaw.mock.calls[1].at(-1)).toBe(2025)
  })

  test('datas das metas saem no formato do Date.toISOString() (com milissegundos e Z)', async () => {
    const prisma = prismaWith(rawRow())
    await loadStoriesRows(prisma, 'u1', 2025)
    const sql = prisma.$queryRaw.mock.calls[0][0].join('?')
    expect(sql).toContain(`to_char("deadline", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`)
    expect(sql).toContain(`to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`)
  })

  test('erro do banco sobe (a rota responde 500 e o app volta às rotas antigas)', async () => {
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('boom')) }
    await expect(getStoriesBundle(prisma, 'u1')).rejects.toThrow('boom')
  })
})
