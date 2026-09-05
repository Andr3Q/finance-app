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

// Secret e helper usados nos testes gerais do webhook (sem secret = 503 é o comportamento correto)
const OUTER_WEBHOOK_SECRET = 'test-webhook-secret'
const OUTER_REQ_ID         = 'req-outer-001'

function signedWebhookPost(id = 'pay_123', body = null) {
  const ts  = String(Date.now())
  const sig = mpSignature(OUTER_WEBHOOK_SECRET, id, OUTER_REQ_ID, ts)
  return request(app)
    .post('/api/payments/webhook')
    .set('x-signature', sig)
    .set('x-request-id', OUTER_REQ_ID)
    .send(body ?? { type: 'payment', data: { id } })
}

beforeEach(() => {
  process.env.MP_ACCESS_TOKEN   = 'test-mp-token'
  process.env.MP_WEBHOOK_SECRET = OUTER_WEBHOOK_SECRET
  sendPlanActivationEmail.mockClear()
})

afterEach(() => {
  delete process.env.MP_ACCESS_TOKEN
  delete process.env.MP_WEBHOOK_SECRET
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
    prisma.user.findUnique
      .mockResolvedValueOnce({ tokenVersion: 0 })  // auth middleware
      .mockResolvedValueOnce(null)                   // route handler
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
    transaction_amount: 9.90,  // preço exato de pro|monthly — requerido pela validação de preço
  }

  function webhookBody(id = 'pay_123') {
    return { type: 'payment', data: { id } }
  }

  function mockPaymentGet(data = VALID_PAYMENT) {
    const mockGet = jest.fn().mockResolvedValue(data)
    Payment.mockImplementation(() => ({ get: mockGet }))
    return mockGet
  }

  function mockTransaction(userResult = { email: 'user@test.com', name: 'Test User', planExpiresAt: new Date(Date.now() + 31 * 24 * 3600 * 1000) }) {
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        processedPayment: { create: jest.fn().mockResolvedValue({}) },
        user: {
          // 1ª chamada: leitura do planExpiresAt "base" antes do claim.
          // 2ª chamada: leitura final (email/nome) depois do claim ganhar a corrida.
          findUnique: jest.fn()
            .mockResolvedValueOnce({ planExpiresAt: null })
            .mockResolvedValueOnce(userResult),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      })
    )
    return userResult
  }

  test('responde 200 imediatamente (antes de processar)', async () => {
    mockPaymentGet()
    mockTransaction()
    const res = await signedWebhookPost()
    expect(res.status).toBe(200)
  })

  test('executa prisma.$transaction para pagamento aprovado', async () => {
    mockPaymentGet()
    mockTransaction()

    await signedWebhookPost()
    await flushAsync()

    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  test('envia e-mail de ativação após aprovação', async () => {
    mockPaymentGet()
    const user = mockTransaction()

    await signedWebhookPost()
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
          findUnique: jest.fn().mockResolvedValue({ planExpiresAt: null }),
          updateMany: jest.fn().mockImplementation(({ data }) => {
            capturedData = data
            return Promise.resolve({ count: 1 })
          }),
        },
      })
    )

    await signedWebhookPost()
    await flushAsync()

    expect(capturedData.plan).toBe('pro')
    expect(capturedData.planPeriod).toBe('monthly')
    expect(capturedData.trialEndsAt).toBeNull()
    const diff = Math.abs(capturedData.planExpiresAt - new Date(Date.now() + 31 * 24 * 3600 * 1000))
    expect(diff).toBeLessThan(5000)
  })

  test('planExpiresAt = ~366 dias para plano anual', async () => {
    mockPaymentGet({ ...VALID_PAYMENT, external_reference: `${USER_ID}|elite|annual`, transaction_amount: 334.80 })
    let capturedData = null
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        processedPayment: { create: jest.fn().mockResolvedValue({}) },
        user: {
          findUnique: jest.fn().mockResolvedValue({ planExpiresAt: null }),
          updateMany: jest.fn().mockImplementation(({ data }) => {
            capturedData = data
            return Promise.resolve({ count: 1 })
          }),
        },
      })
    )

    await signedWebhookPost()
    await flushAsync()

    const diff = Math.abs(capturedData.planExpiresAt - new Date(Date.now() + 366 * 24 * 3600 * 1000))
    expect(diff).toBeLessThan(5000)
    expect(capturedData.plan).toBe('elite')
  })

  // Regressão: dois pagamentos concorrentes do mesmo usuário (upgrade seguido de
  // renovação quase simultânea) não podem fazer um "sumir" — o segundo precisa
  // recomputar a partir do valor fresco (pós-commit do primeiro) e tentar de novo,
  // em vez de sobrescrever com um valor calculado a partir de uma leitura obsoleta.
  test('retry do lock otimista credita corretamente quando a 1ª tentativa perde a corrida', async () => {
    mockPaymentGet()
    const freshExpiry = new Date(Date.now() + 5 * 24 * 3600 * 1000) // valor pós-commit do outro pagamento concorrente
    const finalUser   = { email: 'user@test.com', name: 'Test User', planExpiresAt: new Date(Date.now() + 36 * 24 * 3600 * 1000) }
    let updateManyCalls = 0

    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        processedPayment: { create: jest.fn().mockResolvedValue({}) },
        user: {
          findUnique: jest.fn()
            .mockResolvedValueOnce({ planExpiresAt: null })        // 1ª leitura — base que vai perder a corrida
            .mockResolvedValueOnce({ planExpiresAt: freshExpiry }) // 2ª leitura (retry) — valor fresco
            .mockResolvedValueOnce(finalUser),                     // leitura final pro e-mail
          updateMany: jest.fn().mockImplementation(() => {
            updateManyCalls++
            return Promise.resolve({ count: updateManyCalls === 1 ? 0 : 1 })
          }),
        },
      })
    )

    const res = await signedWebhookPost()
    await flushAsync()

    expect(res.status).toBe(200)
    expect(updateManyCalls).toBe(2) // 1ª tentativa (count:0) + retry que ganhou (count:1) — pagamento não foi perdido
    expect(sendPlanActivationEmail).toHaveBeenCalledWith(finalUser.email, finalUser.name, 'pro', finalUser.planExpiresAt)
  })

  test('ignora quando payment.status != approved', async () => {
    mockPaymentGet({ ...VALID_PAYMENT, status: 'pending' })

    await signedWebhookPost()
    await flushAsync()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  test('ignora quando external_reference está ausente', async () => {
    mockPaymentGet({ ...VALID_PAYMENT, external_reference: null })

    await signedWebhookPost()
    await flushAsync()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  test('ignora quando external_reference tem formato inválido', async () => {
    mockPaymentGet({ ...VALID_PAYMENT, external_reference: 'invalido' })

    await signedWebhookPost()
    await flushAsync()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  test('ignora quando plano no external_reference é inválido', async () => {
    mockPaymentGet({ ...VALID_PAYMENT, external_reference: `${USER_ID}|vip|monthly` })

    await signedWebhookPost()
    await flushAsync()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  test('ignora quando type != payment', async () => {
    mockPaymentGet()

    await signedWebhookPost('pay_123', { type: 'topic', data: { id: 'pay_123' } })
    await flushAsync()

    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  test('Payment.get() falha 1x (transitória) e recupera na tentativa seguinte — pagamento processado mesmo assim', async () => {
    const mockGet = jest.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(VALID_PAYMENT)
    Payment.mockImplementation(() => ({ get: mockGet }))
    mockTransaction()

    await signedWebhookPost()
    // Backoff do withMpRetry é 1s antes da 2ª tentativa — espera passar disso.
    await new Promise(r => setTimeout(r, 1500))

    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  }, 10000)

  test('Payment.get() falha em todas as tentativas — não processa, mas não derruba o processo (sem retry infinito)', async () => {
    const mockGet = jest.fn().mockRejectedValue(new Error('MP fora do ar'))
    Payment.mockImplementation(() => ({ get: mockGet }))
    mockTransaction()

    const res = await signedWebhookPost()
    // Backoff do withMpRetry: 1s + 2s entre as 3 tentativas.
    await new Promise(r => setTimeout(r, 3500))

    expect(res.status).toBe(200) // já respondeu 200 ao MP antes de processar
    expect(mockGet).toHaveBeenCalledTimes(3) // 1 tentativa + 2 retries, não mais
    expect(prisma.$transaction).not.toHaveBeenCalled()
  }, 10000)

  test('trata webhook duplicado (P2002) silenciosamente — não envia email', async () => {
    mockPaymentGet()
    const dup = Object.assign(new Error('Unique constraint violated'), { code: 'P2002' })
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        processedPayment: { create: jest.fn().mockRejectedValue(dup) },
        user: { findUnique: jest.fn(), updateMany: jest.fn() },
      })
    )

    const res = await signedWebhookPost()
    await flushAsync()

    expect(res.status).toBe(200)
    expect(sendPlanActivationEmail).not.toHaveBeenCalled()
  })

  test('503 quando MP_WEBHOOK_SECRET não está configurado', async () => {
    delete process.env.MP_WEBHOOK_SECRET
    const res = await request(app).post(ENDPOINT).send(webhookBody())
    expect(res.status).toBe(503)
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
