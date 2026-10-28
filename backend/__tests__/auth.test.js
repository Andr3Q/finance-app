'use strict'
const request  = require('supertest')
const bcrypt   = require('bcryptjs')
const jwt      = require('jsonwebtoken')
jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))
jest.mock('../src/services/pushService', () => ({ sendPushToUser: jest.fn().mockResolvedValue(true) }))
jest.mock('../src/services/emailService', () => {
  const fn = () => jest.fn().mockResolvedValue(true)
  return {
    sendEmail: fn(), sendWelcomeEmail: fn(), sendVerificationEmail: fn(),
    sendResetEmail: fn(), sendRenewalReminderEmail: fn(), sendTrialExpiryEmail: fn(),
    sendReferralRewardEmail: fn(), sendWeeklyDigest: fn(), sendPlanExpiredEmail: fn(),
    sendMonthlyReport: fn(), sendPlanActivationEmail: fn(), sendPasswordChangedAlert: fn(),
    sendNewIpLoginAlert: fn(), sendAccountUnlockEmail: fn(),
    sendEmailChangeVerification: fn(), sendEmailChangeAlert: fn(),
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

  // Tela "Confirme seu e-mail" (Nancy 2): além do link de sempre, o cadastro
  // agora também gera um código de 6 dígitos (caminho alternativo, mesmo evento).
  test('gera código de verificação de 6 dígitos junto com o link e envia por e-mail', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    prisma.user.findFirst.mockResolvedValue(null)
    prisma.user.create.mockResolvedValue(mockUser())

    await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test User', email: 'test@example.com', password: 'Password123' })

    const createArgs = prisma.user.create.mock.calls[0][0].data
    expect(createArgs.emailVerifyCode).toMatch(/^[a-f0-9]{64}$/) // sha256 hex — nunca o código em texto puro
    expect(createArgs.emailVerifyCodeExpiry).toBeInstanceOf(Date)

    const emailService = require('../src/services/emailService')
    const sentCode = emailService.sendVerificationEmail.mock.calls[0][3]
    expect(sentCode).toMatch(/^\d{6}$/)
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

  // Regressão: a resposta de /login só mandava um subconjunto pequeno de
  // campos (sem onboardingComplete, emailVerified, twoFactorEnabled,
  // pendingEmail...) — componentes que decidem o que mostrar direto desse
  // objeto (ex: OnboardingModal) só recebiam o valor certo depois do próximo
  // boot completo do app (que chama /auth/me). Na prática, todo login normal
  // mostrava o modal de onboarding à toa, mesmo pra quem já tinha completado
  // há muito tempo. Resolvido reusando o mesmo ME_SELECT de /auth/me.
  test('resposta do login inclui onboardingComplete e demais campos que a UI decide sem esperar /me', async () => {
    const user = mockUser({ onboardingComplete: true, emailVerified: true, twoFactorEnabled: false, pendingEmail: null })
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.loginAudit.create.mockResolvedValue({})

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password123' })

    expect(res.body.user.onboardingComplete).toBe(true)
    expect(res.body.user.emailVerified).toBe(true)
    expect(res.body.user.twoFactorEnabled).toBe(false)
    expect(res.body.user).toHaveProperty('pendingEmail', null)
  })

  test('senha errada retorna 401 com mensagem genérica', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.loginAudit.create.mockResolvedValue({})
    prisma.user.update.mockResolvedValue({ failedLoginCount: 1 })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword1' })

    expect(res.status).toBe(401)
    // Mensagem não deve revelar se o email existe
    expect(res.body.error).toMatch(/inválid|incorret|não encontrad/i)
  })

  // Regressão: o contador de tentativas falhas usava leitura+escrita não-atômica
  // (newCount = count+1 calculado na aplicação) — sob requisições concorrentes,
  // updates se perdiam e a conta podia nunca bloquear. Agora usa increment atômico.
  test('senha errada incrementa failedLoginCount atomicamente ({ increment: 1 })', async () => {
    const user = mockUser({ failedLoginCount: 3 })
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.loginAudit.create.mockResolvedValue({})
    prisma.user.update.mockResolvedValue({ failedLoginCount: 4 })

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword1' })

    expect(prisma.user.update).toHaveBeenCalledWith({
      where:  { id: 'user-123' },
      data:   { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    })
  })

  test('10ª tentativa errada bloqueia a conta → 423 e envia e-mail de desbloqueio', async () => {
    const user = mockUser({ failedLoginCount: 9 })
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.loginAudit.create.mockResolvedValue({})
    prisma.user.update.mockResolvedValue({ failedLoginCount: 10 })
    prisma.$transaction.mockResolvedValue([{}, {}])

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword1' })

    expect(res.status).toBe(423)
    expect(res.body.error).toMatch(/bloqueada/i)
  })

  test('9ª tentativa errada NÃO bloqueia a conta → 401', async () => {
    const user = mockUser({ failedLoginCount: 8 })
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.loginAudit.create.mockResolvedValue({})
    prisma.user.update.mockResolvedValue({ failedLoginCount: 9 })

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'WrongPassword1' })

    expect(res.status).toBe(401)
  })

  test('conta já bloqueada retorna 423 sem tentar a senha', async () => {
    const user = mockUser({ accountLockedAt: new Date() })
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.loginAudit.create.mockResolvedValue({})

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Password123' })

    expect(res.status).toBe(423)
    // Conta já bloqueada não deve reincrementar o contador
    expect(prisma.user.update).not.toHaveBeenCalled()
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

  test('depois da troca, ESTE aparelho continua logado: o cookie novo traz o tokenVersion novo (os JWTs antigos morrem, os outros aparelhos caem)', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)
    prisma.user.update.mockResolvedValue({ id: 'user-123', tokenVersion: 5 })

    const res = await request(app)
      .put('/api/auth/password')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ currentPassword: 'Password123', newPassword: 'NewPassword456' })

    expect(res.status).toBe(200)
    const update = prisma.user.update.mock.calls.at(-1)[0]
    expect(update.data.tokenVersion).toEqual({ increment: 1 }) // a invalidação dos outros aparelhos continua
    const cookie = (res.headers['set-cookie'] || []).find(c => c.startsWith('token='))
    expect(cookie).toBeTruthy()
    expect(cookie).toMatch(/HttpOnly/i)
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(cookie.split(';')[0].replace('token=', ''), process.env.JWT_SECRET)
    expect(decoded).toMatchObject({ userId: 'user-123', tokenVersion: 5 })
  })

  test('senha atual errada retorna 401 e NÃO emite cookie novo', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)

    const res = await request(app)
      .put('/api/auth/password')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ currentPassword: 'WrongPass123', newPassword: 'NewPassword456' })

    expect(res.status).toBe(401)
    expect(res.headers['set-cookie']).toBeUndefined()
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
// ESQUECI MINHA SENHA
// ══════════════════════════════════════════════════════════
describe('POST /api/auth/forgot-password', () => {
  test('e-mail existente: dispara sendResetEmail e retorna mensagem genérica', async () => {
    const emailService = require('../src/services/emailService')
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.user.update.mockResolvedValue({})

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'test@example.com' })

    expect(res.status).toBe(200)
    expect(emailService.sendResetEmail).toHaveBeenCalled()
  })

  test('e-mail inexistente: mesma mensagem genérica, sem chamar sendResetEmail (anti-enumeração)', async () => {
    const emailService = require('../src/services/emailService')
    prisma.user.findUnique.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'naoexiste@example.com' })

    expect(res.status).toBe(200)
    expect(emailService.sendResetEmail).not.toHaveBeenCalled()
  })

  // Regressão do incidente real: EMAIL_FROM apontando pro domínio de sandbox
  // da Resend (onboarding@resend.dev) rejeitava o envio pra qualquer
  // destinatário que não fosse o dono da conta — e como emailService.js não
  // checava o campo `error` da resposta, sendResetEmail nunca lançava exceção,
  // então esta rota respondia 200 "enviado" mesmo o e-mail nunca tendo saído.
  // Agora que emailService.js propaga o erro, a rota precisa refletir a falha
  // real em vez de mentir sucesso pro usuário.
  test('falha real no envio (Resend rejeitou): não derruba o fluxo nem revela a falha (proteção contra email enumeration)', async () => {
    const emailService = require('../src/services/emailService')
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.user.update.mockResolvedValue({})
    emailService.sendResetEmail.mockRejectedValueOnce(new Error('Resend rejeitou o envio: domain not verified'))

    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'test@example.com' })

    // O token já foi salvo antes do envio — uma queda do Resend não pode
    // quebrar o fluxo nem, via 500 vs 200, revelar se o e-mail existe ou não.
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Se este e-mail existir, você receberá o link em breve.')
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

  // Achado de auditoria de segurança (2026-10-21): sem isso, um usuário travado
  // por força bruta continuava bloqueado no login mesmo depois de resetar a
  // senha com sucesso — o único desbloqueio (e-mail de uso único, 1h de
  // validade, sem reenvio) podia já ter expirado, deixando-o sem nenhuma rota
  // self-service de recuperação.
  test('limpa accountLockedAt e failedLoginCount ao resetar a senha com sucesso', async () => {
    const crypto = require('crypto')
    const token  = 'valid-reset-token-123'
    const hash   = crypto.createHash('sha256').update(token).digest('hex')
    const user   = mockUser({
      resetToken: hash, resetTokenExpiry: new Date(Date.now() + 3600_000),
      accountLockedAt: new Date(), failedLoginCount: 10,
    })

    prisma.user.findFirst.mockResolvedValue(user)
    prisma.$transaction.mockResolvedValue([])

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'NewPassword456' })

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ accountLockedAt: null, failedLoginCount: 0 }),
    }))
  })
})

