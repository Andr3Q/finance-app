'use strict'

// Compra de plano pelas lojas. Hoje: Google Play (assinaturas do app Android). O site continua pelo Mercado Pago (routes/payments.js)
// e NÃO passa por aqui. Tudo é desligado por padrão: sem GOOGLE_PLAY_SERVICE_ACCOUNT_JSON as rotas respondem 503 e nada chama o Google.
//
//   GET  /api/billing/config          o app pergunta o que a loja oferece e se está ligada
//   POST /api/billing/google/verify   o app entrega o token da compra; o servidor confere com o Google, confirma e ativa o plano
//   POST /api/billing/google/rtdn     avisos do Google (renovou, cancelou, reembolsou...) via Pub/Sub; sem login, com token OIDC
const express        = require('express')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { paymentLimiter, webhookLimiter } = require('../middleware/rateLimiter')
const { reportError } = require('../lib/sentry')
const google         = require('../services/storeBilling/googlePlayClient')
const { PLAY_PRODUCTS, PLAY_PACKAGE_NAME, listPlayProducts } = require('../services/storeBilling/catalog')
const { PROVIDER, parseGoogleSubscription, accessEnd, applyGoogleState, revokeGooglePurchase } = require('../services/storeBilling/entitlement')
const { verifyPubSubPush } = require('../services/storeBilling/pubsubAuth')

const router = express.Router()

// O token da compra é opaco, mas só tem letras, números e alguns símbolos; limita o tamanho antes de ir para a URL do Google.
const TOKEN_REGEX = /^[A-Za-z0-9._-]{20,1000}$/

const unavailable = (res) => res.status(503).json({ error: 'Pagamento pelo Google Play indisponível no momento.' })

// Consulta o Google e, se a compra ainda não foi confirmada e dá acesso, confirma. Erro do Google vira { status } para a rota decidir.
async function syncFromGoogle({ userId, purchaseToken }) {
  let resource
  try {
    resource = await google.getSubscription(purchaseToken)
  } catch (err) {
    return { error: { status: [400, 404, 410].includes(err.status) ? 400 : 502, message: [400, 404, 410].includes(err.status) ? 'Compra não encontrada no Google Play.' : 'Não foi possível falar com o Google agora. Tente de novo.' }, cause: err }
  }
  const parsed = parseGoogleSubscription(resource)
  if (!parsed.ok) return { error: { status: 422, message: 'Compra não reconhecida pelo Nancy.' }, cause: new Error(parsed.reason) }

  const hasAccess = accessEnd(parsed) !== null
  let acknowledged = parsed.acknowledged
  if (!acknowledged && hasAccess) {
    try {
      await google.acknowledge(parsed.productId, purchaseToken)
      acknowledged = true
    } catch (err) {
      // O Google já confirmou o pagamento, então o plano vale desde já (a pessoa pagou). Falta só confirmar a compra, que o Google
      // exige em 3 dias (senão devolve o dinheiro): grava o estado e pede para o app tentar de novo, o que é inofensivo repetir.
      await applyGoogleState({ userId, purchaseToken, parsed, acknowledged: false })
      return { error: { status: 502, message: 'Não foi possível confirmar a compra agora. Tente de novo.' }, cause: err }
    }
  }
  const result = await applyGoogleState({ userId, purchaseToken, parsed, acknowledged })
  return { parsed, result }
}

// ── GET /api/billing/config ─────────────────────────────
router.get('/config', authMiddleware, (req, res) => {
  const enabled = google.isConfigured()
  res.json({ googlePlay: { enabled, packageName: PLAY_PACKAGE_NAME, products: enabled ? listPlayProducts() : [] } })
})

