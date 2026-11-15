'use strict'

// Rotas de compra pela Google Play (routes/billing.js) + as travas nas rotas do site (cancelar plano e pagar pelo Mercado Pago).
// Prisma, cliente do Google e verificação do Pub/Sub mockados; a regra de plano (entitlement) é a de verdade.
const request = require('supertest')
const jwt     = require('jsonwebtoken')
const bcrypt  = require('bcryptjs')

jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))

jest.mock('../src/services/emailService', () => {
  const fn = () => jest.fn().mockResolvedValue(true)
  return {
    sendEmail: fn(), sendWelcomeEmail: fn(), sendVerificationEmail: fn(), sendResetEmail: fn(), sendRenewalReminderEmail: fn(),
    sendTrialExpiryEmail: fn(), sendReferralRewardEmail: fn(), sendWeeklyDigest: fn(), sendPlanExpiredEmail: fn(),
    sendMonthlyReport: fn(), sendPlanActivationEmail: fn(),
  }
})

jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn().mockImplementation(() => ({})),
  Preference: jest.fn(),
  Payment:    jest.fn(),
}))

jest.mock('../src/services/storeBilling/googlePlayClient', () => ({
  isConfigured:    jest.fn(),
  getSubscription: jest.fn(),
  acknowledge:     jest.fn(),
  GoogleApiError:  class GoogleApiError extends Error { constructor(m, s) { super(m); this.status = s } },
}))
jest.mock('../src/services/storeBilling/pubsubAuth', () => ({ verifyPubSubPush: jest.fn() }))

const google = require('../src/services/storeBilling/googlePlayClient')
const { verifyPubSubPush } = require('../src/services/storeBilling/pubsubAuth')
const { Preference } = require('mercadopago')
const prisma = require('./__mocks__/prisma')
const app    = require('../src/server')

const USER_ID  = '550e8400-e29b-41d4-a716-446655440000'
const TOKEN    = 'purchase-token-abcdefghijklmnop123'
const authHdr  = () => `Bearer ${jwt.sign({ userId: USER_ID }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })}`
const DAY      = 24 * 60 * 60 * 1000
const inDays   = (n) => new Date(Date.now() + n * DAY)

// SubscriptionPurchaseV2 do Google
const sub = (over = {}) => ({
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
  lineItems: [{ productId: 'nancy_pro_mensal', expiryTime: inDays(30).toISOString(), autoRenewingPlan: { autoRenewEnabled: true } }],
  ...over,
})
const apiError = (status) => Object.assign(new Error(`HTTP ${status}`), { name: 'GoogleApiError', status })

// O mesmo prisma.user.findUnique atende o middleware de login e as regras de plano: separa pelo "select".
let userRow
function mockUser(over = {}) {
  userRow = { plan: 'free', planExpiresAt: null, planSource: null, ...over }
  prisma.user.findUnique.mockImplementation(async (args) => (args?.select?.tokenVersion ? { tokenVersion: 0, plan: 'free', planExpiresAt: null, trialEndsAt: null } : userRow))
}

beforeEach(() => {
  jest.clearAllMocks()
  google.isConfigured.mockReturnValue(true)
  google.getSubscription.mockResolvedValue(sub())
  google.acknowledge.mockResolvedValue({})
  verifyPubSubPush.mockResolvedValue({ ok: true })
  prisma.storePurchase.findUnique.mockReset().mockResolvedValue(null)
  prisma.storePurchase.upsert.mockReset().mockResolvedValue({})
  prisma.storePurchase.update.mockReset().mockResolvedValue({})
  prisma.user.update.mockReset().mockResolvedValue({})
  mockUser()
})

describe('GET /api/billing/config', () => {
  it('exige login', async () => {
    expect((await request(app).get('/api/billing/config')).status).toBe(401)
  })

  it('desligado: informa que não está disponível e não lista produtos', async () => {
    google.isConfigured.mockReturnValue(false)
    const res = await request(app).get('/api/billing/config').set('Authorization', authHdr())
    expect(res.status).toBe(200)
    expect(res.body.googlePlay).toMatchObject({ enabled: false, products: [] })
  })

  it('ligado: lista os 4 produtos e o pacote do app', async () => {
    const res = await request(app).get('/api/billing/config').set('Authorization', authHdr())
    expect(res.body.googlePlay).toMatchObject({ enabled: true, packageName: 'br.com.myfinancepro.app' })
    expect(res.body.googlePlay.products).toHaveLength(4)
  })
})