// ══════════════════════════════════════════════════════════
// VERIFICAÇÃO DE E-MAIL + RECOMPENSA DE INDICAÇÃO
// ══════════════════════════════════════════════════════════
// Reescrito por achado de auditoria de segurança (2026-10-21): a versão
// antiga fazia count()-então-update() sem lock algum, permitindo (a)
// reprocessar o MESMO token de verificação em paralelo multiplicar a
// recompensa pro mesmo indicado várias vezes, e (b) vários indicados
// DIFERENTES verificando ao mesmo tempo estourarem o teto de 5 recompensas
// por indicador. Zero cobertura de teste existia pra essa rota antes disto.
describe('POST /api/auth/verify-email', () => {
  const { sendReferralRewardEmail } = require('../src/services/emailService')
  const TOKEN = 'valid-verify-token'
  const HASH  = require('crypto').createHash('sha256').update(TOKEN).digest('hex')

  // A recompensa roda em background (fire-and-forget, não bloqueia a resposta
  // de /verify-email) — dá um tick pra cadeia de promises internas resolver
  // antes de checar os mocks.
  const flush = () => new Promise(resolve => setImmediate(resolve))

  beforeEach(() => {
    sendReferralRewardEmail.mockClear()
  })

  test('token ausente retorna 400', async () => {
    const res = await request(app).post('/api/auth/verify-email').send({})
    expect(res.status).toBe(400)
  })

  test('token inválido ou expirado retorna 400', async () => {
    prisma.user.findFirst.mockResolvedValue(null)
    const res = await request(app).post('/api/auth/verify-email').send({ token: 'lixo' })
    expect(res.status).toBe(400)
  })

  test('verificação sem indicação: marca emailVerified e não mexe em recompensa', async () => {
    const user = mockUser({ id: 'user-456', referredBy: null })
    prisma.user.findFirst.mockResolvedValue(user)
    prisma.user.updateMany.mockResolvedValue({ count: 1 })

    const res = await request(app).post('/api/auth/verify-email').send({ token: TOKEN })
    await flush()

    expect(res.status).toBe(200)
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-456', emailVerifyToken: HASH, emailVerifyExpiry: { gt: expect.any(Date) } },
      // Limpa também o código de 6 dígitos (caminho alternativo pro mesmo
      // evento) — sem isso ele continuaria válido/tentável após o e-mail já
      // verificado pelo link.
      data:  {
        emailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null,
        emailVerifyCode: null, emailVerifyCodeExpiry: null, emailVerifyCodeAttempts: 0,
      },
    })
    expect(sendReferralRewardEmail).not.toHaveBeenCalled()
  })

  // updateMany condicionado ao token: uma 2ª requisição concorrente com o
  // MESMO token (já consumido pela 1ª) não encontra mais nada pra
  // atualizar — count:0 — em vez de reprocessar como verificação válida.
  test('token já consumido por outra requisição concorrente (count:0) retorna 400', async () => {
    const user = mockUser({ id: 'user-456', referredBy: null })
    prisma.user.findFirst.mockResolvedValue(user)
    prisma.user.updateMany.mockResolvedValue({ count: 0 })

    const res = await request(app).post('/api/auth/verify-email').send({ token: TOKEN })

    expect(res.status).toBe(400)
  })

  describe('recompensa do indicador', () => {
    // clearMocks (jest.config.js) só limpa o HISTÓRICO de chamadas antes de
    // cada teste — não esvazia a fila de mockResolvedValueOnce ainda não
    // consumida por um teste anterior que retornou mais cedo (ex: indicador
    // não encontrado). mockReset() limpa a fila inteira também, evitando que
    // um valor sobrando vaze pro próximo teste e desalinhe a sequência.
    beforeEach(() => {
      prisma.user.updateMany.mockReset()
      prisma.user.findUnique.mockReset()
    })

    const referredUser = () => mockUser({ id: 'referred-1', referredBy: 'REFCODE1' })
    const referrer = (overrides = {}) => ({
      id: 'referrer-1', name: 'Quem Indicou', email: 'referrer@test.com',
      plan: 'free', trialEndsAt: null, planExpiresAt: null, referralRewardsGiven: 0,
      ...overrides,
    })

    // Sequência real de chamadas dentro de rewardReferrer(): 1) claim atômico
    // no indicado (referralRewardedAt), 2) busca o indicador, 3) lê o estado
    // atual do indicador (lock otimista), 4) updateMany condicionado pra
    // creditar — mockResolvedValueOnce em ordem simula isso sem ambiguidade.
    function mockRewardFlow({ claimCount = 1, referrerData, lockReadData, creditCount = 1 }) {
      prisma.user.updateMany
        .mockResolvedValueOnce({ count: 1 })       // verify-email: marca emailVerified
        .mockResolvedValueOnce({ count: claimCount }) // claim do indicado
      prisma.user.findUnique
        .mockResolvedValueOnce(referrerData)        // busca o indicador por referralCode
        .mockResolvedValueOnce(lockReadData)        // leitura do estado atual (lock otimista)
      if (claimCount === 1 && referrerData) {
        prisma.user.updateMany.mockResolvedValueOnce({ count: creditCount }) // credita
      }
    }

    test('indicador sem trial/plano ativo: vira pro com novo trial de 10 dias', async () => {
      prisma.user.findFirst.mockResolvedValue(referredUser())
      mockRewardFlow({ referrerData: referrer(), lockReadData: referrer() })

      const res = await request(app).post('/api/auth/verify-email').send({ token: TOKEN })
      await flush()

      expect(res.status).toBe(200)
      const creditCall = prisma.user.updateMany.mock.calls[2][0]
      expect(creditCall.where).toEqual({
        id: 'referrer-1', referralRewardsGiven: 0, plan: 'free', trialEndsAt: null, planExpiresAt: null,
      })
      expect(creditCall.data.plan).toBe('pro')
      expect(creditCall.data.referralRewardsGiven).toBe(1)
      expect(creditCall.data.trialEndsAt.getTime()).toBeGreaterThan(Date.now() + 9 * 24 * 60 * 60 * 1000)
      expect(sendReferralRewardEmail).toHaveBeenCalledWith('referrer@test.com', 'Quem Indicou', referredUser().name)
    })

    test('indicador com trial ativo: soma 10 dias ao trialEndsAt existente', async () => {
      const futureTrials = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      prisma.user.findFirst.mockResolvedValue(referredUser())
      mockRewardFlow({
        referrerData: referrer({ trialEndsAt: futureTrials }),
        lockReadData: referrer({ trialEndsAt: futureTrials }),
      })

      await request(app).post('/api/auth/verify-email').send({ token: TOKEN })
      await flush()

      const creditCall = prisma.user.updateMany.mock.calls[2][0]
      expect(creditCall.data.trialEndsAt.getTime()).toBe(futureTrials.getTime() + 10 * 24 * 60 * 60 * 1000)
      expect(creditCall.data.plan).toBeUndefined() // não mexe no plano, só estende o trial
    })

    test('indicador com plano pago ativo: soma 10 dias ao planExpiresAt existente', async () => {
      const futureExpiry = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000)
      prisma.user.findFirst.mockResolvedValue(referredUser())
      mockRewardFlow({
        referrerData: referrer({ plan: 'elite', planExpiresAt: futureExpiry }),
        lockReadData: referrer({ plan: 'elite', planExpiresAt: futureExpiry }),
      })

      await request(app).post('/api/auth/verify-email').send({ token: TOKEN })
      await flush()

      const creditCall = prisma.user.updateMany.mock.calls[2][0]
      expect(creditCall.data.planExpiresAt.getTime()).toBe(futureExpiry.getTime() + 10 * 24 * 60 * 60 * 1000)
    })

    // Achado 2 da auditoria: reprocessar o MESMO indicado (ex: 2 requisições
    // concorrentes com o mesmo token de verificação) não pode recompensar 2x.
    test('indicado já recompensado antes (claim perde a corrida): não credita de novo', async () => {
      prisma.user.findFirst.mockResolvedValue(referredUser())
      prisma.user.updateMany
        .mockResolvedValueOnce({ count: 1 }) // verify-email: marca emailVerified
        .mockResolvedValueOnce({ count: 0 }) // claim do indicado: já estava setado (perdeu a corrida)

      const res = await request(app).post('/api/auth/verify-email').send({ token: TOKEN })
      await flush()

      expect(res.status).toBe(200) // a verificação de e-mail em si funciona normalmente
      expect(prisma.user.findUnique).not.toHaveBeenCalled() // nem chega a buscar o indicador
      expect(sendReferralRewardEmail).not.toHaveBeenCalled()
    })

    // Achado 3 da auditoria: teto de 5 recompensas por indicador, agora como
    // parte do mesmo lock otimista que credita os dias (não mais uma
    // contagem solta antes do update).
    test('indicador já no teto de 5 recompensas: não credita a 6ª', async () => {
      prisma.user.findFirst.mockResolvedValue(referredUser())
      mockRewardFlow({
        referrerData: referrer({ referralRewardsGiven: 5 }),
        lockReadData: referrer({ referralRewardsGiven: 5 }),
      })

      await request(app).post('/api/auth/verify-email').send({ token: TOKEN })
      await flush()

      // só 2 updateMany: marca emailVerified + claim do indicado — nunca chega a creditar
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(2)
      expect(sendReferralRewardEmail).not.toHaveBeenCalled()
    })

    test('código de indicação não corresponde a nenhum indicador: não quebra, não credita', async () => {
      prisma.user.findFirst.mockResolvedValue(referredUser())
      prisma.user.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
      prisma.user.findUnique.mockResolvedValueOnce(null) // indicador não existe mais

      const res = await request(app).post('/api/auth/verify-email').send({ token: TOKEN })
      await flush()

      expect(res.status).toBe(200)
      expect(sendReferralRewardEmail).not.toHaveBeenCalled()
    })

    // Corrida entre indicados DIFERENTES (ou qualquer outra escrita concorrente
    // no indicador): a 1ª tentativa do lock otimista perde (outra transação já
    // mudou a linha), tenta de novo com o valor fresco, e credita na 2ª.
    test('lock otimista perde a 1ª tentativa (corrida) e credita com sucesso na 2ª', async () => {
      prisma.user.findFirst.mockResolvedValue(referredUser())
      prisma.user.updateMany
        .mockResolvedValueOnce({ count: 1 }) // verify-email
        .mockResolvedValueOnce({ count: 1 }) // claim do indicado
        .mockResolvedValueOnce({ count: 0 }) // 1ª tentativa de crédito: perdeu a corrida
        .mockResolvedValueOnce({ count: 1 }) // 2ª tentativa: sucesso com valor fresco
      prisma.user.findUnique
        .mockResolvedValueOnce(referrer())                              // busca indicador
        .mockResolvedValueOnce(referrer({ referralRewardsGiven: 0 }))   // 1ª leitura (lock)
        .mockResolvedValueOnce(referrer({ referralRewardsGiven: 1 }))   // 2ª leitura: outra recompensa já foi dada nesse meio tempo

      const res = await request(app).post('/api/auth/verify-email').send({ token: TOKEN })
      await flush()

      expect(res.status).toBe(200)
      expect(prisma.user.updateMany).toHaveBeenCalledTimes(4)
      const secondAttemptData = prisma.user.updateMany.mock.calls[3][0].data
      expect(secondAttemptData.referralRewardsGiven).toBe(2) // baseado na leitura fresca (1), não na antiga (0)
      expect(sendReferralRewardEmail).toHaveBeenCalled()
    })
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

// ══════════════════════════════════════════════════════════
// PREFERÊNCIAS DE NOTIFICAÇÃO (tela "Preferências", Nancy 2)
// ══════════════════════════════════════════════════════════
describe('PUT /api/auth/notifications', () => {
  const cookie = () => `token=${makeToken('user-123')}`
  const put = (body) => request(app).put('/api/auth/notifications').set('Cookie', cookie()).send(body)
  beforeEach(() => { prisma.user.findUnique.mockResolvedValue(mockUser()); prisma.user.update.mockResolvedValue({ id: 'user-123' }) })

  test('salva cada preferência booleana conhecida', async () => {
    const all = { notifBudgetAlert: false, notifBudgetReminder: false, notifSalary: false, notifStories: false, notifTips: false, notifWeeklyEmail: true }
    const res = await put(all)
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-123' }, data: all })
  })

  test('uma preferência por vez também vale', async () => {
    expect((await put({ notifWeeklyEmail: true })).status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-123' }, data: { notifWeeklyEmail: true } })
  })

  test('ignora o que não é preferência conhecida e o que não é booleano (nada de mexer em plano ou e-mail por aqui)', async () => {
    const res = await put({ notifTips: false, notifSalary: 'sim', plan: 'elite', email: 'x@y.com', emailVerified: true })
    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-123' }, data: { notifTips: false } })
  })

  test('sem nenhum campo válido: 400 e nada é gravado', async () => {
    expect((await put({ notifSalary: 'sim', plan: 'elite' })).status).toBe(400)
    expect((await put({})).status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  test('sem login: 401', async () => {
    expect((await request(app).put('/api/auth/notifications').send({ notifTips: false })).status).toBe(401)
  })

  test('/me devolve as preferências para o app (e login também)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ notifSalary: false, notifStories: true, notifTips: false, notifWeeklyEmail: true }))
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie())
    expect(res.body).toMatchObject({ notifSalary: false, notifStories: true, notifTips: false, notifWeeklyEmail: true })
  })
})

describe('GET /api/auth/me — lembrete de conta que vence (push), 2 dias antes', () => {
  const { sendPushToUser } = require('../src/services/pushService')
  const flush = () => new Promise(r => setTimeout(r, 30))
  const inDays = (k) => { const now = new Date(); const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(); return ((now.getDate() - 1 + k) % dim) + 1 }

  const me = async (dueDay, over = {}) => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ notifBudgetReminder: true, budgetReminderSentAt: null, ...over }))
    // o mesmo método também busca contas encerradas (outro aviso); aqui só a consulta por dia de vencimento devolve a conta
    prisma.budget.findMany.mockImplementation(async ({ where }) => (where && where.dueDay ? [{ id: 'b1', name: 'Aluguel', amount: 1500, dueDay }] : []))
    prisma.transaction.findMany.mockResolvedValue([])
    await request(app).get('/api/auth/me').set('Cookie', `token=${makeToken('user-123')}`)
    await flush()
  }
  const billPushes = () => sendPushToUser.mock.calls.filter(([, p]) => /Aluguel vence/.test(p.title))

  test('conta que vence hoje, amanhã ou em 2 dias avisa, e o aviso abre as Contas do mês', async () => {
    for (const k of [0, 1, 2]) {
      sendPushToUser.mockClear()
      await me(inDays(k))
      expect(billPushes().length).toBe(1)   // em k dias: 0, 1 e 2
      expect(billPushes()[0][1].url).toBe('/contas-do-mes')
    }
  })

  test('conta que vence daqui a 3 dias ainda não avisa', async () => {
    sendPushToUser.mockClear()
    await me(inDays(3))
    expect(billPushes()).toHaveLength(0)
  })

  test('com "Vencimento de contas" desligado, não avisa', async () => {
    sendPushToUser.mockClear()
    await me(inDays(1), { notifBudgetReminder: false })
    expect(billPushes()).toHaveLength(0)
  })
})

