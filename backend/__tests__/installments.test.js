'use strict'
const request = require('supertest')
const jwt     = require('jsonwebtoken')

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

const prisma = require('./__mocks__/prisma')
const app    = require('../src/server')

const JWT_SECRET = process.env.JWT_SECRET
const USER_ID    = '550e8400-e29b-41d4-a716-446655440000'
const PLAN_ID    = '660e8400-e29b-41d4-a716-446655440001'
const makeToken  = (id = USER_ID) => jwt.sign({ userId: id }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' })

const mockPlan = (overrides = {}) => ({
  id:                PLAN_ID,
  name:              'iPhone 15',
  amount:            3299.90,
  totalInstallments: 12,
  paidInstallments:  0,
  startMonth:        5,
  startYear:         2026,
  lastTransactionId: null,
  userId:            USER_ID,
  createdAt:         new Date('2026-05-01'),
  ...overrides,
})

beforeEach(() => {
  // Defaults específicos para installmentPlan (não cobertos pelo setDefaults global)
  prisma.installmentPlan.findMany.mockResolvedValue([])
  prisma.installmentPlan.findFirst.mockResolvedValue(null)
  prisma.installmentPlan.create.mockResolvedValue(null)
  prisma.installmentPlan.update.mockResolvedValue(null)
  prisma.installmentPlan.deleteMany.mockResolvedValue({ count: 0 })
})

// ─────────────────────────────────────────────────────────────────
// GET /api/installments
// ─────────────────────────────────────────────────────────────────
describe('GET /api/installments', () => {
  test('401 sem token JWT', async () => {
    const res = await request(app).get('/api/installments')
    expect(res.status).toBe(401)
  })

  test('retorna array vazio quando não há parcelamentos', async () => {
    const res = await request(app)
      .get('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  test('retorna lista de parcelamentos do usuário', async () => {
    prisma.installmentPlan.findMany.mockResolvedValue([
      mockPlan(),
      mockPlan({ id: '770e8400-e29b-41d4-a716-446655440002', name: 'Notebook Dell', amount: 5999, totalInstallments: 24 }),
    ])
    const res = await request(app)
      .get('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body[0].name).toBe('iPhone 15')
    expect(res.body[1].name).toBe('Notebook Dell')
  })

  test('filtra por userId do token', async () => {
    prisma.installmentPlan.findMany.mockResolvedValue([])
    await request(app).get('/api/installments').set('Authorization', `Bearer ${makeToken()}`)
    expect(prisma.installmentPlan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } })
    )
  })
})

