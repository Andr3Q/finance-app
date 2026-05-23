const express = require('express')
const crypto  = require('crypto')
const os      = require('os')
const router  = express.Router()
const prisma  = require('../lib/prisma')
const { runAllScans } = require('../services/securityScanner')

function monitorOnly(req, res, next) {
  const secret   = process.env.MONITOR_SECRET
  const incoming = req.headers['x-monitor-secret']
  if (!secret || !incoming) return res.status(401).json({ error: 'Unauthorized' })
  const a = Buffer.from(secret), b = Buffer.from(incoming)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  return next()
}

// GET /api/monitor/dashboard — retorna métricas completas do app
router.get('/dashboard', monitorOnly, async (req, res) => {
  try {
    const now          = new Date()
    const startOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const last24h      = new Date(now.getTime() - 24 * 3600 * 1000)
    const last7d       = new Date(now.getTime() - 7  * 24 * 3600 * 1000)

    const [
      usersByPlan,
      txToday,
      txMonth,
      txIncome,
      txExpense,
      goalsCount,
      installmentsCount,
      budgetsCount,
      pushSubsCount,
      processedPayments,
      recentLogins,
      failedLogins24h,
      securityNpm,
      securityTrivy,
    ] = await Promise.all([
      prisma.user.groupBy({ by: ['plan'], _count: { _all: true } }),
      prisma.transaction.count({ where: { createdAt: { gte: startOfDay }, archived: false } }),
      prisma.transaction.count({ where: { createdAt: { gte: startOfMonth }, archived: false } }),
      prisma.transaction.aggregate({ where: { type: 'income',  createdAt: { gte: startOfMonth }, archived: false }, _sum: { amount: true } }),
      prisma.transaction.aggregate({ where: { type: 'expense', createdAt: { gte: startOfMonth }, archived: false }, _sum: { amount: true } }),
      prisma.goal.count(),
      prisma.installmentPlan.count(),
      prisma.budget.count(),
      prisma.pushSubscription.count(),
      prisma.processedPayment.count(),
      prisma.loginAudit.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { email: true, success: true, ip: true, userAgent: true, createdAt: true },
      }),
      prisma.loginAudit.count({ where: { success: false, createdAt: { gte: last24h } } }),
      prisma.securityScan.findFirst({ where: { tool: 'npm_audit' }, orderBy: { runAt: 'desc' } }),
      prisma.securityScan.findFirst({ where: { tool: 'trivy'     }, orderBy: { runAt: 'desc' } }),
    ])

    // Distribuição de planos
    const planMap = { free: 0, pro: 0, elite: 0 }
    for (const g of usersByPlan) planMap[g.plan] = (planMap[g.plan] || 0) + g._count._all
    const totalUsers = planMap.free + planMap.pro + planMap.elite

    // Memória do processo
    const mem = process.memoryUsage()

    // Máscara de e-mail: jo***@gmail.com
    const maskEmail = (e) => e.replace(/^(.{2})(.*)(@.+)$/, (_, a, b, c) => a + '*'.repeat(Math.min(b.length, 4)) + c)

    res.json({
      timestamp: now.toISOString(),
      uptime:    Math.floor(process.uptime()),
      nodeVersion: process.version,
      memory: {
        heapUsed:    mem.heapUsed,
        heapTotal:   mem.heapTotal,
        rss:         mem.rss,
        sysTotal:    os.totalmem(),
        sysFree:     os.freemem(),
      },
      users: {
        total: totalUsers,
        free:  planMap.free,
        pro:   planMap.pro,
        elite: planMap.elite,
      },
      transactions: {
        today:       txToday,
        month:       txMonth,
        incomeMonth: txIncome._sum.amount  || 0,
        expenseMonth: txExpense._sum.amount || 0,
      },
      goals:            goalsCount,
      installments:     installmentsCount,
      budgets:          budgetsCount,
      pushSubscribers:  pushSubsCount,
      processedPayments,
      security: {
        failedLogins24h,
        npm:   securityNpm   ? { status: securityNpm.status,   count: securityNpm.vulnCount,   details: securityNpm.details,   runAt: securityNpm.runAt   } : null,
        trivy: securityTrivy ? { status: securityTrivy.status, count: securityTrivy.vulnCount, details: securityTrivy.details, runAt: securityTrivy.runAt } : null,
      },
      recentLogins: recentLogins.map(l => ({
        email:   maskEmail(l.email),
        success: l.success,
        ip:      l.ip || '—',
        agent:   (l.userAgent || '').slice(0, 60),
        at:      l.createdAt,
      })),
    })
  } catch (err) {
    console.error('[monitor] dashboard:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/monitor/scan — dispara scan de segurança manual
router.post('/scan', monitorOnly, (req, res) => {
  res.json({ ok: true, message: 'Scan iniciado em background' })
  runAllScans().catch(console.error)
})

module.exports = router
