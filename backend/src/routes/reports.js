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
const { reportLimiter }      = require('../middleware/rateLimiter')
const { nowBrasilia, computeFixedCostsStatus } = require('../utils/helpers')
const { reportError } = require('../lib/sentry')

const router = express.Router()

router.use(authMiddleware)

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
    const totalExpenses   = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    const totalIncome     = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const totalFixedCosts = budgets.reduce((s, b) => s + Number(b.amount), 0)
    // Só desconta de totalAvailable as contas fixas AINDA NÃO pagas este mês
    // (sem transação com budgetId vinculado) — ver computeFixedCostsStatus.
    const legacyAllLaunched = user.autoLaunchMonth === month && user.autoLaunchYear === year
    const { unpaidFixedCosts } = computeFixedCostsStatus({ budgets, transactions, legacyAllLaunched })
    const salary         = Number(user.salary)
    const totalAvailable = salary + totalIncome - unpaidFixedCosts
    const currentBalance  = totalAvailable - totalExpenses
    const percentUsed     = totalAvailable > 0 ? Math.round((totalExpenses / totalAvailable) * 100) : 0

    const summary = {
      salary, totalExpenses, totalIncome, totalFixedCosts, unpaidFixedCosts,
      totalAvailable, currentBalance, percentUsed, autoLaunched: unpaidFixedCosts === 0,
    }

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

module.exports = router