// ─────────────────────────────────────────────────────────────────
// POST /api/installments
// ─────────────────────────────────────────────────────────────────
describe('POST /api/installments', () => {
  beforeEach(() => {
    // Usuário Pro por default — testes que esperam 400/401 falham antes da checagem de plano
    prisma.user.findUnique.mockResolvedValue({ plan: 'pro' })
    prisma.installmentPlan.count.mockResolvedValue(0)
  })

  test('401 sem token JWT', async () => {
    const res = await request(app).post('/api/installments').send({ name: 'iPhone', amount: 300, totalInstallments: 12 })
    expect(res.status).toBe(401)
  })

  test('403 quando plano é free', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'free' })
    const res = await request(app)
      .post('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'iPhone', amount: 300, totalInstallments: 12 })
    expect(res.status).toBe(403)
    expect(res.body.limitReached).toBe(true)
  })

  test('400 quando limite de 50 parcelamentos é atingido', async () => {
    prisma.installmentPlan.count.mockResolvedValue(50)
    const res = await request(app)
      .post('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'iPhone', amount: 300, totalInstallments: 12 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/limite/i)
  })

  test('cria parcelamento com dados válidos — retorna 201', async () => {
    prisma.installmentPlan.create.mockResolvedValue(mockPlan())
    const res = await request(app)
      .post('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'iPhone 15', amount: 3299.90, totalInstallments: 12 })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('iPhone 15')
    expect(res.body.totalInstallments).toBe(12)
    expect(res.body.paidInstallments).toBe(0)
  })

  test('armazena startMonth e startYear do mês corrente (Brasília)', async () => {
    prisma.installmentPlan.create.mockResolvedValue(mockPlan())
    await request(app)
      .post('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'iPhone 15', amount: 3299.90, totalInstallments: 12 })
    const data = prisma.installmentPlan.create.mock.calls[0][0].data
    expect(data.startMonth).toBeGreaterThanOrEqual(1)
    expect(data.startMonth).toBeLessThanOrEqual(12)
    expect(data.startYear).toBeGreaterThan(2020)
    expect(data.paidInstallments).toBe(0)
  })

  test('aceita amount como string com vírgula decimal', async () => {
    prisma.installmentPlan.create.mockResolvedValue(mockPlan({ amount: 199.90 }))
    const res = await request(app)
      .post('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Fone Bluetooth', amount: '199,90', totalInstallments: 6 })
    expect(res.status).toBe(201)
  })

  // ── Validações de campo ──────────────────────────────

  test('400 quando name está ausente', async () => {
    const res = await request(app)
      .post('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ amount: 300, totalInstallments: 12 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/obrigatório/i)
  })

  test('400 quando name tem menos de 2 caracteres', async () => {
    const res = await request(app)
      .post('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'X', amount: 300, totalInstallments: 12 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/2 e 100/i)
  })

  test('400 quando amount é zero (falsy → obrigatórios)', async () => {
    const res = await request(app)
      .post('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'iPhone', amount: 0, totalInstallments: 12 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/obrigatórios/i)
  })

  test('400 quando amount é negativo', async () => {
    const res = await request(app)
      .post('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'iPhone', amount: -100, totalInstallments: 12 })
    expect(res.status).toBe(400)
  })

  test('400 quando totalInstallments é 1 (mínimo é 2)', async () => {
    const res = await request(app)
      .post('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'iPhone', amount: 300, totalInstallments: 1 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/2 e 360/i)
  })

  test('400 quando totalInstallments é 361 (máximo é 360)', async () => {
    const res = await request(app)
      .post('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'iPhone', amount: 300, totalInstallments: 361 })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/2 e 360/i)
  })

  test('aceita totalInstallments = 360 (valor máximo)', async () => {
    prisma.installmentPlan.create.mockResolvedValue(mockPlan({ totalInstallments: 360 }))
    const res = await request(app)
      .post('/api/installments')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({ name: 'Financiamento imóvel', amount: 1500, totalInstallments: 360 })
    expect(res.status).toBe(201)
  })
})

// ─────────────────────────────────────────────────────────────────
// PATCH /api/installments/:id/pay
// ─────────────────────────────────────────────────────────────────
describe('PATCH /api/installments/:id/pay', () => {
  test('401 sem token', async () => {
    const res = await request(app).patch(`/api/installments/${PLAN_ID}/pay`)
    expect(res.status).toBe(401)
  })

  test('400 para ID inválido (não-UUID)', async () => {
    const res = await request(app)
      .patch('/api/installments/nao-eh-uuid/pay')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('ID inválido.')
  })

  test('404 quando parcelamento não existe ou não pertence ao usuário', async () => {
    const res = await request(app)
      .patch(`/api/installments/${PLAN_ID}/pay`)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/não encontrado/i)
  })

  test('400 quando todas as parcelas já foram pagas', async () => {
    prisma.installmentPlan.findFirst.mockResolvedValue(
      mockPlan({ paidInstallments: 12, totalInstallments: 12 })
    )
    const res = await request(app)
      .patch(`/api/installments/${PLAN_ID}/pay`)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/já foram pagas/i)
  })

  test('cria transação do tipo expense/shopping e incrementa paidInstallments', async () => {
    const plan       = mockPlan({ paidInstallments: 2, totalInstallments: 12 })
    const createdTx  = { id: 'tx-uuid', description: 'iPhone 15 (parcela 3/12)', amount: 3299.90, type: 'expense', category: 'shopping' }
    const updatedPlan = { ...plan, paidInstallments: 3, lastTransactionId: 'tx-uuid' }

    prisma.installmentPlan.findFirst.mockResolvedValue(plan)
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        transaction:     { create: jest.fn().mockResolvedValue(createdTx) },
        installmentPlan: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update:     jest.fn().mockResolvedValue(updatedPlan),
        },
      })
    )

    const res = await request(app)
      .patch(`/api/installments/${PLAN_ID}/pay`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.plan.paidInstallments).toBe(3)
    expect(res.body.transaction.type).toBe('expense')
    expect(res.body.transaction.category).toBe('shopping')
  })

  // Regressão: duas requisições concorrentes (duplo clique, retry de rede) não
  // podem ambas criar uma transação de despesa pra mesma parcela — o claim
  // atômico (updateMany condicional) precisa barrar a segunda ANTES da criação.
  test('409 quando a parcela já foi paga por uma requisição concorrente (claim falha)', async () => {
    const plan = mockPlan({ paidInstallments: 2, totalInstallments: 12 })
    const createTx = jest.fn()

    prisma.installmentPlan.findFirst.mockResolvedValue(plan)
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        transaction:     { create: createTx },
        installmentPlan: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }), // outra requisição já ganhou a corrida
          update:     jest.fn(),
        },
      })
    )

    const res = await request(app)
      .patch(`/api/installments/${PLAN_ID}/pay`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/já foi paga/i)
    // A garantia central da correção: nenhuma transação de despesa duplicada é criada
    expect(createTx).not.toHaveBeenCalled()
  })

  test('descrição da transação segue o formato "Nome (parcela N/Total)"', async () => {
    const plan = mockPlan({ name: 'Celular Samsung A52', paidInstallments: 0, totalInstallments: 6 })
    let capturedData = null
    const createdTx  = { id: 'tx-1', description: 'Celular Samsung A52 (parcela 1/6)', amount: plan.amount }
    const updatedPlan = { ...plan, paidInstallments: 1, lastTransactionId: 'tx-1' }

    prisma.installmentPlan.findFirst.mockResolvedValue(plan)
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        transaction: {
          create: jest.fn().mockImplementation(({ data }) => {
            capturedData = data
            return Promise.resolve(createdTx)
          }),
        },
        installmentPlan: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update:     jest.fn().mockResolvedValue(updatedPlan),
        },
      })
    )

    await request(app)
      .patch(`/api/installments/${PLAN_ID}/pay`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(capturedData.description).toBe('Celular Samsung A52 (parcela 1/6)')
    expect(capturedData.type).toBe('expense')
    expect(capturedData.category).toBe('shopping')
    expect(capturedData.amount).toBe(plan.amount)
  })

  test('usa prisma.$transaction — se criar transação falhar, plano não é atualizado', async () => {
    prisma.installmentPlan.findFirst.mockResolvedValue(mockPlan({ paidInstallments: 1 }))
    prisma.$transaction.mockImplementation(async (fn) =>
      fn({
        transaction:     { create: jest.fn().mockRejectedValue(new Error('DB error')) },
        installmentPlan: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          update:     jest.fn(),
        },
      })
    )

    const res = await request(app)
      .patch(`/api/installments/${PLAN_ID}/pay`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(500)
  })
})

