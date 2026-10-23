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

describe('POST /api/transactions/import — formatos e erros', () => {
  const post = (buf, name = 'extrato.csv', type) => {
    const r = request(app).post('/api/transactions/import').set(authHeader())
    return type ? r.attach('file', buf, { filename: name, contentType: type }) : r.attach('file', buf, name)
  }
  const created = () => prisma.transaction.createMany.mock.calls.at(-1)[0].data
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite', _count: { transactions: 0 } }))
    prisma.transaction.createMany.mockResolvedValue({ count: 1 })
  })

  test('o CSV que o próprio app exporta (BOM, cabeçalhos em português, dd/mm/aaaa, valor negativo) é aceito de volta', async () => {
    const csv = '﻿Data,Descrição,Categoria,Tipo,Valor (R$)\r\n"10/01/2026","Dividendos","Entrada Extra","Entrada","1800,00"\r\n"12/01/2026","Conta de luz","Contas fixas","Saída","-380,00"\r\n'
    const res = await post(Buffer.from(csv, 'utf8'), 'transacoes-2026-01.csv')
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('2 transações importadas com sucesso.')
    expect(created().map(t => [t.description, t.amount, t.type, t.category, t.month, t.year, t.userId])).toEqual([
      ['Dividendos', 1800, 'income', 'income', 1, 2026, 'user-123'],
      ['Conta de luz', 380, 'expense', 'fixed', 1, 2026, 'user-123'],
    ])
    expect(created()[0].date.toISOString()).toBe('2026-01-10T03:00:00.000Z')
  })

  test('respeita o tipo e a data do arquivo (antes: despesa virava entrada e a data virava "hoje")', async () => {
    const res = await post(Buffer.from('date,description,category,type,amount\n2026-01-22,Cafe QA Import,food,expense,12.34\n'))
    expect(res.status).toBe(200)
    expect(res.body.message).toBe('1 transação importada com sucesso.')
    expect(created()[0]).toMatchObject({ description: 'Cafe QA Import', amount: 12.34, type: 'expense', category: 'food', month: 1, year: 2026 })
    expect(created()[0].date.toISOString()).toBe('2026-01-22T03:00:00.000Z')
  })

  test('sem coluna de data, entra no mês atual (extrato de banco só com descrição e valor)', async () => {
    const res = await post(Buffer.from('Histórico;Valor\nMercado;-50,00\n'))
    expect(res.status).toBe(200)
    const now = new Date()
    expect(created()[0]).toMatchObject({ type: 'expense', category: 'other', month: now.getMonth() + 1, year: now.getFullYear() })
  })

  test('linhas com data inválida ou futura são ignoradas e a resposta avisa quantas', async () => {
    const res = await post(Buffer.from('date,description,amount\n2026-01-10,ok,10\n31/02/2026,data ruim,10\n2031-01-01,futuro,10\n'))
    expect(res.status).toBe(200)
    expect(created()).toHaveLength(1)
    expect(res.body.skipped).toBe(2)
    expect(res.body.message).toBe('1 transação importada com sucesso. 2 linhas foram ignoradas (valor ou data inválidos).')
  })

  test('se nenhuma linha vale, 400 com a mensagem de sempre', async () => {
    const res = await post(Buffer.from('date,description,amount\n31/02/2026,ruim,10\n'))
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Nenhuma transação válida encontrada no arquivo.')
    expect(prisma.transaction.createMany).not.toHaveBeenCalled()
  })

  test('arquivo que não é CSV (imagem) volta 400 com mensagem clara — antes era 500 "Erro interno do servidor"', async () => {
    const res = await post(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]), 'foto.png', 'image/png')
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Envie um arquivo CSV (.csv).')
  })

  test('arquivo binário com nome .csv também é recusado (byte nulo), sem tentar processar', async () => {
    const res = await post(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x08, 0x00]), 'planilha.csv')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/não parece ser um CSV/)
    expect(prisma.transaction.createMany).not.toHaveBeenCalled()
  })

  test('arquivo maior que 2 MB: 400 explicando o limite', async () => {
    const res = await post(Buffer.alloc(2 * 1024 * 1024 + 10, 'a'), 'grande.csv')
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/máximo 2 MB/)
  })

  test('sem coluna de valor: 400 dizendo o que falta', async () => {
    const res = await post(Buffer.from('foo,bar\nx,y\n'))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/coluna de valor/)
  })

  test('mais de 500 linhas: 400', async () => {
    const csv = 'description,amount\n' + Array.from({ length: 501 }, (_, i) => `l${i},1`).join('\n')
    const res = await post(Buffer.from(csv))
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/no máximo 500/)
  })

  test('plano Grátis: importa só até o limite do mês (19 de 20 já usados → 1 linha)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free', _count: { transactions: 19 } }))
    const res = await request(app).post('/api/transactions/import').set(authHeader()).attach('file', Buffer.from('description,amount\na,1\nb,2\nc,3\n'), 'x.csv')
    expect(res.status).toBe(200)
    expect(created()).toHaveLength(1)
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

  test('devolve o salário do usuário: as telas somam salário + lançamentos pra mostrar "Entradas" (Início, Extrato e Balanço mensal iguais)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ salary: 4200 }))
    const res = await request(app).get('/api/transactions/monthly-recap').set(authHeader())
    expect(res.body.salary).toBe(4200)
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

// ══════════════════════════════════════════════════════════
// HISTÓRICO MENSAL (tela Histórico)
// ══════════════════════════════════════════════════════════
describe('GET /api/transactions/monthly-history', () => {
  const now = new Date()
  const cur = { month: now.getMonth() + 1, year: now.getFullYear() }
  const prev = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { month: d.getMonth() + 1, year: d.getFullYear() } })()

  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ salary: 5000 }))
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.budget.findMany.mockResolvedValue([])
  })

  test('exige autenticação', async () => {
    const res = await request(app).get('/api/transactions/monthly-history')
    expect(res.status).toBe(401)
  })

  test('devolve 6 meses por padrão, do mais antigo ao atual, e no máximo 12', async () => {
    const res6 = await request(app).get('/api/transactions/monthly-history').set(authHeader())
    expect(res6.body).toHaveLength(6)
    expect(res6.body.at(-1)).toMatchObject(cur)
    const res99 = await request(app).get('/api/transactions/monthly-history').query({ months: 99 }).set(authHeader())
    expect(res99.body).toHaveLength(12)
  })

  test('inclui transações arquivadas (meses já fechados) e escopa pelo usuário', async () => {
    await request(app).get('/api/transactions/monthly-history').set(authHeader())
    const where = prisma.transaction.findMany.mock.calls.at(-1)[0].where
    expect(where.userId).toBe('user-123')
    expect(where).not.toHaveProperty('archived')
    expect(prisma.budget.findMany.mock.calls.at(-1)[0].where.userId).toBe('user-123')
  })

  test('cada mês traz entradas, saídas e o resultado (salário + entradas − saídas), arquivado ou não', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      mockTx({ id: 'a', type: 'income',  amount: 1000, ...prev, archived: true }),
      mockTx({ id: 'b', type: 'expense', amount: 400,  ...prev, archived: true }),
      mockTx({ id: 'c', type: 'expense', amount: 250,  ...cur }),
    ])
    const res = await request(app).get('/api/transactions/monthly-history').set(authHeader())
    const find = (ym) => res.body.find(m => m.month === ym.month && m.year === ym.year)
    expect(find(prev)).toMatchObject({ income: 1000, expenses: 400, saved: 5600, active: true })
    expect(find(cur)).toMatchObject({ income: 0, expenses: 250, saved: 4750, active: true })
    expect(res.body.filter(m => !m.active).every(m => m.income === 0 && m.expenses === 0)).toBe(true)
  })

  test('conta fixa não paga no mês diminui o resultado (mesma regra do Extrato)', async () => {
    prisma.budget.findMany.mockResolvedValue([{ id: 'bud-1', amount: 800 }])
    prisma.transaction.findMany.mockResolvedValue([mockTx({ id: 'c', type: 'expense', amount: 100, ...cur })])
    const res = await request(app).get('/api/transactions/monthly-history').set(authHeader())
    expect(res.body.at(-1).saved).toBe(5000 - 800 - 100)
  })
})

