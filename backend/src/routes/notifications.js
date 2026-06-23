const express = require('express')
const router  = express.Router()
const prisma  = require('../lib/prisma')
const auth    = require('../middleware/auth')

router.use(auth)

// Retorna a chave pública VAPID para o frontend criar a assinatura
router.get('/vapid-public-key', (_req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || null })
})

// Salva ou atualiza a assinatura push do usuário
router.post('/subscribe', async (req, res) => {
  try {
    const { endpoint, keys } = req.body
    if (!endpoint || typeof endpoint !== 'string' || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Dados de assinatura inválidos.' })
    }

    // Valida URL e exige HTTPS — protege contra SSRF via endpoints maliciosos
    let parsedUrl
    try { parsedUrl = new URL(endpoint) } catch {
      return res.status(400).json({ error: 'Endpoint inválido.' })
    }
    if (parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Endpoint deve usar HTTPS.' })
    }

    // Aceita apenas domínios de serviços de push conhecidos (FCM, Mozilla, Apple, Windows)
    const ALLOWED_PUSH_HOSTS = [
      'fcm.googleapis.com',
      'updates.push.services.mozilla.com',
      'push.services.mozilla.com',
      'web.push.apple.com',
      'wns2.notify.windows.com',
      'notify.windows.com',
    ]
    const hostOk = ALLOWED_PUSH_HOSTS.some(h => parsedUrl.hostname === h || parsedUrl.hostname.endsWith(`.${h}`))
    if (!hostOk) {
      return res.status(400).json({ error: 'Serviço de notificação não reconhecido.' })
    }
    if (parsedUrl.port !== '' && parsedUrl.port !== '443') {
      return res.status(400).json({ error: 'Porta não permitida no endpoint.' })
    }
    // Verifica se o endpoint já pertence a outro usuário — impede roubo de assinatura.
    const existing = await prisma.pushSubscription.findUnique({ where: { endpoint } })
    if (existing && existing.userId !== req.userId) {
      return res.status(409).json({ error: 'Endpoint de notificação já associado a outra conta.' })
    }
    await prisma.pushSubscription.upsert({
      where:  { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: req.userId },
      update: { p256dh: keys.p256dh, auth: keys.auth },
    })
    res.json({ ok: true })
  } catch (err) {
    console.error('Erro ao salvar assinatura push:', err)
    res.status(500).json({ error: 'Erro ao salvar assinatura.' })
  }
})

// Remove a assinatura (usuário desativou as notificações)
router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.userId } })
    }
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover assinatura.' })
  }
})

module.exports = router
