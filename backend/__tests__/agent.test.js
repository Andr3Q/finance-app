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
// Pedir a alteração NÃO altera nada: a IA só prepara a ação (com os valores reais do banco) e devolve um token; quem
// executa é POST /api/agent/confirm, depois do toque do usuário em "Confirmar". Achado crítico da rodada de QA N2-7
// (2026-10-28): a IA apagava e alterava transações sem perguntar.
const txRow = (overrides = {}) => ({
  id: TX_ID, userId: 'user-123', type: 'expense', amount: new Prisma.Decimal('400.00'), category: 'food',
  description: 'Mercado', date: new Date('2026-10-10T15:00:00.000Z'), archived: false, ...overrides,
})

describe('Ferramenta update_transaction (via /api/agent/chat) — só prepara, o usuário confirma', () => {
  test('NÃO altera: devolve a ação pendente com o token e o texto fixo do servidor', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(txRow())
    mockCreate
      .mockResolvedValueOnce(toolCallReply('update_transaction', { id: TX_ID, amount: 300 }))
      .mockResolvedValueOnce(simpleReply('Pronto, atualizei para R$ 300,00!')) // o modelo "mentindo": o servidor não deixa passar

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Muda a conta de alimentação de 400 para 300' })

    expect(res.status).toBe(200)
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled()
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith({ where: { id: TX_ID, userId: 'user-123', archived: false } })
    expect(res.body.dataChanged).toBe(false)
    expect(res.body.pendingAction).toEqual({
      token: expect.any(String), kind: 'update',
      summary: 'Alterar “Mercado” de 10/10/2026: valor de R$ 400,00 para R$ 300,00',
      expiresAt: expect.any(Number), expiresInMs: 600_000,
    })
    // o app fecha sozinho o botão depois da validade (10 min), sem esperar o servidor recusar
    expect(res.body.pendingAction.expiresAt).toBeGreaterThan(Date.now() + 9 * 60 * 1000)
    expect(res.body.pendingAction.expiresAt).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000)
    expect(res.body.reply).toBe('Alterar “Mercado” de 10/10/2026: valor de R$ 400,00 para R$ 300,00?\nAinda não fiz nada: toque em Confirmar para concluir ou em Cancelar para desistir.')
    // o modelo só fica sabendo que está pendente — o token fica com o app
    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.pending_confirmation).toBe(true)
    expect(toolResult.success).toBeUndefined()
    expect(JSON.stringify(toolResult)).not.toContain(res.body.pendingAction.token)
  })

  test('descreve só o que muda (categoria e descrição também)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(txRow())
    mockCreate
      .mockResolvedValueOnce(toolCallReply('update_transaction', { id: TX_ID, amount: 400, category: 'home', description: 'Feira' }))
      .mockResolvedValueOnce(simpleReply('ok'))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Muda o mercado para casa' })

    expect(res.body.pendingAction.summary).toBe('Alterar “Mercado” de 10/10/2026: categoria de Alimentação para Casa; descrição para “Feira”')
  })

  test('alteração que não muda nada devolve erro, sem ação pendente', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(txRow())
    mockCreate
      .mockResolvedValueOnce(toolCallReply('update_transaction', { id: TX_ID, amount: 400 }))
      .mockResolvedValueOnce(simpleReply('Já está assim.'))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Muda o mercado para 400' })

    expect(res.body.pendingAction).toBeNull()
    expect(res.body.reply).toBe('Já está assim.')
    expect(JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content).error).toMatch(/nada para alterar/i)
  })

  test('transação inexistente, de outro usuário ou de mês fechado (archived): erro, sem ação pendente', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(null) // userId + archived:false não bateram nenhuma linha
    mockCreate
      .mockResolvedValueOnce(toolCallReply('update_transaction', { id: TX_ID, amount: 300 }))
      .mockResolvedValueOnce(simpleReply('Não consegui editar — mês já fechado.'))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Muda essa transação' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.error).toMatch(/mês fechado|não encontrada/i)
    expect(res.body.pendingAction).toBeNull()
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled()
  })

  test('id inválido (não-UUID) é rejeitado sem consultar o banco', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate
      .mockResolvedValueOnce(toolCallReply('update_transaction', { id: 'nao-existe', amount: 300 }))
      .mockResolvedValueOnce(simpleReply('id inválido.'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Muda a transação x' })

    expect(prisma.transaction.findFirst).not.toHaveBeenCalled()
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

// Achado N2-7 (rodada final): com a IA sobrecarregada, cada "Tentar de novo" gastava uma das 40 mensagens por hora — ~8 tentativas
// levaram a cota de 12 a 4, sem nenhuma resposta. Falha do PROVEDOR não pode custar cota (nos testes o limiter fica desligado;
// aqui ele é ligado só durante o teste, e o cabeçalho ratelimit-remaining mostra quanto sobrou).
describe('Cota de mensagens por hora e falhas do provedor de IA', () => {
  const asUser = (id) => ({ Cookie: `token=${makeToken(id)}` })
  const withLimiter = async (fn) => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try { await fn() } finally { process.env.NODE_ENV = prev; mockCreate.mockReset() }
  }

  test('pedido que falha por culpa do provedor NÃO gasta a cota: a segunda tentativa vê a mesma sobra', () => withLimiter(async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }))
    const first  = await request(app).post('/api/agent/chat').set(asUser('quota-falha')).send({ message: 'oi' })
    const second = await request(app).post('/api/agent/chat').set(asUser('quota-falha')).send({ message: 'oi de novo' })
    expect(first.status).toBe(500)
    expect(first.headers['ratelimit-remaining']).toBe('39')
    expect(second.headers['ratelimit-remaining']).toBe('39') // se a falha custasse cota, seria 38
  }))

  test('resposta boa gasta a cota (o limite continua valendo para quem usa)', () => withLimiter(async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate.mockResolvedValue(simpleReply('Olá!'))
    const first  = await request(app).post('/api/agent/chat').set(asUser('quota-ok')).send({ message: 'oi' })
    const second = await request(app).post('/api/agent/chat').set(asUser('quota-ok')).send({ message: 'oi de novo' })
    expect(first.status).toBe(200)
    expect(first.headers['ratelimit-remaining']).toBe('39')
    expect(second.headers['ratelimit-remaining']).toBe('38')
  }))

  test('pedido inválido (400) continua contando: o limite existe para frear abuso', () => withLimiter(async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    const first  = await request(app).post('/api/agent/chat').set(asUser('quota-400')).send({})
    const second = await request(app).post('/api/agent/chat').set(asUser('quota-400')).send({})
    expect(first.status).toBe(400)
    expect(Number(second.headers['ratelimit-remaining'])).toBe(Number(first.headers['ratelimit-remaining']) - 1)
  }))
})

