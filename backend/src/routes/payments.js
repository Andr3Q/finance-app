const express        = require('express')
const crypto         = require('crypto')
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { UUID_REGEX } = require('../utils/constants')
const { sendPlanActivationEmail } = require('../services/emailService')
const { paymentLimiter, webhookLimiter } = require('../middleware/rateLimiter')
const { reportError } = require('../lib/sentry')

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
  // timeout: 6s por tentativa — o SDK tenta de novo sozinho até 3x com backoff
  // (não configurável via API pública), então o default de 10s por tentativa
  // dava um pior caso de ~36s, MAIOR que o timeout global de 30s do server.js.
  // Com 6s, o pior caso (~21s) fica dentro da margem mesmo sem contar o
  // override de resposta que /create-preference também ganhou, abaixo.
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN, options: { timeout: 6000 } })
}

// Retry curto e isolado só pra Payment.get() no webhook — é a chamada que, se
// falhar DEPOIS do 200 já enviado ao MP (que por isso nunca reenvia), deixa
// o pagamento sem nenhuma tentativa automática de recuperação: hoje só cai
// no Sentry. Não substitui uma reconciliação completa (fora de escopo por
// ora), mas reduz bastante a janela de perda por falha transitória de rede.
async function withMpRetry(fn, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
}

// ── POST /api/payments/create-preference ───────────────
// Cria preferência MP e retorna a URL de checkout.
// Timeout de resposta maior que o global (30s, server.js) — margem extra
// pro pior caso de retry do SDK do MP (~21s com o timeout de 6s acima).
router.post('/create-preference', authMiddleware, paymentLimiter, (req, res, next) => {
  res.setTimeout(40_000, () => {
    if (!res.headersSent) res.status(503).json({ error: 'Tempo de resposta esgotado.' })
  })
  next()
}, async (req, res) => {
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
    reportError(err, { tag: '[payments] create-preference', userId: req.userId })
    res.status(500).json({ error: 'Erro ao criar preferência de pagamento.' })
  }
})

// ── POST /api/payments/webhook ──────────────────────────
// Recebe notificações do MP — sem auth JWT (chamado pelo MP).
// Responde 200 imediatamente e processa em background.
router.post('/webhook', webhookLimiter, async (req, res) => {
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

    const payment = await withMpRetry(() => new Payment(client).get({ id: dataId }))
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

    const daysToAdd = period === 'annual' ? 366 : 31
    const DAY_MS    = 24 * 60 * 60 * 1000

    // Deduplicação atômica: processedPayment.create falha com P2002 se já existir,
    // garantindo que plano nunca seja ativado duas vezes mesmo com webhooks concorrentes.
    let activatedUser
    try {
      activatedUser = await prisma.$transaction(async (tx) => {
        await tx.processedPayment.create({
          data: { paymentId: String(dataId), userId, plan, period },
        })

        // A-03: acumula dias restantes — renovação antecipada não perde dias já pagos.
        // Lock otimista com retry: dois pagamentos DIFERENTES do mesmo usuário quase
        // simultâneos (ex: upgrade seguido de renovação) podem ambos ler o mesmo
        // planExpiresAt "base" — sem isso, o segundo UPDATE sobrescreve o primeiro
        // (lost update) e um dos pagamentos não credita dias, mesmo já pago. A
        // condição no where (planExpiresAt = valor lido) faz o Postgres barrar a
        // escrita se outra transação já mudou a linha — tenta de novo com o valor
        // fresco em vez de simplesmente falhar, porque o pagamento tem que ser
        // creditado de qualquer forma.
        const MAX_RETRIES = 5
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          const cur  = await tx.user.findUnique({ where: { id: userId }, select: { planExpiresAt: true } })
          const base = cur?.planExpiresAt && cur.planExpiresAt > new Date() ? cur.planExpiresAt : new Date()
          const planExpiresAt = new Date(base.getTime() + daysToAdd * DAY_MS)

          const claim = await tx.user.updateMany({
            where: { id: userId, planExpiresAt: cur?.planExpiresAt ?? null },
            data:  { plan, planExpiresAt, planPeriod: period, renewalReminderSent: false, trialEndsAt: null },
          })
          if (claim.count === 1) {
            return tx.user.findUnique({ where: { id: userId }, select: { email: true, name: true, planExpiresAt: true } })
          }
        }
        throw new Error(`[payments] falha ao ativar plano após ${MAX_RETRIES} tentativas concorrentes (userId ${userId})`)
      })
    } catch (txErr) {
      if (txErr.code === 'P2002') {
        console.log(`[payments] webhook duplicado ignorado: ${dataId}`)
        return
      }
      throw txErr
    }

    // E-mail de confirmação — fire-and-forget
    sendPlanActivationEmail(activatedUser.email, activatedUser.name, plan, activatedUser.planExpiresAt).catch(() => {})

    console.log(`[payments] ${plan} ativado para ${userId} até ${activatedUser.planExpiresAt.toISOString().slice(0, 10)}`)
  } catch (err) {
    reportError(err, { tag: '[payments] webhook' })
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
