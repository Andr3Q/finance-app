// Rota exclusiva para gatilhos de jobs agendados (GitHub Actions cron).
// Protegida por x-cron-secret (segredo dedicado, nunca exposto ao browser —
// separado do MONITOR_SECRET porque tem um propósito diferente: disparar
// efeitos colaterais reais, como envio de e-mail em massa, não só ler dados).

const express = require('express')
const crypto  = require('crypto')
const { sweepPendingPlanReminders } = require('../jobs/planReminders')
const { sweepWeeklyDigests } = require('../jobs/weeklyDigest')
const { reportError } = require('../lib/sentry')

const router = express.Router()

// Middleware: valida x-cron-secret com comparação em tempo constante
// (mesmo padrão de backend/src/routes/monitor.js)
router.use((req, res, next) => {
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET não configurado.' })
  const provided = Buffer.from(req.headers['x-cron-secret'] || '')
  const expected = Buffer.from(secret)
  const valid = provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected)
  if (!valid) return res.status(401).json({ error: 'Não autorizado.' })
  next()
})

// POST /api/cron/plan-reminders
// Varredura diária de lembretes de vencimento (trial e renovação de plano
// pago) — cobre todos os usuários, não só quem abre o app.
router.post('/plan-reminders', async (req, res) => {
  try {
    const result = await sweepPendingPlanReminders()
    res.json({ ts: new Date().toISOString(), ...result })
  } catch (err) {
    reportError(err, { tag: '[cron] plan-reminders' })
    res.status(500).json({ error: 'Erro na varredura de lembretes.' })
  }
})

// POST /api/cron/weekly-digest
// Resumo semanal por e-mail (segunda-feira de manhã) — só para quem ligou "Relatório por e-mail" em Preferências.
router.post('/weekly-digest', async (req, res) => {
  try {
    const result = await sweepWeeklyDigests()
    res.json({ ts: new Date().toISOString(), ...result })
  } catch (err) {
    reportError(err, { tag: '[cron] weekly-digest' })
    res.status(500).json({ error: 'Erro no envio do resumo semanal.' })
  }
})

module.exports = router
