'use strict'

// Assinaturas que o Nancy vende nas lojas. Cada combinação plano + período é um PRODUTO próprio no Play Console
// (Monetizar > Assinaturas), cada um com UM único plano base:
//   nancy_pro_mensal    nancy_pro_anual    nancy_elite_mensal    nancy_elite_anual
// Por que não um produto com vários planos base? A documentação da Digital Goods API (o que o app web usa para comprar) só fala de
// "ID do produto" e não diz como escolher o plano base, então cada produto tem um só e o ID já diz tudo.
// O Google devolve o productId em cada compra e o servidor traduz para o plano e o período do Nancy AQUI; NUNCA confia no que o app
// diz (o app só entrega o token da compra).
const PLAY_PRODUCTS = Object.freeze({
  nancy_pro_mensal:   Object.freeze({ plan: 'pro',   period: 'monthly' }),
  nancy_pro_anual:    Object.freeze({ plan: 'pro',   period: 'annual'  }),
  nancy_elite_mensal: Object.freeze({ plan: 'elite', period: 'monthly' }),
  nancy_elite_anual:  Object.freeze({ plan: 'elite', period: 'annual'  }),
})

// Nome do pacote do app Android (nancy-twa/twa-manifest.json: packageId).
const PLAY_PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'br.com.myfinancepro.app'

// { plan, period } para um produto conhecido; null para qualquer outro.
function resolvePlayProduct(productId) {
  if (typeof productId !== 'string' || !Object.prototype.hasOwnProperty.call(PLAY_PRODUCTS, productId)) return null
  const { plan, period } = PLAY_PRODUCTS[productId]
  return { plan, period }
}

// Lista para o app saber o que oferecer (a tela de planos usa isto + os preços que o Google devolve no aparelho).
function listPlayProducts() {
  return Object.entries(PLAY_PRODUCTS).map(([productId, { plan, period }]) => ({ productId, plan, period }))
}

module.exports = { PLAY_PRODUCTS, PLAY_PACKAGE_NAME, resolvePlayProduct, listPlayProducts }
