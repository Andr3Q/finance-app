// ═══════════════════════════════════════════════════════
// src/routes/analyzer.js — Analisador de compras (tela 38 do desktop)
//
//   GET /analyzer/base → os números do usuário que a análise usa (renda, contas fixas, parcelas, gasto variável, sobra, saldo)
//
// A comparação das formas de pagar roda no navegador (instantânea, com o que a pessoa digita); aqui só se lê o que é dela.
// ═══════════════════════════════════════════════════════

const express        = require('express')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { dashboardLimiter } = require('../middleware/rateLimiter')
const { nowBrasilia } = require('../utils/helpers')
const { reportError } = require('../lib/sentry')
const { buildPurchaseBase, baseWindow } = require('../services/purchaseBase')

const router = express.Router()
router.use(authMiddleware)

router.get('/base', dashboardLimiter, async (req, res) => {
  try {
    const now   = nowBrasilia()
    const start = baseWindow(now)
    const [transactions, budgets, installments, user] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: req.userId, OR: [{ year: { gt: start.year } }, { year: start.year, month: { gte: start.month } }] },
        select: { type: true, category: true, amount: true, description: true, month: true, year: true, budgetId: true, archived: true },
      }),
      prisma.budget.findMany({ where: { userId: req.userId }, select: { id: true, amount: true, endDate: true } }),
      prisma.installmentPlan.findMany({ where: { userId: req.userId }, select: { amount: true, totalInstallments: true, paidInstallments: true } }),
      prisma.user.findUnique({ where: { id: req.userId }, select: { salary: true, autoLaunchMonth: true, autoLaunchYear: true } }),
    ])
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
    const legacyAllLaunched = user.autoLaunchMonth === now.month && user.autoLaunchYear === now.year
    res.set('Cache-Control', 'no-store')
    res.json(buildPurchaseBase({ now, transactions, budgets, installments, salary: Number(user.salary), legacyAllLaunched }))
  } catch (err) {
    reportError(err, { tag: 'Erro no analisador de compras' })
    res.status(500).json({ error: 'Erro ao carregar seus números.' })
  }
})

module.exports = router
