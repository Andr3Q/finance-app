'use strict'
jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))
jest.mock('../src/services/emailService', () => ({ sendWeeklyDigest: jest.fn().mockResolvedValue(true) }))
jest.mock('../src/lib/sentry', () => ({ reportError: jest.fn() }))

const prisma = require('./__mocks__/prisma')
const { sendWeeklyDigest } = require('../src/services/emailService')
const { reportError } = require('../src/lib/sentry')
const { sweepWeeklyDigests, digestForUser } = require('../src/jobs/weeklyDigest')

const NOW = new Date('2026-10-26T11:00:00Z')   // segunda-feira
const DAY = 24 * 60 * 60 * 1000
const user = (over = {}) => ({ id: 'u1', email: 'a@x.com', name: 'Ana', salary: 5000, ...over })
const tx = (type, category, amount) => ({ type, category, amount })

beforeEach(() => {
  prisma.user.findMany.mockResolvedValue([])
  prisma.user.updateMany.mockResolvedValue({ count: 1 })
  prisma.transaction.findMany.mockResolvedValue([tx('expense', 'food', 100), tx('expense', 'food', 50), tx('expense', 'transport', 30), tx('income', 'other', 200)])
})

describe('resumo semanal por e-mail (job)', () => {
  test('busca só quem ligou o relatório e tem e-mail verificado, e que não recebeu nos últimos 6 dias', async () => {
    await sweepWeeklyDigests(NOW)
    const where = prisma.user.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ notifWeeklyEmail: true, emailVerified: true })
    expect(where.OR).toEqual([{ weeklyDigestSentAt: null }, { weeklyDigestSentAt: { lt: new Date(NOW.getTime() - 6 * DAY) } }])
  })

  test('envia com os números da semana: gastos, entradas, categoria que mais gastou e saldo', async () => {
    prisma.user.findMany.mockResolvedValueOnce([user()])
    const r = await sweepWeeklyDigests(NOW)
    expect(r).toEqual({ sent: 1, skipped: 0, errors: 0, done: true })
    expect(sendWeeklyDigest).toHaveBeenCalledWith('a@x.com', 'Ana', {
      totalExpenses: 180, totalIncome: 200, topCategory: 'food', transactionCount: 4, balance: 5000 + 200 - 180,
    })
    // olha só a última semana, sem lançamentos arquivados, filtrando pelo usuário
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1', date: { gte: new Date(NOW.getTime() - 7 * DAY), lte: NOW }, archived: false },
    }))
  })

  test('reserva o envio ANTES de mandar, de forma condicional (duas execuções ao mesmo tempo não duplicam)', async () => {
    prisma.user.findMany.mockResolvedValueOnce([user()])
    const order = []
    prisma.user.updateMany.mockImplementation(async () => { order.push('claim'); return { count: 1 } })
    sendWeeklyDigest.mockImplementationOnce(async () => { order.push('send') })
    await sweepWeeklyDigests(NOW)
    expect(order).toEqual(['claim', 'send'])
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', OR: [{ weeklyDigestSentAt: null }, { weeklyDigestSentAt: { lt: new Date(NOW.getTime() - 6 * DAY) } }] },
      data:  { weeklyDigestSentAt: NOW },
    })
  })

  test('se outra execução já reservou o envio, não manda de novo', async () => {
    prisma.user.findMany.mockResolvedValueOnce([user()])
    prisma.user.updateMany.mockResolvedValueOnce({ count: 0 })
    const r = await sweepWeeklyDigests(NOW)
    expect(r).toEqual({ sent: 0, skipped: 1, errors: 0, done: true })
    expect(sendWeeklyDigest).not.toHaveBeenCalled()
  })

  test('semana sem nenhum lançamento: não manda e nem reserva', async () => {
    prisma.user.findMany.mockResolvedValueOnce([user()])
    prisma.transaction.findMany.mockResolvedValueOnce([])
    const r = await sweepWeeklyDigests(NOW)
    expect(r).toEqual({ sent: 0, skipped: 1, errors: 0, done: true })
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
    expect(sendWeeklyDigest).not.toHaveBeenCalled()
  })

  test('sem despesas na semana: categoria nula, e o e-mail sai mesmo assim', async () => {
    prisma.transaction.findMany.mockResolvedValueOnce([tx('income', 'other', 300)])
    expect(await digestForUser(user({ salary: 0 }), NOW)).toBe('sent')
    expect(sendWeeklyDigest).toHaveBeenCalledWith('a@x.com', 'Ana', expect.objectContaining({ topCategory: null, totalExpenses: 0, balance: 300 }))
  })

  test('erro com um usuário não derruba os outros e é reportado', async () => {
    prisma.user.findMany.mockResolvedValueOnce([user({ id: 'u1' }), user({ id: 'u2', email: 'b@x.com', name: 'Bia' })])
    sendWeeklyDigest.mockRejectedValueOnce(new Error('resend fora do ar'))
    const r = await sweepWeeklyDigests(NOW)
    expect(r).toEqual({ sent: 1, skipped: 0, errors: 1, done: true })
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ tag: '[weeklyDigest] sweep', userId: 'u1' }))
  })

  test('percorre em páginas de 200 usando o último id como cursor', async () => {
    const page1 = Array.from({ length: 200 }, (_, i) => user({ id: `u${String(i).padStart(3, '0')}` }))
    prisma.user.findMany.mockResolvedValueOnce(page1).mockResolvedValueOnce([user({ id: 'u999' })])
    prisma.transaction.findMany.mockResolvedValue([])
    const r = await sweepWeeklyDigests(NOW)
    expect(r.skipped).toBe(201)
    expect(prisma.user.findMany).toHaveBeenCalledTimes(2)
    expect(prisma.user.findMany.mock.calls[1][0].where.id).toEqual({ gt: 'u199' })
    expect(prisma.user.findMany.mock.calls[0][0]).toMatchObject({ take: 200, orderBy: { id: 'asc' } })
  })

  test('manda no ritmo da Resend: espera entre um e-mail e outro (e só depois dos que saíram)', async () => {
    prisma.user.findMany.mockResolvedValueOnce([user({ id: 'u1' }), user({ id: 'u2', email: 'b@x.com' })])
    const sleepFn = jest.fn().mockResolvedValue()
    await sweepWeeklyDigests(NOW, { sleepFn })
    expect(sleepFn).toHaveBeenCalledTimes(2)
    expect(sleepFn).toHaveBeenCalledWith(600)
    // quem foi pulado (semana sem lançamentos) não gasta espera
    sleepFn.mockClear(); sendWeeklyDigest.mockClear()
    prisma.user.findMany.mockResolvedValueOnce([user()])
    prisma.transaction.findMany.mockResolvedValueOnce([])
    await sweepWeeklyDigests(NOW, { sleepFn })
    expect(sleepFn).not.toHaveBeenCalled()
  })

  test('acabou o tempo da chamada: devolve done=false e a próxima chamada continua só com quem falta', async () => {
    prisma.user.findMany.mockResolvedValueOnce([user({ id: 'u1' }), user({ id: 'u2', email: 'b@x.com' })])
    const r = await sweepWeeklyDigests(NOW, { budgetMs: -1, paceMs: 0 })
    expect(r).toEqual({ sent: 0, skipped: 0, errors: 0, done: false })
    expect(sendWeeklyDigest).not.toHaveBeenCalled()
    // quem já recebeu tem weeklyDigestSentAt recente e sai do filtro da busca: a próxima chamada pega só o resto
    expect(prisma.user.findMany.mock.calls[0][0].where.OR).toEqual([{ weeklyDigestSentAt: null }, { weeklyDigestSentAt: { lt: new Date(NOW.getTime() - 6 * DAY) } }])
  })

  test('a Resend recusou o envio (cota, remetente, chave): devolve a reserva pra pessoa não perder a semana', async () => {
    prisma.user.findMany.mockResolvedValueOnce([user({ id: 'u1', weeklyDigestSentAt: new Date(NOW.getTime() - 9 * DAY) })])
    sendWeeklyDigest.mockRejectedValueOnce(new Error('Resend rejeitou o envio: daily quota exceeded'))
    const r = await sweepWeeklyDigests(NOW, { paceMs: 0 })
    expect(r.errors).toBe(1)
    expect(prisma.user.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'u1', weeklyDigestSentAt: NOW },
      data:  { weeklyDigestSentAt: new Date(NOW.getTime() - 9 * DAY) },
    })
  })

  test('qualquer outro erro (ex.: tempo esgotado depois de mandar) MANTÉM a reserva: nunca duplica o e-mail', async () => {
    prisma.user.findMany.mockResolvedValueOnce([user({ id: 'u1' })])
    sendWeeklyDigest.mockRejectedValueOnce(new Error('timeout'))
    prisma.user.updateMany.mockClear()
    await sweepWeeklyDigests(NOW, { paceMs: 0 })
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1) // só a reserva; nada devolvido
  })

  test('falha em série (5 seguidas) interrompe a varredura em vez de martelar a API; um sucesso no meio zera a contagem', async () => {
    sendWeeklyDigest.mockClear()
    const many = Array.from({ length: 8 }, (_, i) => user({ id: `u${i}`, email: `e${i}@x.com` }))
    prisma.user.findMany.mockResolvedValueOnce(many)
    sendWeeklyDigest.mockRejectedValue(new Error('Resend rejeitou o envio: invalid api key'))
    const r = await sweepWeeklyDigests(NOW, { paceMs: 0 })
    expect(r).toMatchObject({ sent: 0, errors: 5, done: false, aborted: 'erros seguidos' })
    expect(sendWeeklyDigest).toHaveBeenCalledTimes(5)

    sendWeeklyDigest.mockReset(); sendWeeklyDigest.mockResolvedValue(true)
    prisma.user.findMany.mockResolvedValueOnce(many.slice(0, 7))
    sendWeeklyDigest
      .mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce(true) // o 5º dá certo: zera a contagem
      .mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x'))
    const r2 = await sweepWeeklyDigests(NOW, { paceMs: 0 })
    expect(r2).toMatchObject({ sent: 1, errors: 6, done: true })
  })
})
