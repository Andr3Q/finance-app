const express  = require('express')
const router   = express.Router()
const prisma   = require('../lib/prisma')
const webpush  = require('web-push')
const { readFileSync, writeFileSync } = require('fs')

const COOLDOWN_MS   = (parseInt(process.env.MONITOR_COOLDOWN_MINUTES) || 15) * 60 * 1000
const COOLDOWN_FILE = '/tmp/fm_last_alert'

webpush.setVapidDetails(
  `mailto:${process.env.EMAIL_USER || 'monitor@finance-app.local'}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

function cooldownOk() {
  try {
    const last = parseInt(readFileSync(COOLDOWN_FILE, 'utf8'))
    if (Date.now() - last < COOLDOWN_MS) return false
  } catch { /* arquivo não existe ainda — primeira vez */ }
  writeFileSync(COOLDOWN_FILE, String(Date.now()))
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

  const payload = JSON.stringify({
    title: '⚠️ Finance App com problemas',
    body:  failed.map(f => `${f.name}: ${f.detail}`).join('\n'),
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
  console.log(`[monitor-alert] ${sent} notificações enviadas, ${errors} erros | serviços: ${failed.map(f => f.name).join(', ')}`)

  res.json({ ok: true, sent, errors })
})

module.exports = router
