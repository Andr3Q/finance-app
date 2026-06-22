'use strict'
const request  = require('supertest')
const jwt      = require('jsonwebtoken')
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
jest.mock('../src/services/pushService', () => ({ sendPushToUser: jest.fn().mockResolvedValue(true) }))

const prisma = require('./__mocks__/prisma')
const app    = require('../src/server')

const JWT_SECRET = process.env.JWT_SECRET
const makeToken  = (userId = 'user-123') => jwt.sign({ userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })
const authHeader = () => ({ Cookie: `token=${makeToken()}` })

const TX_UUID  = 'd1e2f3a4-b5c6-7890-defa-123456789012'
const TX_UUID2 = 'e2f3a4b5-c6d7-8901-efab-234567890123'

const mockUser = (overrides = {}) => ({
  id: 'user-123', plan: 'free', salary: 5000,
  emailVerified: true, twoFactorEnabled: false,
  isOnTrial: false, planExpiresAt: null, ...overrides,
})

const mockTx = (overrides = {}) => ({
  id: TX_UUID, userId: 'user-123', description: 'Aluguel',
  amount: 1500, type: 'expense', category: 'home',
  month: 5, year: 2026, date: new Date('2026-05-01'),
  archived: false, isFixed: false, ...overrides,
})

// ══════════════════════════════════════════════════════════
// CRIAÇÃO DE TRANSAÇÃO
// ══════════════════════════════════════════════════════════
describe('POST /api/transactions', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ _count: { transactions: 5 } }))
    prisma.transaction.count.mockResolvedValue(5)
  })

  test('cria transação de despesa válida', async () => {
    prisma.transaction.create.mockResolvedValue(mockTx())

    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Aluguel', amount: 1500, type: 'expense', category: 'home' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body.userId).toBe('user-123')
  })

  test('cria transação de receita', async () => {
    prisma.transaction.create.mockResolvedValue(mockTx({ type: 'income', category: 'income' }))

    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Salário', amount: 5000, type: 'income', category: 'income' })

    expect(res.status).toBe(201)
    expect(res.body.type).toBe('income')
  })

  test('amount negativo é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Test', amount: -100, type: 'expense', category: 'food' })

    expect(res.status).toBe(400)
  })

  test('amount zero é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Test', amount: 0, type: 'expense', category: 'food' })

    expect(res.status).toBe(400)
  })

  test('type inválido é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Test', amount: 100, type: 'invalid', category: 'food' })

    expect(res.status).toBe(400)
  })

  test('category inválida é rejeitada → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Test', amount: 100, type: 'expense', category: 'invalid_cat_xyz' })

    expect(res.status).toBe(400)
  })

  test('amount acima do máximo é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Test', amount: 999_999_999_999, type: 'expense', category: 'food' })

    expect(res.status).toBe(400)
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({ description: 'Test', amount: 100, type: 'expense', category: 'food' })

    expect(res.status).toBe(401)
  })
})

// ══════════════════════════════════════════════════════════
// LISTAGEM E DASHBOARD
// ══════════════════════════════════════════════════════════
describe('GET /api/transactions/dashboard', () => {
  test('retorna summary + transactions + limits', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.findMany.mockResolvedValue([mockTx()])
    prisma.budget.findMany.mockResolvedValue([])
    prisma.categoryLimit.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/transactions/dashboard')
      .set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('summary')
    expect(res.body).toHaveProperty('transactions')
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app).get('/api/transactions/dashboard')
    expect(res.status).toBe(401)
  })

  test('query params extras são ignorados — dashboard usa mês atual', async () => {
    // A rota usa nowBrasilia() e ignora query params month/year
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.budget.findMany.mockResolvedValue([])
    prisma.categoryLimit.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/transactions/dashboard?month=5&year=2026')
      .set(authHeader())

    expect(res.status).toBe(200)
  })
})

// ══════════════════════════════════════════════════════════
// ATUALIZAÇÃO DE TRANSAÇÃO
// ══════════════════════════════════════════════════════════
describe('PUT /api/transactions/:id', () => {
  test('atualiza transação do próprio usuário', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    const tx = mockTx()
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 })
    prisma.transaction.findUnique.mockResolvedValue({ ...tx, amount: 2000 })

    const res = await request(app)
      .put(`/api/transactions/${TX_UUID}`)
      .set(authHeader())
      .send({ amount: 2000 })

    expect(res.status).toBe(200)
  })

  test('transação de outro usuário retorna 404 (ownership)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.updateMany.mockResolvedValue({ count: 0 })

    const res = await request(app)
      .put(`/api/transactions/${TX_UUID2}`)
      .set(authHeader())
      .send({ amount: 2000 })

    expect(res.status).toBe(404)
  })

  test('ID não-UUID retorna 400', async () => {
    const res = await request(app)
      .put('/api/transactions/not-a-uuid')
      .set(authHeader())
      .send({ amount: 2000 })

    expect(res.status).toBe(400)
  })

  test('data em formato inválido retorna 400', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())

    const res = await request(app)
      .put(`/api/transactions/${TX_UUID}`)
      .set(authHeader())
      .send({ date: 'not-a-date' })

    expect(res.status).toBe(400)
  })

  test('date no formato correto YYYY-MM-DD é aceita', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 })
    prisma.transaction.findUnique.mockResolvedValue(mockTx({ date: new Date('2026-06-15') }))

    const res = await request(app)
      .put(`/api/transactions/${TX_UUID}`)
      .set(authHeader())
      .send({ date: '2026-06-15' })

    expect(res.status).toBe(200)
  })
})

// ══════════════════════════════════════════════════════════
// DELEÇÃO DE TRANSAÇÃO
// ══════════════════════════════════════════════════════════
describe('DELETE /api/transactions/:id', () => {
  test('deleta transação do próprio usuário', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.deleteMany.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .delete(`/api/transactions/${TX_UUID}`)
      .set(authHeader())

    expect(res.status).toBe(200)
  })

  test('não deleta transação de outro usuário → 404', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.deleteMany.mockResolvedValue({ count: 0 })

    const res = await request(app)
      .delete(`/api/transactions/${TX_UUID2}`)
      .set(authHeader())

    expect(res.status).toBe(404)
  })

  test('ID com SQL injection não causa erro → 400 (UUID inválido)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())

    const res = await request(app)
      .delete('/api/transactions/1%20OR%201=1')
      .set(authHeader())

    expect([400, 404]).toContain(res.status)
  })
})

// ══════════════════════════════════════════════════════════
// ISOLAMENTO DE DADOS ENTRE USUÁRIOS
// ══════════════════════════════════════════════════════════
describe('Isolamento de dados por usuário', () => {
  test('usuário A não vê dados do usuário B', async () => {
    const userA = mockUser({ id: 'user-A' })

    prisma.user.findUnique.mockResolvedValue(userA)
    prisma.transaction.deleteMany.mockResolvedValue({ count: 0 })

    const tokenA = jwt.sign({ userId: 'user-A' }, JWT_SECRET, { expiresIn: '1h' })

    const res = await request(app)
      .delete(`/api/transactions/${TX_UUID2}`)
      .set('Cookie', `token=${tokenA}`)

    expect(res.status).toBe(404)
  })
})
