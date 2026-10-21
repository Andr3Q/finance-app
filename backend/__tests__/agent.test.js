'use strict'
const request = require('supertest')
const jwt     = require('jsonwebtoken')
const { Prisma } = require('@prisma/client')

process.env.GROQ_API_KEY = 'test-groq-key'

const mockCreate     = jest.fn()
const mockTranscribe = jest.fn()
const mockToFile     = jest.fn(async (buffer, filename) => ({ buffer, filename }))
jest.mock('groq-sdk', () => {
  const Groq = jest.fn().mockImplementation(() => ({
    chat:  { completions:    { create: mockCreate } },
    audio: { transcriptions: { create: mockTranscribe } },
  }))
  Groq.toFile = mockToFile
  return Groq
})
// Os áudios "fake" dos testes (Buffer.alloc repetindo um byte) não são um
// arquivo de áudio de verdade, então o parseBuffer real sempre falharia
// (cai no fail-open do try/catch) — mocka pra poder testar o caminho de
// rejeição por duração de forma determinística. Default: duração curta
// (comportamento "normal" nos testes que não mexem nisso de propósito).
// src/lib/audioMetadata.js isola o import() dinâmico do music-metadata (pacote
// ESM puro) — mocka o wrapper CJS normal em vez do pacote ESM em si (ver
// comentário no próprio arquivo sobre por que import() dinâmico não é
// mockável aqui do jeito que require() é).
const mockGetAudioDuration = jest.fn().mockResolvedValue(5)
jest.mock('../src/lib/audioMetadata', () => ({ getAudioDurationSeconds: (...args) => mockGetAudioDuration(...args) }))
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
  id: 'user-123', plan: 'free', planExpiresAt: null, trialEndsAt: null,
  name: 'Usuário Teste', salary: 5000,
  ...overrides,
})

const simpleReply = (text = 'ok') => ({
  choices: [{ message: { content: text, tool_calls: [] } }],
})

const toolCallReply = (name, args, id = 'call_1') => ({
  choices: [{ message: { role: 'assistant', tool_calls: [{ id, function: { name, arguments: JSON.stringify(args) } }] } }],
})

// Simula o modelo pedindo várias tool calls na MESMA resposta (mesma iteração
// do loop de /chat) — é o caminho que testa a barreira de "1 exclusão por vez".
const multiToolCallReply = (calls) => ({
  choices: [{ message: { role: 'assistant', tool_calls: calls.map((c, i) => ({
    id: `call_${i + 1}`, function: { name: c.name, arguments: JSON.stringify(c.args) },
  })) } }],
})

const TX_ID  = 'b2c3d4e5-f6a7-8901-bcde-f12345678901'
const TX_ID2 = 'c3d4e5f6-a7b8-9012-cdef-123456789013'

