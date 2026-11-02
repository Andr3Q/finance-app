// ═══════════════════════════════════════════════════════
// src/routes/sheet.js — Planilha IA (tela 12 do desktop)
//
//   GET /sheet         → três meses reais + dois de previsão, por seção, e o que mudou por último
//   GET /sheet/export  → a mesma planilha em .xlsx (?forecast=0 tira as colunas de previsão)
//
// Só para os planos em SHEET_PLANS (hoje o Elite). Os números vêm de services/sheet.js.
// ═══════════════════════════════════════════════════════

const express        = require('express')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { dashboardLimiter } = require('../middleware/rateLimiter')
const { SHEET_PLANS } = require('../utils/constants')
const { nowBrasilia } = require('../utils/helpers')
const { reportError } = require('../lib/sentry')
const { buildSheet, buildFeed, sheetWindow } = require('../services/sheet')
const { buildXlsx } = require('../services/xlsx')

const router = express.Router()
router.use(authMiddleware)

// Plano efetivo já calculado pelo authMiddleware (considera plano e teste vencidos)
const requireSheetPlan = (req, res, next) => (SHEET_PLANS.includes(req.userPlan)
  ? next()
  // limitReached: o cliente trata 403 sem isto como sessão expirada e leva ao login (services/api.js) — é a mesma marca dos limites de plano
  : res.status(403).json({ error: 'A Planilha IA faz parte do plano Elite.', code: 'plan_required', limitReached: true, plan: req.userPlan }))

async function loadSheet(userId) {
  const now   = nowBrasilia()
  const start = sheetWindow(now)
  const [transactions, budgets, installments, user] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId, OR: [{ year: { gt: start.year } }, { year: start.year, month: { gte: start.month } }] },
      select: { type: true, amount: true, category: true, description: true, date: true, month: true, year: true, budgetId: true },
    }),
    prisma.budget.findMany({ where: { userId }, select: { id: true, name: true, amount: true, dueDay: true, endDate: true } }),
    prisma.installmentPlan.findMany({ where: { userId }, select: { id: true, name: true, amount: true, totalInstallments: true, paidInstallments: true, startMonth: true, startYear: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { salary: true } }),
  ])
  if (!user) return null
  const sheet = buildSheet({ now, transactions, budgets, installments, salary: Number(user.salary) })
  const feed  = buildFeed({ now, transactions, installments, budgets })
  return { sheet, feed, now }
}

router.get('/', dashboardLimiter, requireSheetPlan, async (req, res) => {
  try {
    const out = await loadSheet(req.userId)
    if (!out) return res.status(404).json({ error: 'Usuário não encontrado.' })
    res.set('Cache-Control', 'no-store')
    res.json({ ...out.sheet, feed: out.feed, generatedAt: new Date().toISOString() })
  } catch (err) {
    reportError(err, { tag: 'Erro na planilha IA' })
    res.status(500).json({ error: 'Erro ao montar a planilha.' })
  }
})

router.get('/export', dashboardLimiter, requireSheetPlan, async (req, res) => {
  try {
    const out = await loadSheet(req.userId)
    if (!out) return res.status(404).json({ error: 'Usuário não encontrado.' })
    const { sheet, now } = out
    const cols = req.query.forecast === '0' ? sheet.months.filter(m => m.kind !== 'forecast') : sheet.months
    const pick = (values) => cols.map(m => values[sheet.months.indexOf(m)])
    const header = ['Conta', ...cols.map(m => `${m.label}/${m.year}${m.kind === 'forecast' ? ' (previsão)' : ''}`)]

    const rows = [{ cells: header, bold: true }]
    for (const s of sheet.sections) {
      rows.push({ cells: [s.label, ...pick(s.total)], bold: true })
      for (const r of s.rows) rows.push({ cells: [r.label, ...pick(r.values)] })
    }
    rows.push({ cells: ['Saldo do mês', ...pick(sheet.net)], bold: true })

    const file = buildXlsx({ sheetName: 'Planilha IA', rows, widths: [30, ...cols.map(() => 18)] })
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="planilha-nancy-${now.year}-${String(now.month).padStart(2, '0')}.xlsx"`,
      'Cache-Control': 'no-store',
    })
    res.send(file)
  } catch (err) {
    reportError(err, { tag: 'Erro ao exportar a planilha IA' })
    res.status(500).json({ error: 'Erro ao exportar a planilha.' })
  }
})

module.exports = router
