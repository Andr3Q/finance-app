const express    = require('express')
const crypto     = require('crypto')
const router     = express.Router()
const prisma     = require('../lib/prisma')
const { runAllScans } = require('../services/securityScanner')

// Aceita apenas x-monitor-secret — resultados de CVE não devem ser acessíveis a usuários comuns
function monitorOnly(req, res, next) {
  const secret   = process.env.MONITOR_SECRET
  const incoming = req.headers['x-monitor-secret']
  if (!secret || !incoming) return res.status(401).json({ error: 'Não autorizado.' })
  const a = Buffer.from(secret), b = Buffer.from(incoming)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Não autorizado.' })
  }
  return next()
}

// GET /api/security/latest
router.get('/latest', monitorOnly, async (req, res) => {
  try {
    const [npmScan, trivyScan] = await Promise.all([
      prisma.securityScan.findFirst({ where: { tool: 'npm_audit' }, orderBy: { runAt: 'desc' } }),
      prisma.securityScan.findFirst({ where: { tool: 'trivy'     }, orderBy: { runAt: 'desc' } }),
    ])
    res.json({ npm_audit: npmScan || null, trivy: trivyScan || null })
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar scans' })
  }
})

// POST /api/security/run — dispara scan manual, responde imediatamente
router.post('/run', monitorOnly, async (req, res) => {
  res.json({ ok: true, message: 'Scan iniciado' })
  runAllScans().catch(console.error)
})

module.exports = router