// Se a IA falhar DEPOIS de uma ação já feita, o usuário não pode ver só um erro: "Tentar de novo" lançaria em dobro.
describe('Falha da IA depois de uma ação (QA N2-7, rodada 2)', () => {
  test('gasto registrado e o 2º turno do modelo falha: responde 200 avisando, com dataChanged', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.transaction.create.mockResolvedValue({ id: 'tx-novo', description: null })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('create_transaction', { type: 'expense', amount: 30, category: 'transport', date: '2026-10-20' }))
      .mockRejectedValueOnce(Object.assign(new Error('Too Many Requests'), { status: 429 }))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Registra 30 de transporte' })

    expect(res.status).toBe(200)
    expect(res.body.dataChanged).toBe(true)
    expect(res.body.reply).toBe('Fiz o que você pediu, mas não consegui escrever a resposta agora. Confira no Extrato.')
    expect(prisma.transaction.create).toHaveBeenCalledTimes(1)
  })

  test('ação preparada e o 2º turno do modelo falha: o cartão de confirmação continua valendo', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(txRow())
    mockCreate
      .mockResolvedValueOnce(toolCallReply('delete_transaction', { id: TX_ID }))
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Exclui o mercado' })

    expect(res.status).toBe(200)
    expect(res.body.pendingAction.kind).toBe('delete')
    expect(res.body.reply).toContain('Ainda não fiz nada')
    expect(res.body.dataChanged).toBe(false)
  })

  test('falha da IA SEM nenhuma ação feita continua sendo erro (o usuário pode tentar de novo sem risco)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'APITimeoutError' }))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Quanto gastei?' })

    expect(res.status).toBe(504)
    expect(res.body.error).toMatch(/demorou muito/i)
  })

  test('leitura (sem mudar nada) seguida de falha também é erro comum', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.budget.findMany.mockResolvedValue([])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_summary', {}))
      .mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Qual meu saldo?' })

    expect(res.status).toBe(500)
  })
})

