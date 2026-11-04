'use strict'
const request = require('supertest')
const jwt     = require('jsonwebtoken')

jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))
jest.mock('../src/services/emailService', () => {
  const fn = () => jest.fn().mockResolvedValue(true)
  return {
    sendEmail: fn(), sendWelcomeEmail: fn(), sendVerificationEmail: fn(),
    sendResetEmail: fn(), sendRenewalReminderEmail: fn(), sendTrialExpiryEmail: fn(),
    sendReferralRewardEmail: fn(), sendWeeklyDigest: fn(), sendPlanExpiredEmail: fn(),
    sendMonthlyReport: fn(), sendPlanActivationEmail: fn(),
  }
})

const prisma = require('./__mocks__/prisma')
const app    = require('../src/server')
const { buildPurchaseBase, baseWindow } = require('../src/services/purchaseBase')

const JWT_SECRET = process.env.JWT_SECRET
const USER_ID    = '550e8400-e29b-41d4-a716-446655440000'
const makeToken  = () => jwt.sign({ userId: USER_ID }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })

// hoje é 20/out/2026
const NOW = { month: 10, year: 2026 }
const budgets = [
  { id: 'b-rent', amount: 3500, endDate: null },
  { id: 'b-luz',  amount: 380,  endDate: null },
  { id: 'b-gym',  amount: 200,  endDate: null },
  { id: 'b-tv',   amount: 100,  endDate: new Date('2026-09-30T15:00:00Z') }, // acabou em setembro: não entra nas fixas de hoje
]
const installments = [
  { amount: 600, totalInstallments: 10, paidInstallments: 3 },
  { amount: 400, totalInstallments: 8,  paidInstallments: 6 },
  { amount: 90,  totalInstallments: 3,  paidInstallments: 3 }, // quitado
]
const tx = (month, type, category, amount, description, extra = {}) => ({ type, category, amount, description, month, year: 2026, budgetId: null, archived: false, ...extra })
const transactions = [
  tx(8, 'income', 'income', 1200, 'Freelance'), tx(8, 'expense', 'food', 1320, 'Mercado'), tx(8, 'expense', 'fixed', 342, 'Conta de luz', { budgetId: 'b-luz', archived: true }),
  tx(9, 'expense', 'food', 1410, 'Mercado'), tx(9, 'expense', 'shopping', 420, 'Roupa'), tx(9, 'expense', 'shopping', 400, 'Geladeira (parcela 5/8)'),
  tx(9, 'expense', 'fixed', 365, 'Conta de luz', { budgetId: 'b-luz' }),
  tx(10, 'income', 'income', 1800, 'Freelance'), tx(10, 'expense', 'food', 1165, 'Mercado'), tx(10, 'expense', 'shopping', 350, 'Roupa'),
  tx(10, 'expense', 'fixed', 380, 'Conta de luz', { budgetId: 'b-luz' }),
]
const base = (over = {}) => buildPurchaseBase({ now: NOW, transactions, budgets, installments, salary: 15000, ...over })

