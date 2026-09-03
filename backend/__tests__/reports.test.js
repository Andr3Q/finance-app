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

jest.mock('../src/services/pdfService', () => ({
  generateMonthlyPDF: jest.fn().mockResolvedValue(Buffer.from('fake-pdf')),
}))

// Fixa nowBrasilia em maio/2026 para todos os testes — mantém computeEffectivePlan
// real, pois o authMiddleware depende dela pra calcular req.userPlan
jest.mock('../src/utils/helpers', () => ({
  ...jest.requireActual('../src/utils/helpers'),
  nowBrasilia: () => ({ month: 5, year: 2026 }),
}))

const prisma               = require('./__mocks__/prisma')
const { sendMonthlyReport } = require('../src/services/emailService')
const { generateMonthlyPDF } = require('../src/services/pdfService')
const app                  = require('../src/server')

const JWT_SECRET = process.env.JWT_SECRET
const USER_ID    = '550e8400-e29b-41d4-a716-446655440000'
const makeToken  = (id = USER_ID) => jwt.sign({ userId: id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })

const ENDPOINT = '/api/reports/monthly-close'

// Dados base reutilizados nos testes
const mockProUser = (overrides = {}) => ({
  id:              USER_ID,
  name:            'Ana Tester',
  email:           'ana@test.com',
  reportEmail:     null,
  plan:            'pro',
  salary:          5000,
  autoLaunchMonth: 0,
  autoLaunchYear:  0,
  ...overrides,
})

const mockTransactions = [
  { type: 'expense', amount: 200, date: new Date('2026-05-10') },
  { type: 'expense', amount: 150, date: new Date('2026-05-15') },
  { type: 'income',  amount: 500, date: new Date('2026-05-20') },
]

const mockBudgets = [
  { amount: 1200 },
  { amount: 120  },
]

function setDefaults() {
  prisma.user.findUnique.mockResolvedValue(mockProUser())
  prisma.transaction.findMany.mockResolvedValue(mockTransactions)
  prisma.budget.findMany.mockResolvedValue(mockBudgets)
  prisma.transaction.updateMany.mockResolvedValue({ count: 3 })
}

beforeEach(() => {
  jest.clearAllMocks()
  setDefaults()
})

