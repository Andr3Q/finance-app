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

const TX_UUID  = 'd1e2f3a4-b5c6-7890-defa-123456789012'
const TX_UUID2 = 'e2f3a4b5-c6d7-8901-efab-234567890123'

const mockUser = (overrides = {}) => ({
  id: 'user-123', plan: 'free', salary: 5000,
  emailVerified: true, twoFactorEnabled: false,
  isOnTrial: false, planExpiresAt: null, ...overrides,
})

const mockTx = (overrides = {}) => ({
  id: TX_UUID, userId: 'user-123', description: 'Aluguel',
  amount: 1500, type: 'expense', category: 'home',
  month: 5, year: 2026, date: new Date('2026-05-01'),
  archived: false, isFixed: false, ...overrides,
})

// ══════════════════════════════════════════════════════════
// CRIAÇÃO DE TRANSAÇÃO
// ══════════════════════════════════════════════════════════
describe('POST /api/transactions', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ _count: { transactions: 5 } }))
    prisma.transaction.count.mockResolvedValue(5)
  })

  test('cria transação de despesa válida', async () => {
    prisma.transaction.create.mockResolvedValue(mockTx())

    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Aluguel', amount: 1500, type: 'expense', category: 'home' })

    expect(res.status).toBe(201)
    expect(res.body).toHaveProperty('id')
    expect(res.body.userId).toBe('user-123')
  })

  test('cria transação de receita', async () => {
    prisma.transaction.create.mockResolvedValue(mockTx({ type: 'income', category: 'income' }))

    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Salário', amount: 5000, type: 'income', category: 'income' })

    expect(res.status).toBe(201)
    expect(res.body.type).toBe('income')
  })

  test('amount negativo é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Test', amount: -100, type: 'expense', category: 'food' })

    expect(res.status).toBe(400)
  })

  test('amount zero é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Test', amount: 0, type: 'expense', category: 'food' })

    expect(res.status).toBe(400)
  })

  test('type inválido é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Test', amount: 100, type: 'invalid', category: 'food' })

    expect(res.status).toBe(400)
  })

  test('category inválida é rejeitada → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Test', amount: 100, type: 'expense', category: 'invalid_cat_xyz' })

    expect(res.status).toBe(400)
  })

  test('amount acima do máximo é rejeitado → 400', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .set(authHeader())
      .send({ description: 'Test', amount: 999_999_999_999, type: 'expense', category: 'food' })

    expect(res.status).toBe(400)
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app)
      .post('/api/transactions')
      .send({ description: 'Test', amount: 100, type: 'expense', category: 'food' })

    expect(res.status).toBe(401)
  })
})

// ══════════════════════════════════════════════════════════
// LISTAGEM E DASHBOARD
// ══════════════════════════════════════════════════════════
describe('GET /api/transactions/dashboard', () => {
  test('retorna summary + transactions + limits', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.findMany.mockResolvedValue([mockTx()])
    prisma.budget.findMany.mockResolvedValue([])
    prisma.categoryLimit.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/transactions/dashboard')
      .set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('summary')
    expect(res.body).toHaveProperty('transactions')
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app).get('/api/transactions/dashboard')
    expect(res.status).toBe(401)
  })

  test('query params extras são ignorados — dashboard usa mês atual', async () => {
    // A rota usa nowBrasilia() e ignora query params month/year
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.budget.findMany.mockResolvedValue([])
    prisma.categoryLimit.findMany.mockResolvedValue([])

    const res = await request(app)
      .get('/api/transactions/dashboard?month=5&year=2026')
      .set(authHeader())

    expect(res.status).toBe(200)
  })
})

// ══════════════════════════════════════════════════════════
// ATUALIZAÇÃO DE TRANSAÇÃO
// ══════════════════════════════════════════════════════════
describe('PUT /api/transactions/:id', () => {
  test('atualiza transação do próprio usuário', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    const tx = mockTx()
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 })
    prisma.transaction.findUnique.mockResolvedValue({ ...tx, amount: 2000 })

    const res = await request(app)
      .put(`/api/transactions/${TX_UUID}`)
      .set(authHeader())
      .send({ amount: 2000 })

    expect(res.status).toBe(200)
  })

  test('transação de outro usuário retorna 404 (ownership)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.updateMany.mockResolvedValue({ count: 0 })

    const res = await request(app)
      .put(`/api/transactions/${TX_UUID2}`)
      .set(authHeader())
      .send({ amount: 2000 })

    expect(res.status).toBe(404)
  })

  test('ID não-UUID retorna 400', async () => {
    const res = await request(app)
      .put('/api/transactions/not-a-uuid')
      .set(authHeader())
      .send({ amount: 2000 })

    expect(res.status).toBe(400)
  })

  test('data em formato inválido retorna 400', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())

    const res = await request(app)
      .put(`/api/transactions/${TX_UUID}`)
      .set(authHeader())
      .send({ date: 'not-a-date' })

    expect(res.status).toBe(400)
  })

  test('date no formato correto YYYY-MM-DD é aceita', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 })
    prisma.transaction.findUnique.mockResolvedValue(mockTx({ date: new Date('2026-06-15') }))

    const res = await request(app)
      .put(`/api/transactions/${TX_UUID}`)
      .set(authHeader())
      .send({ date: '2026-06-15' })

    expect(res.status).toBe(200)
    // "YYYY-MM-DD" grava meia-noite de Brasília — não meia-noite UTC, que
    // aparecia como 14/06 na tela (bug sistêmico das datas 1 dia antes).
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ date: new Date('2026-06-15T03:00:00.000Z'), month: 6, year: 2026 }),
    }))
  })

  test('rejeita data com dia inexistente → 400', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())

    const res = await request(app)
      .put(`/api/transactions/${TX_UUID}`)
      .set(authHeader())
      .send({ date: '2026-02-31' })

    expect(res.status).toBe(400)
  })
})

