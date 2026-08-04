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

const VALID_UUID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901'

const mockUser = (overrides = {}) => ({
  id: 'user-123', plan: 'free', salary: 5000,
  emailVerified: true, twoFactorEnabled: false,
  isOnTrial: false, planExpiresAt: null,
  _count: { goals: 0 },
  ...overrides,
})

const mockGoal = (overrides = {}) => ({
  id: VALID_UUID, userId: 'user-123',
  title: 'Viagem', targetAmount: 5000,
  currentAmount: 0, color: '#4ac46e',
  deadline: null, completed: false,
  createdAt: new Date(), ...overrides,
})

// ══════════════════════════════════════════════════════════
// LISTAGEM
// ══════════════════════════════════════════════════════════
describe('GET /api/goals', () => {
  test('retorna metas do usuário', async () => {
    prisma.goal.findMany.mockResolvedValue([mockGoal()])

    const res = await request(app)
      .get('/api/goals')
      .set(authHeader())

    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body[0].title).toBe('Viagem')
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app).get('/api/goals')
    expect(res.status).toBe(401)
  })
})

// ══════════════════════════════════════════════════════════
// CRIAÇÃO
// ══════════════════════════════════════════════════════════
describe('POST /api/goals', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ _count: { goals: 0 } }))
  })

  test('cria meta válida com todos os campos', async () => {
    prisma.goal.create.mockResolvedValue(mockGoal())

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'Viagem', targetAmount: 5000, color: '#4ac46e', deadline: '2027-12-31' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body.title).toBe('Viagem')
  })

  test('cria meta sem campos opcionais', async () => {
    prisma.goal.create.mockResolvedValue(mockGoal())

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'Emergência', targetAmount: 10000 })

    expect(res.status).toBe(201)
  })

  test('título vazio é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: '', targetAmount: 5000 })

    expect(res.status).toBe(400)
  })

  test('título com mais de 80 chars é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'A'.repeat(81), targetAmount: 5000 })

    expect(res.status).toBe(400)
  })

  test('targetAmount zero é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'Meta', targetAmount: 0 })

    expect(res.status).toBe(400)
  })

  test('targetAmount negativo é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'Meta', targetAmount: -100 })

    expect(res.status).toBe(400)
  })

  test('cor inválida é rejeitada → 400', async () => {
    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'Meta', targetAmount: 1000, color: 'red' })

    expect(res.status).toBe(400)
  })

  test('deadline inválida é rejeitada → 400', async () => {
    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'Meta', targetAmount: 1000, deadline: 'not-a-date' })

    expect(res.status).toBe(400)
  })

  test('plano free com 1 meta existente retorna 403', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free', _count: { goals: 1 } }))

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'Segunda meta', targetAmount: 1000 })

    expect(res.status).toBe(403)
    expect(res.body.limitReached).toBe(true)
    expect(res.body.plan).toBe('free')
  })

  test('plano pro com 4 metas existentes retorna 403', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro', _count: { goals: 4 } }))

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'Quinta meta', targetAmount: 1000 })

    expect(res.status).toBe(403)
    expect(res.body.limitReached).toBe(true)
  })

  test('plano elite sem limite pode criar → 201', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite', _count: { goals: 10 } }))
    prisma.goal.create.mockResolvedValue(mockGoal())

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'Meta elite', targetAmount: 1000 })

    expect(res.status).toBe(201)
  })

  // C-01: plano pago expirado deve ser tratado como Free — o campo `plan`
  // no banco só é resetado de forma lazy em /auth/me, então o authMiddleware
  // precisa recalcular o plano efetivo em toda escrita, não só ali.
  test('plano pro com planExpiresAt no passado é tratado como free → 403 na 2ª meta', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({
      plan: 'pro',
      planExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // expirou ontem
      _count: { goals: 1 },
    }))

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'Segunda meta', targetAmount: 1000 })

    expect(res.status).toBe(403)
    expect(res.body.limitReached).toBe(true)
    expect(res.body.plan).toBe('free')
  })

  test('plano elite com trialEndsAt expirado é tratado como free → 403 na 2ª meta', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({
      plan: 'elite',
      planExpiresAt: null,
      trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // trial acabou ontem
      _count: { goals: 1 },
    }))

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'Segunda meta', targetAmount: 1000 })

    expect(res.status).toBe(403)
    expect(res.body.plan).toBe('free')
  })

  test('plano pro ainda dentro do prazo (planExpiresAt no futuro) continua liberado', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({
      plan: 'pro',
      planExpiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 dias restantes
      _count: { goals: 3 },
    }))
    prisma.goal.create.mockResolvedValue(mockGoal())

    const res = await request(app)
      .post('/api/goals')
      .set(authHeader())
      .send({ title: 'Quarta meta', targetAmount: 1000 })

    expect(res.status).toBe(201)
  })
})

// ══════════════════════════════════════════════════════════
// ATUALIZAÇÃO
// ══════════════════════════════════════════════════════════
describe('PATCH /api/goals/:id', () => {
  test('atualiza título e valor atual', async () => {
    prisma.goal.findUnique.mockResolvedValue(mockGoal())
    prisma.goal.update.mockResolvedValue(mockGoal({ title: 'Novo título', currentAmount: 1000 }))

    const res = await request(app)
      .patch(`/api/goals/${VALID_UUID}`)
      .set(authHeader())
      .send({ title: 'Novo título', currentAmount: 1000 })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('Novo título')
  })

  test('ID não-UUID retorna 400', async () => {
    const res = await request(app)
      .patch('/api/goals/invalid-id')
      .set(authHeader())
      .send({ title: 'Teste' })

    expect(res.status).toBe(400)
  })

  test('cor inválida retorna 400', async () => {
    prisma.goal.findUnique.mockResolvedValue(mockGoal())

    const res = await request(app)
      .patch(`/api/goals/${VALID_UUID}`)
      .set(authHeader())
      .send({ color: '#GGGGGG' })

    expect(res.status).toBe(400)
  })

  test('currentAmount negativo retorna 400', async () => {
    prisma.goal.findUnique.mockResolvedValue(mockGoal())

    const res = await request(app)
      .patch(`/api/goals/${VALID_UUID}`)
      .set(authHeader())
      .send({ currentAmount: -100 })

    expect(res.status).toBe(400)
  })

  test('payload vazio retorna 400', async () => {
    const res = await request(app)
      .patch(`/api/goals/${VALID_UUID}`)
      .set(authHeader())
      .send({})

    expect(res.status).toBe(400)
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app)
      .patch(`/api/goals/${VALID_UUID}`)
      .send({ title: 'Teste' })

    expect(res.status).toBe(401)
  })
})

// ══════════════════════════════════════════════════════════
// DELEÇÃO
// ══════════════════════════════════════════════════════════
describe('DELETE /api/goals/:id', () => {
  test('deleta meta do próprio usuário', async () => {
    prisma.goal.deleteMany.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .delete(`/api/goals/${VALID_UUID}`)
      .set(authHeader())

    expect(res.status).toBe(200)
  })

  test('meta de outro usuário retorna 404', async () => {
    prisma.goal.deleteMany.mockResolvedValue({ count: 0 })

    const res = await request(app)
      .delete(`/api/goals/${VALID_UUID}`)
      .set(authHeader())

    expect(res.status).toBe(404)
  })

  test('ID não-UUID retorna 400', async () => {
    const res = await request(app)
      .delete('/api/goals/not-a-uuid')
      .set(authHeader())

    expect(res.status).toBe(400)
  })
})