// ══════════════════════════════════════════════════════════
// ASSINATURAS (/subscriptions) — modo padrão e ?strict=1 (story Dicas IA)
// ══════════════════════════════════════════════════════════
describe('GET /api/transactions/weekly-tip-available', () => {
  const DAY = 24 * 60 * 60 * 1000
  const daysAgo = (n) => new Date(Date.now() - n * DAY)
  const exp = (n, category, amount) => ({ category, amount, date: daysAgo(n) })

  test('exige autenticação', async () => {
    expect((await request(app).get('/api/transactions/weekly-tip-available')).status).toBe(401)
  })

  test('sem histórico de comparação (só gasto recente) não há dica: available=false', async () => {
    prisma.transaction.findMany.mockResolvedValue([exp(3, 'food', 900), exp(10, 'food', 200)])
    const res = await request(app).get('/api/transactions/weekly-tip-available').set(authHeader())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ available: false })
  })

  test('com gasto recente E um período anterior mais baixo, a dica existe: available=true', async () => {
    prisma.transaction.findMany.mockResolvedValue([exp(5, 'food', 1200), exp(40, 'food', 500), exp(70, 'food', 500)])
    const res = await request(app).get('/api/transactions/weekly-tip-available').set(authHeader())
    expect(res.body).toEqual({ available: true })
  })

  test('só olha as despesas do próprio usuário nos últimos 120 dias e não chama IA nem devolve a frase', async () => {
    prisma.transaction.findMany.mockResolvedValue([])
    const res = await request(app).get('/api/transactions/weekly-tip-available').set(authHeader())
    const q = prisma.transaction.findMany.mock.calls.at(-1)[0]
    expect(q.where.userId).toBe('user-123')
    expect(q.where.type).toBe('expense')
    expect(Date.now() - q.where.date.gte.getTime()).toBeGreaterThan(119 * DAY)
    expect(Date.now() - q.where.date.gte.getTime()).toBeLessThan(121 * DAY)
    expect(Object.keys(res.body)).toEqual(['available'])
  })

  test('falha no banco: 500 com mensagem, sem vazar o erro', async () => {
    prisma.transaction.findMany.mockRejectedValue(new Error('boom'))
    const res = await request(app).get('/api/transactions/weekly-tip-available').set(authHeader())
    expect(res.status).toBe(500)
    expect(JSON.stringify(res.body)).not.toMatch(/boom/)
  })
})