// ══════════════════════════════════════════════════════════
// POST /api/agent/chat — regressão: Pro NÃO deve mais passar
// ══════════════════════════════════════════════════════════
describe('POST /api/agent/chat — gate de plano', () => {
  test('plano free é bloqueado → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free' }))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Gastei 50 no mercado' })

    expect(res.status).toBe(403)
    expect(res.body.requiredPlan).toBe('elite')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  // Regressão do bug real: o backend aceitava Pro para um recurso vendido
  // como exclusivo do Elite (AgentChat.jsx só libera a tela pra isElite).
  test('plano pro é bloqueado → 403 (chat com IA é exclusivo do Elite)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Gastei 50 no mercado' })

    expect(res.status).toBe(403)
    expect(res.body.requiredPlan).toBe('elite')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('plano pro com plano expirado (efetivo free) é bloqueado → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({
      plan: 'pro',
      planExpiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    }))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Gastei 50 no mercado' })

    expect(res.status).toBe(403)
  })

  test('plano elite passa pelo gate e conversa normalmente → 200', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate.mockResolvedValueOnce(simpleReply('Registrado!'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Gastei 50 no mercado' })

    expect(res.status).toBe(200)
    expect(res.body.reply).toBe('Registrado!')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  test('sem autenticação retorna 401', async () => {
    const res = await request(app).post('/api/agent/chat').send({ message: 'oi' })
    expect(res.status).toBe(401)
  })
})

// ══════════════════════════════════════════════════════════
// Ferramentas da IA — editar e excluir transação
// ══════════════════════════════════════════════════════════
describe('Ferramenta update_transaction (via /api/agent/chat)', () => {
  test('atualiza valor da transação e confirma na resposta', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 })
    prisma.transaction.findUnique.mockResolvedValue({
      id: TX_ID, type: 'expense', amount: 300, category: 'food', description: 'Mercado',
    })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('update_transaction', { id: TX_ID, amount: 300 }))
      .mockResolvedValueOnce(simpleReply('Atualizei para R$ 300,00.'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Muda a conta de alimentação de 400 para 300' })

    expect(res.status).toBe(200)
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: TX_ID, userId: 'user-123', archived: false },
      data:  { amount: 300 },
    })
    // O resultado da ferramenta (não a resposta final) precisa confirmar sucesso —
    // é o que o 2º turno do modelo recebe pra formular a resposta ao usuário.
    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.success).toBe(true)
  })

  test('transação de mês já fechado (archived) não é editada', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.updateMany.mockResolvedValue({ count: 0 }) // archived:false não bateu nenhuma linha
    mockCreate
      .mockResolvedValueOnce(toolCallReply('update_transaction', { id: TX_ID, amount: 300 }))
      .mockResolvedValueOnce(simpleReply('Não consegui editar — mês já fechado.'))

    await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Muda essa transação' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.error).toMatch(/mês fechado|não encontrada/i)
    expect(prisma.transaction.findUnique).not.toHaveBeenCalled()
  })

  test('id inválido (não-UUID) é rejeitado sem consultar o banco', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate
      .mockResolvedValueOnce(toolCallReply('update_transaction', { id: 'nao-existe', amount: 300 }))
      .mockResolvedValueOnce(simpleReply('id inválido.'))

    await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Muda a transação x' })

    expect(prisma.transaction.updateMany).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════
// Ferramenta get_summary — regressão do bug de saldo 10x maior
// (soma de Prisma.Decimal sem Number() vira concatenação de string:
// salário "23000" + totalIncome 0 = "230000")
// ══════════════════════════════════════════════════════════
describe('Ferramenta get_summary (via /api/agent/chat)', () => {
  test('saldo não fica 10x maior com salário Decimal redondo e sem receita extra no mês', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite', salary: new Prisma.Decimal('23000.00') }))
    prisma.transaction.findMany.mockResolvedValue([]) // sem transações => totalIncome/totalExpenses ficam 0 puro
    prisma.budget.findMany.mockResolvedValue([])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_summary', {}))
      .mockResolvedValueOnce(simpleReply('Seu saldo é R$ 23.000,00.'))

    await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Quanto eu tenho no meu saldo?' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.salary).toBe(23000)
    expect(toolResult.balance).toBe(23000)
  })

  test('soma corretamente valores Decimal de receitas, despesas e contas fixas', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite', salary: new Prisma.Decimal('5000.00') }))
    prisma.transaction.findMany.mockResolvedValue([
      { type: 'income',  amount: new Prisma.Decimal('1500.50') },
      { type: 'expense', amount: new Prisma.Decimal('320.25') },
      { type: 'expense', amount: new Prisma.Decimal('80.00') },
    ])
    prisma.budget.findMany.mockResolvedValue([
      { name: 'Aluguel', amount: new Prisma.Decimal('1200.00') },
    ])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_summary', {}))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Qual meu saldo?' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.totalIncome).toBe(1500.5)
    expect(toolResult.totalExpenses).toBeCloseTo(400.25, 2)
    expect(toolResult.fixedTotal).toBe(1200)
    expect(toolResult.balance).toBeCloseTo(5000 + 1500.5 - 1200 - 400.25, 2)
  })

  // Regressão: get_summary sempre descontava fixedTotal INTEIRO do saldo,
  // mesmo quando uma conta fixa já tinha sido paga (já dentro de
  // totalExpenses via a transação real) — descontava a mesma conta 2x.
  test('não desconta 2x uma conta fixa já paga (transação com budgetId vinculado)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite', salary: new Prisma.Decimal('5000.00') }))
    prisma.transaction.findMany.mockResolvedValue([
      { type: 'expense', amount: new Prisma.Decimal('89.00'), budgetId: 'bud-internet' },
    ])
    prisma.budget.findMany.mockResolvedValue([
      { id: 'bud-internet', name: 'Internet', amount: new Prisma.Decimal('89.00') },
      { id: 'bud-claro',    name: 'Claro',    amount: new Prisma.Decimal('49.00') },
    ])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_summary', {}))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Qual meu saldo?' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    // Internet já paga (não desconta de novo) — só Claro (49) continua pendente
    expect(toolResult.unpaidFixedCosts).toBe(49)
    expect(toolResult.balance).toBeCloseTo(5000 - 49 - 89, 2)
  })
})