// ══════════════════════════════════════════════════════════
// FOTO DE PERFIL (tela "Dados pessoais", Nancy 2)
// ══════════════════════════════════════════════════════════
describe('Foto de perfil — /api/auth/avatar', () => {
  const jpegBytes = (n = 300) => {
    const b = Buffer.alloc(n, 0x41)
    b[0] = 0xFF; b[1] = 0xD8; b[2] = 0xFF; b[3] = 0xE0
    b[n - 2] = 0xFF; b[n - 1] = 0xD9
    return b
  }
  const PREFIX  = 'data:image/jpeg;base64,'
  const dataUrl = (buf, mime = 'image/jpeg') => `data:${mime};base64,${buf.toString('base64')}`
  const cookie  = () => `token=${makeToken('user-123')}`
  const put = (body, token = cookie()) => request(app).put('/api/auth/avatar').set('Cookie', token).send(body)
  const binary = (res, cb) => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))) }

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.user.update.mockResolvedValue({ id: 'user-123' })
  })

  describe('PUT', () => {
    test('salva um JPEG válido na tabela da foto, marca a data na linha do usuário e devolve só a data', async () => {
      const image = dataUrl(jpegBytes())
      const res = await put({ image })
      expect(res.status).toBe(200)
      expect(res.body.avatar).toBeUndefined()
      expect(new Date(res.body.avatarUpdatedAt).toString()).not.toBe('Invalid Date')
      expect(prisma.userAvatar.upsert).toHaveBeenCalledWith({ where: { userId: 'user-123' }, create: { userId: 'user-123', image }, update: { image } })
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-123' }, data: { avatarUpdatedAt: expect.any(Date) } }))
    })

    test('aceita o tamanho máximo (48 KB) — o corpo cabe no teto próprio da rota', async () => {
      expect((await put({ image: dataUrl(jpegBytes(48 * 1024)) })).status).toBe(200)
    })

    test('sem login: 401 e nada é gravado', async () => {
      const res = await request(app).put('/api/auth/avatar').send({ image: dataUrl(jpegBytes()) })
      expect(res.status).toBe(401)
      expect(prisma.userAvatar.upsert).not.toHaveBeenCalled()
    })

    test.each([
      ['sem o campo image', {}],
      ['image que não é texto', { image: 123 }],
      ['PNG', { image: `data:image/png;base64,${jpegBytes().toString('base64')}` }],
      ['SVG', { image: `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"/>').toString('base64')}` }],
      ['URL externa', { image: 'https://exemplo.com/foto.jpg' }],
      ['base64 com caracteres inválidos', { image: `${PREFIX}/9j/<script>alert(1)</script>` }],
      ['base64 vazio', { image: PREFIX }],
    ])('recusa %s com 400', async (_nome, body) => {
      expect((await put(body)).status).toBe(400)
      expect(prisma.userAvatar.upsert).not.toHaveBeenCalled()
    })

    test('recusa base64 fora do padrão: sobra de caractere, sem padding e bits sobrando', async () => {
      const b64 = jpegBytes(301).toString('base64')                    // termina em "xx=="
      expect(b64.endsWith('==')).toBe(true)
      const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
      const bitsSobrando = b64.slice(0, -3) + ALPHA[ALPHA.indexOf(b64.slice(-3, -2)) + 1] + '=='
      expect(Buffer.from(bitsSobrando, 'base64').equals(Buffer.from(b64, 'base64'))).toBe(true)   // decodifica igual, mas não é o canônico
      for (const ruim of [b64 + 'A', b64.replace(/=+$/, ''), bitsSobrando]) {
        expect((await put({ image: PREFIX + ruim })).status).toBe(400)
      }
      expect(prisma.userAvatar.upsert).not.toHaveBeenCalled()
    })

    test('recusa bytes que não são JPEG, JPEG cortado (sem FFD9) e arquivo minúsculo', async () => {
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47]), Buffer.alloc(300, 1), Buffer.from([0xFF, 0xD9])])
      expect((await put({ image: dataUrl(png) })).status).toBe(400)
      const cortado = jpegBytes(); cortado[cortado.length - 1] = 0x00
      expect((await put({ image: dataUrl(cortado) })).status).toBe(400)
      expect((await put({ image: dataUrl(Buffer.from([0xFF, 0xD8, 0xFF, 0xFF, 0xD9])) })).status).toBe(400)
      expect(prisma.userAvatar.upsert).not.toHaveBeenCalled()
    })

    test('recusa JPEG acima de 48 KB (400) e corpo gigante (413)', async () => {
      expect((await put({ image: dataUrl(jpegBytes(48 * 1024 + 3)) })).status).toBe(400)
      expect((await put({ image: dataUrl(jpegBytes(120 * 1024)) })).status).toBe(413)
      expect(prisma.userAvatar.upsert).not.toHaveBeenCalled()
    })

    test('o teto maior vale só para /avatar: o resto da API continua com 10 KB', async () => {
      const res = await request(app).put('/api/auth/profile').set('Cookie', cookie()).send({ name: 'A'.repeat(11 * 1024) })
      expect(res.status).toBe(413)
    })
  })

  describe('DELETE', () => {
    test('remove a foto e zera a data', async () => {
      const res = await request(app).delete('/api/auth/avatar').set('Cookie', cookie())
      expect(res.status).toBe(200)
      expect(res.body.avatarUpdatedAt).toBeNull()
      expect(prisma.userAvatar.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-123' } })
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-123' }, data: { avatarUpdatedAt: null } }))
    })
  })

  describe('GET', () => {
    const when = new Date('2026-10-22T15:00:00Z')

    test('devolve a própria foto como JPEG, com cabeçalhos de segurança e ETag da versão', async () => {
      const buf = jpegBytes(500)
      prisma.user.findUnique.mockResolvedValue(mockUser({ avatarUpdatedAt: when }))
      prisma.userAvatar.findUnique.mockResolvedValue({ image: dataUrl(buf) })
      const res = await request(app).get('/api/auth/avatar').set('Cookie', cookie()).buffer(true).parse(binary)
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe('image/jpeg')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
      expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox")
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin')
      expect(res.headers['cache-control']).toBe('private, no-cache')
      expect(res.headers.etag).toBe(`"av-${when.getTime()}"`)
      expect(res.body.equals(buf)).toBe(true)
      expect(prisma.userAvatar.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-123' } }))
    })

    test('com If-None-Match igual à versão: 304 e a imagem nem é lida do banco', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser({ avatarUpdatedAt: when }))
      const res = await request(app).get('/api/auth/avatar').set('Cookie', cookie()).set('If-None-Match', `"av-${when.getTime()}"`)
      expect(res.status).toBe(304)
      expect(prisma.userAvatar.findUnique).not.toHaveBeenCalled()
    })

    test('sem foto: 404', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser({ avatarUpdatedAt: null }))
      expect((await request(app).get('/api/auth/avatar').set('Cookie', cookie())).status).toBe(404)
    })

    test('linha da foto ausente ou com conteúdo que não é JPEG válido: 404 (nunca serve lixo)', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser({ avatarUpdatedAt: when }))
      prisma.userAvatar.findUnique.mockResolvedValue(null)
      expect((await request(app).get('/api/auth/avatar').set('Cookie', cookie())).status).toBe(404)
      prisma.userAvatar.findUnique.mockResolvedValue({ image: 'data:text/html;base64,PHNjcmlwdD4=' })
      expect((await request(app).get('/api/auth/avatar').set('Cookie', cookie())).status).toBe(404)
    })

    test('sem login: 401', async () => {
      expect((await request(app).get('/api/auth/avatar')).status).toBe(401)
    })
  })

  test('/me devolve a data da foto, nunca a imagem', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ avatarUpdatedAt: new Date('2026-10-22T15:00:00Z') }))
    const res = await request(app).get('/api/auth/me').set('Cookie', cookie())
    expect(res.status).toBe(200)
    expect(res.body.avatarUpdatedAt).toBe('2026-10-22T15:00:00.000Z')
    expect(res.body.avatar).toBeUndefined()
  })

  test('a exportação de dados (LGPD) inclui a foto', async () => {
    const image = dataUrl(jpegBytes())
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.userAvatar.findUnique.mockResolvedValue({ image })
    const res = await request(app).get('/api/auth/export-data').set('Cookie', cookie())
    expect(res.status).toBe(200)
    expect(res.body.profile.avatar).toBe(image)
  })
})