// Achados do revisor independente
describe('Revisão independente — chat', () => {
  test('ação feita mas o modelo respondeu vazio: NÃO manda "tente novamente" (levaria a lançar em dobro)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.transaction.create.mockResolvedValue({ id: 'tx-novo', description: 'Alimentação' })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('create_transaction', { type: 'expense', amount: 50, category: 'food', description: 'Mercado' }))
      .mockResolvedValueOnce({ choices: [{ message: { content: '', tool_calls: [] } }] })

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Registra 50 de mercado' })

    expect(res.status).toBe(200)
    expect(res.body.dataChanged).toBe(true)
    expect(res.body.reply).toBe('Fiz o que você pediu, mas não consegui escrever a resposta agora. Confira no Extrato.')
    expect(res.body.reply).not.toMatch(/tente novamente/i)
  })

  test('nada feito e o modelo respondeu vazio: aí sim "tente novamente" (é seguro)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: '', tool_calls: [] } }] })

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'oi' })

    expect(res.body.reply).toBe('Não consegui gerar uma resposta. Tente novamente.')
    expect(res.body.dataChanged).toBe(false)
  })

  test.each([[undefined], [null], [''], ['   ']])('registrar gasto sem descrição (%p) grava o nome da categoria: a coluna é NOT NULL', async (description) => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.transaction.create.mockResolvedValue({ id: 'tx-novo', description: 'Alimentação' })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('create_transaction', { type: 'expense', amount: 50, category: 'food', description }))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Registrar gasto de R$ 50 em alimentação' })

    expect(prisma.transaction.create.mock.calls[0][0].data.description).toBe('Alimentação')
  })

  test('com descrição, ela é usada (cortada em 255)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.transaction.create.mockResolvedValue({ id: 'tx-novo', description: 'x' })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('create_transaction', { type: 'expense', amount: 5, category: 'food', description: `  ${'a'.repeat(400)}  ` }))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'x' })

    expect(prisma.transaction.create.mock.calls[0][0].data.description).toBe('a'.repeat(255))
  })

  // O parser global é de 10kb; um histórico de 10 mensagens longas (a IA responde listas de vários KB) estourava → 413 para sempre.
  test('histórico longo (10 mensagens de 2000 caracteres + pergunta) cabe: 200, não 413', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate.mockResolvedValueOnce(simpleReply('ok'))
    const history = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(2000) }))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'y'.repeat(2000), history })

    expect(res.status).toBe(200)
    // 10 x 2000 passa de 12000 caracteres: o servidor (sanitizeHistory) fica só com as 4 últimas — sistema + 4 + a pergunta
    expect(mockCreate.mock.calls[0][0].messages).toHaveLength(6)
  })

  test('mas o teto é o do chat (32kb): um corpo gigante continua sendo recusado', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'oi', history: [{ role: 'user', content: 'z'.repeat(40_000) }] })
    expect(res.status).toBe(413)
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('Mensagens das ferramentas e aviso do 2º pedido', () => {
  test('dois pedidos de exclusão: a resposta avisa que só a primeira foi preparada', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(txRow())
    mockCreate
      .mockResolvedValueOnce(multiToolCallReply([
        { name: 'delete_transaction', args: { id: TX_ID } },
        { name: 'delete_transaction', args: { id: TX_ID2 } },
      ]))
      .mockResolvedValueOnce(simpleReply('ok'))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Exclui a farmácia e o sushi' })

    expect(res.body.reply).toMatch(/Ainda não fiz nada[\s\S]*Preparei só esta ação: peça a outra numa mensagem separada\./)
  })

  test('uma exclusão só: sem o aviso de "só esta ação"', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(txRow())
    mockCreate
      .mockResolvedValueOnce(toolCallReply('delete_transaction', { id: TX_ID }))
      .mockResolvedValueOnce(simpleReply('ok'))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Exclui o mercado' })

    expect(res.body.reply).not.toContain('Preparei só esta ação')
  })

  test('registrar gasto devolve ao modelo uma frase no padrão do app (R$ 1.234,56, data brasileira)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.transaction.create.mockResolvedValue({ id: 'tx-novo', description: 'Uber' })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('create_transaction', { type: 'expense', amount: 1234.5, category: 'transport', description: 'Uber', date: '2026-10-20' }))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Registra 1234,50 de uber' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.message).toBe('Registrado: saída de R$ 1.234,50 em Transporte (Uber), 20/10/2026.')
  })

  test('pagar conta fixa devolve o valor no padrão do app', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    prisma.transaction.count.mockResolvedValue(0)
    prisma.budget.findFirst.mockResolvedValue({ id: 'bud-1', userId: 'user-123', name: 'Condomínio', amount: 600 })
    prisma.transaction.create.mockResolvedValue({ id: 'tx-pg', amount: new Prisma.Decimal('600.00'), description: 'Condomínio' })
    mockCreate
      .mockResolvedValueOnce(toolCallReply('pay_fixed_bill', { budgetName: 'Condomínio' }))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Paga o condomínio' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    if (toolResult.success) expect(toolResult.message).toBe('Pagamento de "Condomínio" registrado: R$ 600,00.')
  })
})

// Achado N2-7 (2026-10-28): a IA dizia "Entradas R$ 1.800,00" (só as receitas, sem o salário) enquanto o Início e o
// Extrato mostravam R$ 16.800,00 — e o "Resultado" dela usava os 16.800, então os números da própria resposta não fechavam.
describe('Ferramenta get_summary — Entradas e Resultado iguais aos do Início/Extrato', () => {
  test('entradas = salário + receitas; resultado = entradas − saídas − fixas a pagar; valores já formatados', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite', salary: new Prisma.Decimal('15000.00') }))
    prisma.transaction.findMany.mockResolvedValue([
      { type: 'income',  amount: new Prisma.Decimal('1800.00') },
      { type: 'expense', amount: new Prisma.Decimal('7377.80') },
      { type: 'expense', amount: new Prisma.Decimal('629.10') },
    ])
    prisma.budget.findMany.mockResolvedValue([])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_summary', {}))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Quanto entrou e qual meu resultado?' })

    const r = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(r.entradas).toBe(16800)
    expect(r.saidas).toBe(8006.9)
    expect(r.resultado).toBe(8793.1)
    expect(r.balance).toBe(8793.1) // nome antigo mantido
    expect(r.totalIncome).toBe(1800) // só as receitas lançadas — NÃO são as "Entradas" do app
    expect(r.texto).toEqual({
      entradas: 'R$ 16.800,00', salario: 'R$ 15.000,00', receitas: 'R$ 1.800,00',
      saidas: 'R$ 8.006,90', contasFixasAPagar: 'R$ 0,00', resultado: 'R$ 8.793,10',
    })
  })

  test('a conta fixa ainda não paga entra no resultado, e os nomes das contas vêm formatados', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite', salary: new Prisma.Decimal('5000.00') }))
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.budget.findMany.mockResolvedValue([{ id: 'b1', name: 'Condomínio', amount: new Prisma.Decimal('600.00') }])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_summary', {}))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Qual meu resultado?' })

    const r = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(r.resultado).toBe(4400)
    expect(r.texto.contasFixasAPagar).toBe('R$ 600,00')
    expect(r.budgets).toEqual([{ name: 'Condomínio', amount: 600, amountText: 'R$ 600,00' }])
  })
})