describe('Ferramenta pay_fixed_bill (via /api/agent/chat)', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst
      .mockResolvedValueOnce(null)  // mês não fechado
      .mockResolvedValueOnce(null) // ainda não paga
    prisma.transaction.count.mockResolvedValue(0)
  })

  test('registra o pagamento vinculado à conta fixa pelo nome', async () => {
    prisma.budget.findFirst.mockResolvedValue({ id: 'bud-internet', userId: 'user-123', name: 'Internet', amount: 89 })
    prisma.transaction.create.mockResolvedValue({ id: 'tx-1', amount: 89, budgetId: 'bud-internet' })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('pay_fixed_bill', { budgetName: 'Internet' }))
      .mockResolvedValueOnce(simpleReply('Pago!'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Paga a conta de Internet' })

    expect(res.status).toBe(200)
    expect(prisma.transaction.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ budgetId: 'bud-internet', category: 'fixed' }),
    }))
    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.success).toBe(true)
  })

  test('encontra a conta fixa ignorando maiúsculas/minúsculas', async () => {
    prisma.budget.findFirst.mockResolvedValue({ id: 'bud-internet', userId: 'user-123', name: 'Internet', amount: 89 })
    prisma.transaction.create.mockResolvedValue({ id: 'tx-1', amount: 89, budgetId: 'bud-internet' })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('pay_fixed_bill', { budgetName: 'internet' }))
      .mockResolvedValueOnce(simpleReply('Pago!'))

    await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'paga a internet' })

    expect(prisma.budget.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-123', name: { equals: 'internet', mode: 'insensitive' } },
    })
  })

  test('conta fixa inexistente retorna erro pra IA, sem criar transação', async () => {
    prisma.budget.findFirst.mockResolvedValue(null)
    mockCreate
      .mockResolvedValueOnce(toolCallReply('pay_fixed_bill', { budgetName: 'Netflix' }))
      .mockResolvedValueOnce(simpleReply('não achei'))

    await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'paga a Netflix' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.error).toMatch(/não encontrada/i)
    expect(prisma.transaction.create).not.toHaveBeenCalled()
  })

  test('conta já paga este mês não duplica — IA recebe aviso, não erro genérico', async () => {
    prisma.budget.findFirst.mockResolvedValue({ id: 'bud-internet', userId: 'user-123', name: 'Internet', amount: 89 })
    prisma.transaction.findFirst
      .mockReset()
      .mockResolvedValueOnce(null)                                       // mês não fechado
      .mockResolvedValueOnce({ amount: 89, date: new Date('2026-10-05') }) // já paga
    mockCreate
      .mockResolvedValueOnce(toolCallReply('pay_fixed_bill', { budgetName: 'Internet' }))
      .mockResolvedValueOnce(simpleReply('já paga'))

    await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'paga a internet de novo' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.error).toMatch(/já foi paga/i)
    expect(prisma.transaction.create).not.toHaveBeenCalled()
  })
})

describe('Ferramenta delete_transaction (via /api/agent/chat)', () => {
  test('exclui a transação e confirma na resposta', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.deleteMany.mockResolvedValue({ count: 1 })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('delete_transaction', { id: TX_ID }))
      .mockResolvedValueOnce(simpleReply('Excluí a transação de alimentação.'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Exclui a conta de alimentação de 400' })

    expect(res.status).toBe(200)
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: TX_ID, userId: 'user-123', archived: false },
    })
    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.success).toBe(true)
  })

  test('transação inexistente ou de outro usuário retorna erro (count 0)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.deleteMany.mockResolvedValue({ count: 0 })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('delete_transaction', { id: TX_ID }))
      .mockResolvedValueOnce(simpleReply('Não encontrei essa transação.'))

    await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Exclui essa transação' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.error).toBeTruthy()
  })

  // Regressão: barreira técnica de "1 exclusão por mensagem" — o modelo pode
  // pedir 2 delete_transaction na mesma resposta (mesma iteração do loop),
  // então a defesa em profundidade (SYSTEM prompt) não basta.
  test('duas exclusões pedidas na mesma resposta do modelo: só a 1ª executa', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.deleteMany.mockResolvedValue({ count: 1 })
    mockCreate
      .mockResolvedValueOnce(multiToolCallReply([
        { name: 'delete_transaction', args: { id: TX_ID } },
        { name: 'delete_transaction', args: { id: TX_ID2 } },
      ]))
      .mockResolvedValueOnce(simpleReply('Excluí a primeira. Peça a segunda numa mensagem separada.'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Exclui a conta de alimentação de 400 e a de transporte de 100' })

    expect(res.status).toBe(200)
    expect(prisma.transaction.deleteMany).toHaveBeenCalledTimes(1)
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({
      where: { id: TX_ID, userId: 'user-123', archived: false },
    })

    const toolMessages = mockCreate.mock.calls[1][0].messages.filter(m => m.role === 'tool')
    expect(toolMessages).toHaveLength(2)
    expect(JSON.parse(toolMessages[0].content).success).toBe(true)
    expect(JSON.parse(toolMessages[1].content).error).toMatch(/uma transação por vez/i)
  })
})

