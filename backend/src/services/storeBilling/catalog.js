'use strict'

// Assinaturas que o Nancy vende nas lojas. Os IDs abaixo são os que precisam existir no Play Console (Monetizar > Assinaturas):
//   produto  nancy_pro    com planos base  mensal / anual
//   produto  nancy_elite  com planos base  mensal / anual
// O Google devolve, em cada compra, o productId e o basePlanId; o servidor traduz para o plano e o período do Nancy aqui e
// NUNCA confia no que o app diz (o app só entrega o token da compra).
const PLAY_PRODUCTS = Object.freeze({
  nancy_pro:   'pro',
  nancy_elite: 'elite',
})

const PLAY_BASE_PLANS = Object.freeze({
  mensal: 'monthly',
  anual:  'annual',
})

// Nome do pacote do app Android (nancy-twa/twa-manifest.json: packageId).
const PLAY_PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'br.com.myfinancepro.app'

// { plan, period } para um par (produto, plano base) conhecido; null para qualquer outro.
function resolvePlayProduct(productId, basePlanId) {
  const plan   = Object.prototype.hasOwnProperty.call(PLAY_PRODUCTS, productId) ? PLAY_PRODUCTS[productId] : undefined
  const period = Object.prototype.hasOwnProperty.call(PLAY_BASE_PLANS, basePlanId) ? PLAY_BASE_PLANS[basePlanId] : undefined
  if (!plan || !period) return null
  return { plan, period }
}

// Lista para o app saber o que oferecer (a tela de planos usa isto + os preços que o Google devolve no aparelho).
function listPlayProducts() {
  return Object.entries(PLAY_PRODUCTS).flatMap(([productId, plan]) =>
    Object.entries(PLAY_BASE_PLANS).map(([basePlanId, period]) => ({ productId, basePlanId, plan, period })))
}

module.exports = { PLAY_PRODUCTS, PLAY_BASE_PLANS, PLAY_PACKAGE_NAME, resolvePlayProduct, listPlayProducts }