describe('Ferramenta get_transactions — totais completos mesmo com a lista cortada', () => {
  const row = (i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, type: i % 10 === 0 ? 'income' : 'expense',
    amount: new Prisma.Decimal('100.00'), category: i % 2 ? 'food' : 'transport',
    description: `Item ${i}`, date: new Date('2026-10-10T15:00:00.000Z'),
  })
  const group = (category, type, sum, n) => ({ category, type, _sum: { amount: new Prisma.Decimal(sum) }, _count: { _all: n } })

  test('150 transações: total e por categoria vêm da agregação do banco (todas); a lista mostra só as 40 mais recentes e avisa', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findMany.mockResolvedValue(Array.from({ length: 40 }, (_, i) => row(i)))
    // 150 transações de R$ 100: 15 receitas (food), 135 saídas (70 food + 65 transport)
    prisma.transaction.groupBy.mockResolvedValue([
      group('food', 'expense', '6700.00', 67), group('transport', 'expense', '6800.00', 68), group('food', 'income', '1500.00', 15),
    ])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_transactions', {}))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Onde estou gastando mais?' })

    const content = mockCreate.mock.calls[1][0].messages.at(-1).content
    const r = JSON.parse(content) // JSON válido: não foi cortado no meio
    expect(r.count).toBe(150)
    expect(r.truncated).toBe(true)
    expect(r.transactions).toHaveLength(40)
    expect(r.totalIncome).toBe(1500)
    expect(r.totalExpenses).toBe(13500)
    expect(r.texto).toEqual({ saidas: 'R$ 13.500,00', receitas: 'R$ 1.500,00' })
    expect(r.byCategory.map(c => [c.category, c.expenses, c.count])).toEqual([['Transporte', 6800, 68], ['Alimentação', 6700, 82]]) // maior gasto primeiro
    expect(r.byCategory.find(c => c.category === 'Alimentação').income).toBe(1500)
    expect(r.transactions[0]).toEqual({
      id: expect.any(String), type: 'income', amount: 100, amountText: 'R$ 100,00',
      category: expect.any(String), description: 'Item 0', date: '10/10/2026',
    })
    expect(content.length).toBeLessThan(12000)
  })

  // Achado do revisor independente: os totais eram somados sobre as 200 primeiras linhas (take: 200) — quem importou muitos
  // lançamentos recebia totais menores que os reais.
  test('mais de 200 transações no mês: os totais NÃO são limitados a 200 linhas', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findMany.mockResolvedValue(Array.from({ length: 40 }, (_, i) => row(i)))
    prisma.transaction.groupBy.mockResolvedValue([group('food', 'expense', '123456.78', 1234)])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_transactions', {}))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Quanto gastei?' })

    const r = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(r.count).toBe(1234)
    expect(r.totalExpenses).toBe(123456.78)
    expect(r.texto.saidas).toBe('R$ 123.456,78')
    expect(r.truncated).toBe(true)
  })

  test('a lista pede só as 40 mais recentes (não 200) e a agregação usa o MESMO filtro, sempre do usuário', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.groupBy.mockResolvedValue([])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_transactions', { search: '  ALIMENT ' }))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Quanto gastei com alimentação?' })

    const list = prisma.transaction.findMany.mock.calls[0][0]
    const agg  = prisma.transaction.groupBy.mock.calls[0][0]
    expect(list.take).toBe(40)
    expect(list.where.userId).toBe('user-123')
    expect(list.where.OR).toEqual([
      { description: { contains: 'aliment', mode: 'insensitive' } },
      { category: { in: ['food'] } },
    ])
    expect(agg.where).toEqual(list.where)   // totais e lista olham exatamente as mesmas transações
    expect(agg.by).toEqual(['category', 'type'])
  })

  test('sem busca não filtra nada além do usuário e do mês', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.groupBy.mockResolvedValue([])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_transactions', { month: 9, year: 2026 }))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'E em setembro?' })

    expect(Object.keys(prisma.transaction.findMany.mock.calls[0][0].where).sort()).toEqual(['date', 'userId'])
    expect(Object.keys(prisma.transaction.groupBy.mock.calls[0][0].where).sort()).toEqual(['date', 'userId'])
  })

  test('mês sem transações: totais zerados, sem lista e sem aviso de corte', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.transaction.groupBy.mockResolvedValue([])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_transactions', {}))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Quanto gastei?' })

    const r = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(r).toMatchObject({ count: 0, totalExpenses: 0, totalIncome: 0, byCategory: [], transactions: [], truncated: false })
  })
})