// Regressão: achado de auditoria de segurança (2026-10-21) — só
// delete_transaction tinha um teto técnico por mensagem; create_transaction,
// update_transaction e pay_fixed_bill podiam ser chamadas sem limite na mesma
// resposta do modelo (defesa em profundidade contra prompt injection via
// dado que o próprio usuário cadastrou antes, ex: nome de conta fixa).
describe('Teto de ações mutantes por mensagem (exceto delete, que tem teto próprio de 1)', () => {
  test('4 create_transaction pedidas na mesma resposta: só as 3 primeiras executam', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.create.mockResolvedValue({ id: 'tx-novo' })
    mockCreate
      .mockResolvedValueOnce(multiToolCallReply([
        { name: 'create_transaction', args: { type: 'expense', amount: 10, category: 'food' } },
        { name: 'create_transaction', args: { type: 'expense', amount: 20, category: 'food' } },
        { name: 'create_transaction', args: { type: 'expense', amount: 30, category: 'food' } },
        { name: 'create_transaction', args: { type: 'expense', amount: 40, category: 'food' } },
      ]))
      .mockResolvedValueOnce(simpleReply('Registrei 3, a 4ª precisa ser pedida de novo.'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Registra 4 gastos de 10, 20, 30 e 40 reais em alimentação' })

    expect(res.status).toBe(200)
    expect(prisma.transaction.create).toHaveBeenCalledTimes(3)

    const toolMessages = mockCreate.mock.calls[1][0].messages.filter(m => m.role === 'tool')
    expect(toolMessages).toHaveLength(4)
    expect(toolMessages.slice(0, 3).every(m => JSON.parse(m.content).success)).toBe(true)
    expect(JSON.parse(toolMessages[3].content).error).toMatch(/no máximo 3/i)
  })
})

// ══════════════════════════════════════════════════════════
// dataChanged — o frontend usa essa flag pra saber se precisa invalidar o
// cache de Dashboard/Transações depois de uma conversa no chat. Só deve vir
// true quando uma ferramenta que MUDA dado (create/update/delete) de fato
// teve sucesso — não basta o modelo ter tentado.
// ══════════════════════════════════════════════════════════
describe('dataChanged (via /api/agent/chat)', () => {
  test('true quando create_transaction tem sucesso', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(null) // mês não fechado
    prisma.transaction.create.mockResolvedValue({ id: TX_ID })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('create_transaction', { type: 'expense', amount: 50, category: 'food' }))
      .mockResolvedValueOnce(simpleReply('Registrei o gasto de R$ 50,00.'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Registrar gasto de 50 em alimentação' })

    expect(res.status).toBe(200)
    expect(res.body.dataChanged).toBe(true)
  })

  test('false quando get_summary é a única ferramenta chamada (só leitura)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.budget.findMany.mockResolvedValue([])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_summary', {}))
      .mockResolvedValueOnce(simpleReply('Seu saldo é R$ 5.000,00.'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Qual meu saldo?' })

    expect(res.body.dataChanged).toBe(false)
  })

  test('false quando update_transaction falha (mês já fechado)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.updateMany.mockResolvedValue({ count: 0 })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('update_transaction', { id: TX_ID, amount: 300 }))
      .mockResolvedValueOnce(simpleReply('Não consegui editar — mês já fechado.'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Muda essa transação' })

    expect(res.body.dataChanged).toBe(false)
  })

  test('false quando nenhuma ferramenta é chamada (resposta direta)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate.mockResolvedValueOnce(simpleReply('Oi! Como posso ajudar?'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'oi' })

    expect(res.body.dataChanged).toBe(false)
  })

  test('true quando delete_transaction tem sucesso mesmo com get_summary na mesma mensagem', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.deleteMany.mockResolvedValue({ count: 1 })
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.budget.findMany.mockResolvedValue([])
    mockCreate
      .mockResolvedValueOnce(multiToolCallReply([
        { name: 'delete_transaction', args: { id: TX_ID } },
        { name: 'get_summary', args: {} },
      ]))
      .mockResolvedValueOnce(simpleReply('Excluí a transação. Seu saldo agora é R$ 5.000,00.'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Exclui essa conta e me diz meu saldo' })

    expect(res.body.dataChanged).toBe(true)
  })
})

describe('Ferramenta create_transaction — plano efetivo (req.userPlan)', () => {
  // /chat exige Elite antes de qualquer tool rodar (requirePlan no topo da rota),
  // então create_transaction NUNCA é alcançado com plano Pro/Free ou com Elite
  // expirado — o próprio gate de /chat já bloqueia com 403 antes disso (mesma
  // fórmula de expiração usada em req.userPlan). PLAN_LIMITS não tem entrada
  // 'elite', então quem chega até aqui nunca tem limite de transações por mês.
  // A troca pra req.userPlan em vez do campo `plan` bruto continua correta como
  // consistência com o padrão C-01 (e blindagem caso o gate de /chat mude no
  // futuro para aceitar Pro), mas não corresponde a um bug alcançável hoje.
  test('plano elite não tem limite de transações por mês', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({
      plan: 'elite',
      _count: { transactions: 500 }, // bem acima de qualquer limite Free/Pro
    }))
    prisma.transaction.create.mockResolvedValue({ id: TX_ID })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('create_transaction', { type: 'expense', amount: 50, category: 'food' }))
      .mockResolvedValueOnce(simpleReply('Registrado!'))

    await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Registra 50 reais em alimentação' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.success).toBe(true)
  })

  test('valor acima de MAX_AMOUNT é rejeitado sem criar a transação', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate
      .mockResolvedValueOnce(toolCallReply('create_transaction', { type: 'expense', amount: 1_000_000_000, category: 'food' }))
      .mockResolvedValueOnce(simpleReply('Esse valor não é permitido.'))

    await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Registra um bilhão de reais em alimentação' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.error).toMatch(/limite/i)
    expect(prisma.transaction.create).not.toHaveBeenCalled()
  })

  // Regressão: sem essa checagem, a IA podia lançar uma transação viva
  // (archived:false) dentro de um mês já fechado por relatório PDF — a rota
  // manual POST /transactions não tem esse risco pois sempre usa o mês atual,
  // mas a IA aceita `date` arbitrária.
  test('mês já fechado (archived) rejeita a criação da transação', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue({ id: 'tx-closed' }) // mês já fechado
    mockCreate
      .mockResolvedValueOnce(toolCallReply('create_transaction', { type: 'expense', amount: 50, category: 'food', date: '2026-01-15' }))
      .mockResolvedValueOnce(simpleReply('Esse mês já foi fechado.'))

    await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Registra 50 reais em alimentação em janeiro' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.error).toMatch(/já foi fechado/i)
    expect(prisma.transaction.create).not.toHaveBeenCalled()
  })
})

