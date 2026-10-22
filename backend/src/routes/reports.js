// ═══════════════════════════════════════════════════════
// 📊 src/routes/reports.js — Relatórios e Fechamento Mensal
//
// Rota principal: POST /reports/monthly-close
//   1. Busca todas as transações do mês atual
//   2. Gera PDF do relatório
//   3. Envia e-mail com PDF anexo
//   4. Arquiva as transações (marca archived = true)
//   5. Novo mês começa zerado
// ═══════════════════════════════════════════════════════

const express                = require('express')
const prisma                 = require('../lib/prisma')
const authMiddleware         = require('../middleware/auth')
const { sendMonthlyReport }  = require('../services/emailService')
const { generateMonthlyPDF } = require('../services/pdfService')
const { reportLimiter, reportDownloadLimiter } = require('../middleware/rateLimiter')
const { nowBrasilia, computeFixedCostsStatus } = require('../utils/helpers')
const { reportError } = require('../lib/sentry')

const router = express.Router()

router.use(authMiddleware)

// Resumo do mês usado no PDF (e no e-mail do fechamento). Só desconta de totalAvailable as contas fixas AINDA NÃO
// pagas naquele mês (sem transação com budgetId vinculado) — ver computeFixedCostsStatus.
function buildSummary(user, budgets, transactions, month, year) {
  const totalExpenses   = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
  const totalIncome     = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const totalFixedCosts = budgets.reduce((s, b) => s + Number(b.amount), 0)
  const legacyAllLaunched = user.autoLaunchMonth === month && user.autoLaunchYear === year
  const { unpaidFixedCosts } = computeFixedCostsStatus({ budgets, transactions, legacyAllLaunched })
  const salary         = Number(user.salary)
  const totalAvailable = salary + totalIncome - unpaidFixedCosts
  const currentBalance  = totalAvailable - totalExpenses
  const percentUsed     = totalAvailable > 0 ? Math.round((totalExpenses / totalAvailable) * 100) : 0
  return {
    salary, totalExpenses, totalIncome, totalFixedCosts, unpaidFixedCosts,
    totalAvailable, currentBalance, percentUsed, autoLaunched: unpaidFixedCosts === 0,
  }
}

// ── POST /reports/monthly-close ─────────────────────────
// Fecha o mês: gera PDF, envia e-mail e arquiva transações
router.post('/monthly-close', reportLimiter, async (req, res) => {
  try {
    const { month, year } = nowBrasilia()

    // Busca user + transações + orçamentos em paralelo (1 round trip ao banco)
    // A checagem do plano é feita após — Pro users não pagam 1 query extra de plan-check
    const [user, transactions, budgets] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.userId } }),
      prisma.transaction.findMany({
        where:   { userId: req.userId, month, year, archived: false },
        orderBy: { date: 'asc' }
      }),
      prisma.budget.findMany({ where: { userId: req.userId } })
    ])

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

    // req.userPlan já vem calculado (e testado) pelo authMiddleware — evita recalcular
    // a mesma regra de expiração de plano/trial aqui com uma fórmula divergente (C-01).
    if (req.userPlan === 'free') {
      return res.status(403).json({
        error: 'O relatório mensal em PDF é exclusivo do plano Pro.',
        limitReached: true,
        plan: 'free'
      })
    }

    // Calcula resumo
    const summary = buildSummary(user, budgets, transactions, month, year)

    // Gera PDF
    const pdfBuffer = await generateMonthlyPDF(user, month, year, summary, transactions)

    // Envia e-mail — não pode bloquear o fechamento do mês: uma queda do
    // Resend não pode impedir o arquivamento das transações abaixo, que é
    // o efeito que realmente importa em "fechar o mês".
    const reportTo = user.reportEmail || user.email
    let emailSent = true
    try {
      await sendMonthlyReport(reportTo, user.name, month, year, summary, pdfBuffer)
    } catch (err) {
      emailSent = false
      reportError(err, { tag: '[reports] monthly-close sendMonthlyReport' })
    }

    // Arquiva as transações do mês (marca como fechadas)
    await prisma.transaction.updateMany({
      where: { userId: req.userId, month, year, archived: false },
      data:  { archived: true }
    })

    res.json({
      message: emailSent
        ? `Mês fechado com sucesso! Relatório enviado para ${reportTo}`
        : 'Mês fechado com sucesso! Não foi possível enviar o relatório por e-mail agora — tente novamente mais tarde.',
      sentTo:    emailSent ? reportTo : null,
      emailSent,
      month,
      year,
      summary
    })
  } catch (error) {
    reportError(error, { tag: 'Erro no fechamento mensal' })
    res.status(500).json({ error: 'Erro ao fechar o mês. Tente novamente.' })
  }
})

// ── GET /reports/history ────────────────────────────────
// Retorna meses que já foram fechados (têm transações arquivadas)
router.get('/history', async (req, res) => {
  try {
    const archived = await prisma.transaction.findMany({
      where:   { userId: req.userId, archived: true },
      select:  { month: true, year: true },
      distinct: ['month', 'year'],
      orderBy: [{ year: 'desc' }, { month: 'desc' }]
    })

    res.json(archived)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar histórico.' })
  }
})

// ── GET /reports/pdf?month=&year= ───────────────────────
// Baixa de novo o PDF de um mês JÁ FECHADO (tela "Balanço mensal → Relatórios anteriores"). O arquivo não fica
// guardado: é gerado agora, a partir das transações arquivadas daquele mês. Salário e contas fixas são os de hoje
// (o app não versiona isso); o que foi pago no mês vem das transações do próprio mês. Exclusivo Pro, como o fechamento.
router.get('/pdf', reportDownloadLimiter, async (req, res) => {
  try {
    const month = Number(req.query.month)
    const year  = Number(req.query.year)
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Mês ou ano inválido.' })
    }
    if (req.userPlan === 'free') {
      return res.status(403).json({ error: 'O relatório mensal em PDF é exclusivo do plano Pro.', limitReached: true, plan: 'free' })
    }

    const [user, transactions, budgets] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.userId } }),
      prisma.transaction.findMany({ where: { userId: req.userId, month, year, archived: true }, orderBy: { date: 'asc' } }),
      prisma.budget.findMany({ where: { userId: req.userId } }),
    ])
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
    if (!transactions.length) return res.status(404).json({ error: 'Esse mês ainda não foi fechado.' })

    const pdfBuffer = await generateMonthlyPDF(user, month, year, buildSummary(user, budgets, transactions, month, year), transactions)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="nancy-balanco-${year}-${String(month).padStart(2, '0')}.pdf"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send(pdfBuffer)
  } catch (error) {
    reportError(error, { tag: 'Erro ao baixar relatório' })
    res.status(500).json({ error: 'Erro ao gerar o relatório.' })
  }
})

module.exports = router