// Achado N2-7: "A IA não enxerga as metas do usuário".
describe('Ferramenta get_goals (via /api/agent/chat)', () => {
  test('devolve as metas do usuário e o mesmo percentual do círculo "Metas" do Início', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.goal.findMany.mockResolvedValue([
      { title: 'Viagem', targetAmount: new Prisma.Decimal('5000.00'), currentAmount: new Prisma.Decimal('1000.00'), deadline: new Date('2027-01-15T03:00:00.000Z') },
      { title: 'Reserva', targetAmount: new Prisma.Decimal('10000.00'), currentAmount: new Prisma.Decimal('12000.00'), deadline: null }, // passou da meta: conta 100%
    ])
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_goals', {}))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Quantas metas eu tenho?' })

    expect(prisma.goal.findMany.mock.calls[0][0].where).toEqual({ userId: 'user-123' })
    const r = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(r.count).toBe(2)
    expect(r.overallPercent).toBe(60) // (0,2 + 1) / 2 = 60%
    expect(r.goals[0]).toEqual({ title: 'Viagem', target: 5000, targetText: 'R$ 5.000,00', saved: 1000, savedText: 'R$ 1.000,00', percent: 20, deadline: '15/01/2027' })
    expect(r.goals[1].percent).toBe(100)
    expect(r.goals[1].deadline).toBeNull()
  })

  test('sem metas', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate
      .mockResolvedValueOnce(toolCallReply('get_goals', {}))
      .mockResolvedValueOnce(simpleReply('ok'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Tenho metas?' })

    expect(JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)).toEqual({ count: 0, overallPercent: 0, goals: [] })
  })
})

// O texto que o usuário lê não depende de o modelo obedecer ao prompt: o servidor tira emoji e acerta o dinheiro.
// Achado N2-7 rodada 3: depois de ~20 trocas de mensagem o app mandava mais de 40 mensagens de histórico e o servidor
// respondia "Histórico inválido." (400) a TUDO — o chat só voltava recarregando a página.
describe('Histórico da conversa (POST /api/agent/chat)', () => {
  const hist = (n) => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `mensagem ${i}` }))

  test('conversa longa (mais de 40 mensagens) NÃO é recusada: o modelo recebe só as 10 últimas', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate.mockResolvedValueOnce(simpleReply('oi'))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'e agora?', history: hist(60) })

    expect(res.status).toBe(200)
    const sent = mockCreate.mock.calls[0][0].messages
    expect(sent).toHaveLength(12) // sistema + 10 do histórico + a pergunta
    expect(sent[1].content).toBe('mensagem 50')
    expect(sent.at(-1)).toEqual({ role: 'user', content: 'e agora?' })
  })

  test('lixo continua recusado: não é lista ou passa de 100 itens', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    for (const bad of ['texto', { a: 1 }, 5, hist(101)]) {
      const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'oi', history: bad })
      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Histórico inválido.')
    }
    expect(mockCreate).not.toHaveBeenCalled()
  })
})

describe('Resposta da IA — limpeza determinística', () => {
  test('sem emoji e com dinheiro no padrão brasileiro', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate.mockResolvedValueOnce(simpleReply('✅ Pagamento do Condomínio registrado! 🚗💰\nVocê gastou R$ 7 377,80 (0 R$ em lazer).'))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Paga o condomínio' })

    expect(res.body.reply).toBe('Pagamento do Condomínio registrado!\nVocê gastou R$ 7.377,80 (R$ 0 em lazer).')
  })

  test('o prompt de sistema carrega as regras que o QA cobrou (escopo, formato, entradas, confirmação)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    mockCreate.mockResolvedValueOnce(simpleReply('oi'))

    await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'oi' })

    const system = mockCreate.mock.calls[0][0].messages[0].content
    expect(system).toMatch(/ESCOPO[\s\S]*NÃO responda o assunto/)
    expect(system).toMatch(/Sem markdown[\s\S]*sem emojis/)
    expect(system).toMatch(/"R\$ 1\.234,56"/)
    expect(system).toMatch(/Entradas = salário \+ receitas do mês/)
    expect(system).toMatch(/nunca peça "confirma\?" por texto/)
    expect(system).toMatch(/get_goals/)
    // fatos do produto (a IA mandava "definir um teto diário" e "evitar juros nas metas", que não existem no app)
    expect(system).toMatch(/Limites são tetos MENSAIS por categoria \(não existe teto diário\)/)
    expect(system).toMatch(/Metas são valores a guardar e não têm juros/)
    const toolNames = mockCreate.mock.calls[0][0].tools.map(t => t.function.name)
    expect(toolNames).toEqual(expect.arrayContaining(['get_goals', 'get_summary', 'get_transactions', 'update_transaction', 'delete_transaction']))
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