// ══════════════════════════════════════════════════════════
// POST /api/agent/predict — continua exclusivo do Pro/Elite (sem regressão)
// ══════════════════════════════════════════════════════════
describe('POST /api/agent/predict — gate de plano', () => {
  test('plano free é bloqueado → 403', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free' }))

    const res = await request(app).post('/api/agent/predict').set(authHeader())

    expect(res.status).toBe(403)
    expect(res.body.requiredPlan).toBe('pro')
  })

  test('plano pro sem transações no mês retorna prediction null (sem chamar a IA)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))
    prisma.transaction.findMany.mockResolvedValue([])

    const res = await request(app).post('/api/agent/predict').set(authHeader())

    expect(res.status).toBe(200)
    expect(res.body.prediction).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('não quebra e calcula o disponível corretamente com salário Decimal redondo (regressão do bug de 10x)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro', salary: new Prisma.Decimal('23000.00') }))
    prisma.transaction.findMany.mockResolvedValue([
      { type: 'expense', amount: new Prisma.Decimal('500.00'), category: 'food' },
    ])
    mockCreate.mockResolvedValueOnce(simpleReply('Você deve fechar o mês no azul.'))

    const res = await request(app).post('/api/agent/predict').set(authHeader())

    expect(res.status).toBe(200)
    const promptSent = mockCreate.mock.calls[0][0].messages[1].content
    expect(promptSent).toContain('Disponível: R$ 23000.00')
    expect(promptSent).not.toContain('230000.00')
  })
})

