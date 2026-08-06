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

const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

const mockUser = (overrides = {}) => ({
  id: 'user-123', plan: 'free', salary: 5000,
  emailVerified: true, twoFactorEnabled: false,
  isOnTrial: false, planExpiresAt: null,
  _count: { budgets: 0 },
  ...overrides,
})

const mockBudget = (overrides = {}) => ({
  id: VALID_UUID, userId: 'user-123', name: 'Aluguel',
  amount: 1500, dueDay: 5, ...overrides,
})

// ══════════════════════════════════════════════════════════
// LISTAGEM
// ══════════════════════════════════════════════════════════
describe('GET /api/budget', () => {
  test('retorna lista de contas fixas do usuário', async () => {
    prisma.budget.findMany.mockResolvedValue([mockBudget()])

    const res = await request(app)
      .get('/api/budget')
      .set(authHeader())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0].userId).toBe('user-123')
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app).get('/api/budget')
    expect(res.status).toBe(401)
  })
})

// ══════════════════════════════════════════════════════════
// CRIAÇÃO
// ══════════════════════════════════════════════════════════
describe('POST /api/budget', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ _count: { budgets: 5 } }))
  })

  test('cria conta fixa válida', async () => {
    prisma.budget.create.mockResolvedValue(mockBudget())

    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: 'Aluguel', amount: 1500, dueDay: 5 })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body.name).toBe('Aluguel')
  })

  test('cria conta sem dueDay (opcional)', async () => {
    prisma.budget.create.mockResolvedValue(mockBudget({ dueDay: null }))

    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: 'Streaming', amount: 50 })

    expect(res.status).toBe(201)
  })

  test('nome vazio é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: '', amount: 100 })

    expect(res.status).toBe(400)
  })

  test('nome com mais de 100 chars é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: 'A'.repeat(101), amount: 100 })

    expect(res.status).toBe(400)
  })

  test('amount zero é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: 'Teste', amount: 0 })

    expect(res.status).toBe(400)
  })

  test('amount negativo é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: 'Teste', amount: -50 })

    expect(res.status).toBe(400)
  })

  test('dueDay 0 é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: 'Teste', amount: 100, dueDay: 0 })

    expect(res.status).toBe(400)
  })

  test('dueDay 32 é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: 'Teste', amount: 100, dueDay: 32 })

    expect(res.status).toBe(400)
  })

  test('plano free com 15 contas retorna 403', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free', _count: { budgets: 15 } }))

    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: 'Extra', amount: 100 })

    expect(res.status).toBe(403)
    expect(res.body.limitReached).toBe(true)
  })

  test('plano pro com 35 contas retorna 403', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro', _count: { budgets: 35 } }))

    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: 'Extra', amount: 100 })

    expect(res.status).toBe(403)
    expect(res.body.limitReached).toBe(true)
  })

  test('plano pro com 34 contas pode criar → 201', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro', _count: { budgets: 34 } }))
    prisma.budget.create.mockResolvedValue(mockBudget())

    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: 'Última conta', amount: 100 })

    expect(res.status).toBe(201)
  })

  // C-01: esta rota tinha sua própria fórmula de "plano efetivo", divergente da do
  // authMiddleware (não considerava trialEndsAt ativo), o que podia negar acesso
  // pago indevidamente. Agora usa req.userPlan — mesma fonte de verdade do resto da API.
  test('plano pro com planExpiresAt no passado mas trialEndsAt futuro (bônus de indicação) permanece pro → 201', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({
      plan: 'pro',
      planExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // stale, ainda não resetado
      trialEndsAt:   new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // bônus de indicação ativo
      _count: { budgets: 20 },
    }))
    prisma.budget.create.mockResolvedValue(mockBudget())

    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: 'Conta com bônus', amount: 100 })

    expect(res.status).toBe(201)
  })

  test('plano pro com planExpiresAt no passado e sem trial ativo cai para free → 403 na 16ª conta', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({
      plan: 'pro',
      planExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      _count: { budgets: 15 },
    }))

    const res = await request(app)
      .post('/api/budget')
      .set(authHeader())
      .send({ name: 'Conta expirada', amount: 100 })

    expect(res.status).toBe(403)
    expect(res.body.plan).toBe('free')
  })
})