// ══════════════════════════════════════════════════════════
// EXPORTAÇÃO DE DADOS em CSV / PDF (tela "Meus dados") — mesmo conteúdo do JSON da LGPD
// ══════════════════════════════════════════════════════════
describe('GET /api/auth/export-data?format=csv|pdf', () => {
  const get = (q = '') => request(app).get(`/api/auth/export-data${q}`).set('Cookie', `token=${makeToken('user-123')}`)
    .buffer(true).parse((res, cb) => { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))) })
  const TX = (over = {}) => ({ id: 't1', description: 'Mercado', amount: 123.4, type: 'expense', category: 'food', date: new Date('2026-10-20T15:00:00Z'), archived: false, month: 10, year: 2026, ...over })

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ name: 'Ana', email: 'ana@x.com' }))
    prisma.transaction.findMany.mockResolvedValue([TX()])
    prisma.goal.findMany.mockResolvedValue([{ title: 'Viagem', targetAmount: 5000, currentAmount: 1250.5, deadline: new Date('2027-01-10T15:00:00Z'), createdAt: new Date('2026-05-01T15:00:00Z') }])
    prisma.budget.findMany.mockResolvedValue([{ name: 'Aluguel', amount: 1800, dueDay: 5, endDate: null }])
    prisma.installmentPlan.findMany.mockResolvedValue([{ name: 'Celular', amount: 250, paidInstallments: 3, totalInstallments: 12, startMonth: 8, startYear: 2026 }])
    prisma.categoryLimit.findMany.mockResolvedValue([{ category: 'food', amount: 900 }])
  })

  test('CSV: BOM, ";" e vírgula decimal, uma seção por tipo de dado, anexo .csv', async () => {
    const res = await get('?format=csv')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/^text\/csv/)
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="nancy-dados-\d{4}-\d{2}-\d{2}\.csv"$/)
    expect(res.headers['cache-control']).toMatch(/no-store/)
    const csv = res.body.toString('utf8')
    expect(csv.charCodeAt(0)).toBe(0xFEFF)
    const lines = csv.slice(1).split('\r\n')
    expect(lines).toContain('Transações')
    expect(lines).toContain('Data;Descrição;Categoria;Tipo;Valor (R$);Mês fechado')
    expect(lines).toContain('20/10/2026;Mercado;Alimentação;Gasto;123,40;Não')
    expect(lines).toContain('Viagem;5000,00;1250,50;10/01/2027;01/05/2026')
    expect(lines).toContain('Aluguel;1800,00;5;')
    expect(lines).toContain('Celular;250,00;3;12;08/2026')
    expect(lines).toContain('Alimentação;900,00')
    expect(lines).toContain('Conta;Ana;ana@x.com')
  })

  test('CSV: descrição com ; aspas e quebra de linha vira uma célula entre aspas, sem quebrar as colunas', async () => {
    prisma.transaction.findMany.mockResolvedValue([TX({ description: 'Bar "do Zé"; 2 chopes\nconta' })])
    const csv = (await get('?format=csv')).body.toString('utf8')
    expect(csv).toContain('20/10/2026;"Bar ""do Zé""; 2 chopes\nconta";Alimentação;Gasto;123,40;Não')
  })

  test('CSV: texto que começa com = + - @ ganha apóstrofo (não vira fórmula na planilha); números não', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      TX({ description: '=HYPERLINK("http://x.test","a")' }), TX({ id: 't2', description: '+55 11 9999' }),
      TX({ id: 't3', description: '-cmd' }), TX({ id: 't4', description: '@SOMA(A1)' }), TX({ id: 't5', description: 'normal', amount: -5 }),
    ])
    prisma.goal.findMany.mockResolvedValue([{ title: '=1+1', targetAmount: 10, currentAmount: 0, deadline: null, createdAt: new Date('2026-05-01T15:00:00Z') }])
    const lines = (await get('?format=csv')).body.toString('utf8').split('\r\n')
    expect(lines).toContain('20/10/2026;"\'=HYPERLINK(""http://x.test"",""a"")";Alimentação;Gasto;123,40;Não')
    expect(lines).toContain("20/10/2026;'+55 11 9999;Alimentação;Gasto;123,40;Não")
    expect(lines).toContain("20/10/2026;'-cmd;Alimentação;Gasto;123,40;Não")
    expect(lines).toContain("20/10/2026;'@SOMA(A1);Alimentação;Gasto;123,40;Não")
    expect(lines).toContain('20/10/2026;normal;Alimentação;Gasto;-5,00;Não')
    expect(lines).toContain("'=1+1;10,00;0,00;;01/05/2026")
  })

  test('CSV sem dados: cada seção avisa que não há nada registrado', async () => {
    prisma.transaction.findMany.mockResolvedValue([]); prisma.goal.findMany.mockResolvedValue([])
    prisma.budget.findMany.mockResolvedValue([]); prisma.installmentPlan.findMany.mockResolvedValue([]); prisma.categoryLimit.findMany.mockResolvedValue([])
    const lines = (await get('?format=csv')).body.toString('utf8').split('\r\n')
    expect(lines.filter(l => l === '(nada registrado)')).toHaveLength(5)
  })

  test('PDF: arquivo PDF de verdade, anexo .pdf, e a lista enorme não derruba a geração', async () => {
    prisma.transaction.findMany.mockResolvedValue(Array.from({ length: 2100 }, (_, i) => TX({ id: `t${i}`, description: `Compra ${i} 😀` })))
    const res = await get('?format=pdf')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toBe('application/pdf')
    expect(res.headers['content-disposition']).toMatch(/\.pdf"$/)
    expect(res.body.subarray(0, 5).toString()).toBe('%PDF-')
    expect(res.body.length).toBeGreaterThan(1000)
  })

  test('CSV e PDF não carregam a foto do perfil; JSON (padrão e explícito) continua completo com a foto', async () => {
    await get('?format=csv'); await get('?format=pdf')
    expect(prisma.userAvatar.findUnique).not.toHaveBeenCalled()
    prisma.userAvatar.findUnique.mockResolvedValue({ image: 'data:image/jpeg;base64,AAAA' })
    for (const q of ['', '?format=json']) {
      const res = await request(app).get(`/api/auth/export-data${q}`).set('Cookie', `token=${makeToken('user-123')}`)
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toMatch(/^application\/json/)
      expect(res.body.profile.avatar).toBe('data:image/jpeg;base64,AAAA')
      expect(res.body.transactions).toHaveLength(1)
    }
  })

  test('formato desconhecido ou repetido é recusado antes de buscar qualquer dado', async () => {
    for (const q of ['?format=xml', '?format=', '?format=csv&format=pdf', '?format[a]=1', '?format=CSV']) {
      const res = await request(app).get(`/api/auth/export-data${q}`).set('Cookie', `token=${makeToken('user-123')}`)
      expect(res.status).toBe(400)
    }
    expect(prisma.transaction.findMany).not.toHaveBeenCalled()
  })

  test('sem login: 401; usuário que não existe mais: 404', async () => {
    expect((await request(app).get('/api/auth/export-data?format=csv')).status).toBe(401)
    prisma.user.findUnique.mockResolvedValueOnce(mockUser()).mockResolvedValueOnce(null)
    expect((await get('?format=csv')).status).toBe(404)
  })
})