describe('GET /api/transactions/subscriptions', () => {
  const row = (description, amount, month, extra = {}) => ({
    description, amount, category: 'leisure', month, year: 2026,
    date: new Date(`2026-${String(month).padStart(2, '0')}-10T12:00:00Z`), budgetId: null, ...extra,
  })
  const get = (query = {}) => request(app).get('/api/transactions/subscriptions').query(query).set(authHeader())

  // Elite por padrão: o modo strict é do plano Elite (ver teste de plano abaixo).
  beforeEach(() => { prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' })) })

  test('padrão: 2+ meses com a mesma descrição aparece, com a média dos valores (comportamento de sempre)', async () => {
    prisma.transaction.findMany.mockResolvedValue([row('Netflix', 40, 9), row('Netflix', 50, 10), row('Avulso', 10, 10)])

    const res = await get()

    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0]).toMatchObject({ description: 'Netflix', amount: 45, months: 2, occurrences: 2 })
    expect(prisma.transaction.findMany.mock.calls.at(-1)[0].where.archived).toBe(false)
  })

  test('strict: assinatura de valor estável, uma cobrança por mês', async () => {
    prisma.transaction.findMany.mockResolvedValue([row('Spotify', 21.9, 8), row('Spotify', 21.9, 9), row('Spotify', 21.9, 10)])

    const res = await get({ strict: '1' })

    expect(res.body).toEqual([expect.objectContaining({ description: 'Spotify', amount: 21.9, months: 3 })])
  })

  test('strict: conta fixa (budgetId ou categoria fixed) não é assinatura', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      row('Aluguel', 2000, 9, { budgetId: 'b1', category: 'fixed' }), row('Aluguel', 2000, 10, { budgetId: 'b1', category: 'fixed' }),
      row('Internet', 120, 9, { category: 'fixed' }), row('Internet', 120, 10, { category: 'fixed' }),
    ])

    expect((await get({ strict: '1' })).body).toEqual([])
    // sem strict, continua aparecendo — o comportamento antigo não muda
    expect((await get()).body).toHaveLength(2)
  })

  test('strict: compra recorrente com valor variável ou várias vezes no mês não é assinatura', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      row('Mercado', 80, 9), row('Mercado', 240, 10),                 // valor varia muito
      row('Padaria', 10, 9), row('Padaria', 10, 9), row('Padaria', 10, 10), // 2 no mesmo mês
    ])

    expect((await get({ strict: '1' })).body).toEqual([])
  })

  test('strict: aceita variação de até 10% no valor', async () => {
    prisma.transaction.findMany.mockResolvedValue([row('Academia', 100, 9), row('Academia', 105, 10)])

    expect((await get({ strict: '1' })).body).toHaveLength(1)
  })

  test.each(['free', 'pro'])('strict: plano %s recebe lista vazia, sem consultar o banco (recurso Elite)', async (plan) => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan }))
    prisma.transaction.findMany.mockResolvedValue([row('Netflix', 40, 9), row('Netflix', 40, 10)])

    const res = await get({ strict: '1' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
    expect(prisma.transaction.findMany).not.toHaveBeenCalled()
  })

  test('plano Elite expirado (tratado como free) também não recebe o modo strict', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite', planExpiresAt: new Date(Date.now() - 86400000) }))

    const res = await get({ strict: '1' })

    expect(res.body).toEqual([])
    expect(prisma.transaction.findMany).not.toHaveBeenCalled()
  })

  test('sem strict o endpoint segue como sempre para qualquer plano (comportamento antigo intacto)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free' }))
    prisma.transaction.findMany.mockResolvedValue([row('Netflix', 40, 9), row('Netflix', 50, 10)])

    const res = await get()

    expect(res.body).toHaveLength(1)
  })

  test('strict: inclui meses já fechados (archived) e escopa pelo usuário', async () => {
    prisma.transaction.findMany.mockResolvedValue([])

    await get({ strict: '1' })

    const { where } = prisma.transaction.findMany.mock.calls.at(-1)[0]
    expect(where).not.toHaveProperty('archived')
    expect(where.userId).toBe('user-123')
    expect(where.type).toBe('expense')
  })
})

