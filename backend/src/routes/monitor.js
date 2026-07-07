// Rota exclusiva para o Finance Monitor — dados de observabilidade
// Protegida por x-monitor-secret (segredo partilhado, nunca exposto ao browser)
// GET /api/monitor/login-stats  → auditoria de logins (24h)
// GET /api/monitor/user-stats   → métricas de utilizadores (Fase 4)

const express = require('express')
const crypto  = require('crypto')
const prisma  = require('../lib/prisma')

const router = express.Router()

// Middleware: valida x-monitor-secret com comparação em tempo constante
// (evita timing attack que revelaria o secret byte a byte via latência de resposta)
router.use((req, res, next) => {
  const secret = process.env.MONITOR_SECRET
  if (!secret) return res.status(503).json({ error: 'MONITOR_SECRET não configurado.' })
  const provided = Buffer.from(req.headers['x-monitor-secret'] || '')
  const expected = Buffer.from(secret)
  const valid = provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected)
  if (!valid) return res.status(401).json({ error: 'Não autorizado.' })
  next()
})

// GET /api/monitor/login-stats
// Devolve auditoria de logins das últimas 24h
router.get('/login-stats', async (req, res) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const since1h  = new Date(Date.now() -       60 * 60 * 1000)

    const [all24h, all1h] = await Promise.all([
      prisma.loginAudit.findMany({
        where:   { createdAt: { gte: since24h } },
        select:  { email: true, success: true, ip: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take:    5000,
      }),
      prisma.loginAudit.findMany({
        where:  { createdAt: { gte: since1h }, success: false },
        select: { ip: true },
        take:   5000,
      }),
    ])

    const ok24h   = all24h.filter(r => r.success)
    const fail24h = all24h.filter(r => !r.success)

    // Top IPs com mais falhas na última hora (suspeita de força bruta)
    const ipFails1h = {}
    all1h.forEach(r => { if (r.ip) ipFails1h[r.ip] = (ipFails1h[r.ip] || 0) + 1 })
    const suspiciousIPs = Object.entries(ipFails1h)
      .filter(([, n]) => n >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }))

    // Top IPs com mais falhas em 24h
    const ipFails24h = {}
    fail24h.forEach(r => { if (r.ip) ipFails24h[r.ip] = (ipFails24h[r.ip] || 0) + 1 })
    const topFailIPs = Object.entries(ipFails24h)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ip, count]) => ({ ip, count }))

    // Distribuição por hora (últimas 24h)
    const byHour = Array(24).fill(0).map((_, i) => ({ hour: i, ok: 0, fail: 0 }))
    all24h.forEach(r => {
      const h = new Date(r.createdAt).getUTCHours()
      if (r.success) byHour[h].ok++
      else           byHour[h].fail++
    })

    // Últimos 10 logins falhados (sem expor passwords ou dados sensíveis)
    const recentFails = fail24h.slice(0, 10).map(r => ({
      email:   r.email.replace(/(.{2}).+(@.+)/, '$1***$2'),  // mascara email
      ip:      r.ip || '–',
      at:      r.createdAt,
    }))

    res.json({
      ts:      new Date().toISOString(),
      period:  '24h',
      summary: {
        total:       all24h.length,
        ok:          ok24h.length,
        failed:      fail24h.length,
        failRate:    all24h.length ? +(fail24h.length / all24h.length * 100).toFixed(1) : 0,
        bruteForce:  suspiciousIPs.length > 0,
      },
      suspiciousIPs,
      topFailIPs,
      recentFails,
      byHour,
    })
  } catch (err) {
    console.error('[monitor] login-stats error:', err.message)
    res.status(500).json({ error: 'Erro interno.' })
  }
})

// GET /api/monitor/user-stats  (Fase 4 — métricas globais de utilizadores)
router.get('/user-stats', async (req, res) => {
  try {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const [total, byPlan, new7d, with2fa, emailVerified, onboarded] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ['plan'], _count: true }),
      prisma.user.count({ where: { createdAt: { gte: since7d } } }),
      prisma.user.count({ where: { twoFactorEnabled: true } }),
      prisma.user.count({ where: { emailVerified: true } }),
      prisma.user.count({ where: { onboardingComplete: true } }),
    ])

    res.json({
      ts:    new Date().toISOString(),
      total,
      plans: byPlan.map(p => ({ plan: p.plan, count: p._count })),
      new7d,
      with2fa,
      emailVerified,
      onboarded,
      rates: {
        twofa:     total ? +(with2fa    / total * 100).toFixed(1) : 0,
        verified:  total ? +(emailVerified / total * 100).toFixed(1) : 0,
        onboarded: total ? +(onboarded  / total * 100).toFixed(1) : 0,
      },
    })
  } catch (err) {
    console.error('[monitor] user-stats error:', err.message)
    res.status(500).json({ error: 'Erro interno.' })
  }
})

module.exports = router
