'use strict'
const request = require('supertest')
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
const app = require('../src/server')
const { safeNext } = require('../src/middleware/stagingGate')

// Portão da homologação: só age com STAGING_GATE_KEY definida; produção/CI/desenvolvimento não definem, então nada muda lá.
const KEY  = 'chave-de-teste-do-portao-1234'
const GATE = 'Acesso restrito à homologação.'
const HTML = { Accept: 'text/html' }
const cookieOf = (res) => (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('staging_gate='))

describe('portão da homologação DESLIGADO (sem STAGING_GATE_KEY)', () => {
  beforeEach(() => { delete process.env.STAGING_GATE_KEY })

  it('não interfere em nada: /health responde, rotas da API respondem com a resposta do app, /__gate não existe', async () => {
    expect((await request(app).get('/health')).status).toBe(200)
    const me = await request(app).get('/api/auth/me')
    expect(me.status).toBe(401)
    expect(me.body.error).not.toBe(GATE)
    expect((await request(app).post('/__gate').type('form').send({ password: KEY })).status).toBe(404)
  })
})

describe('portão da homologação LIGADO', () => {
  beforeEach(() => { process.env.STAGING_GATE_KEY = KEY })
  afterAll(() => { delete process.env.STAGING_GATE_KEY })

  it('quem abre o site sem senha vê a tela de senha (HTML, 401, sem cache) e a API responde 401 em JSON', async () => {
    const page = await request(app).get('/').set(HTML)
    expect(page.status).toBe(401)
    expect(page.headers['content-type']).toMatch(/html/)
    expect(page.headers['cache-control']).toMatch(/no-store/)
    expect(page.text).toMatch(/name="password"/)
    const api = await request(app).get('/api/transactions')
    expect(api.status).toBe(401)
    expect(api.body.error).toBe(GATE)
  })

  it('rotas com segredo próprio ficam abertas ao portão (health, cron, seed, webhook): a resposta é a do app, não a do portão', async () => {
    expect((await request(app).get('/health')).status).toBe(200)
    for (const [method, url] of [['post', '/api/cron/weekly-digest'], ['post', '/api/admin/seed-staging'], ['post', '/api/payments/webhook']]) {
      const res = await request(app)[method](url).send({})
      expect(res.body.error).not.toBe(GATE)
    }
  })

  it('o cabeçalho x-staging-key certo passa; errado ou vazio não', async () => {
    const ok = await request(app).get('/api/auth/me').set('x-staging-key', KEY)
    expect(ok.body.error).not.toBe(GATE)
    expect((await request(app).get('/api/auth/me').set('x-staging-key', KEY + 'x')).body.error).toBe(GATE)
    expect((await request(app).get('/api/auth/me').set('x-staging-key', 'chute')).body.error).toBe(GATE)
  })

  it('senha errada: 401, volta a tela com o aviso e NÃO entrega cookie', async () => {
    const res = await request(app).post('/__gate').type('form').send({ password: 'errada', next: '/' })
    expect(res.status).toBe(401)
    expect(res.text).toMatch(/Senha incorreta/)
    expect(cookieOf(res)).toBeUndefined()
  })

  it('senha certa: 303 para o destino, cookie HttpOnly + SameSite=Lax de 30 dias, e o cookie abre as rotas', async () => {
    const res = await request(app).post('/__gate').type('form').send({ password: KEY, next: '/extrato?mes=11' })
    expect(res.status).toBe(303)
    expect(res.headers.location).toBe('/extrato?mes=11')
    const raw = res.headers['set-cookie'].find((c) => c.startsWith('staging_gate='))
    expect(raw).toMatch(/HttpOnly/i)
    expect(raw).toMatch(/SameSite=Lax/i)
    expect(raw).toMatch(/Max-Age=2592000/)
    const ck = cookieOf(res)
    expect((await request(app).get('/api/auth/me').set('Cookie', ck)).body.error).not.toBe(GATE)
    // cookie adulterado não vale
    expect((await request(app).get('/api/auth/me').set('Cookie', ck.slice(0, -2) + '00')).body.error).toBe(GATE)
    expect((await request(app).get('/api/auth/me').set('Cookie', 'staging_gate=qualquer')).body.error).toBe(GATE)
  })

  it('o destino pós-login só pode ser caminho do próprio site (sem redirecionamento aberto)', async () => {
    for (const bad of ['//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)', '']) {
      const res = await request(app).post('/__gate').type('form').send({ password: KEY, next: bad })
      expect(res.status).toBe(303)
      expect(res.headers.location).toBe('/')
    }
    expect(safeNext('/planos')).toBe('/planos')
    expect(safeNext(undefined)).toBe('/')
  })

  it('o endereço pedido não vira HTML cru na tela de senha (sem XSS)', async () => {
    const res = await request(app).get('/"><script>alert(1)</script>').set(HTML)
    expect(res.status).toBe(401)
    expect(res.text).not.toMatch(/<script>alert\(1\)<\/script>/)
  })
})