describe('POST /api/billing/google/verify', () => {
  const post = (body) => request(app).post('/api/billing/google/verify').set('Authorization', authHdr()).send(body)

  it('exige login', async () => {
    expect((await request(app).post('/api/billing/google/verify').send({ purchaseToken: TOKEN })).status).toBe(401)
  })

  it('desligado (sem a chave do Google): 503 e nenhuma chamada ao Google', async () => {
    google.isConfigured.mockReturnValue(false)
    const res = await post({ purchaseToken: TOKEN })
    expect(res.status).toBe(503)
    expect(google.getSubscription).not.toHaveBeenCalled()
  })

  it.each([
    ['sem token', {}], ['token curto', { purchaseToken: 'curto' }], ['token com caracteres estranhos', { purchaseToken: 'a'.repeat(25) + '/../x' }],
    ['token que não é texto', { purchaseToken: 12345678901234567890 }], ['token enorme', { purchaseToken: 'a'.repeat(1001) }],
    ['produto inventado', { purchaseToken: TOKEN, productId: 'nancy_gratis' }], ['produto herdado do Object', { purchaseToken: TOKEN, productId: 'constructor' }],
  ])('400 para %s (e nada vai ao Google)', async (_n, body) => {
    expect((await post(body)).status).toBe(400)
    expect(google.getSubscription).not.toHaveBeenCalled()
  })

  it('compra válida: confere com o Google, CONFIRMA a compra, grava e ativa o plano', async () => {
    const res = await post({ purchaseToken: TOKEN, productId: 'nancy_pro_mensal' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ applied: true, plan: 'pro', state: 'active' })
    expect(new Date(res.body.planExpiresAt).getTime()).toBeGreaterThan(Date.now() + 29 * DAY)

    expect(google.getSubscription).toHaveBeenCalledWith(TOKEN)
    expect(google.acknowledge).toHaveBeenCalledWith('nancy_pro_mensal', TOKEN)
    expect(prisma.storePurchase.upsert.mock.calls[0][0].create).toMatchObject({ userId: USER_ID, purchaseToken: TOKEN, acknowledged: true, state: 'active' })
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: USER_ID }, data: expect.objectContaining({ plan: 'pro', planPeriod: 'monthly', planSource: 'google_play', trialEndsAt: null }) }))
  })

  it('o que o app diz do produto não vale: o plano vem do que o GOOGLE informa', async () => {
    const res = await post({ purchaseToken: TOKEN, productId: 'nancy_elite_mensal' }) // o Google diz nancy_pro_mensal
    expect(res.status).toBe(200)
    expect(res.body.plan).toBe('pro')
  })

  it('compra já confirmada antes não é confirmada de novo', async () => {
    google.getSubscription.mockResolvedValue(sub({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }))
    expect((await post({ purchaseToken: TOKEN })).status).toBe(200)
    expect(google.acknowledge).not.toHaveBeenCalled()
  })

  it('pagamento ainda pendente (sem acesso): não confirma e não libera plano', async () => {
    google.getSubscription.mockResolvedValue(sub({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }))
    const res = await post({ purchaseToken: TOKEN })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ applied: false, state: 'pending' })
    expect(google.acknowledge).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('o mesmo dono pode reenviar o token (reabrir o app) sem erro', async () => {
    prisma.storePurchase.findUnique.mockResolvedValue({ id: 'p1', userId: USER_ID })
    expect((await post({ purchaseToken: TOKEN })).status).toBe(200)
  })

  it('token já ligado a OUTRA conta: 409 e nada é consultado nem alterado', async () => {
    prisma.storePurchase.findUnique.mockResolvedValue({ id: 'p1', userId: 'outra-conta' })
    const res = await post({ purchaseToken: TOKEN })
    expect(res.status).toBe(409)
    expect(google.getSubscription).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it.each([[404, 400], [400, 400], [410, 400], [500, 502], [403, 502], [0, 502]])('Google responde %s: o cliente recebe %s', async (googleStatus, esperado) => {
    google.getSubscription.mockRejectedValue(apiError(googleStatus))
    const res = await post({ purchaseToken: TOKEN })
    expect(res.status).toBe(esperado)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('produto que o Nancy não vende: 422', async () => {
    google.getSubscription.mockResolvedValue(sub({ lineItems: [{ productId: 'outro_app', expiryTime: inDays(30).toISOString() }] }))
    expect((await post({ purchaseToken: TOKEN })).status).toBe(422)
  })

  it('falha ao confirmar a compra: 502 para o app tentar de novo e guarda como NÃO confirmada, mas o plano JÁ vale (a pessoa pagou)', async () => {
    google.acknowledge.mockRejectedValue(apiError(500))
    const res = await post({ purchaseToken: TOKEN })
    expect(res.status).toBe(502)
    expect(prisma.storePurchase.upsert.mock.calls[0][0].create.acknowledged).toBe(false)
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ plan: 'pro', planSource: 'google_play' }) }))
  })

  it('tentar de novo depois da falha confirma a compra e termina certo (idempotente)', async () => {
    google.acknowledge.mockRejectedValueOnce(apiError(500)).mockResolvedValueOnce({})
    expect((await post({ purchaseToken: TOKEN })).status).toBe(502)
    prisma.storePurchase.findUnique.mockResolvedValue({ id: 'p1', userId: USER_ID })
    const again = await post({ purchaseToken: TOKEN })
    expect(again.status).toBe(200)
    expect(google.acknowledge).toHaveBeenCalledTimes(2)
    expect(prisma.storePurchase.upsert.mock.calls[1][0].create.acknowledged).toBe(true)
  })

  it('conta com plano ativo pelo SITE: não sobrescreve e avisa (409)', async () => {
    mockUser({ plan: 'elite', planExpiresAt: inDays(10), planSource: 'mercadopago' })
    const res = await post({ purchaseToken: TOKEN })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('other_source_active')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})