describe('Ferramenta delete_transaction (via /api/agent/chat) — só prepara, o usuário confirma', () => {
  test('NÃO exclui: devolve a ação pendente com o que seria excluído', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(txRow())
    mockCreate
      .mockResolvedValueOnce(toolCallReply('delete_transaction', { id: TX_ID }))
      .mockResolvedValueOnce(simpleReply('Excluí a transação de alimentação.'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Exclui a conta de alimentação de 400' })

    expect(res.status).toBe(200)
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled()
    expect(prisma.transaction.delete).not.toHaveBeenCalled()
    expect(res.body.dataChanged).toBe(false)
    expect(res.body.pendingAction).toEqual({ token: expect.any(String), kind: 'delete', summary: 'Excluir “Mercado” de R$ 400,00 em 10/10/2026', expiresAt: expect.any(Number), expiresInMs: 600_000 })
    expect(res.body.reply).toContain('Ainda não fiz nada')
    expect(res.body.reply).not.toContain('Excluí a transação')
    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.pending_confirmation).toBe(true)
    expect(toolResult.success).toBeUndefined()
  })

  test('sem descrição, o nome é o da categoria', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(txRow({ description: null, category: 'transport', amount: new Prisma.Decimal('1234.5') }))
    mockCreate
      .mockResolvedValueOnce(toolCallReply('delete_transaction', { id: TX_ID }))
      .mockResolvedValueOnce(simpleReply('ok'))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Exclui o transporte' })

    expect(res.body.pendingAction.summary).toBe('Excluir “Transporte” de R$ 1.234,50 em 10/10/2026')
  })

  test('transação inexistente, de outro usuário ou de mês fechado: erro, sem ação pendente', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(null)
    mockCreate
      .mockResolvedValueOnce(toolCallReply('delete_transaction', { id: TX_ID }))
      .mockResolvedValueOnce(simpleReply('Não encontrei essa transação.'))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Exclui essa transação' })

    const toolResult = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content)
    expect(toolResult.error).toBeTruthy()
    expect(res.body.pendingAction).toBeNull()
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled()
  })

  // Barreira técnica: o modelo pode pedir 2 ações na mesma resposta (mesma iteração do loop), então a instrução do
  // prompt de sistema não basta — só a primeira vira ação pendente.
  test('duas exclusões pedidas na mesma resposta do modelo: só a 1ª é preparada', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(txRow())
    mockCreate
      .mockResolvedValueOnce(multiToolCallReply([
        { name: 'delete_transaction', args: { id: TX_ID } },
        { name: 'delete_transaction', args: { id: TX_ID2 } },
      ]))
      .mockResolvedValueOnce(simpleReply('Preparei a primeira. Peça a segunda numa mensagem separada.'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Exclui a conta de alimentação de 400 e a de transporte de 100' })

    expect(res.status).toBe(200)
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled()
    expect(prisma.transaction.findFirst).toHaveBeenCalledTimes(1)
    expect(res.body.pendingAction.kind).toBe('delete')

    const toolMessages = mockCreate.mock.calls[1][0].messages.filter(m => m.role === 'tool')
    expect(toolMessages).toHaveLength(2)
    expect(JSON.parse(toolMessages[0].content).pending_confirmation).toBe(true)
    expect(JSON.parse(toolMessages[1].content).error).toMatch(/uma alteração ou exclusão por vez/i)
  })

  test('editar + excluir na mesma resposta: só a 1ª é preparada (teto comum)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(txRow())
    mockCreate
      .mockResolvedValueOnce(multiToolCallReply([
        { name: 'update_transaction', args: { id: TX_ID, amount: 300 } },
        { name: 'delete_transaction', args: { id: TX_ID2 } },
      ]))
      .mockResolvedValueOnce(simpleReply('ok'))

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Muda uma e apaga outra' })

    expect(res.body.pendingAction.kind).toBe('update')
    expect(prisma.transaction.findFirst).toHaveBeenCalledTimes(1)
  })
})

