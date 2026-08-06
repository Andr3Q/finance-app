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

const mockUser = (overrides = {}) => ({
  id: 'user-123', plan: 'free', salary: 5000,
  emailVerified: true, twoFactorEnabled: false,
  isOnTrial: false, planExpiresAt: null, ...overrides,
})

// ══════════════════════════════════════════════════════════
// AUTENTICAÇÃO — ataques ao middleware JWT
// ══════════════════════════════════════════════════════════
describe('Segurança JWT', () => {
  test('token com algoritmo "none" é rejeitado → 403', async () => {
    const parts = [
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
      Buffer.from(JSON.stringify({ userId: 'user-123' })).toString('base64url'),
      '',
    ]
    const forgedToken = parts.join('.')

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `token=${forgedToken}`)

    expect(res.status).toBe(403)
  })

  test('token assinado com secret errado retorna 403', async () => {
    const badToken = jwt.sign({ userId: 'user-123' }, 'wrong-secret')
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `token=${badToken}`)

    expect(res.status).toBe(403)
  })

  test('token expirado retorna 403', async () => {
    const expired = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '-1s' })
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `token=${expired}`)

    expect(res.status).toBe(403)
  })

  test('token com payload adulterado retorna 403', async () => {
    const validToken = makeToken('user-123')
    const parts = validToken.split('.')
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
    payload.userId = 'admin-user'
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const tampered = parts.join('.')

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `token=${tampered}`)

    expect(res.status).toBe(403)
  })

  test('cookie token completamente inválido retorna 403', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', 'token=not.a.jwt.token.at.all')

    expect(res.status).toBe(403)
  })
})

// ══════════════════════════════════════════════════════════
// INJEÇÃO E PAYLOADS MALICIOSOS
// ══════════════════════════════════════════════════════════
describe('Proteção contra injeção e payloads maliciosos', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.findFirst.mockResolvedValue(null)
  })

  test('ID com SQL injection em DELETE é tratado como 400 ou 404', async () => {
    const res = await request(app)
      .delete("/api/transactions/1' OR '1'='1")
      .set(authHeader())

    expect([400, 404]).toContain(res.status)
  })

  test('ID com path traversal em GET é tratado como 400 ou 404', async () => {
    const res = await request(app)
      .get('/api/transactions/../../../etc/passwd')
      .set(authHeader())

    expect([400, 404]).toContain(res.status)
  })

  test('payload oversized (>100kb) é rejeitado', async () => {
    const bigPayload = { description: 'A'.repeat(110_000), amount: 100, type: 'expense', category: 'food' }

    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send(bigPayload)

    expect([400, 413]).toContain(res.status)
  })

  test('campo numérico com string é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Teste', amount: 'abc', type: 'expense', category: 'food' })

    expect(res.status).toBe(400)
  })

  test('injeção de prototype pollution via __proto__ não afeta validação', async () => {
    // Intenção do teste é "user não existe" — precisa ser explícito: o mock
    // padrão global de prisma.user.findUnique resolve para {tokenVersion:0}
    // (objeto truthy, mas sem id/password), o que faria o fluxo de login
    // tratar como "usuário encontrado" e tentar atualizar failedLoginCount
    // de um id inexistente.
    prisma.user.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password123', '__proto__': { admin: true } })

    // Deve retornar 401 (user não existe no mock) ou 400, nunca 200 com privilégios
    expect([400, 401]).toContain(res.status)
  })
})

// ══════════════════════════════════════════════════════════
// CABEÇALHOS DE SEGURANÇA
// ══════════════════════════════════════════════════════════
describe('Cabeçalhos de segurança HTTP', () => {
  test('resposta inclui X-Content-Type-Options', async () => {
    const res = await request(app).get('/api/auth/me')
    // Pode ser 401, mas os headers de segurança devem estar presentes
    const header = res.headers['x-content-type-options']
    expect(header).toBe('nosniff')
  })

  test('resposta inclui X-Frame-Options ou CSP com frame-ancestors', async () => {
    const res = await request(app).get('/api/auth/me')
    const hasFrameOptions = !!res.headers['x-frame-options']
    const hasCSP = (res.headers['content-security-policy'] || '').includes('frame')
    expect(hasFrameOptions || hasCSP).toBe(true)
  })

  // Regressão: microphone=() bloqueava o recurso de voz do AgentChat mesmo com
  // o usuário concedendo permissão no navegador — Permissions-Policy do servidor
  // tem prioridade sobre a concessão manual do usuário.
  test('Permissions-Policy libera microfone para o próprio site (self)', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.headers['permissions-policy']).toContain('microphone=(self)')
  })

  test('endpoint de dados financeiros inclui Cache-Control: no-store', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())

    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader())

    const cacheControl = res.headers['cache-control'] || ''
    expect(cacheControl.toLowerCase()).toMatch(/no-store|no-cache|private/)
  })
})

// ══════════════════════════════════════════════════════════
// ISOLAMENTO DE DADOS
// ══════════════════════════════════════════════════════════
describe('Isolamento de dados entre usuários', () => {
  test('token de user-A não pode modificar recurso de user-B (transaction)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ id: 'user-A' }))
    prisma.transaction.findFirst.mockResolvedValue(null) // ownership mismatch

    const tokenA = jwt.sign({ userId: 'user-A' }, JWT_SECRET, { expiresIn: '1h' })

    // UUID válido pertencente ao user-B
    const res = await request(app)
      .delete('/api/transactions/c3d4e5f6-a7b8-9012-cdef-123456789012')
      .set('Cookie', `token=${tokenA}`)

    expect(res.status).toBe(404)
  })

  test('userId do token não pode ser sobrescrito pelo body', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ _count: { transactions: 5 } }))
    prisma.transaction.count.mockResolvedValue(5)
    prisma.transaction.create.mockImplementation(async ({ data }) => ({
      id: 'tx-new', ...data, date: new Date(),
    }))

    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader()) // token de user-123
      .send({
        description: 'Fraude',
        amount: 100,
        type: 'expense',
        category: 'food',
        userId: 'outro-user-id', // tentativa de injetar userId diferente
      })

    if (res.status === 201) {
      // Deve ter gravado com userId do token, não do body
      expect(res.body.userId).toBe('user-123')
    } else {
      expect([400, 403]).toContain(res.status)
    }
  })
})

// ══════════════════════════════════════════════════════════
// CAMPOS SENSÍVEIS NAS RESPOSTAS
// ══════════════════════════════════════════════════════════
describe('Campos sensíveis não expostos nas respostas', () => {
  test('GET /api/auth/me não retorna password hash', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())

    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader())

    expect(res.body).not.toHaveProperty('password')
    expect(res.body).not.toHaveProperty('twoFactorSecret')
    expect(res.body).not.toHaveProperty('resetToken')
  })

  test('POST /api/auth/login não retorna password hash', async () => {
    const bcrypt = require('bcryptjs')
    prisma.user.findUnique.mockResolvedValue(mockUser({
      password: bcrypt.hashSync('Password123', 4),
    }))
    prisma.loginAudit.create.mockResolvedValue({})

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password123' })

    expect(res.body.user).not.toHaveProperty('password')
    expect(res.body.user).not.toHaveProperty('twoFactorSecret')
  })

  test('POST /api/auth/register não retorna password hash', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    prisma.user.findFirst.mockResolvedValue(null)
    prisma.user.create.mockResolvedValue(mockUser())

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'Password123' })

    expect(res.body.user).not.toHaveProperty('password')
  })
})
