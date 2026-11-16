import { billingAPI } from './api.js'
import { isAndroidApp } from '../utils/androidApp.js'

// Compra de plano DENTRO do app Android da Play Store (Trusted Web Activity) pela Digital Goods API + Payment Request API do Chrome.
// O app só entrega ao servidor o "token da compra"; quem confere com o Google, confirma e ativa o plano é o servidor
// (POST /api/billing/google/verify). Fora do app (site comum) nada disto roda: o site segue pelo Mercado Pago.
//
// Estado: 'idle' (ainda não olhou) | 'checking' | 'ready' | 'unavailable'. Só fica 'ready' se TUDO existir: app Android com a API de
// cobrança do aparelho, recurso ligado no servidor e os 4 produtos com preço no Google. Qualquer falta = 'unavailable', e o app volta
// a se comportar como "sem compra" (nada de preço nem convite), que é o jeito seguro. Nunca vende pela metade.
export const PLAY_BILLING_URL = 'https://play.google.com/billing'

// Mesmos IDs do servidor (backend/src/services/storeBilling/catalog.js) e do Play Console: um produto por plano + período.
export const PLAY_PRODUCTS = Object.freeze({
  pro:   Object.freeze({ monthly: 'nancy_pro_mensal',   annual: 'nancy_pro_anual' }),
  elite: Object.freeze({ monthly: 'nancy_elite_mensal', annual: 'nancy_elite_anual' }),
})
export const PLAY_PRODUCT_IDS = Object.freeze(Object.values(PLAY_PRODUCTS).flatMap((p) => Object.values(p)))
export const PLAY_PACKAGE = 'br.com.myfinancepro.app'

let state = { status: 'idle', details: {} }
let service = null
let initPromise = null
const listeners = new Set()

const setState = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()) }

// para o React (useSyncExternalStore): a mesma referência enquanto nada muda
export const getPlayBilling = () => state
export const subscribePlayBilling = (listener) => { listeners.add(listener); return () => listeners.delete(listener) }

// Erros com um "code" que a tela traduz em mensagem: 'unavailable' | 'cancelled' | 'failed' | 'conflict' | 'verify_failed'
export class PlayBillingError extends Error {
  constructor(code, extra = {}) {
    super(code)
    this.name = 'PlayBillingError'
    this.code = code
    Object.assign(this, extra)
  }
}

// Olha se dá para vender aqui e já busca os preços do Google. Pode ser chamado várias vezes: só trabalha uma vez enquanto der certo
// e tenta de novo depois de uma falha (ex.: rede). Só vale para quem está logado (a rota de configuração exige login).
export function initPlayBilling() {
  if (state.status === 'ready') return Promise.resolve(state)
  if (initPromise) return initPromise
  if (!isAndroidApp() || typeof window === 'undefined' || typeof window.getDigitalGoodsService !== 'function') {
    setState({ status: 'unavailable', details: {} })
    return Promise.resolve(state)
  }
  setState({ status: 'checking' })
  initPromise = (async () => {
    try {
      const [svc, cfg] = await Promise.all([window.getDigitalGoodsService(PLAY_BILLING_URL), billingAPI.config()])
      if (cfg?.data?.googlePlay?.enabled !== true) throw new Error('recurso desligado no servidor')

      const items = await svc.getDetails([...PLAY_PRODUCT_IDS])
      const details = {}
      for (const it of Array.isArray(items) ? items : []) {
        const value = Number(it?.price?.value)
        if (PLAY_PRODUCT_IDS.includes(it?.itemId) && typeof it.price?.currency === 'string' && Number.isFinite(value) && value > 0) {
          details[it.itemId] = { currency: it.price.currency, value }
        }
      }
      if (!PLAY_PRODUCT_IDS.every((id) => details[id])) throw new Error('produtos incompletos no Google Play')

      service = svc
      setState({ status: 'ready', details })
    } catch {
      service = null
      setState({ status: 'unavailable', details: {} })
    } finally {
      initPromise = null
    }
    return state
  })()
  return initPromise
}

// Abre a tela de compra do Google. Devolve a resposta do servidor ({ applied, plan, planExpiresAt, state }).
// Assinatura NÃO é "consumida" (isso é só para itens avulsos). Quem cancelou a tela de compra recebe PlayBillingError('cancelled').
export async function purchase(productId) {
  if (state.status !== 'ready' || !service || !PLAY_PRODUCT_IDS.includes(productId)) throw new PlayBillingError('unavailable')

  const request = new PaymentRequest(
    [{ supportedMethods: PLAY_BILLING_URL, data: { sku: productId } }],
    { total: { label: 'Total', amount: { currency: 'BRL', value: '0' } } }, // exigido pela API, ignorado pelo Google (vale o preço do Play Console)
  )

  let response
  try {
    response = await request.show()
  } catch (err) {
    throw new PlayBillingError(err?.name === 'AbortError' ? 'cancelled' : 'failed')
  }

  const token = response?.details?.purchaseToken
  if (typeof token !== 'string' || !token) {
    await response?.complete?.('fail').catch(() => {})
    throw new PlayBillingError('failed')
  }

  try {
    const { data } = await billingAPI.verifyGoogle(token, productId)
    await response.complete('success')
    return data
  } catch (err) {
    await response.complete('fail').catch(() => {})
    const status = err?.response?.status
    throw new PlayBillingError(status === 409 ? 'conflict' : 'verify_failed', { status, serverMessage: err?.response?.data?.error })
  }
}

// Reenvia ao servidor as assinaturas que o Google diz que esta conta Google tem (compra feita mas não confirmada por falha de rede,
// reinstalação, aparelho novo). O servidor decide: compra já ligada a outra conta Nancy é recusada. Falhas são silenciosas.
export async function restorePurchases() {
  if (state.status !== 'ready' || !service) return []
  const restored = []
  try {
    const list = await service.listPurchases()
    for (const p of Array.isArray(list) ? list : []) {
      if (!PLAY_PRODUCT_IDS.includes(p?.itemId) || typeof p.purchaseToken !== 'string') continue
      try {
        const { data } = await billingAPI.verifyGoogle(p.purchaseToken, p.itemId)
        restored.push(data)
      } catch { /* sem rede ou compra de outra conta: tenta de novo na próxima sessão */ }
    }
  } catch { /* a API pode não listar nada */ }
  return restored
}

// "R$ 9,90" a partir do preço que o Google devolveu (a lei da Play: o preço mostrado tem que ser o da loja).
export function formatPlayPrice(detail, locale = 'pt-BR') {
  if (!detail) return ''
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: detail.currency }).format(detail.value)
  } catch {
    return `${detail.currency} ${detail.value}`
  }
}

// Endereço da Play Store para gerenciar/cancelar a assinatura (abre o app da Play).
export function manageSubscriptionUrl(plan, period) {
  const sku = PLAY_PRODUCTS[plan]?.[period]
  return `https://play.google.com/store/account/subscriptions?package=${PLAY_PACKAGE}${sku ? `&sku=${sku}` : ''}`
}

export function resetPlayBillingForTests() {
  state = { status: 'idle', details: {} }
  service = null
  initPromise = null
  listeners.clear()
}
