const express = require('express')
const router  = express.Router()
const prisma  = require('../lib/prisma')
const webpush = require('web-push')

const COOLDOWN_MS = (parseInt(process.env.MONITOR_COOLDOWN_MINUTES) || 15) * 60 * 1000

// Configura VAPID apenas se as chaves estiverem definidas — evita crash no módulo load
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.EMAIL_USER || 'monitor@finance-app.local'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

// Cooldown em memória — sem race condition, sem /tmp, sem disco
let lastAlertTs = 0

function cooldownOk() {
  const now = Date.now()
  if (now - lastAlertTs < COOLDOWN_MS) return false
  lastAlertTs = now
  return true
}

router.post('/', async (req, res) => {
  const secret = process.env.MONITOR_SECRET
  if (!secret || req.headers['x-monitor-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { failed } = req.body
  if (!Array.isArray(failed) || failed.length === 0) {
    return res.status(400).json({ error: 'Payload inválido' })
  }

  if (!cooldownOk()) {
    return res.json({ ok: true, skipped: true, reason: 'cooldown ativo' })
  }

  const subscriptions = await prisma.pushSubscription.findMany()
  if (subscriptions.length === 0) {
    return res.json({ ok: true, sent: 0, reason: 'sem assinantes' })
  }

  const serviceNames = failed
    .filter(f => f && typeof f.name === 'string')
    .map(f => `${f.name}: ${f.detail || 'offline'}`)
    .join('\n')

  const payload = JSON.stringify({
    title: '⚠️ Finance App com problemas',
    body:  serviceNames,
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    data:  { url: '/' },
  })

  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  )

  // Remove assinaturas expiradas (HTTP 410 Gone)
  const expired = results
    .map((r, i) => ({ r, sub: subscriptions[i] }))
    .filter(({ r }) => r.status === 'rejected' && r.reason?.statusCode === 410)

  if (expired.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: expired.map(({ sub }) => sub.endpoint) } },
    })
  }

  const sent   = results.filter(r => r.status === 'fulfilled').length
  const errors = results.filter(r => r.status === 'rejected').length
  console.log(`[monitor-alert] ${sent} notificações enviadas, ${errors} erros`)

  res.json({ ok: true, sent, errors })
})

module.exports = router
