'use strict'

// Traduz o estado de uma assinatura da loja em PLANO do Nancy. A regra de ouro: o plano do usuário continua sendo calculado pelo
// mesmo lugar de sempre (computeEffectivePlan, a partir de plan + planExpiresAt). A compra pela loja só ESCREVE esses campos:
// planExpiresAt = até quando a loja garante o acesso; a cada renovação o aviso do Google empurra a data para frente; se a loja
// cancelar, suspender ou reembolsar, a data para de andar e o plano vence sozinho. Nada mais no app precisa saber da loja.
const prisma = require('../../lib/prisma')
const { resolvePlayProduct } = require('./catalog')

const PROVIDER = 'google_play'
// Em "período de carência" (cobrança falhou, o Google ainda tenta) o cliente deve manter o acesso. Se a data de expiração já passou,
// damos 3 dias a partir do aviso; o próximo aviso do Google (renovou ou suspendeu) corrige. Suposição a conferir com os testes da Play.
const GRACE_FALLBACK_MS = 3 * 24 * 60 * 60 * 1000

const STATE_MAP = Object.freeze({
  SUBSCRIPTION_STATE_ACTIVE:                    'active',
  SUBSCRIPTION_STATE_CANCELED:                  'canceled',   // cancelou a renovação, mas pagou até expiryTime
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD:           'grace',
  SUBSCRIPTION_STATE_ON_HOLD:                   'on_hold',    // cobrança falhou e a carência acabou: sem acesso
  SUBSCRIPTION_STATE_PAUSED:                    'paused',
  SUBSCRIPTION_STATE_EXPIRED:                   'expired',
  SUBSCRIPTION_STATE_PENDING:                   'pending',    // pagamento ainda não confirmado (ex.: boleto): sem acesso
  SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED: 'expired',
})

// Lê a resposta do Google (SubscriptionPurchaseV2) e devolve só o que o Nancy usa; { ok:false, reason } se não reconhecer.
function parseGoogleSubscription(resource) {
  if (!resource || typeof resource !== 'object') return { ok: false, reason: 'resposta vazia' }
  const state = STATE_MAP[resource.subscriptionState]
  if (!state) return { ok: false, reason: `estado desconhecido: ${resource.subscriptionState}` }

  const items = Array.isArray(resource.lineItems) ? resource.lineItems : []
  const item = items.find((i) => resolvePlayProduct(i?.productId))
  if (!item) return { ok: false, reason: 'produto desconhecido' }
  const { plan, period } = resolvePlayProduct(item.productId)

  const expiresAt = item.expiryTime ? new Date(item.expiryTime) : null
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return { ok: false, reason: 'data de expiração inválida' }

  return {
    ok: true,
    productId:    item.productId,
    plan, period, state,
    autoRenewing: item.autoRenewingPlan?.autoRenewEnabled === true,
    expiresAt,
    acknowledged: resource.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
    testPurchase: resource.testPurchase != null,
  }
}

// Até quando este estado garante acesso; null = sem acesso.
function accessEnd(parsed, now = new Date()) {
  switch (parsed.state) {
    case 'active':
    case 'canceled':
      return parsed.expiresAt && parsed.expiresAt > now ? parsed.expiresAt : null
    case 'grace':
      return parsed.expiresAt && parsed.expiresAt > now ? parsed.expiresAt : new Date(now.getTime() + GRACE_FALLBACK_MS)
    default:
      return null
  }
}

// Grava a compra e ajusta o plano do usuário. Devolve { applied, ... } e nunca mexe em plano que veio de outra fonte ainda válida
// (ex.: o cliente assinou pelo site e depois pelo app: o app avisa antes, e aqui fica a trava para o caso de corrida).
async function applyGoogleState({ userId, purchaseToken, parsed, acknowledged = parsed.acknowledged, now = new Date() }) {
  const row = {
    productId: parsed.productId, plan: parsed.plan, period: parsed.period, state: parsed.state,
    autoRenewing: parsed.autoRenewing, expiresAt: parsed.expiresAt, acknowledged,
  }
  await prisma.storePurchase.upsert({
    where:  { provider_purchaseToken: { provider: PROVIDER, purchaseToken } },
    create: { provider: PROVIDER, purchaseToken, userId, ...row },
    update: row,
  })

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true, planSource: true } })
  if (!user) return { applied: false, reason: 'user_not_found' }

  const end = accessEnd(parsed, now)
  if (end) {
    const otherSourceActive = user.plan !== 'free' && user.planSource !== PROVIDER && user.planExpiresAt && user.planExpiresAt > now
    if (otherSourceActive) {
      return { applied: false, reason: 'other_source_active', plan: user.plan, planExpiresAt: user.planExpiresAt, state: parsed.state }
    }
    await prisma.user.update({
      where: { id: userId },
      data:  { plan: parsed.plan, planExpiresAt: end, planPeriod: parsed.period, planSource: PROVIDER, trialEndsAt: null, renewalReminderSent: false },
    })
    return { applied: true, plan: parsed.plan, planExpiresAt: end, state: parsed.state }
  }

  // Sem acesso (suspensa, pausada, vencida, pendente): só mexe se ESTE for o plano que a loja sustentava, e apenas para a data parar.
  if (user.planSource === PROVIDER) {
    const stop = parsed.expiresAt && parsed.expiresAt < now ? parsed.expiresAt : now
    await prisma.user.update({ where: { id: userId }, data: { planExpiresAt: stop } })
    return { applied: true, plan: user.plan, planExpiresAt: stop, state: parsed.state, ended: true }
  }
  return { applied: false, reason: 'no_access', state: parsed.state }
}

// Reembolso ou estorno avisado pelo Google: o acesso acaba agora.
async function revokeGooglePurchase({ purchase, now = new Date() }) {
  await prisma.storePurchase.update({ where: { id: purchase.id, userId: purchase.userId }, data: { state: 'revoked', autoRenewing: false } })
  const user = await prisma.user.findUnique({ where: { id: purchase.userId }, select: { planSource: true } })
  if (user?.planSource === PROVIDER) {
    await prisma.user.update({ where: { id: purchase.userId }, data: { planExpiresAt: now } })
    return { applied: true, ended: true }
  }
  return { applied: false, reason: 'not_current_source' }
}

module.exports = { PROVIDER, STATE_MAP, parseGoogleSubscription, accessEnd, applyGoogleState, revokeGooglePurchase }