// "Alerta de limite" (Preferências): o push por categoria é a partir de 80% do teto e some quando a preferência é desligada
describe('POST /api/transactions — aviso de limite por categoria (push)', () => {
  const { sendPushToUser } = require('../src/services/pushService')
  const flush = () => new Promise(r => setTimeout(r, 30))   // o push roda em setImmediate, depois da resposta

  const post = async (userOver) => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ _count: { transactions: 5 }, notifBudgetAlert: true, ...userOver }))
    prisma.transaction.count.mockResolvedValue(5)
    prisma.transaction.create.mockResolvedValue(mockTx())
    prisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 85 } })      // 85 gastos na categoria
    prisma.budget.aggregate.mockResolvedValue({ _sum: { amount: 0 } })
    prisma.categoryLimit.findUnique.mockResolvedValue({ userId: 'user-123', category: 'food', amount: 100 })   // teto de 100 → 85%
    const res = await request(app).post('/api/transactions').set(authHeader()).send({ description: 'Mercado', amount: 20, type: 'expense', category: 'food' })
    await flush()
    return res
  }
  const limitPushes = () => sendPushToUser.mock.calls.filter(([, p]) => /do limite de|Limite de/.test(p.title))

  test('a partir de 80% do teto avisa', async () => {
    expect((await post({})).status).toBe(201)
    expect(limitPushes()).toHaveLength(1)
    expect(limitPushes()[0][1].title).toMatch(/85% do limite de/)
  })

  test('com "Alerta de limite" desligado, não avisa (mas o aviso de gasto registrado continua)', async () => {
    expect((await post({ notifBudgetAlert: false })).status).toBe(201)
    expect(limitPushes()).toHaveLength(0)
    expect(sendPushToUser.mock.calls.some(([, p]) => /Gasto registrado/.test(p.title))).toBe(true)
  })
})