// ══════════════════════════════════════════════════════════
// LIMITES POR CATEGORIA (exclusivo Pro/Elite)
// ══════════════════════════════════════════════════════════
describe('POST /api/budget/category-limits', () => {
  test('plano free é bloqueado → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free' }))

    const res = await request(app)
      .post('/api/budget/category-limits')
      .set(authHeader())
      .send({ category: 'food', amount: 300 })

    expect(res.status).toBe(403)
    expect(res.body.limitReached).toBe(true)
  })

  test('plano pro cria/atualiza limite → 200', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))
    prisma.categoryLimit.upsert.mockResolvedValue({ id: 'limit-1', category: 'food', amount: 300, userId: 'user-123' })

    const res = await request(app)
      .post('/api/budget/category-limits')
      .set(authHeader())
      .send({ category: 'food', amount: 300 })

    expect(res.status).toBe(200)
    expect(res.body.category).toBe('food')
  })

  test('categoria inválida retorna 400', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))

    const res = await request(app)
      .post('/api/budget/category-limits')
      .set(authHeader())
      .send({ category: 'categoria-inexistente', amount: 300 })

    expect(res.status).toBe(400)
  })
})

// ══════════════════════════════════════════════════════════
// ATUALIZAÇÃO
// ══════════════════════════════════════════════════════════
describe('PUT /api/budget/:id', () => {
  test('atualiza conta fixa com dados válidos', async () => {
    prisma.budget.update.mockResolvedValue(mockBudget({ amount: 2000 }))

    const res = await request(app)
      .put(`/api/budget/${VALID_UUID}`)
      .set(authHeader())
      .send({ amount: 2000 })

    expect(res.status).toBe(200)
    expect(res.body.amount).toBe(2000)
  })

  test('ID não-UUID retorna 400', async () => {
    const res = await request(app)
      .put('/api/budget/not-a-uuid')
      .set(authHeader())
      .send({ amount: 100 })

    expect(res.status).toBe(400)
  })

  test('conta de outro usuário retorna 404', async () => {
    const err = new Error('Record not found')
    err.code = 'P2025'
    prisma.budget.update.mockRejectedValue(err)

    const res = await request(app)
      .put(`/api/budget/${VALID_UUID}`)
      .set(authHeader())
      .send({ amount: 100 })

    expect(res.status).toBe(404)
  })

  test('payload vazio (sem campos) retorna 400', async () => {
    const res = await request(app)
      .put(`/api/budget/${VALID_UUID}`)
      .set(authHeader())
      .send({})

    expect(res.status).toBe(400)
  })
})

// ══════════════════════════════════════════════════════════
// DELEÇÃO
// ══════════════════════════════════════════════════════════
describe('DELETE /api/budget/:id', () => {
  test('deleta conta fixa do próprio usuário', async () => {
    prisma.budget.deleteMany.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .delete(`/api/budget/${VALID_UUID}`)
      .set(authHeader())

    expect(res.status).toBe(200)
  })

  test('conta de outro usuário retorna 404', async () => {
    prisma.budget.deleteMany.mockResolvedValue({ count: 0 })

    const res = await request(app)
      .delete(`/api/budget/${VALID_UUID}`)
      .set(authHeader())

    expect(res.status).toBe(404)
  })

  test('ID não-UUID retorna 400', async () => {
    const res = await request(app)
      .delete('/api/budget/sql-injection-here')
      .set(authHeader())

    expect(res.status).toBe(400)
  })
})

// ══════════════════════════════════════════════════════════
// SALÁRIO
// ══════════════════════════════════════════════════════════
describe('PUT /api/budget/salary', () => {
  test('atualiza salário com valor válido', async () => {
    prisma.user.update.mockResolvedValue({ salary: 8000 })

    const res = await request(app)
      .put('/api/budget/salary')
      .set(authHeader())
      .send({ salary: 8000 })

    expect(res.status).toBe(200)
    expect(res.body.salary).toBe(8000)
  })

  test('salário zero é aceito', async () => {
    prisma.user.update.mockResolvedValue({ salary: 0 })

    const res = await request(app)
      .put('/api/budget/salary')
      .set(authHeader())
      .send({ salary: 0 })

    expect(res.status).toBe(200)
  })

  test('salário negativo é rejeitado → 400', async () => {
    const res = await request(app)
      .put('/api/budget/salary')
      .set(authHeader())
      .send({ salary: -1000 })

    expect(res.status).toBe(400)
  })

  test('salário acima do máximo é rejeitado → 400', async () => {
    const res = await request(app)
      .put('/api/budget/salary')
      .set(authHeader())
      .send({ salary: 1_000_000_000 })

    expect(res.status).toBe(400)
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app)
      .put('/api/budget/salary')
      .send({ salary: 5000 })

    expect(res.status).toBe(401)
  })
})