// ══════════════════════════════════════════════════════════
// TROCA DE E-MAIL (login) — 2 passos: pedir (com senha) + confirmar (token
// enviado pro e-mail NOVO). Regressão do bug onde PUT /profile recebia
// `email` do frontend mas nunca aplicava (só lia name/reportEmail do body).
// ══════════════════════════════════════════════════════════
describe('POST /api/auth/change-email', () => {
  test('senha correta e e-mail novo válido: marca pendingEmail e envia verificação pro e-mail NOVO', async () => {
    const user = mockUser()
    prisma.user.findUnique
      .mockResolvedValueOnce(user)  // authMiddleware (checa tokenVersion)
      .mockResolvedValueOnce(user)  // rota: busca o próprio usuário
      .mockResolvedValueOnce(null)  // checagem de e-mail já em uso: livre
    prisma.user.update.mockResolvedValue({ ...user, pendingEmail: 'novo@example.com' })

    const res = await request(app)
      .post('/api/auth/change-email')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ newEmail: 'novo@example.com', password: 'Password123' })

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      data: expect.objectContaining({ pendingEmail: 'novo@example.com' }),
    })
    const emailService = require('../src/services/emailService')
    expect(emailService.sendEmailChangeVerification).toHaveBeenCalledWith(
      'novo@example.com', user.name, expect.stringContaining('/confirmar-troca-email?token=')
    )
    // O alerta de segurança é só no e-mail ANTIGO, na confirmação — não aqui.
    expect(emailService.sendEmailChangeAlert).not.toHaveBeenCalled()
  })

  test('senha errada retorna 401 e não envia nada', async () => {
    const user = mockUser()
    prisma.user.findUnique.mockResolvedValue(user)

    const res = await request(app)
      .post('/api/auth/change-email')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ newEmail: 'novo@example.com', password: 'WrongPassword1' })

    expect(res.status).toBe(401)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  test('e-mail inválido retorna 400', async () => {
    const res = await request(app)
      .post('/api/auth/change-email')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ newEmail: 'não-é-email', password: 'Password123' })

    expect(res.status).toBe(400)
  })

  test('mesmo e-mail atual retorna 400', async () => {
    const user = mockUser({ email: 'test@example.com' })
    prisma.user.findUnique.mockResolvedValue(user)

    const res = await request(app)
      .post('/api/auth/change-email')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ newEmail: 'test@example.com', password: 'Password123' })

    expect(res.status).toBe(400)
  })

  test('e-mail novo já usado por outra conta retorna 400', async () => {
    const user = mockUser()
    prisma.user.findUnique
      .mockResolvedValueOnce(user)                       // authMiddleware
      .mockResolvedValueOnce(user)                       // rota: busca o próprio usuário
      .mockResolvedValueOnce({ id: 'outro-usuario' })     // e-mail já em uso

    const res = await request(app)
      .post('/api/auth/change-email')
      .set('Cookie', `token=${makeToken('user-123')}`)
      .send({ newEmail: 'jatem@example.com', password: 'Password123' })

    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app)
      .post('/api/auth/change-email')
      .send({ newEmail: 'novo@example.com', password: 'Password123' })

    expect(res.status).toBe(401)
  })
})

