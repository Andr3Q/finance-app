'use strict'
// O seed de homologação alimenta o QA manual e o agente de QA. Estas regras impedem que ele volte a gerar dado que parece bug do app:
// salário contado em dobro (lançamento "Salário" + campo salary), categorias que o app não oferece, conta fixa paga sem vínculo
// com o lançamento, ou lançamentos no futuro.

const { VALID_CATEGORIES } = require('../src/utils/constants')

const created = { users: [], budgets: [], transactions: [], goals: [], limits: [], installments: [] }

jest.mock('@prisma/client', () => {
  let n = 0
  const model = (onCreate) => ({
    deleteMany: jest.fn(),
    createMany: jest.fn(async ({ data }) => { onCreate(data); return { count: data.length } }),
    create:     jest.fn(async ({ data }) => { const row = { id: `id${++n}`, ...data }; onCreate([row]); return row }),
  })
  class PrismaClient {
    constructor() {
      this.loginAudit = model(() => {}); this.processedPayment = model(() => {}); this.pushSubscription = model(() => {})
      this.twoFactorBackupCode = model(() => {}); this.installmentPlan = model(d => created.installments.push(...d))
      this.goal = model(d => created.goals.push(...d)); this.budget = model(d => created.budgets.push(...d))
      this.categoryLimit = model(d => created.limits.push(...d)); this.transaction = model(d => created.transactions.push(...d))
      this.user = model(d => created.users.push(...d))
    }
    async $transaction(ops) { return Promise.all(ops) }
    async $disconnect() { global.__seedDone() }
  }
  return { PrismaClient }
})

let exitSpy
beforeAll(async () => {
  process.env.STAGING_SEED_SECRET = 'teste'
  exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => { throw new Error('o seed chamou process.exit') })
  jest.spyOn(console, 'log').mockImplementation(() => {})
  const finished = new Promise(resolve => { global.__seedDone = resolve })
  require('../prisma/seed.staging.js')
  await finished
})
afterAll(() => { jest.restoreAllMocks() })

const byEmail = Object.fromEntries([['alice', 'alice@staging.test'], ['bob', 'bob@staging.test'], ['admin', 'admin@staging.test']])
const userId = (who) => created.users.find(u => u.email === byEmail[who]).id
const txsOf = (who) => created.transactions.filter(t => t.userId === userId(who))

describe('seed de homologação', () => {
  test('cria as 3 contas (Grátis, Pro, Elite) com o salário no campo salary', () => {
    expect(created.users.map(u => [u.email, u.plan, u.salary])).toEqual([
      ['alice@staging.test', 'free', 5000], ['bob@staging.test', 'pro', 8500], ['admin@staging.test', 'elite', 15000],
    ])
    expect(exitSpy).not.toHaveBeenCalled()
  })

  test('NÃO há lançamento de salário: o campo salary já entra no saldo e nas Entradas (senão conta em dobro)', () => {
    const salaryLike = created.transactions.filter(t => t.type === 'income' && /^sal[aá]rio/i.test(t.description))
    expect(salaryLike).toEqual([])
  })

  test('só categorias que o app oferece', () => {
    const bad = created.transactions.filter(t => !VALID_CATEGORIES.includes(t.category)).map(t => `${t.description}:${t.category}`)
    expect(bad).toEqual([])
    expect(created.limits.filter(l => !VALID_CATEGORIES.includes(l.category))).toEqual([])
  })

  test('cada conta tem movimento no mês atual e nos 2 anteriores (stories, histórico e dica da semana precisam de base)', () => {
    for (const who of ['alice', 'bob', 'admin']) {
      const months = new Set(txsOf(who).map(t => `${t.year}-${t.month}`))
      expect(months.size).toBe(3)
    }
  })

  test('lançamento de conta fixa paga tem o MESMO valor e dono da conta, e cada conta é paga no máximo uma vez por mês', () => {
    const seen = new Set()
    for (const t of created.transactions.filter(t => t.budgetId)) {
      const b = created.budgets.find(x => x.id === t.budgetId)
      expect(b).toBeTruthy()
      expect(b.userId).toBe(t.userId)
      expect(Number(t.amount)).toBe(Number(b.amount))
      const key = `${t.budgetId}:${t.month}:${t.year}`
      expect(seen.has(key)).toBe(false) // @@unique([budgetId, month, year])
      seen.add(key)
    }
  })

  test('cada conta tem pelo menos uma conta fixa pendente neste mês (pra testar "Marcar como paga")', () => {
    const now = new Date()
    for (const who of ['alice', 'bob', 'admin']) {
      const paid = new Set(txsOf(who).filter(t => t.budgetId && t.date.getTime() > 0).map(t => t.budgetId))
      const mine = created.budgets.filter(b => b.userId === userId(who))
      expect(mine.length).toBeGreaterThan(0)
      expect(mine.some(b => !txsOf(who).some(t => t.budgetId === b.id && t.month === now.getMonth() + 1 && t.year === now.getFullYear()))).toBe(true)
    }
  })

  test('nenhum lançamento fica no futuro', () => {
    const limit = Date.now() + 24 * 3600 * 1000 // folga de fuso
    expect(created.transactions.filter(t => t.date.getTime() > limit)).toEqual([])
  })

  test('o Elite tem assinaturas detectáveis: mesmo nome e valor nos 3 meses', () => {
    for (const [name, amount] of [['Netflix', 55.9], ['Spotify', 21.9]]) {
      const rows = txsOf('admin').filter(t => t.description === name)
      expect(rows).toHaveLength(3)
      expect(new Set(rows.map(t => Number(t.amount)))).toEqual(new Set([amount]))
    }
  })

  test('a comida deste mês passa da média dos anteriores (a dica da semana tem o que dizer) e o Elite estoura o limite de alimentação', () => {
    const food = (who, m) => txsOf(who).filter(t => t.category === 'food' && t.month === m).reduce((s, t) => s + Number(t.amount), 0)
    const now = new Date(); const cur = now.getMonth() + 1
    const prev = (k) => ((cur - 1 - k + 12) % 12) + 1
    for (const who of ['alice', 'bob', 'admin']) {
      const avg = (food(who, prev(1)) + food(who, prev(2))) / 2
      expect(food(who, cur)).toBeGreaterThan(avg * 1.1)
    }
    const limit = created.limits.find(l => l.userId === userId('admin') && l.category === 'food')
    expect(food('admin', cur)).toBeGreaterThan(limit.amount)
  })
})