// ── POST /api/billing/google/verify ─────────────────────
router.post('/google/verify', authMiddleware, paymentLimiter, async (req, res) => {
  if (!google.isConfigured()) return unavailable(res)

  const { purchaseToken, productId } = req.body || {}
  if (typeof purchaseToken !== 'string' || !TOKEN_REGEX.test(purchaseToken)) return res.status(400).json({ error: 'Compra inválida.' })
  if (productId !== undefined && !Object.prototype.hasOwnProperty.call(PLAY_PRODUCTS, productId)) return res.status(400).json({ error: 'Produto inválido.' })

  try {
    // Um token de compra pertence a UMA conta: se já está ligado a outra, ninguém mais o usa.
    const existing = await prisma.storePurchase.findUnique({ where: { provider_purchaseToken: { provider: PROVIDER, purchaseToken } } })
    if (existing && existing.userId !== req.userId) return res.status(409).json({ error: 'Esta compra já está ligada a outra conta.' })

    const out = await syncFromGoogle({ userId: req.userId, purchaseToken })
    if (out.error) {
      if (out.error.status >= 500) reportError(out.cause, { where: 'billing.verify' })
      return res.status(out.error.status).json({ error: out.error.message })
    }
    const r = out.result
    if (!r.applied && r.reason === 'other_source_active') {
      // O cliente já tem plano válido pelo site: não sobrescreve. O app avisa antes de vender; isto é a trava da corrida.
      console.warn(`[billing] compra Google em conta com plano ativo de outra fonte (user ${req.userId}) — revisar/reembolsar`)
      return res.status(409).json({ error: 'Você já tem um plano ativo pelo site. Fale com o suporte para ajustar a assinatura.', code: 'other_source_active' })
    }
    return res.json({ applied: r.applied, plan: r.plan ?? null, planExpiresAt: r.planExpiresAt ? r.planExpiresAt.toISOString() : null, state: r.state })
  } catch (err) {
    reportError(err, { where: 'billing.verify' })
    return res.status(500).json({ error: 'Erro ao validar a compra.' })
  }
})

// ── POST /api/billing/google/rtdn ───────────────────────
// Pub/Sub reenvia enquanto a resposta não for 2xx: 200 = "recebi" (inclui avisos que não nos interessam); 5xx = "tente de novo".
router.post('/google/rtdn', webhookLimiter, async (req, res) => {
  const auth = await verifyPubSubPush(req)
  if (!auth.ok) return res.status(auth.status).json({ error: auth.reason })
  if (!google.isConfigured()) return unavailable(res)

  let note
  try {
    const data = req.body?.message?.data
    if (typeof data !== 'string') throw new Error('sem data')
    note = JSON.parse(Buffer.from(data, 'base64').toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'Mensagem inválida.' })
  }
  if (!note || typeof note !== 'object') return res.status(400).json({ error: 'Mensagem inválida.' })
  if (note.packageName && note.packageName !== PLAY_PACKAGE_NAME) return res.sendStatus(200) // aviso de outro app: não é nosso
  if (note.testNotification) return res.sendStatus(200)                                       // o botão "enviar aviso de teste" do Play Console

  try {
    // Reembolso/estorno: o acesso acaba agora.
    const voided = note.voidedPurchaseNotification
    if (voided?.purchaseToken && voided.productType === 1) {
      const purchase = await prisma.storePurchase.findUnique({ where: { provider_purchaseToken: { provider: PROVIDER, purchaseToken: String(voided.purchaseToken) } } })
      if (purchase) await revokeGooglePurchase({ purchase })
      return res.sendStatus(200)
    }

    const sub = note.subscriptionNotification
    if (!sub?.purchaseToken) return res.sendStatus(200) // outros tipos (compra avulsa etc.): ignorados
    const purchaseToken = String(sub.purchaseToken)
    const purchase = await prisma.storePurchase.findUnique({ where: { provider_purchaseToken: { provider: PROVIDER, purchaseToken } } })
    if (!purchase) return res.sendStatus(200) // ainda sem dono: o app chama /verify e o estado atual do Google é aplicado nessa hora

    const out = await syncFromGoogle({ userId: purchase.userId, purchaseToken })
    if (out.error) {
      reportError(out.cause, { where: 'billing.rtdn' })
      // 4xx do Google/produto desconhecido não melhora com reenvio: confirma o recebimento; falha de rede/5xx pede reenvio.
      return res.sendStatus(out.error.status >= 500 ? 500 : 200)
    }
    return res.sendStatus(200)
  } catch (err) {
    reportError(err, { where: 'billing.rtdn' })
    return res.sendStatus(500)
  }
})

module.exports = router