// ══════════════════════════════════════════════════════════
// POST /api/agent/confirm — o toque em "Confirmar" executa o que foi mostrado, e só isso
// ══════════════════════════════════════════════════════════
describe('POST /api/agent/confirm', () => {
  // Faz o caminho real: pede pelo chat, pega o token que o app recebeu.
  async function prepare(toolName, args, row = txRow()) {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(row)
    mockCreate
      .mockResolvedValueOnce(toolCallReply(toolName, args))
      .mockResolvedValueOnce(simpleReply('ok'))
    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'faz isso' })
    expect(res.body.pendingAction).toBeTruthy()
    prisma.transaction.findFirst.mockReset()
    return res.body.pendingAction.token
  }
  const confirm = (token, headers = authHeader()) => request(app).post('/api/agent/confirm').set(headers).send({ token })

  test('excluir: só depois do Confirmar apaga, com a trava de dono e mês aberto', async () => {
    const token = await prepare('delete_transaction', { id: TX_ID })
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled()
    prisma.transaction.deleteMany.mockResolvedValue({ count: 1 })

    const res = await confirm(token)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: 'Pronto, excluí a transação “Mercado” de R$ 400,00 em 10/10/2026.', dataChanged: true })
    expect(prisma.transaction.deleteMany).toHaveBeenCalledTimes(1)
    expect(prisma.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: TX_ID, userId: 'user-123', archived: false } })
    expect(mockCreate).toHaveBeenCalledTimes(2) // o Confirmar não chama o modelo (só os 2 turnos do pedido)
  })

  test('editar: aplica exatamente os campos que foram mostrados', async () => {
    const token = await prepare('update_transaction', { id: TX_ID, amount: 300, category: 'home' })
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled()
    prisma.transaction.updateMany.mockResolvedValue({ count: 1 })
    prisma.transaction.findUnique.mockResolvedValue(txRow({ amount: new Prisma.Decimal('300.00'), category: 'home' }))

    const res = await confirm(token)

    expect(res.status).toBe(200)
    // a confirmação repete o que mudou (o usuário não precisa ir ao Extrato conferir o novo valor)
    expect(res.body.message).toBe('Pronto, atualizei a transação “Mercado” de 10/10/2026: valor de R$ 400,00 para R$ 300,00; categoria de Alimentação para Casa.')
    expect(res.body.dataChanged).toBe(true)
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: TX_ID, userId: 'user-123', archived: false },
      data:  { amount: 300, category: 'home' },
    })
  })

  test('o token de um usuário não funciona para outro (nada é executado)', async () => {
    const token = await prepare('delete_transaction', { id: TX_ID })
    prisma.user.findUnique.mockResolvedValue(mockUser({ id: 'user-999', plan: 'elite' }))

    const res = await confirm(token, { Cookie: `token=${makeToken('user-999')}` })

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/inválida/i)
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled()
  })

  test('token expirado (mais de 10 minutos) é recusado', async () => {
    const { signPendingAction } = require('../src/services/agentConfirm')
    const token = signPendingAction({ userId: 'user-123', tool: 'delete_transaction', args: { id: TX_ID }, label: 'a transação X' }, Date.now() - 11 * 60 * 1000)
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))

    const res = await confirm(token)

    expect(res.status).toBe(400)
    expect(res.body.expired).toBe(true)
    expect(res.body.error).toMatch(/expirou/i)
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled()
  })

  test('token adulterado, vazio ou de outro tipo é recusado', async () => {
    const token = await prepare('delete_transaction', { id: TX_ID })
    const [payload, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), a: { id: TX_ID2 } })).toString('base64url')

    for (const bad of [`${forged}.${sig}`, `${payload}.AAAA`, payload, '', 'lixo.lixo', 123, null, undefined, 'x'.repeat(5000)]) {
      const res = await confirm(bad)
      expect(res.status).toBe(400)
    }
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled()
  })

  test('mês fechado depois do pedido: não executa e avisa (409)', async () => {
    const token = await prepare('update_transaction', { id: TX_ID, amount: 300 })
    prisma.transaction.updateMany.mockResolvedValue({ count: 0 })

    const res = await confirm(token)

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/mês fechado|não encontrada/i)
  })

  test('confirmar duas vezes: a segunda não acha mais a transação (409)', async () => {
    const token = await prepare('delete_transaction', { id: TX_ID })
    prisma.transaction.deleteMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

    expect((await confirm(token)).status).toBe(200)
    const second = await confirm(token)

    expect(second.status).toBe(409)
    expect(second.body.error).toMatch(/não encontrada/i)
  })

  test('plano que deixou de ser Elite não confirma (403) e sem login é 401', async () => {
    const token = await prepare('delete_transaction', { id: TX_ID })
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))

    expect((await confirm(token)).status).toBe(403)
    expect((await request(app).post('/api/agent/confirm').send({ token })).status).toBe(401)
    expect(prisma.transaction.deleteMany).not.toHaveBeenCalled()
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

  test('false quando update_transaction não acha a transação (mês já fechado)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(null)
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

  // Excluir só PREPARA (o dado muda no /confirm): nada para o app invalidar ainda.
  test('false quando delete_transaction só preparou a exclusão (mesmo com get_summary na mensagem)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(txRow())
    prisma.transaction.findMany.mockResolvedValue([])
    prisma.budget.findMany.mockResolvedValue([])
    mockCreate
      .mockResolvedValueOnce(multiToolCallReply([
        { name: 'delete_transaction', args: { id: TX_ID } },
        { name: 'get_summary', args: {} },
      ]))
      .mockResolvedValueOnce(simpleReply('Seu saldo agora é R$ 5.000,00.'))

    const res = await request(app)
      .post('/api/agent/chat')
      .set(authHeader())
      .send({ message: 'Exclui essa conta e me diz meu saldo' })

    expect(res.body.dataChanged).toBe(false)
    expect(res.body.pendingAction.kind).toBe('delete')
  })

  test('uma ação feita (create) + uma exclusão preparada: dataChanged true e o que o modelo contou vem antes do pedido de confirmação', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findFirst.mockResolvedValue(null)
    prisma.transaction.create.mockResolvedValue({ id: 'tx-novo' })
    mockCreate
      .mockResolvedValueOnce(multiToolCallReply([
        { name: 'create_transaction', args: { type: 'expense', amount: 50, category: 'food' } },
        { name: 'delete_transaction', args: { id: TX_ID } },
      ]))
      .mockResolvedValueOnce(simpleReply('Registrei o gasto de R$ 50,00.'))
    // 1ª findFirst = mês fechado? (create), 2ª = achar a transação a excluir
    prisma.transaction.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(txRow())

    const res = await request(app).post('/api/agent/chat').set(authHeader()).send({ message: 'Registra 50 de mercado e apaga o outro' })

    expect(res.body.dataChanged).toBe(true)
    expect(res.body.reply).toMatch(/^Registrei o gasto de R\$ 50,00\.\n\nExcluir “Mercado”/)
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
// GET /api/agent/weekly-tip — dica da semana do story Dicas IA
// (cada teste usa um usuário próprio: o cache da frase é módulo-level)
// ══════════════════════════════════════════════════════════
describe('GET /api/agent/weekly-tip', () => {
  const DAY = 24 * 60 * 60 * 1000
  const ago = (days) => new Date(Date.now() - days * DAY)
  // Alimentação: 3 períodos de referência com 500 + últimos 30 dias com 590 → +18%
  const foodAbove = () => [
    { category: 'food', amount: 500, date: ago(40) },
    { category: 'food', amount: 500, date: ago(70) },
    { category: 'food', amount: 500, date: ago(100) },
    { category: 'food', amount: 590, date: ago(3) },
  ]
  const as = (userId) => ({ Cookie: `token=${makeToken(userId)}` })
  const adviceReply = (text) => ({ choices: [{ message: { content: text } }] })

  test('exige autenticação', async () => {
    const res = await request(app).get('/api/agent/weekly-tip')
    expect(res.status).toBe(401)
  })

  test('plano free recebe o texto por regra, sem chamar a IA', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free' }))
    prisma.transaction.findMany.mockResolvedValue(foodAbove())

    const res = await request(app).get('/api/agent/weekly-tip').set(as('tip-free'))

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ category: 'food', label: 'Alimentação', pct: 18, excess: 90, source: 'rule' })
    expect(res.body.tip).toBe('Voltar à sua média em alimentação poupa cerca de R$ 90 por mês.')
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('plano pro: frase da IA + a conta calculada no servidor', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))
    prisma.transaction.findMany.mockResolvedValue(foodAbove())
    mockCreate.mockResolvedValueOnce(adviceReply('Planeje as refeições da semana e leve marmita.'))

    const res = await request(app).get('/api/agent/weekly-tip').set(as('tip-pro'))

    expect(res.status).toBe(200)
    expect(res.body.source).toBe('ai')
    expect(res.body.tip).toBe('Planeje as refeições da semana e leve marmita. Voltar à média poupa cerca de R$ 90 por mês.')
    const [body, options] = mockCreate.mock.calls[0]
    expect(body.model).toBe('llama-3.1-8b-instant')
    expect(body.messages[1].content).toContain('Alimentação')
    // só a categoria vai pro modelo — nem as estatísticas nem texto do usuário
    for (const n of ['18', '90', '590', '500']) expect(body.messages[1].content).not.toContain(n)
    expect(options).toEqual({ timeout: 8000 })
  })

  test('resposta da IA com número inventado é rejeitada → texto por regra', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))
    prisma.transaction.findMany.mockResolvedValue(foodAbove())
    mockCreate.mockResolvedValueOnce(adviceReply('Cozinhar em casa economiza cerca de R$ 280 por mês.'))

    const res = await request(app).get('/api/agent/weekly-tip').set(as('tip-invented'))

    expect(res.status).toBe(200)
    expect(res.body.source).toBe('rule')
    expect(res.body.tip).not.toContain('280')
    expect(res.body.tip).toContain('R$ 90')
  })

  test('falha da IA não derruba a dica: cai no texto por regra', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))
    prisma.transaction.findMany.mockResolvedValue(foodAbove())
    mockCreate.mockRejectedValueOnce(new Error('groq fora do ar'))

    const res = await request(app).get('/api/agent/weekly-tip').set(as('tip-ai-down'))

    expect(res.status).toBe(200)
    expect(res.body.source).toBe('rule')
  })

  test('abrir de novo na mesma semana reaproveita a frase (uma única chamada paga)', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'elite' }))
    prisma.transaction.findMany.mockResolvedValue(foodAbove())
    mockCreate.mockResolvedValue(adviceReply('Defina um teto semanal para essa categoria.'))

    const first  = await request(app).get('/api/agent/weekly-tip').set(as('tip-cache'))
    const second = await request(app).get('/api/agent/weekly-tip').set(as('tip-cache'))

    expect(first.body.tip).toBe(second.body.tip)
    expect(second.body.source).toBe('ai')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  test('sem base de comparação devolve tip null, sem chamar a IA', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'pro' }))
    prisma.transaction.findMany.mockResolvedValue([{ category: 'food', amount: 900, date: ago(3) }])

    const res = await request(app).get('/api/agent/weekly-tip').set(as('tip-nodata'))

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tip: null })
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('consulta só despesas do próprio usuário nos últimos 120 dias', async () => {
    prisma.user.findUnique.mockResolvedValue(mockUser({ plan: 'free' }))
    prisma.transaction.findMany.mockResolvedValue([])

    await request(app).get('/api/agent/weekly-tip').set(as('tip-scope'))

    const { where } = prisma.transaction.findMany.mock.calls.at(-1)[0]
    expect(where.userId).toBe('tip-scope')
    expect(where.type).toBe('expense')
    const days = (Date.now() - where.date.gte.getTime()) / DAY
    expect(days).toBeGreaterThan(119.9)
    expect(days).toBeLessThan(120.1)
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