describe('buildPurchaseBase — os números que a análise cruza com a compra', () => {
  test('renda, contas fixas (só as que ainda valem), parcelas em andamento e gasto variável médio dos meses fechados', () => {
    const b = base()
    expect(b.income).toBe(15000)
    expect(b.fixedTotal).toBe(4080)            // aluguel + luz + academia; o boleto da TV acabou
    expect(b.installmentsMonthly).toBe(1000)   // o parcelamento quitado não conta
    expect(b.variableAvg).toBe(1575)           // (ago 1320 + set 1830) / 2: julho não teve movimento; a parcela da geladeira e as contas fixas ficam de fora
    expect(b.monthlyCost).toBe(5655)           // fixas + variável
    expect(b.leftover).toBe(8345)              // 15000 - 4080 - 1000 - 1575
    expect(b.hasHistory).toBe(true)
  })

  test('saldo e saúde batem com o Início (mesma fórmula: salário + entradas - fixas não pagas - saídas)', () => {
    const b = base()
    // disponível = 15000 + 1800 - (aluguel 3500 + academia 200 + TV 100 sem pagamento) = 13000; saídas do mês = 1895
    expect(b.balance).toBe(11105)
    expect(b.score).toBe(85)
  })

  test('mês atual arquivado (fechado) não entra no saldo', () => {
    const closed = transactions.map(t => (t.month === 10 ? { ...t, archived: true } : t))
    const b = base({ transactions: closed })
    expect(b.balance).toBe(15000 - 4180) // sem lançamentos do mês: só o salário menos todas as fixas (nenhuma conta paga ainda)
  })

  test('sem meses fechados com movimento: usa o gasto variável que já saiu neste mês, e diz que não há histórico', () => {
    const b = base({ transactions: transactions.filter(t => t.month === 10) })
    expect(b.hasHistory).toBe(false)
    expect(b.variableAvg).toBe(1515) // 1165 + 350
  })

  test('sem nenhum dado: sobra é a renda menos o que é fixo, nunca zero, e a nota não é inventada', () => {
    const b = base({ transactions: [], budgets: [], installments: [], salary: 0 })
    expect(b).toMatchObject({ income: 0, fixedTotal: 0, installmentsMonthly: 0, variableAvg: 0, balance: 0, score: 0, hasHistory: false })
    expect(b.leftover).toBe(1) // a análise divide por ela
  })

  test('contas e parcelas maiores que a renda deixam a sobra no mínimo (1), não negativa', () => {
    expect(base({ salary: 3000 }).leftover).toBe(1)
  })

  test('a janela de busca começa 3 meses antes do atual', () => {
    expect(baseWindow(NOW)).toEqual({ month: 7, year: 2026 })
    expect(baseWindow({ month: 2, year: 2026 })).toEqual({ month: 11, year: 2025 })
  })
})

// ── rota ──
const asUser = (plan = 'free') => prisma.user.findUnique.mockResolvedValue({ tokenVersion: 0, plan, planExpiresAt: null, trialEndsAt: null, salary: 15000, autoLaunchMonth: null, autoLaunchYear: null })
const fixedNow = () => jest.useFakeTimers({ toFake: ['Date'] }).setSystemTime(new Date('2026-10-20T15:00:00Z'))

describe('GET /api/analyzer/base', () => {
  beforeEach(() => {
    fixedNow()
    prisma.transaction.findMany.mockResolvedValue(transactions)
    prisma.budget.findMany.mockResolvedValue(budgets)
    prisma.installmentPlan.findMany.mockResolvedValue(installments)
  })
  afterEach(() => jest.useRealTimers())

  test('401 sem token', async () => {
    expect((await request(app).get('/api/analyzer/base')).status).toBe(401)
  })

  test('qualquer plano usa (a conta é do próprio usuário e não tem custo de IA)', async () => {
    for (const plan of ['free', 'pro', 'elite']) {
      asUser(plan)
      const res = await request(app).get('/api/analyzer/base').set('Authorization', `Bearer ${makeToken()}`)
      expect(res.status).toBe(200)
    }
  })

  test('devolve a base, sem cache', async () => {
    asUser()
    const res = await request(app).get('/api/analyzer/base').set('Authorization', `Bearer ${makeToken()}`)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.body).toEqual({ income: 15000, fixedTotal: 4080, installmentsMonthly: 1000, variableAvg: 1575, monthlyCost: 5655, leftover: 8345, balance: 11105, score: 85, hasHistory: true })
  })

  test('busca só os dados do próprio usuário e a partir de 3 meses atrás', async () => {
    asUser()
    await request(app).get('/api/analyzer/base').set('Authorization', `Bearer ${makeToken()}`)
    const where = prisma.transaction.findMany.mock.calls[0][0].where
    expect(where.userId).toBe(USER_ID)
    expect(where.OR).toEqual([{ year: { gt: 2026 } }, { year: 2026, month: { gte: 7 } }])
    expect(prisma.budget.findMany.mock.calls[0][0].where).toEqual({ userId: USER_ID })
    expect(prisma.installmentPlan.findMany.mock.calls[0][0].where).toEqual({ userId: USER_ID })
  })

  test('falha no banco devolve 500 sem vazar detalhes', async () => {
    asUser()
    prisma.transaction.findMany.mockRejectedValue(new Error('conexão com senha xyz'))
    const res = await request(app).get('/api/analyzer/base').set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toContain('xyz')
  })
})
