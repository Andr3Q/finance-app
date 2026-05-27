'use strict'
const request = require('supertest')
const jwt     = require('jsonwebtoken')
const crypto  = require('crypto')

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

jest.mock('mercadopago', () => ({
  MercadoPagoConfig: jest.fn().mockImplementation(() => ({})),
  Preference: jest.fn(),
  Payment:    jest.fn(),
}))

const { Preference, Payment } = require('mercadopago')
const prisma                  = require('./__mocks__/prisma')
const { sendPlanActivationEmail } = require('../src/services/emailService')
const app = require('../src/server')

const JWT_SECRET = process.env.JWT_SECRET
const USER_ID    = '550e8400-e29b-41d4-a716-446655440000' // UUID v4 válido
const makeToken  = (id = USER_ID) => jwt.sign({ userId: id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })

// Gera assinatura HMAC válida para o webhook do Mercado Pago
function mpSignature(secret, dataId, requestId, ts) {
  const template = `id:${dataId};request-id:${requestId};ts:${ts};`
  const v1 = crypto.createHmac('sha256', secret).update(template).digest('hex')
  return `ts=${ts},v1=${v1}`
}

// Aguarda resolução de promises pendentes (background tasks pós-webhook)
const flushAsync = () => new Promise(resolve => setTimeout(resolve, 80))

beforeEach(() => {
  process.env.MP_ACCESS_TOKEN = 'test-mp-token'
  delete process.env.MP_WEBHOOK_SECRET
  sendPlanActivationEmail.mockClear()
})

afterEach(() => {
  delete process.env.MP_ACCESS_TOKEN
})

// ─────────────────────────────────────────────────────────────────
// POST /api/payments/create-preference
// ─────────────────────────────────────────────────────────────────
describe('POST /api/payments/create-preference', () => {
  const ENDPOINT = '/api/payments/create-preference'

  test('401 sem token JWT', async () => {
    const res = await request(app).post(ENDPOINT).send({ plan: 'pro', period: 'monthly' })
    expect(res.status).toBe(401)
  })

  test('503 quando MP_ACCESS_TOKEN não está configurado', async () => {
    delete process.env.MP_ACCESS_TOKEN
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'pro', period: 'monthly' })
    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/não configurad/i)
  })

  test('400 para plano inválido', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'vip', period: 'monthly' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Plano inválido.')
  })

  test('400 para período inválido', async () => {
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'pro', period: 'semanal' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Período inválido.')
  })

  test('404 quando usuário não existe no banco', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'pro', period: 'monthly' })
    expect(res.status).toBe(404)
  })

  test('retorna checkoutUrl para Pro Mensal (R$9,90)', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'user@test.com', name: 'Test User' })
    const mockCreate = jest.fn().mockResolvedValue({
      init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=abc123',
    })
    Preference.mockImplementation(() => ({ create: mockCreate }))

    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'pro', period: 'monthly' })

    expect(res.status).toBe(200)
    expect(res.body.checkoutUrl).toContain('mercadopago.com.br')

    const body = mockCreate.mock.calls[0][0].body
    expect(body.items[0].unit_price).toBe(9.90)
    expect(body.items[0].currency_id).toBe('BRL')
    expect(body.external_reference).toBe(`${USER_ID}|pro|monthly`)
    expect(body.payer.email).toBe('user@test.com')
  })

  test('retorna checkoutUrl para Elite Anual (R$334,80)', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'user@test.com', name: 'Test User' })
    const mockCreate = jest.fn().mockResolvedValue({
      init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=elite99',
    })
    Preference.mockImplementation(() => ({ create: mockCreate }))

    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'elite', period: 'annual' })

    expect(res.status).toBe(200)
    const body = mockCreate.mock.calls[0][0].body
    expect(body.items[0].unit_price).toBe(334.80)
    expect(body.external_reference).toBe(`${USER_ID}|elite|annual`)
  })

  test('back_urls e notification_url apontam para rotas corretas', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'u@t.com', name: 'U' })
    const mockCreate = jest.fn().mockResolvedValue({ init_point: 'https://www.mercadopago.com.br/1' })
    Preference.mockImplementation(() => ({ create: mockCreate }))

    await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'pro', period: 'monthly' })

    const { back_urls, notification_url } = mockCreate.mock.calls[0][0].body
    expect(back_urls.success).toContain('/planos?payment=success')
    expect(back_urls.failure).toContain('/planos?payment=failure')
    expect(back_urls.pending).toContain('/planos?payment=pending')
    expect(notification_url).toContain('/api/payments/webhook')
  })

  test('500 quando o Mercado Pago lança erro', async () => {
    prisma.user.findUnique.mockResolvedValue({ email: 'u@t.com', name: 'U' })
    Preference.mockImplementation(() => ({ create: jest.fn().mockRejectedValue(new Error('MP timeout')) }))

    const res = await request(app)
      .post(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ plan: 'pro', period: 'monthly' })

    expect(res.status).toBe(500)
  })
})