describe('POST /api/billing/google/rtdn', () => {
  const note = (n) => ({ message: { data: Buffer.from(JSON.stringify({ packageName: 'br.com.myfinancepro.app', eventTimeMillis: '1', ...n })).toString('base64'), messageId: '1' }, subscription: 's' })
  const post = (body) => request(app).post('/api/billing/google/rtdn').send(body)
  const renewal = { subscriptionNotification: { version: '1.0', notificationType: 2, purchaseToken: TOKEN, subscriptionId: 'nancy_pro_mensal' } }

  it('credencial do Pub/Sub inválida: devolve o status da verificação e não faz nada', async () => {
    verifyPubSubPush.mockResolvedValue({ ok: false, status: 401, reason: 'Credencial inválida.' })
    const res = await post(note(renewal))
    expect(res.status).toBe(401)
    expect(prisma.storePurchase.findUnique).not.toHaveBeenCalled()
    expect(google.getSubscription).not.toHaveBeenCalled()
  })

  it('sem configuração de verificação: 503 (Pub/Sub tenta de novo depois)', async () => {
    verifyPubSubPush.mockResolvedValue({ ok: false, status: 503, reason: 'Avisos do Google Play não configurados.' })
    expect((await post(note(renewal))).status).toBe(503)
  })

  it.each([['sem mensagem', {}], ['sem data', { message: {} }], ['data que não é JSON', { message: { data: Buffer.from('nao e json').toString('base64') } }], ['JSON que não é objeto', { message: { data: Buffer.from('123').toString('base64') } }]])('400 para %s', async (_n, body) => {
    expect((await post(body)).status).toBe(400)
  })

  it('aviso de teste do Play Console e aviso de outro app: 200 sem tocar em nada', async () => {
    expect((await post(note({ testNotification: { version: '1.0' } }))).status).toBe(200)
    expect((await post(note({ ...renewal, packageName: 'com.outro.app' }))).status).toBe(200)
    expect((await post(note({ oneTimeProductNotification: { purchaseToken: TOKEN } }))).status).toBe(200)
    expect(google.getSubscription).not.toHaveBeenCalled()
  })

  it('compra que ainda não tem dono (o app não chamou /verify): 200, sem consultar o Google', async () => {
    expect((await post(note(renewal))).status).toBe(200)
    expect(google.getSubscription).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('renovação: consulta o estado ATUAL no Google (não confia no aviso) e empurra a validade do dono da compra', async () => {
    prisma.storePurchase.findUnique.mockResolvedValue({ id: 'p1', userId: USER_ID })
    mockUser({ plan: 'pro', planExpiresAt: inDays(1), planSource: 'google_play' })
    const res = await post(note(renewal))
    expect(res.status).toBe(200)
    expect(google.getSubscription).toHaveBeenCalledWith(TOKEN)
    const data = prisma.user.update.mock.calls[0][0].data
    expect(data.planSource).toBe('google_play')
    expect(data.planExpiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY)
  })

  it('assinatura suspensa/vencida: a validade para de andar', async () => {
    prisma.storePurchase.findUnique.mockResolvedValue({ id: 'p1', userId: USER_ID })
    mockUser({ plan: 'pro', planExpiresAt: inDays(1), planSource: 'google_play' })
    google.getSubscription.mockResolvedValue(sub({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', lineItems: [{ productId: 'nancy_pro_mensal', expiryTime: inDays(-1).toISOString() }] }))
    expect((await post(note({ subscriptionNotification: { ...renewal.subscriptionNotification, notificationType: 13 } }))).status).toBe(200)
    expect(prisma.user.update.mock.calls[0][0].data.planExpiresAt.getTime()).toBeLessThan(Date.now())
  })

  it('reembolso (assinatura): marca a compra como revogada e encerra o acesso agora', async () => {
    prisma.storePurchase.findUnique.mockResolvedValue({ id: 'p1', userId: USER_ID })
    mockUser({ plan: 'pro', planExpiresAt: inDays(20), planSource: 'google_play' })
    const res = await post(note({ voidedPurchaseNotification: { purchaseToken: TOKEN, orderId: 'GPA.1', productType: 1, refundType: 1 } }))
    expect(res.status).toBe(200)
    expect(prisma.storePurchase.update).toHaveBeenCalledWith({ where: { id: 'p1', userId: USER_ID }, data: { state: 'revoked', autoRenewing: false } })
    expect(prisma.user.update.mock.calls[0][0].data.planExpiresAt.getTime()).toBeLessThanOrEqual(Date.now())
    expect(google.getSubscription).not.toHaveBeenCalled()
  })

  it('reembolso de compra avulsa (productType 2) é ignorado', async () => {
    const res = await post(note({ voidedPurchaseNotification: { purchaseToken: TOKEN, orderId: 'GPA.2', productType: 2 } }))
    expect(res.status).toBe(200)
    expect(prisma.storePurchase.update).not.toHaveBeenCalled()
  })

  it('Google fora do ar (5xx ou rede): 500 para o Pub/Sub reenviar; erro 4xx do Google não melhora com reenvio: 200', async () => {
    prisma.storePurchase.findUnique.mockResolvedValue({ id: 'p1', userId: USER_ID })
    google.getSubscription.mockRejectedValue(apiError(503))
    expect((await post(note(renewal))).status).toBe(500)
    google.getSubscription.mockRejectedValue(apiError(0))
    expect((await post(note(renewal))).status).toBe(500)
    google.getSubscription.mockRejectedValue(apiError(404))
    expect((await post(note(renewal))).status).toBe(200)
  })
})

describe('travas nas rotas do site para quem assina pela Play', () => {
  it('cancelar plano (downgrade) de assinatura da Play: 409 explicando onde cancelar, sem mexer no plano', async () => {
    const hash = bcrypt.hashSync('Senha123', 4)
    userRow = { password: hash, planExpiresAt: inDays(20), trialEndsAt: null, planSource: 'google_play' }
    prisma.user.findUnique.mockImplementation(async (args) => (args?.select?.tokenVersion ? { tokenVersion: 0, plan: 'pro', planExpiresAt: inDays(20), trialEndsAt: null } : userRow))
    const res = await request(app).post('/api/auth/downgrade').set('Authorization', authHdr()).send({ password: 'Senha123' })
    expect(res.status).toBe(409)
    expect(res.body.code).toBe('cancel_in_play_store')
    expect(res.body.error).toContain('Play Store')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('downgrade de plano do SITE segue igual (a trava só vale para a Play)', async () => {
    const hash = bcrypt.hashSync('Senha123', 4)
    userRow = { password: hash, planExpiresAt: inDays(20), trialEndsAt: null, planSource: 'mercadopago' }
    prisma.user.findUnique.mockImplementation(async (args) => (args?.select?.tokenVersion ? { tokenVersion: 0, plan: 'pro', planExpiresAt: inDays(20), trialEndsAt: null } : userRow))
    const res = await request(app).post('/api/auth/downgrade').set('Authorization', authHdr()).send({ password: 'Senha123' })
    expect(res.status).toBe(200)
    expect(res.body.scheduledAt).toBeDefined()
  })

  it('pagar pelo Mercado Pago quem já assina pela Play: 409 (duas cobranças pelo mesmo plano) e nenhum checkout criado', async () => {
    process.env.MP_ACCESS_TOKEN = 'test-mp-token'
    try {
      userRow = { email: 'a@b.com', name: 'Ana', planSource: 'google_play', planExpiresAt: inDays(10) }
      prisma.user.findUnique.mockImplementation(async (args) => (args?.select?.tokenVersion ? { tokenVersion: 0, plan: 'pro', planExpiresAt: inDays(10), trialEndsAt: null } : userRow))
      const res = await request(app).post('/api/payments/create-preference').set('Authorization', authHdr()).send({ plan: 'elite', period: 'monthly' })
      expect(res.status).toBe(409)
      expect(res.body.code).toBe('already_subscribed_play')
      expect(Preference).not.toHaveBeenCalled()
    } finally { delete process.env.MP_ACCESS_TOKEN }
  })
})
