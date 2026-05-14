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
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Dados de assinatura inválidos.' })
    }
    await prisma.pushSubscription.upsert({
      where:  { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: req.userId },
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: req.userId },
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
