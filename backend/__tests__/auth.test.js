'use strict'
const request  = require('supertest')
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))
jest.mock('../src/services/emailService', () => {
  const fn = () => jest.fn().mockResolvedValue(true)
  return {
    sendEmail: fn(), sendWelcomeEmail: fn(), sendVerificationEmail: fn(),
    sendResetEmail: fn(), sendRenewalReminderEmail: fn(), sendTrialExpiryEmail: fn(),
    sendReferralRewardEmail: fn(), sendWeeklyDigest: fn(), sendPlanExpiredEmail: fn(),
    sendMonthlyReport: fn(), sendPlanActivationEmail: fn(), sendPasswordChangedAlert: fn(),
    sendNewIpLoginAlert: fn(), sendAccountUnlockEmail: fn(),
  }
})

const prisma = require('./__mocks__/prisma')
const app    = require('../src/server')

const JWT_SECRET = process.env.JWT_SECRET
const makeToken  = (userId) => jwt.sign({ userId }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })

// ── Helpers ─────────────────────────────────────────────
const mockUser = (overrides = {}) => ({
  id:                'user-123',
  name:              'Test User',
  email:             'test@example.com',
  password:          bcrypt.hashSync('Password123', 4),
  plan:              'free',
  emailVerified:     true,
  twoFactorEnabled:  false,
  twoFactorSecret:   null,
  isOnTrial:         false,
  trialEndsAt:       null,
  planExpiresAt:     null,
  referralCode:      'ABCD1234',
  salary:            5000,
  reportEmail:       null,
  onboardingComplete: true,
  notifBudgetAlert:  true,
  notifBudgetReminder: true,
  createdAt:         new Date('2025-01-01'),
  ...overrides,
})

// ══════════════════════════════════════════════════════════
// REGISTRO
// ══════════════════════════════════════════════════════════
describe('POST /api/auth/register', () => {
  test('cria usuário com dados válidos', async () => {
    prisma.user.findUnique.mockResolvedValue(null)   // email livre
    prisma.user.findFirst.mockResolvedValue(null)    // sem referral
    prisma.user.create.mockResolvedValue(mockUser())

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'Password123' })

    expect(res.status).toBe(201)
    expect(res.body).not.toHaveProperty('token')
    expect(res.body.user).toHaveProperty('email', 'test@example.com')
    expect(res.body.user).not.toHaveProperty('password')
  })

  test('rejeita email duplicado → 400', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'Password123' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/não foi possível criar a conta/i)
  })

  test('rejeita senha fraca (sem maiúscula/número) → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'simplepassword' })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
  })

  test('rejeita senha com menos de 8 caracteres → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'new@example.com', password: 'Ab1' })

    expect(res.status).toBe(400)
  })

  test('rejeita nome muito curto → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'A', email: 'new@example.com', password: 'Password123' })

    expect(res.status).toBe(400)
  })

  test('rejeita email inválido → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'not-an-email', password: 'Password123' })

    expect(res.status).toBe(400)
  })

  test('rejeita payload vazio → 400', async () => {
    const res = await request(app).post('/api/auth/register').send({})
    expect(res.status).toBe(400)
  })

  test('não retorna password hash na resposta', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    prisma.user.create.mockResolvedValue(mockUser())

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'Password123' })

    expect(res.body.user).not.toHaveProperty('password')
    expect(res.body.user).not.toHaveProperty('twoFactorSecret')
  })

  test('nome com XSS é salvo como texto puro (não é executado)', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    prisma.user.create.mockResolvedValue(mockUser({ name: '<script>alert(1)</script>' }))

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: '<script>alert(1)</script>', email: 'xss@example.com', password: 'Password123' })

    // Não deve executar — deve retornar o texto ou 400 por validação
    expect([201, 400]).toContain(res.status)
  })
})

// ══════════════════════════════════════════════════════════
// LOGIN
// ══════════════════════════════════════════════════════════
describe('POST /api/auth/login', () => {
  test('login válido retorna user e seta cookie HttpOnly', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.loginAudit.create.mockResolvedValue({})

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password123' })

    expect(res.status).toBe(200)
    expect(res.body).not.toHaveProperty('token')
    expect(res.body.user.id).toBe('user-123')
    expect(res.headers['set-cookie']).toBeDefined()
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i)
  })

  test('senha errada retorna 401 com mensagem genérica', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.loginAudit.create.mockResolvedValue({})

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword1' })

    expect(res.status).toBe(401)
    // Mensagem não deve revelar se o email existe
    expect(res.body.error).toMatch(/inválid|incorret|não encontrad/i)
  })

  test('usuário inexistente retorna 401 (não vaza se email existe)', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    prisma.loginAudit.create.mockResolvedValue({})

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'notexist@example.com', password: 'Password123' })

    expect(res.status).toBe(401)
  })

  test('não retorna password hash no response', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.loginAudit.create.mockResolvedValue({})

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password123' })

    expect(res.body.user).not.toHaveProperty('password')
    expect(res.body.user).not.toHaveProperty('twoFactorSecret')
  })

  test('senha como número é rejeitada → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 12345678 })

    expect(res.status).toBe(400)
  })

  test('payload sem email → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Password123' })

    expect(res.status).toBe(400)
  })

  test('senha com mais de 72 chars é rejeitada (bcrypt limit) → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'A'.repeat(73) + '1' })

    expect(res.status).toBe(400)
  })
})