describe('POST /api/auth/confirm-email-change', () => {
  test('token válido: aplica o e-mail novo, invalida sessões antigas e avisa o e-mail ANTIGO', async () => {
    const crypto = require('crypto')
    const token  = 'valid-email-change-token'
    const hash   = crypto.createHash('sha256').update(token).digest('hex')
    const user   = mockUser({
      email:              'antigo@example.com',
      pendingEmail:       'novo@example.com',
      pendingEmailToken:  hash,
      pendingEmailExpiry: new Date(Date.now() + 3600_000),
    })
    prisma.user.findFirst.mockResolvedValue(user)
    prisma.user.update.mockResolvedValue({ ...user, email: 'novo@example.com' })

    const res = await request(app)
      .post('/api/auth/confirm-email-change')
      .send({ token })

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: expect.objectContaining({
        email:              'novo@example.com',
        emailVerified:      true,
        pendingEmail:       null,
        pendingEmailToken:  null,
        pendingEmailExpiry: null,
        tokenVersion:       { increment: 1 },
      }),
    })
    const emailService = require('../src/services/emailService')
    expect(emailService.sendEmailChangeAlert).toHaveBeenCalledWith('antigo@example.com', user.name, 'novo@example.com')
  })

  test('token inválido ou expirado retorna 400, sem aplicar nada', async () => {
    prisma.user.findFirst.mockResolvedValue(null)

    const res = await request(app)
      .post('/api/auth/confirm-email-change')
      .send({ token: 'token-que-nao-existe' })

    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  test('sem token no body retorna 400', async () => {
    const res = await request(app)
      .post('/api/auth/confirm-email-change')
      .send({})

    expect(res.status).toBe(400)
  })

  // Regressão: dois usuários pedem o mesmo e-mail novo, um confirma primeiro —
  // o segundo não pode virar um 500 cru, precisa de uma mensagem clara.
  test('corrida rara (e-mail já usado por outra conta na confirmação) retorna 409, não 500', async () => {
    const crypto = require('crypto')
    const token  = 'valid-email-change-token'
    const hash   = crypto.createHash('sha256').update(token).digest('hex')
    const user   = mockUser({
      pendingEmail:       'ja-tomado@example.com',
      pendingEmailToken:  hash,
      pendingEmailExpiry: new Date(Date.now() + 3600_000),
    })
    prisma.user.findFirst.mockResolvedValue(user)
    const p2002 = new Error('Unique constraint failed')
    p2002.code  = 'P2002'
    prisma.user.update.mockRejectedValue(p2002)

    const res = await request(app)
      .post('/api/auth/confirm-email-change')
      .send({ token })

    expect(res.status).toBe(409)
  })
})