// ─────────────────────────────────────────────────────────────────
// PATCH /api/installments/:id/unpay
// ─────────────────────────────────────────────────────────────────
describe('PATCH /api/installments/:id/unpay', () => {
  test('401 sem token', async () => {
    const res = await request(app).patch(`/api/installments/${PLAN_ID}/unpay`)
    expect(res.status).toBe(401)
  })

  test('400 para ID inválido', async () => {
    const res = await request(app)
      .patch('/api/installments/nao-uuid/unpay')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(400)
  })

  test('404 quando parcelamento não existe', async () => {
    const res = await request(app)
      .patch(`/api/installments/${PLAN_ID}/unpay`)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(404)
  })

  test('400 quando paidInstallments já é 0', async () => {
    prisma.installmentPlan.findFirst.mockResolvedValue(mockPlan({ paidInstallments: 0 }))
    const res = await request(app)
      .patch(`/api/installments/${PLAN_ID}/unpay`)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/nenhuma parcela paga/i)
  })

  test('decrementa paidInstallments e zera lastTransactionId', async () => {
    const plan        = mockPlan({ paidInstallments: 3, lastTransactionId: 'tx-abc' })
    const updatedPlan = { ...plan, paidInstallments: 2, lastTransactionId: null }
    prisma.installmentPlan.findFirst.mockResolvedValue(plan)
    prisma.$transaction.mockResolvedValue([updatedPlan])

    const res = await request(app)
      .patch(`/api/installments/${PLAN_ID}/unpay`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res.status).toBe(200)
    expect(res.body.paidInstallments).toBe(2)
    expect(res.body.lastTransactionId).toBeNull()
  })

  test('inclui deleteMany quando encontra a transação correspondente à parcela atual', async () => {
    const plan = mockPlan({ paidInstallments: 1, lastTransactionId: 'tx-to-delete' })
    prisma.installmentPlan.findFirst.mockResolvedValue(plan)
    // A busca agora é por descrição determinística, não mais pelo lastTransactionId
    prisma.transaction.findFirst.mockResolvedValueOnce({ id: 'tx-to-delete', description: 'iPhone 15 (parcela 1/12)' })
    prisma.$transaction.mockResolvedValue([{ ...plan, paidInstallments: 0, lastTransactionId: null }])

    await request(app)
      .patch(`/api/installments/${PLAN_ID}/unpay`)
      .set('Authorization', `Bearer ${makeToken()}`)

    // ops passados para $transaction devem ser array de 2 (update + deleteMany)
    const ops = prisma.$transaction.mock.calls[0][0]
    expect(Array.isArray(ops)).toBe(true)
    expect(ops).toHaveLength(2)
  })

  test('não inclui deleteMany quando a transação correspondente não é encontrada', async () => {
    const plan = mockPlan({ paidInstallments: 1, lastTransactionId: null })
    prisma.installmentPlan.findFirst.mockResolvedValue(plan)
    prisma.transaction.findFirst.mockResolvedValueOnce(null)
    prisma.$transaction.mockResolvedValue([{ ...plan, paidInstallments: 0 }])

    await request(app)
      .patch(`/api/installments/${PLAN_ID}/unpay`)
      .set('Authorization', `Bearer ${makeToken()}`)

    const ops = prisma.$transaction.mock.calls[0][0]
    expect(Array.isArray(ops)).toBe(true)
    expect(ops).toHaveLength(1) // só o update
  })

  // Regressão: com a lógica antiga (lastTransactionId), a 2ª chamada consecutiva
  // de /unpay não encontrava mais nada pra remover (o campo já tinha sido zerado
  // na 1ª chamada) — decrementava o contador mas deixava a transação órfã.
  test('desfazer 2 parcelas em sequência remove a transação certa em cada chamada', async () => {
    const basePlan = mockPlan({ paidInstallments: 3 })

    // 1ª chamada: desfaz a parcela 3 → remove "iPhone 15 (parcela 3/12)"
    prisma.installmentPlan.findFirst.mockResolvedValueOnce(basePlan)
    prisma.transaction.findFirst.mockResolvedValueOnce({ id: 'tx-3', description: 'iPhone 15 (parcela 3/12)' })
    prisma.$transaction.mockResolvedValueOnce([{ ...basePlan, paidInstallments: 2, lastTransactionId: null }])

    const res1 = await request(app)
      .patch(`/api/installments/${PLAN_ID}/unpay`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res1.status).toBe(200)
    expect(prisma.transaction.deleteMany).toHaveBeenNthCalledWith(1, { where: { id: 'tx-3', userId: USER_ID } })

    // 2ª chamada consecutiva: plano já está com paidInstallments=2 (estado real após a 1ª)
    // → deve remover "iPhone 15 (parcela 2/12)", não repetir a tentativa da parcela 3
    prisma.installmentPlan.findFirst.mockResolvedValueOnce({ ...basePlan, paidInstallments: 2, lastTransactionId: null })
    prisma.transaction.findFirst.mockResolvedValueOnce({ id: 'tx-2', description: 'iPhone 15 (parcela 2/12)' })
    prisma.$transaction.mockResolvedValueOnce([{ ...basePlan, paidInstallments: 1, lastTransactionId: null }])

    const res2 = await request(app)
      .patch(`/api/installments/${PLAN_ID}/unpay`)
      .set('Authorization', `Bearer ${makeToken()}`)

    expect(res2.status).toBe(200)
    expect(prisma.transaction.deleteMany).toHaveBeenNthCalledWith(2, { where: { id: 'tx-2', userId: USER_ID } })
  })
})