// ─────────────────────────────────────────────────────────────────
// POST /api/payments/webhook
// ─────────────────────────────────────────────────────────────────
describe('POST /api/payments/webhook', () => {
  const ENDPOINT = '/api/payments/webhook'

  const VALID_PAYMENT = {
    id: 'pay_123',
    status: 'approved',
    external_reference: `${USER_ID}|pro|monthly`,
  }

  function webhookBody(id = 'pay_123') {
    return { type: 'payment', data: { id } }
  }

  function mockPaymentGet(data = VALID_PAYMENT) {
    const mockGet = jest.fn().mockResolvedValue(data)
    Payment.mockImplementation(() => ({ get: mockGet }))
    return mockGet
  }

  function mockTransaction(userResult = { email: 'user@test.com', name: 'Test User' }) {
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        processedPayment: { create: jest.fn().mockResolvedValue({}) },
        user: { update: jest.fn().mockResolvedValue(userResult) },
      })
    )
    return userResult
  }

  test('responde 200 imediatamente (antes de processar)', async () => {
    mockPaymentGet()
    mockTransaction()
    const res = await request(app).post(ENDPOINT).send(webhookBody())
    expect(res.status).toBe(200)
  })

  test('executa prisma.$transaction para pagamento aprovado', async () => {
    mockPaymentGet()
    mockTransaction()

    await request(app).post(ENDPOINT).send(webhookBody())
    await flushAsync()

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  test('envia e-mail de ativação após aprovação', async () => {
    mockPaymentGet()
    const user = mockTransaction()

    await request(app).post(ENDPOINT).send(webhookBody())
    await flushAsync()

    expect(sendPlanActivationEmail).toHaveBeenCalledWith(
      user.email, user.name, 'pro', expect.any(Date)
    )
  })

  test('planExpiresAt = ~31 dias para plano mensal', async () => {
    mockPaymentGet()
    let capturedData = null
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        processedPayment: { create: jest.fn().mockResolvedValue({}) },
        user: {
          update: jest.fn().mockImplementation(({ data }) => {
            capturedData = data
            return Promise.resolve({ email: 'u@t.com', name: 'U' })
          }),
        },
      })
    )

    await request(app).post(ENDPOINT).send(webhookBody())
    await flushAsync()

    expect(capturedData.plan).toBe('pro')
    expect(capturedData.planPeriod).toBe('monthly')
    expect(capturedData.trialEndsAt).toBeNull()
    const diff = Math.abs(capturedData.planExpiresAt - new Date(Date.now() + 31 * 24 * 3600 * 1000))
    expect(diff).toBeLessThan(5000)
  })

  test('planExpiresAt = ~366 dias para plano anual', async () => {
    mockPaymentGet({ ...VALID_PAYMENT, external_reference: `${USER_ID}|elite|annual` })
    let capturedData = null
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        processedPayment: { create: jest.fn().mockResolvedValue({}) },
        user: {
          update: jest.fn().mockImplementation(({ data }) => {
            capturedData = data
            return Promise.resolve({ email: 'u@t.com', name: 'U' })
          }),
        },
      })
    )

    await request(app).post(ENDPOINT).send(webhookBody())
    await flushAsync()

    const diff = Math.abs(capturedData.planExpiresAt - new Date(Date.now() + 366 * 24 * 3600 * 1000))
    expect(diff).toBeLessThan(5000)
    expect(capturedData.plan).toBe('elite')
  })

  test('ignora quando payment.status != approved', async () => {
    mockPaymentGet({ ...VALID_PAYMENT, status: 'pending' })

    await request(app).post(ENDPOINT).send(webhookBody())
    await flushAsync()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  test('ignora quando external_reference está ausente', async () => {
    mockPaymentGet({ ...VALID_PAYMENT, external_reference: null })

    await request(app).post(ENDPOINT).send(webhookBody())
    await flushAsync()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  test('ignora quando external_reference tem formato inválido', async () => {
    mockPaymentGet({ ...VALID_PAYMENT, external_reference: 'invalido' })

    await request(app).post(ENDPOINT).send(webhookBody())
    await flushAsync()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  test('ignora quando plano no external_reference é inválido', async () => {
    mockPaymentGet({ ...VALID_PAYMENT, external_reference: `${USER_ID}|vip|monthly` })

    await request(app).post(ENDPOINT).send(webhookBody())
    await flushAsync()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  test('ignora quando type != payment', async () => {
    mockPaymentGet()

    await request(app).post(ENDPOINT).send({ type: 'topic', data: { id: 'pay_123' } })
    await flushAsync()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  test('trata webhook duplicado (P2002) silenciosamente — não envia email', async () => {
    mockPaymentGet()
    const dup = Object.assign(new Error('Unique constraint violated'), { code: 'P2002' })
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        processedPayment: { create: jest.fn().mockRejectedValue(dup) },
        user: { update: jest.fn() },
      })
    )

    const res = await request(app).post(ENDPOINT).send(webhookBody())
    await flushAsync()

    expect(res.status).toBe(200)
    expect(sendPlanActivationEmail).not.toHaveBeenCalled()
  })

  // ── Validação de assinatura HMAC ──────────────────────
  describe('HMAC signature (MP_WEBHOOK_SECRET configurado)', () => {
    const SECRET     = 'webhook-secret-test'
    const DATA_ID    = 'pay_456'
    const REQUEST_ID = 'req-xyz-789'
    const TS         = String(Date.now())

    beforeEach(() => {
      process.env.MP_WEBHOOK_SECRET = SECRET
      mockPaymentGet({ ...VALID_PAYMENT, id: DATA_ID })
      mockTransaction()
    })

    test('aceita webhook com assinatura válida e processa', async () => {
      const sig = mpSignature(SECRET, DATA_ID, REQUEST_ID, TS)
      await request(app)
        .post(ENDPOINT)
        .set('x-signature', sig)
        .set('x-request-id', REQUEST_ID)
        .send({ type: 'payment', data: { id: DATA_ID } })
      await flushAsync()

      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    })

    test('rejeita assinatura inválida — retorna 200 mas não processa', async () => {
      await request(app)
        .post(ENDPOINT)
        .set('x-signature', `ts=${TS},v1=000000000000000000000000000000000000000000000000000000000000dead`)
        .set('x-request-id', REQUEST_ID)
        .send({ type: 'payment', data: { id: DATA_ID } })
      await flushAsync()

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    test('rejeita quando falta cabeçalho x-signature', async () => {
      await request(app)
        .post(ENDPOINT)
        .set('x-request-id', REQUEST_ID)
        .send({ type: 'payment', data: { id: DATA_ID } })
      await flushAsync()

      expect(prisma.$transaction).not.toHaveBeenCalled()
    })
  })
})

// ─────────────────────────────────────────────────────────────────
// GET /api/payments/history
// ─────────────────────────────────────────────────────────────────
describe('GET /api/payments/history', () => {
  const ENDPOINT = '/api/payments/history'

  test('401 sem token JWT', async () => {
    const res = await request(app).get(ENDPOINT)
    expect(res.status).toBe(401)
  })

  test('retorna array vazio quando não há pagamentos', async () => {
    prisma.processedPayment.findMany.mockResolvedValue([])
    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  test('retorna lista de pagamentos do usuário', async () => {
    const payments = [
      { paymentId: 'p1', plan: 'pro',   period: 'monthly', processedAt: new Date('2026-01-01') },
      { paymentId: 'p2', plan: 'elite', period: 'annual',  processedAt: new Date('2025-06-01') },
    ]
    prisma.processedPayment.findMany.mockResolvedValue(payments)

    const res = await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0]).toMatchObject({ paymentId: 'p1', plan: 'pro', period: 'monthly' })
    expect(res.body[1]).toMatchObject({ paymentId: 'p2', plan: 'elite', period: 'annual' })
  })

  test('filtra por userId do token (não expõe dados de outros usuários)', async () => {
    prisma.processedPayment.findMany.mockResolvedValue([])
    await request(app)
      .get(ENDPOINT)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(prisma.processedPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where:   { userId: USER_ID },
        take:    20,
        orderBy: { processedAt: 'desc' },
      })
    )
  })
})
