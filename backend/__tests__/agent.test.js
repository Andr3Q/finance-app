'use strict'
const request = require('supertest')
const jwt     = require('jsonwebtoken')

process.env.GROQ_API_KEY = 'test-groq-key'

const mockCreate = jest.fn()
jest.mock('groq-sdk', () => jest.fn().mockImplementation(() => ({
  chat: { completions: { create: mockCreate } },
})))
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

const mockUser = (overrides = {}) => ({
  id: 'user-123', plan: 'free', planExpiresAt: null, trialEndsAt: null,
  name: 'Usuário Teste', salary: 5000,
  ...overrides,
})

const simpleReply = (text = 'ok') => ({
  choices: [{ message: { content: text, tool_calls: [] } }],
})

// ══════════════════════════════════════════════════════════
// POST /api/agent/chat — regressão: Pro NÃO deve mais passar
// ══════════════════════════════════════════════════════════
describe('POST /api/agent/chat — gate de plano', () => {
  test('plano free é bloqueado → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free' }))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Gastei 50 no mercado' })

    expect(res.status).toBe(403)
    expect(res.body.requiredPlan).toBe('elite')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  // Regressão do bug real: o backend aceitava Pro para um recurso vendido
  // como exclusivo do Elite (AgentChat.jsx só libera a tela pra isElite).
  test('plano pro é bloqueado → 403 (chat com IA é exclusivo do Elite)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Gastei 50 no mercado' })

    expect(res.status).toBe(403)
    expect(res.body.requiredPlan).toBe('elite')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('plano pro com plano expirado (efetivo free) é bloqueado → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({
      plan: 'pro',
      planExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    }))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Gastei 50 no mercado' })

    expect(res.status).toBe(403)
  })

  test('plano elite passa pelo gate e conversa normalmente → 200', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate.mockResolvedValueOnce(simpleReply('Registrado!'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Gastei 50 no mercado' })

    expect(res.status).toBe(200)
    expect(res.body.reply).toBe('Registrado!')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app).post('/api/agent/chat').send({ message: 'oi' })
    expect(res.status).toBe(401)
  })
})

// ══════════════════════════════════════════════════════════
// POST /api/agent/predict — continua exclusivo do Pro/Elite (sem regressão)
// ══════════════════════════════════════════════════════════
describe('POST /api/agent/predict — gate de plano', () => {
  test('plano free é bloqueado → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free' }))

    const res = await request(app).post('/api/agent/predict').set(authHeader())

    expect(res.status).toBe(403)
    expect(res.body.requiredPlan).toBe('pro')
  })

  test('plano pro sem transações no mês retorna prediction null (sem chamar a IA)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))
    prisma.transaction.findMany.mockResolvedValue([])

    const res = await request(app).post('/api/agent/predict').set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body.prediction).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════
// POST /api/agent/monthly-report — exclusivo do Elite (sem regressão)
// ══════════════════════════════════════════════════════════
describe('POST /api/agent/monthly-report — gate de plano', () => {
  test('plano pro é bloqueado → 403 (já era exclusivo do Elite)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))

    const res = await request(app).post('/api/agent/monthly-report').set(authHeader())

    expect(res.status).toBe(403)
    expect(res.body.requiredPlan).toBe('elite')
  })
})