// ─────────────────────────────────────────────────────────────────
// POST /api/reports/monthly-close
// ─────────────────────────────────────────────────────────────────
describe('POST /api/reports/monthly-close', () => {
  test('401 sem token JWT', async () => {
    const res = await request(app).post(ENDPOINT)
    expect(res.status).toBe(401)
  })

  test('403 para usuário free', async () => {
    prisma.user.findUnique.mockResolvedValue(mockProUser({ plan: 'free' }))
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(403)
    expect(res.body.limitReached).toBe(true)
    expect(res.body.plan).toBe('free')
  })

  test('403 indica plano necessário na mensagem', async () => {
    prisma.user.findUnique.mockResolvedValue(mockProUser({ plan: 'free' }))
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.body.error).toMatch(/pro/i)
  })

  test('404 quando usuário não existe', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce({ tokenVersion: 0 })  // auth middleware
      .mockResolvedValueOnce(null)                   // route handler
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(404)
  })

  test('200 com summary correto (sem auto-launch)', async () => {
    // salary=5000, income=500, fixedCosts=1320, expenses=350
    // totalAvailable = 5000 + 500 - 1320 = 4180
    // currentBalance = 4180 - 350 = 3830
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    const { summary } = res.body
    expect(summary.totalExpenses).toBe(350)
    expect(summary.totalIncome).toBe(500)
    expect(summary.totalFixedCosts).toBe(1320)
    expect(summary.totalAvailable).toBe(4180)
    expect(summary.currentBalance).toBe(3830)
  })

  test('percentUsed calculado corretamente', async () => {
    // 350 / 4180 ≈ 8%
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.body.summary.percentUsed).toBe(8)
  })

  test('aceita plano elite', async () => {
    prisma.user.findUnique.mockResolvedValue(mockProUser({ plan: 'elite' }))
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
  })

  test('usa reportEmail quando configurado', async () => {
    prisma.user.findUnique.mockResolvedValue(
      mockProUser({ reportEmail: 'relatorio@outro.com' })
    )
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.sentTo).toBe('relatorio@outro.com')
    expect(sendMonthlyReport).toHaveBeenCalledWith(
      'relatorio@outro.com', expect.any(String), 5, 2026,
      expect.any(Object), expect.any(Buffer)
    )
  })

  test('usa email padrão quando reportEmail é null', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.body.sentTo).toBe('ana@test.com')
  })

  test('não subtrai fixedCosts quando mês foi auto-lançado (evita dupla contagem)', async () => {
    // autoLaunchMonth=5, autoLaunchYear=2026 → nowBrasilia retorna {month:5,year:2026}
    // totalAvailable = 5000 + 500 = 5500 (sem subtrair 1320)
    prisma.user.findUnique.mockResolvedValue(
      mockProUser({ autoLaunchMonth: 5, autoLaunchYear: 2026 })
    )
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.summary.totalAvailable).toBe(5500)
    expect(res.body.summary.currentBalance).toBe(5150)
  })

  test('arquiva as transações do mês após fechar', async () => {
    await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, month: 5, year: 2026, archived: false },
      data:  { archived: true },
    })
  })

  test('chama generateMonthlyPDF com os parâmetros corretos', async () => {
    await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(generateMonthlyPDF).toHaveBeenCalledWith(
      expect.objectContaining({ id: USER_ID }),
      5, 2026,
      expect.objectContaining({ totalExpenses: 350 }),
      mockTransactions
    )
  })

  test('500 quando generateMonthlyPDF falha', async () => {
    generateMonthlyPDF.mockRejectedValueOnce(new Error('PDF crash'))
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/fechar o mês/i)
  })

  test('sendMonthlyReport falha: mês fecha (transações arquivadas) mesmo sem o e-mail sair', async () => {
    sendMonthlyReport.mockRejectedValueOnce(new Error('SMTP error'))
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.emailSent).toBe(false)
    expect(res.body.sentTo).toBeNull()
    expect(res.body.message).toMatch(/não foi possível enviar/i)
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archived: true } })
    )
  })

  test('resposta inclui month, year e message com e-mail', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.body.month).toBe(5)
    expect(res.body.year).toBe(2026)
    expect(res.body.message).toMatch(/ana@test\.com/i)
  })

  test('percentUsed é 0 quando totalAvailable é 0', async () => {
    prisma.user.findUnique.mockResolvedValue(
      mockProUser({ salary: 0 })
    )
    // income=500, fixedCosts=1320 → totalAvailable = 0 + 500 - 1320 = -820 → percentUsed calculado
    // mas o teste real é salary=0, income=0, fixedCosts=0 → totalAvailable=0
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.budget.findMany.mockResolvedValue([])
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.body.summary.percentUsed).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────
// GET /api/reports/history
// ─────────────────────────────────────────────────────────────────
describe('GET /api/reports/history', () => {
  const HIST = '/api/reports/history'

  test('401 sem token JWT', async () => {
    const res = await request(app).get(HIST)
    expect(res.status).toBe(401)
  })

  test('retorna array vazio quando não há transações arquivadas', async () => {
    prisma.transaction.findMany.mockResolvedValue([])
    const res = await request(app)
      .get(HIST)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  test('retorna meses fechados corretamente', async () => {
    const archived = [
      { month: 4, year: 2026 },
      { month: 3, year: 2026 },
    ]
    prisma.transaction.findMany.mockResolvedValue(archived)
    const res = await request(app)
      .get(HIST)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toMatchObject({ month: 4, year: 2026 })
  })

  test('filtra por userId (segurança multi-tenant)', async () => {
    prisma.transaction.findMany.mockResolvedValue([])
    await request(app)
      .get(HIST)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID, archived: true }),
      })
    )
  })

  test('500 quando Prisma falha', async () => {
    prisma.transaction.findMany.mockRejectedValueOnce(new Error('DB error'))
    const res = await request(app)
      .get(HIST)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(500)
  })
})