// ══════════════════════════════════════════════════════════
// VERIFICAÇÃO DE E-MAIL POR CÓDIGO (6 dígitos) — caminho alternativo ao
// link acima pro mesmo evento. Cobertura do link já existe no describe
// 'POST /api/auth/verify-email' (bloco de cima).
// ══════════════════════════════════════════════════════════
describe('POST /api/auth/verify-email-code', () => {
  const authCookie = () => `token=${makeToken('user-123')}`

  test('sem sessão → 401', async () => {
    const res = await request(app).post('/api/auth/verify-email-code').send({ code: '123456' })
    expect(res.status).toBe(401)
  })

  test('formato inválido (não são 6 dígitos) → 400', async () => {
    const res = await request(app)
      .post('/api/auth/verify-email-code')
      .set('Cookie', authCookie())
      .send({ code: '12345' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/inválido/i)
  })

  test('e-mail já verificado → 400', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ emailVerified: true }))
    const res = await request(app)
      .post('/api/auth/verify-email-code')
      .set('Cookie', authCookie())
      .send({ code: '123456' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/já verificado/i)
  })

  test('sem código ativo → 400 código expirado', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({
      emailVerified: false, emailVerifyCode: null, emailVerifyCodeExpiry: null,
    }))
    const res = await request(app)
      .post('/api/auth/verify-email-code')
      .set('Cookie', authCookie())
      .send({ code: '123456' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/expirado/i)
  })

  test('código expirado (expiry no passado) → 400', async () => {
    const crypto = require('crypto')
    prisma.user.findUnique.mockResolvedValue(mockUser({
      emailVerified: false,
      emailVerifyCode: crypto.createHash('sha256').update('123456').digest('hex'),
      emailVerifyCodeExpiry: new Date(Date.now() - 1000),
      emailVerifyCodeAttempts: 0,
    }))
    const res = await request(app)
      .post('/api/auth/verify-email-code')
      .set('Cookie', authCookie())
      .send({ code: '123456' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/expirado/i)
  })

  // Reserva a tentativa de forma atômica (updateMany condicionado) ANTES de
  // comparar o código — achado de auditoria de segurança, 2026-10-21: a
  // versão original lia emailVerifyCodeAttempts solto e só incrementava
  // depois de decidir comparar, então requisições concorrentes liam o
  // mesmo contador defasado e todas passavam do teto antes de qualquer
  // escrita aterrissar. Essa suíte cobre a versão corrigida.
  test('teto de tentativas já estourado → 429 sem nem tentar verificar o código', async () => {
    const crypto = require('crypto')
    prisma.user.findUnique.mockResolvedValue(mockUser({
      emailVerified: false,
      emailVerifyCode: crypto.createHash('sha256').update('123456').digest('hex'),
      emailVerifyCodeExpiry: new Date(Date.now() + 10 * 60 * 1000),
    }))
    // where: { emailVerifyCodeAttempts: { lt: MAX } } não acha a linha — já no teto
    prisma.user.updateMany.mockResolvedValue({ count: 0 })

    const res = await request(app)
      .post('/api/auth/verify-email-code')
      .set('Cookie', authCookie())
      .send({ code: '123456' }) // mesmo o código certo não passa — limite já estourado

    expect(res.status).toBe(429)
    // Só a reserva de tentativa foi chamada — nunca chegou no updateMany de
    // verificação (que teria emailVerifyCode no where).
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1)
  })

  test('código incorreto (abaixo do limite) → 400 e reserva/consome uma tentativa', async () => {
    const crypto = require('crypto')
    prisma.user.findUnique.mockResolvedValue(mockUser({
      emailVerified: false,
      emailVerifyCode: crypto.createHash('sha256').update('999999').digest('hex'),
      emailVerifyCodeExpiry: new Date(Date.now() + 10 * 60 * 1000),
    }))
    prisma.user.updateMany.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .post('/api/auth/verify-email-code')
      .set('Cookie', authCookie())
      .send({ code: '111111' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/incorreto/i)
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-123', emailVerifyCodeAttempts: { lt: 5 } },
      data:  { emailVerifyCodeAttempts: { increment: 1 } },
    })
  })

  // A 5ª tentativa errada ainda reserva normalmente (4 < 5) e responde
  // "incorreto" — só a PRÓXIMA requisição (6ª) encontra o teto já estourado
  // e vira 429. Diferente da versão antiga, que tentava detectar "acabei de
  // estourar" dentro da mesma requisição; a nova versão não precisa disso
  // porque o próprio where da reserva já barra pra sempre a partir daqui.
  test('5ª tentativa errada (última dentro do limite) ainda responde "incorreto", não 429', async () => {
    const crypto = require('crypto')
    prisma.user.findUnique.mockResolvedValue(mockUser({
      emailVerified: false,
      emailVerifyCode: crypto.createHash('sha256').update('999999').digest('hex'),
      emailVerifyCodeExpiry: new Date(Date.now() + 10 * 60 * 1000),
    }))
    prisma.user.updateMany.mockResolvedValue({ count: 1 }) // where lt:5 ainda bate (attempts era 4)

    const res = await request(app)
      .post('/api/auth/verify-email-code')
      .set('Cookie', authCookie())
      .send({ code: '111111' })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/incorreto/i)
  })

  test('código correto → 200, verifica e limpa token/código/tentativas', async () => {
    const crypto = require('crypto')
    const hash   = crypto.createHash('sha256').update('123456').digest('hex')
    prisma.user.findUnique.mockResolvedValue(mockUser({
      emailVerified: false, referredBy: null,
      emailVerifyCode: hash,
      emailVerifyCodeExpiry: new Date(Date.now() + 10 * 60 * 1000),
      emailVerifyCodeAttempts: 1,
    }))
    prisma.user.updateMany.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .post('/api/auth/verify-email-code')
      .set('Cookie', authCookie())
      .send({ code: '123456' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-123', emailVerifyCode: hash },
      data:  {
        emailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null,
        emailVerifyCode: null, emailVerifyCodeExpiry: null, emailVerifyCodeAttempts: 0,
      },
    })
  })

  test('código correto mas corrida na verificação final (updateMany conta 0) → 400, não 200', async () => {
    const crypto = require('crypto')
    const hash   = crypto.createHash('sha256').update('123456').digest('hex')
    prisma.user.findUnique.mockResolvedValue(mockUser({
      emailVerified: false,
      emailVerifyCode: hash,
      emailVerifyCodeExpiry: new Date(Date.now() + 10 * 60 * 1000),
    }))
    // 1ª chamada (reserva de tentativa) passa normalmente; 2ª (verificação
    // final, condicionada ao emailVerifyCode) perde a corrida.
    prisma.user.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    const res = await request(app)
      .post('/api/auth/verify-email-code')
      .set('Cookie', authCookie())
      .send({ code: '123456' })

    expect(res.status).toBe(400)
  })
})

describe('POST /api/auth/resend-verification', () => {
  test('sem sessão → 401', async () => {
    const res = await request(app).post('/api/auth/resend-verification')
    expect(res.status).toBe(401)
  })

  test('e-mail já verificado → 400', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ emailVerified: true }))
    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Cookie', `token=${makeToken('user-123')}`)

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/já verificado/i)
  })

  test('sucesso: regenera link e código juntos, zera tentativas', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ emailVerified: false }))

    const res = await request(app)
      .post('/api/auth/resend-verification')
      .set('Cookie', `token=${makeToken('user-123')}`)

    expect(res.status).toBe(200)
    const updateArgs = prisma.user.update.mock.calls[0][0]
    expect(updateArgs.data.emailVerifyToken).toMatch(/^[a-f0-9]{64}$/)
    expect(updateArgs.data.emailVerifyCode).toMatch(/^[a-f0-9]{64}$/)
    expect(updateArgs.data.emailVerifyCodeAttempts).toBe(0)

    const emailService = require('../src/services/emailService')
    const call = emailService.sendVerificationEmail.mock.calls.at(-1)
    expect(call[3]).toMatch(/^\d{6}$/) // código de 6 dígitos em texto puro só no e-mail
  })
})