// ══════════════════════════════════════════════════════════
// POST /api/agent/monthly-report — exclusivo do Elite (sem regressão)
// ══════════════════════════════════════════════════════════
describe('POST /api/agent/monthly-report — gate de plano', () => {
  test('plano pro é bloqueado → 403 (já era exclusivo do Elite)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))

    const res = await request(app).post('/api/agent/monthly-report').set(authHeader())

    expect(res.status).toBe(403)
    expect(res.body.requiredPlan).toBe('elite')
  })

  test('saldo do relatório não fica 10x maior com salário Decimal redondo (regressão do bug de 10x)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite', salary: new Prisma.Decimal('23000.00') }))
    prisma.transaction.findMany.mockResolvedValue([
      { type: 'expense', amount: new Prisma.Decimal('1200.00'), category: 'food', description: 'Mercado' },
    ])
    prisma.budget.findMany.mockResolvedValue([])
    mockCreate.mockResolvedValueOnce(simpleReply('Relatório gerado.'))

    const res = await request(app).post('/api/agent/monthly-report').set(authHeader()).send({})

    expect(res.status).toBe(200)
    const promptSent = mockCreate.mock.calls[0][0].messages[1].content
    expect(promptSent).toContain('Salário R$23000.00')
    expect(promptSent).toContain('Saldo R$21800.00')
    expect(promptSent).not.toContain('230000.00')
  })
})