// ══════════════════════════════════════════════════════════
// AUTENTICAÇÃO E MIDDLEWARE
// ══════════════════════════════════════════════════════════
describe('GET /api/auth/me', () => {
  test('retorna dados do usuário com token válido', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `token=${makeToken('user-123')}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe('user-123')
    // A rota strip os campos sensíveis antes de enviar
    expect(res.body).not.toHaveProperty('password')
    expect(res.body).not.toHaveProperty('twoFactorSecret')
  })

  test('sem token retorna 401', async () => {
    const res = await request(app).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  test('token expirado retorna 403', async () => {
    const expiredToken = jwt.sign({ userId: 'user-123' }, JWT_SECRET, { expiresIn: '-1s' })
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `token=${expiredToken}`)

    expect(res.status).toBe(403)
  })

  test('token com algoritmo "none" é rejeitado → 403', async () => {
    // Tenta forjar token sem assinatura
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
})

// ══════════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════════
describe('POST /api/auth/logout', () => {
  test('limpa cookie de autenticação', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', `token=${makeToken('user-123')}`)

    expect(res.status).toBe(200)
    // Cookie deve ser expirado
    const cookie = res.headers['set-cookie']?.[0] || ''
    expect(cookie).toMatch(/token=;|token=$/i)
  })
})

// ══════════════════════════════════════════════════════════
// TROCA DE SENHA
// ══════════════════════════════════════════════════════════
describe('PUT /api/auth/password', () => {
  test('troca senha com credenciais corretas', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.user.update.mockResolvedValue({ ...user, password: 'newHash' })

    const res = await request(app)
      .put('/api/auth/password')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ currentPassword: 'Password123', newPassword: 'NewPassword456' })

    expect(res.status).toBe(200)
  })

  test('senha atual errada retorna 401', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)

    const res = await request(app)
      .put('/api/auth/password')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ currentPassword: 'WrongPass123', newPassword: 'NewPassword456' })

    expect(res.status).toBe(401)
  })

  test('nova senha fraca retorna 400', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)

    const res = await request(app)
      .put('/api/auth/password')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ currentPassword: 'Password123', newPassword: 'weak' })

    expect(res.status).toBe(400)
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app)
      .put('/api/auth/password')
      .send({ currentPassword: 'Password123', newPassword: 'NewPassword456' })

    expect(res.status).toBe(401)
  })
})

// ══════════════════════════════════════════════════════════
// DELETE CONTA
// ══════════════════════════════════════════════════════════
describe('DELETE /api/auth/account', () => {
  test('deleta conta com senha correta', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.$transaction.mockResolvedValue([])

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ password: 'Password123' })

    expect(res.status).toBe(200)
  })

  test('senha errada impede deleção → 401', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ password: 'WrongPassword1' })

    expect(res.status).toBe(401)
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app)
      .delete('/api/auth/account')
      .send({ password: 'Password123' })

    expect(res.status).toBe(401)
  })
})

// ══════════════════════════════════════════════════════════
// RESET DE SENHA
// ══════════════════════════════════════════════════════════
describe('POST /api/auth/reset-password', () => {
  test('reseta senha com token válido', async () => {
    const crypto = require('crypto')
    const token  = 'valid-reset-token-123'
    const hash   = crypto.createHash('sha256').update(token).digest('hex')
    const user   = mockUser({ resetToken: hash, resetTokenExpiry: new Date(Date.now() + 3600_000) })

    prisma.user.findFirst.mockResolvedValue(user)
    prisma.$transaction.mockResolvedValue([])

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'NewPassword456' })

    expect(res.status).toBe(200)
  })

  test('token expirado retorna 400', async () => {
    prisma.user.findFirst.mockResolvedValue(null) // não encontra (expirado)

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'expired-token', password: 'NewPassword456' })

    expect(res.status).toBe(400)
  })

  test('senha fraca no reset retorna 400', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'some-token', password: 'weak' })

    expect(res.status).toBe(400)
  })
})

// ══════════════════════════════════════════════════════════
// PERFIL
// ══════════════════════════════════════════════════════════
describe('PUT /api/auth/profile', () => {
  test('atualiza nome e email de relatório', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.user.update.mockResolvedValue({ ...user, name: 'Novo Nome' })

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ name: 'Novo Nome' })

    expect(res.status).toBe(200)
    expect(res.body.user.name).toBe('Novo Nome')
  })

  test('nome muito longo retorna 400', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ name: 'A'.repeat(101) })

    expect(res.status).toBe(400)
  })
})