// ─────────────────────────────────────────────────────────────────
// DELETE /api/installments/:id
// ─────────────────────────────────────────────────────────────────
describe('DELETE /api/installments/:id', () => {
  test('401 sem token', async () => {
    const res = await request(app).delete(`/api/installments/${PLAN_ID}`)
    expect(res.status).toBe(401)
  })

  test('400 para ID inválido (não-UUID)', async () => {
    const res = await request(app)
      .delete('/api/installments/nao-uuid-algum')
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('ID inválido.')
  })

  test('404 quando parcelamento não existe ou é de outro usuário', async () => {
    const res = await request(app)
      .delete(`/api/installments/${PLAN_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(404)
    expect(res.body.error).toMatch(/não encontrado/i)
  })

  test('remove parcelamento e retorna mensagem de confirmação', async () => {
    prisma.installmentPlan.deleteMany.mockResolvedValue({ count: 1 })
    const res = await request(app)
      .delete(`/api/installments/${PLAN_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('Parcelamento removido.')
  })

  test('deleteMany filtra por id E userId (proteção multi-tenant)', async () => {
    prisma.installmentPlan.deleteMany.mockResolvedValue({ count: 1 })
    await request(app)
      .delete(`/api/installments/${PLAN_ID}`)
      .set('Authorization', `Bearer ${makeToken()}`)
    expect(prisma.installmentPlan.deleteMany).toHaveBeenCalledWith({
      where: { id: PLAN_ID, userId: USER_ID },
    })
  })
})
