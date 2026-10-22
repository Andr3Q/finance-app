const prisma = require('../lib/prisma')
const { sendWeeklyDigest } = require('../services/emailService')
const { reportError } = require('../lib/sentry')

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_GAP_DAYS = 6    // um disparo duplicado (ou reprocessado) no mesmo dia/semana não reenvia
const PAGE = 200

// Resumo da semana (toda segunda-feira, às 8h de Brasília, via GitHub Actions → POST /api/cron/weekly-digest).
// Só vai para quem ligou "Relatório por e-mail" em Preferências (notifWeeklyEmail) e tem o e-mail verificado.
// Antes o resumo saía sozinho para todo mundo, na primeira vez que a pessoa abria o app depois de 7 dias.
// A "reserva" do envio (weeklyDigestSentAt) é feita ANTES de mandar e de forma condicional: se o job rodar
// duas vezes ao mesmo tempo só uma leva passa, e se o e-mail falhar o pior caso é pular esta semana.
async function digestForUser(user, now) {
  const since = new Date(now.getTime() - 7 * DAY_MS)
  const txs = await prisma.transaction.findMany({
    where: { userId: user.id, date: { gte: since, lte: now }, archived: false },
    select: { type: true, category: true, amount: true },
  })
  if (txs.length === 0) return 'skipped'

  const claimed = await prisma.user.updateMany({
    where: { id: user.id, OR: [{ weeklyDigestSentAt: null }, { weeklyDigestSentAt: { lt: new Date(now.getTime() - MIN_GAP_DAYS * DAY_MS) } }] },
    data:  { weeklyDigestSentAt: now },
  })
  if (!claimed || claimed.count !== 1) return 'skipped'

  const expenses = txs.filter(t => t.type === 'expense')
  const totalExpenses = expenses.reduce((s, t) => s + Number(t.amount), 0)
  const totalIncome   = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const byCategory = {}
  for (const t of expenses) byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount)
  const topCategory = Object.keys(byCategory).sort((a, b) => byCategory[b] - byCategory[a])[0] || null

  await sendWeeklyDigest(user.email, user.name, {
    totalExpenses, totalIncome, topCategory,
    transactionCount: txs.length,
    balance: Number(user.salary || 0) + totalIncome - totalExpenses,
  })
  return 'sent'
}

async function sweepWeeklyDigests(now = new Date()) {
  const result = { sent: 0, skipped: 0, errors: 0 }
  const lastOk = new Date(now.getTime() - MIN_GAP_DAYS * DAY_MS)
  let cursor = null

  for (;;) {
    const users = await prisma.user.findMany({
      where: {
        notifWeeklyEmail: true,
        emailVerified:    true,
        OR: [{ weeklyDigestSentAt: null }, { weeklyDigestSentAt: { lt: lastOk } }],
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select:  { id: true, email: true, name: true, salary: true },
      orderBy: { id: 'asc' },
      take:    PAGE,
    })
    if (!users.length) break

    for (const user of users) {
      try {
        const r = await digestForUser(user, now)
        if (r === 'sent') result.sent++
        else result.skipped++
      } catch (err) {
        result.errors++
        reportError(err, { tag: '[weeklyDigest] sweep', userId: user.id })
      }
    }
    cursor = users[users.length - 1].id
    if (users.length < PAGE) break
  }
  return result
}

module.exports = { sweepWeeklyDigests, digestForUser }