// ══════════════════════════════════════════════════════════
// DELEÇÃO DE TRANSAÇÃO
// ══════════════════════════════════════════════════════════
describe('DELETE /api/transactions/:id', () => {
  test('deleta transação do próprio usuário', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.deleteMany.mockResolvedValue({ count: 1 })

    const res = await request(app)
      .delete(`/api/transactions/${TX_UUID}`)
      .set(authHeader())

    expect(res.status).toBe(200)
  })

  test('não deleta transação de outro usuário → 404', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.deleteMany.mockResolvedValue({ count: 0 })

    const res = await request(app)
      .delete(`/api/transactions/${TX_UUID2}`)
      .set(authHeader())

    expect(res.status).toBe(404)
  })

  test('ID com SQL injection não causa erro → 400 (UUID inválido)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser())

    const res = await request(app)
      .delete('/api/transactions/1%20OR%201=1')
      .set(authHeader())

    expect([400, 404]).toContain(res.status)
  })
})

// ══════════════════════════════════════════════════════════
// ISOLAMENTO DE DADOS ENTRE USUÁRIOS
// ══════════════════════════════════════════════════════════
describe('Isolamento de dados por usuário', () => {
  test('usuário A não vê dados do usuário B', async () => {
    const userA = mockUser({ id: 'user-A' })

    prisma.user.findUnique.mockResolvedValue(userA)
    prisma.transaction.deleteMany.mockResolvedValue({ count: 0 })

    const tokenA = jwt.sign({ userId: 'user-A' }, JWT_SECRET, { expiresIn: '1h' })

    const res = await request(app)
      .delete(`/api/transactions/${TX_UUID2}`)
      .set('Cookie', `token=${tokenA}`)

    expect(res.status).toBe(404)
  })
})

// ══════════════════════════════════════════════════════════
// IMPORTAÇÃO CSV — parsing de valor decimal
// ══════════════════════════════════════════════════════════
describe('POST /api/transactions/import', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite', _count: { transactions: 0 } }))
  })

  test('sem arquivo retorna 400', async () => {
    const res = await request(app).post('/api/transactions/import').set(authHeader())
    expect(res.status).toBe(400)
  })

  // Regressão: a lógica antiga sempre removia '.' assumindo pt-BR, então um
  // decimal americano ("1234.56") virava 123456 — valor 100x maior, sem erro.
  test('decimal americano (1234.56) não é multiplicado por 100', async () => {
    prisma.transaction.createMany.mockResolvedValue({ count: 1 })
    const csv = 'description;amount\nCompra internacional;1234.56\n'

    const res = await request(app)
      .post('/api/transactions/import')
      .set(authHeader())
      .attach('file', Buffer.from(csv), 'extrato.csv')

    expect(res.status).toBe(200)
    const created = prisma.transaction.createMany.mock.calls[0][0].data
    expect(created[0].amount).toBe(1234.56)
  })

  test('decimal pt-BR com separador de milhar (1.234,56) continua correto', async () => {
    prisma.transaction.createMany.mockResolvedValue({ count: 1 })
    // Valor entre aspas — a vírgula do decimal pt-BR não deve ser confundida com o
    // delimitador ';' do CSV (RFC 4180: conteúdo entre aspas não é dividido).
    const csv = 'description;amount\nCompra nacional;"1.234,56"\n'

    const res = await request(app)
      .post('/api/transactions/import')
      .set(authHeader())
      .attach('file', Buffer.from(csv), 'extrato.csv')

    expect(res.status).toBe(200)
    const created = prisma.transaction.createMany.mock.calls[0][0].data
    expect(created[0].amount).toBe(1234.56)
  })

  test('milhar pt-BR sem decimais (1.234) não é interpretado como 1,234', async () => {
    prisma.transaction.createMany.mockResolvedValue({ count: 1 })
    const csv = 'description;amount\nValor redondo;1.234\n'

    const res = await request(app)
      .post('/api/transactions/import')
      .set(authHeader())
      .attach('file', Buffer.from(csv), 'extrato.csv')

    expect(res.status).toBe(200)
    const created = prisma.transaction.createMany.mock.calls[0][0].data
    expect(created[0].amount).toBe(1234)
  })
})