// ══════════════════════════════════════════════════════════
// POST /api/agent/transcribe — registro de transação por voz (Whisper/Groq)
// ══════════════════════════════════════════════════════════
describe('POST /api/agent/transcribe', () => {
  const attachAudio = (req, { field = 'audio', filename = 'voz.webm', contentType = 'audio/webm', bytes = 2000 } = {}) =>
    req.attach(field, Buffer.alloc(bytes, 1), { filename, contentType })

  // clearMocks/restoreMocks (jest.config.js) zeram o mock entre testes — fixa
  // um default de "duração curta" pra não afetar os testes que não mexem
  // nisso de propósito (o áudio fake deles não é parseável de verdade de
  // qualquer forma; isso só documenta o comportamento esperado).
  beforeEach(() => {
    mockGetAudioDuration.mockResolvedValue(5)
  })

  test('plano free é bloqueado → 403 (mesmo gate do /chat)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free' }))

    const res = await attachAudio(
      request(app).post('/api/agent/transcribe').set(authHeader())
    )

    expect(res.status).toBe(403)
    expect(res.body.requiredPlan).toBe('elite')
    expect(mockTranscribe).not.toHaveBeenCalled()
  })

  test('plano pro é bloqueado → 403 (voz é exclusiva do Elite, igual ao /chat)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))

    const res = await attachAudio(
      request(app).post('/api/agent/transcribe').set(authHeader())
    )

    expect(res.status).toBe(403)
    expect(mockTranscribe).not.toHaveBeenCalled()
  })

  test('sem arquivo de áudio retorna 400', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))

    const res = await request(app)
      .post('/api/agent/transcribe')
      .set(authHeader())

    expect(res.status).toBe(400)
    expect(mockTranscribe).not.toHaveBeenCalled()
  })

  test('formato de áudio não suportado retorna 400 (não 500)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))

    const res = await attachAudio(
      request(app).post('/api/agent/transcribe').set(authHeader()),
      { filename: 'malware.exe', contentType: 'application/x-msdownload' }
    )

    expect(res.status).toBe(400)
    expect(mockTranscribe).not.toHaveBeenCalled()
  })

  test('áudio maior que 3MB retorna 400 (não 500)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))

    const res = await attachAudio(
      request(app).post('/api/agent/transcribe').set(authHeader()),
      { bytes: 3 * 1024 * 1024 + 1 }
    )

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/grande/i)
  }, 15000)

  // Achado de auditoria de segurança (2026-10-21): o limite de bytes sozinho
  // não limita duração de verdade (bitrate varia) — um áudio de ~33min cabia
  // em 3MB com bitrate baixo. Checa a duração real do arquivo.
  test('áudio com duração acima do limite retorna 400 (não 500)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockGetAudioDuration.mockResolvedValue(600) // 10 minutos

    const res = await attachAudio(
      request(app).post('/api/agent/transcribe').set(authHeader())
    )

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/longo/i)
    expect(mockTranscribe).not.toHaveBeenCalled()
  })

  test('falha ao ler metadados do áudio não bloqueia a transcrição (fail-open)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockGetAudioDuration.mockRejectedValue(new Error('formato não reconhecido'))
    mockTranscribe.mockResolvedValueOnce({ text: 'Gastei 50 reais no mercado' })

    const res = await attachAudio(
      request(app).post('/api/agent/transcribe').set(authHeader())
    )

    expect(res.status).toBe(200)
    expect(mockTranscribe).toHaveBeenCalled()
  })

  test('transcrição bem-sucedida retorna o texto', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockTranscribe.mockResolvedValueOnce({ text: 'Gastei 50 reais no mercado' })

    const res = await attachAudio(
      request(app).post('/api/agent/transcribe').set(authHeader())
    )

    expect(res.status).toBe(200)
    expect(res.body.text).toBe('Gastei 50 reais no mercado')
    expect(mockTranscribe).toHaveBeenCalledTimes(1)
    expect(mockTranscribe).toHaveBeenCalledWith(expect.objectContaining({
      model:    'whisper-large-v3-turbo',
      language: 'pt',
    }))
  })

  test('transcrição vazia (silêncio) retorna 422', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockTranscribe.mockResolvedValueOnce({ text: '   ' })

    const res = await attachAudio(
      request(app).post('/api/agent/transcribe').set(authHeader())
    )

    expect(res.status).toBe(422)
  })

  test('erro do Groq é tratado via handleGroqError (429 sobrecarga)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    // mockRejectedValue (não Once): withRetry tenta até 3x — todas precisam falhar
    // pra simular sobrecarga persistente e cair no handleGroqError como esperado.
    mockTranscribe.mockRejectedValue(Object.assign(new Error('overloaded'), { status: 529 }))

    const res = await attachAudio(
      request(app).post('/api/agent/transcribe').set(authHeader())
    )

    expect(res.status).toBe(429)
  }, 15000)

  test('sem autenticação retorna 401', async () => {
    const res = await attachAudio(request(app).post('/api/agent/transcribe'))
    expect(res.status).toBe(401)
  })
})

// ══════════════════════════════════════════════════════════
// Circuit breaker do Groq — TEM que ficar por último no arquivo: o estado
// (circuitFailures/circuitOpenedAt) é módulo-level, compartilhado entre
// TODAS as rotas de IA, e este teste deliberadamente deixa o circuito
// aberto no final (testes depois deste veriam 503 mesmo com Groq saudável).
// ══════════════════════════════════════════════════════════
describe('Circuit breaker do Groq', () => {
  test('abre depois de falhas consecutivas e recusa rápido sem chamar o Groq de novo', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))

    // 1 chamada bem-sucedida primeiro — zera qualquer falha acumulada por
    // outro teste do arquivo (o teste de 529 do /transcribe, acima, já soma 1),
    // deixando o teste independente da ordem/histórico dos demais.
    mockCreate.mockResolvedValueOnce(simpleReply('oi'))
    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'oi' })

    // Erro NÃO retryable (500 genérico) — falha na 1ª tentativa de cada
    // request, sem esperar o backoff do withRetry (que só reage a 429/529/503).
    mockCreate.mockRejectedValue(Object.assign(new Error('erro genérico'), { status: 500 }))

    for (let i = 0; i < 5; i++) {
      const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: `falha ${i}` })
      expect(res.status).toBe(500)
    }

    const callsBeforeCircuitOpen = mockCreate.mock.calls.length

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'circuito deveria estar aberto agora' })

    expect(res.status).toBe(503)
    expect(res.body.error).toMatch(/temporariamente indisponível/i)
    // Circuito aberto: essa 6ª requisição nem chegou a chamar o Groq de novo.
    expect(mockCreate.mock.calls.length).toBe(callsBeforeCircuitOpen)
  })
})
