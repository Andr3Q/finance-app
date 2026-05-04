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

const express              = require('express')
const { PrismaClient }     = require('@prisma/client')
const authMiddleware        = require('../middleware/auth')
const { sendMonthlyReport } = require('../services/emailService')
const { generateMonthlyPDF } = require('../services/pdfService')

const router = express.Router()
const prisma = new PrismaClient()

router.use(authMiddleware)

// ── POST /reports/monthly-close ─────────────────────────
// Fecha o mês: gera PDF, envia e-mail e arquiva transações
router.post('/monthly-close', async (req, res) => {
  try {
    const now   = new Date()
    const month = now.getMonth() + 1
    const year  = now.getFullYear()

    // Busca dados necessários
    const [user, transactions, budgets] = await Promise.all([
      prisma.user.findUnique({ where: { id: req.userId } }),
      prisma.transaction.findMany({
        where:   { userId: req.userId, month, year, archived: false },
        orderBy: { date: 'asc' }
      }),
      prisma.budget.findMany({ where: { userId: req.userId } })
    ])

    // Calcula resumo
    const totalExpenses   = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const totalIncome     = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const totalFixedCosts = budgets.reduce((s, b) => s + b.amount, 0)
    // Se as contas fixas já foram lançadas como transações (auto-launch), elas já estão
    // em totalExpenses — não subtrair novamente para evitar dupla contagem
    const autoLaunched   = user.autoLaunchMonth === month && user.autoLaunchYear === year
    const totalAvailable = autoLaunched
      ? user.salary + totalIncome
      : user.salary + totalIncome - totalFixedCosts
    const currentBalance  = totalAvailable - totalExpenses
    const percentUsed     = totalAvailable > 0 ? Math.round((totalExpenses / totalAvailable) * 100) : 0

    const summary = { salary: user.salary, totalExpenses, totalIncome, totalFixedCosts, totalAvailable, currentBalance, percentUsed }

    // Gera PDF
    const pdfBuffer = await generateMonthlyPDF(user, month, year, summary, transactions)

    // Envia e-mail
    const reportTo = user.reportEmail || user.email
    await sendMonthlyReport(reportTo, user.name, month, year, summary, pdfBuffer)

    // Arquiva as transações do mês (marca como fechadas)
    await prisma.transaction.updateMany({
      where: { userId: req.userId, month, year, archived: false },
      data:  { archived: true }
    })

    res.json({
      message:    `Mês fechado com sucesso! Relatório enviado para ${reportTo}`,
      sentTo:     reportTo,
      month,
      year,
      summary
    })
  } catch (error) {
    console.error('Erro no fechamento mensal:', error)
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
