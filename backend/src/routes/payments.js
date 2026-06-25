const express        = require('express')
const crypto         = require('crypto')
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { UUID_REGEX } = require('../utils/constants')
const { sendPlanActivationEmail } = require('../services/emailService')
const { apiLimiter } = require('../middleware/rateLimiter')

const router  = express.Router()
const APP_URL = process.env.APP_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'

// Verifica assinatura HMAC do webhook do Mercado Pago.
// Sem MP_WEBHOOK_SECRET configurado, rejeita sempre — não há modo permissivo.
// Ref: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
function verifyMpSignature(req) {
  const secret = process.env.MP_WEBHOOK_SECRET
  if (!secret) return null  // null = secret ausente (503), false = assinatura inválida (200)

  const sig   = req.headers['x-signature']
  const reqId = req.headers['x-request-id']
  if (!sig || !reqId) return false

  const ts = sig.split(',').find(p => p.startsWith('ts='))?.slice(3)
  const v1 = sig.split(',').find(p => p.startsWith('v1='))?.slice(3)
  if (!ts || !v1) return false

  const dataId = req.body?.data?.id || req.query?.id
  if (!dataId) return false

  const template = `id:${dataId};request-id:${reqId};ts:${ts};`
  const expected = crypto.createHmac('sha256', secret).update(template).digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

const PRICES = {
  pro:   { monthly: 9.90, annual: 99.00 },
  elite: { monthly: 34.90, annual: 334.80 },
}

const TITLES = {
  pro:   { monthly: 'Nancy Pro — Mensal',  annual: 'Nancy Pro — Anual'  },
  elite: { monthly: 'Nancy Elite — Mensal', annual: 'Nancy Elite — Anual' },
}

function getMpClient() {
  if (!process.env.MP_ACCESS_TOKEN) return null
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN })
}

// ── POST /api/payments/create-preference ───────────────
// Cria preferência MP e retorna a URL de checkout.
router.post('/create-preference', authMiddleware, async (req, res) => {
  const client = getMpClient()
  if (!client) return res.status(503).json({ error: 'Pagamentos não configurados.' })

  const { plan, period } = req.body
  if (!['pro', 'elite'].includes(plan))       return res.status(400).json({ error: 'Plano inválido.' })
  if (!['monthly', 'annual'].includes(period)) return res.status(400).json({ error: 'Período inválido.' })

  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { email: true, name: true },
    })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

    const response = await new Preference(client).create({
      body: {
        items: [{
          id:         `${plan}_${period}`,
          title:      TITLES[plan][period],
          quantity:   1,
          unit_price: PRICES[plan][period],
          currency_id: 'BRL',
        }],
        payer: { email: user.email, name: user.name },
        external_reference: `${req.userId}|${plan}|${period}`,
        back_urls: {
          success: `${APP_URL}/planos?payment=success`,
          failure: `${APP_URL}/planos?payment=failure`,
          pending: `${APP_URL}/planos?payment=pending`,
        },
        auto_return:          'approved',
        notification_url:     `${APP_URL}/api/payments/webhook`,
        statement_descriptor: 'NANCY',
      },
    })

    res.json({ checkoutUrl: response.init_point })
  } catch (err) {
    console.error('[payments] create-preference:', err.message)
    res.status(500).json({ error: 'Erro ao criar preferência de pagamento.' })
  }
})

// ── POST /api/payments/webhook ──────────────────────────
// Recebe notificações do MP — sem auth JWT (chamado pelo MP).
// Responde 200 imediatamente e processa em background.
router.post('/webhook', apiLimiter, async (req, res) => {
  const sigResult = verifyMpSignature(req)
  if (sigResult === null) {
    // Secret não configurado: 503 para o MP retentar quando o servidor estiver pronto
    console.error('[payments] MP_WEBHOOK_SECRET não configurado — rejeitando webhook com 503')
    return res.sendStatus(503)
  }
  if (!sigResult) {
    console.warn('[payments] webhook rejeitado: assinatura inválida')
    return res.sendStatus(200) // 200 para o MP não retentar com dados inválidos
  }
  res.sendStatus(200)

  try {
    const client = getMpClient()
    if (!client) return

    const type   = req.body?.type   || req.query?.topic
    const dataId = req.body?.data?.id || req.query?.id

    if (type !== 'payment' || !dataId) return

    const payment = await new Payment(client).get({ id: dataId })
    if (payment.status !== 'approved')       return
    if (!payment.external_reference)         return

    const parts = String(payment.external_reference).split('|')
    if (parts.length !== 3) return

    const [userId, plan, period] = parts
    if (!UUID_REGEX.test(userId))                return
    if (!['pro', 'elite'].includes(plan))        return
    if (!['monthly', 'annual'].includes(period)) return

    // Valida que o valor pago corresponde ao preço do plano — impede ativar Elite
    // pagando R$9,90 (Pro mensal) com external_reference apontando para elite|annual
    const expectedPrice = PRICES[plan][period]
    if (typeof payment.transaction_amount !== 'number' ||
        Math.abs(payment.transaction_amount - expectedPrice) > 0.01) {
      console.warn(`[payments] valor divergente — esperado R$${expectedPrice}, recebido R$${payment.transaction_amount} (payment ${dataId})`)
      return
    }

    const daysToAdd     = period === 'annual' ? 366 : 31
    const planExpiresAt = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000)

    // Deduplicação atômica: processedPayment.create falha com P2002 se já existir,
    // garantindo que plano nunca seja ativado duas vezes mesmo com webhooks concorrentes.
    let activatedUser
    try {
      activatedUser = await prisma.$transaction(async (tx) => {
        await tx.processedPayment.create({
          data: { paymentId: String(dataId), userId, plan, period },
        })
        return tx.user.update({
          where:  { id: userId },
          data:   { plan, planExpiresAt, planPeriod: period, renewalReminderSent: false, trialEndsAt: null },
          select: { email: true, name: true },
        })
      })
    } catch (txErr) {
      if (txErr.code === 'P2002') {
        console.log(`[payments] webhook duplicado ignorado: ${dataId}`)
        return
      }
      throw txErr
    }

    // E-mail de confirmação — fire-and-forget
    sendPlanActivationEmail(activatedUser.email, activatedUser.name, plan, planExpiresAt).catch(() => {})

    console.log(`[payments] ${plan} ativado para ${userId} até ${planExpiresAt.toISOString().slice(0, 10)}`)
  } catch (err) {
    console.error('[payments] webhook:', err.message)
  }
})

// ── GET /payments/history ───────────────────────────────
// Retorna os últimos pagamentos processados do usuário
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const payments = await prisma.processedPayment.findMany({
      where:   { userId: req.userId },
      orderBy: { processedAt: 'desc' },
      take:    20,
      select:  { paymentId: true, plan: true, period: true, processedAt: true },
    })
    res.json(payments)
  } catch {
    res.status(500).json({ error: 'Erro ao buscar histórico de pagamentos.' })
  }
})

module.exports = router