// ══════════════════════════════════════════════════════════
// AUTO-LANÇAMENTO DE CONTAS FIXAS — pula as já pagas individualmente
// ══════════════════════════════════════════════════════════
// Regressão: antes disso, esta rota lançava TODAS as contas fixas
// incondicionalmente na 1ª chamada do mês (controlado só por uma flag global
// no User). Uma conta já paga individualmente antes (botão "Marcar como
// paga" ou chat de IA) sempre duplicava quando o usuário clicava "Lançar
// agora" depois — bug real relatado por testadores beta.
describe('POST /api/transactions/auto-launch', () => {
  const { nowBrasilia } = require('../src/utils/helpers')
  const { month, year } = nowBrasilia()
  const budgetPaid   = { id: 'bud-1', name: 'Internet', amount: 89, userId: 'user-123' }
  const budgetUnpaid = { id: 'bud-2', name: 'Claro',     amount: 49, userId: 'user-123' }

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.count.mockResolvedValue(0)
  })

  test('pula conta já paga individualmente (budgetId vinculado) e lança só as pendentes', async () => {
    prisma.budget.findMany.mockResolvedValue([budgetPaid, budgetUnpaid])
    prisma.transaction.findMany.mockResolvedValue([{ budgetId: budgetPaid.id }])
    prisma.transaction.createMany.mockResolvedValue({ count: 1 })

    const res = await request(app).post('/api/transactions/auto-launch').set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body.count).toBe(1)
    expect(prisma.transaction.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [{ description: 'Claro', amount: 49, type: 'expense', category: 'fixed', budgetId: 'bud-2', month, year, userId: 'user-123' }],
    })
  })

  test('todas já pagas: não cria nenhuma transação, retorna alreadyLaunched', async () => {
    prisma.budget.findMany.mockResolvedValue([budgetPaid])
    prisma.transaction.findMany.mockResolvedValue([{ budgetId: budgetPaid.id }])

    const res = await request(app).post('/api/transactions/auto-launch').set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body.alreadyLaunched).toBe(true)
    expect(prisma.transaction.createMany).not.toHaveBeenCalled()
  })

  test('nenhuma paga: lança todas, cada transação com o budgetId correspondente', async () => {
    prisma.budget.findMany.mockResolvedValue([budgetPaid, budgetUnpaid])
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.createMany.mockResolvedValue({ count: 2 })

    const res = await request(app).post('/api/transactions/auto-launch').set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body.count).toBe(2)
    const data = prisma.transaction.createMany.mock.calls[0][0].data
    expect(data.map(d => d.budgetId).sort()).toEqual(['bud-1', 'bud-2'])
  })

  test('sem contas fixas cadastradas retorna 400', async () => {
    prisma.budget.findMany.mockResolvedValue([])
    const res = await request(app).post('/api/transactions/auto-launch').set(authHeader())
    expect(res.status).toBe(400)
  })

  test('limite de transações do plano Free atingido não lança nenhuma', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free' }))
    prisma.budget.findMany.mockResolvedValue([budgetUnpaid])
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.count.mockResolvedValue(20)

    const res = await request(app).post('/api/transactions/auto-launch').set(authHeader())

    expect(res.status).toBe(403)
    expect(res.body.limitReached).toBe(true)
    expect(prisma.transaction.createMany).not.toHaveBeenCalled()
  })

  test('plano Elite (sem limite) lança mesmo com muitas transações já no mês', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.budget.findMany.mockResolvedValue([budgetUnpaid])
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.count.mockResolvedValue(500)
    prisma.transaction.createMany.mockResolvedValue({ count: 1 })

    const res = await request(app).post('/api/transactions/auto-launch').set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body.count).toBe(1)
  })
})

// ══════════════════════════════════════════════════════════
// RESUMO EM STORIES
// ══════════════════════════════════════════════════════════
describe('GET /api/transactions/monthly-recap', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser())
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.budget.findMany.mockResolvedValue([])
    prisma.goal.findMany.mockResolvedValue([])
  })

  test('exige autenticação', async () => {
    const res = await request(app).get('/api/transactions/monthly-recap')
    expect(res.status).toBe(401)
  })

  test.each(['1', '-12', 'abc', '0.5'])('rejeita offset inválido (%s)', async (offset) => {
    const res = await request(app).get('/api/transactions/monthly-recap').query({ offset }).set(authHeader())
    expect(res.status).toBe(400)
  })

  test('sem movimento devolve hasData=false', async () => {
    const res = await request(app).get('/api/transactions/monthly-recap').set(authHeader())
    expect(res.status).toBe(200)
    expect(res.body.hasData).toBe(false)
  })

  test('escopa todas as consultas pelo usuário e não filtra archived', async () => {
    await request(app).get('/api/transactions/monthly-recap').query({ offset: -1 }).set(authHeader())
    const where = prisma.transaction.findMany.mock.calls.at(-1)[0].where
    expect(where.userId).toBe('user-123')
    expect(where).not.toHaveProperty('archived')
    expect(prisma.budget.findMany.mock.calls.at(-1)[0].where.userId).toBe('user-123')
    expect(prisma.goal.findMany.mock.calls.at(-1)[0].where.userId).toBe('user-123')
  })
})
