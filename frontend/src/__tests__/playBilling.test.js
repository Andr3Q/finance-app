import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../services/api.js', () => ({ billingAPI: { config: vi.fn(), verifyGoogle: vi.fn() }, authAPI: { me: vi.fn() } }))

import { billingAPI } from '../services/api.js'
import { ANDROID_APP_KEY } from '../utils/androidApp.js'
import { hidePurchaseUI } from '../utils/purchaseUi.js'
import {
  PLAY_PRODUCT_IDS, PLAY_PRODUCTS, PlayBillingError, initPlayBilling, purchase, restorePurchases, getPlayBilling,
  formatPlayPrice, manageSubscriptionUrl, resetPlayBillingForTests,
} from '../services/playBilling.js'

// Compra dentro do app Android pela Digital Goods API + Payment Request API (as do Chrome). Tudo simulado: o navegador de teste não tem Google Play.
const PRICES = { nancy_pro_mensal: '9.90', nancy_pro_anual: '99.00', nancy_elite_mensal: '34.90', nancy_elite_anual: '334.80' }
const goodItems = () => PLAY_PRODUCT_IDS.map((id) => ({ itemId: id, title: id, price: { currency: 'BRL', value: PRICES[id] } }))

let service
function fakeGoogle({ items = goodItems(), purchases = [] } = {}) {
  service = { getDetails: vi.fn().mockResolvedValue(items), listPurchases: vi.fn().mockResolvedValue(purchases) }
  window.getDigitalGoodsService = vi.fn().mockResolvedValue(service)
}

// PaymentRequest falso: guarda como foi montado e devolve o que o teste mandar.
class FakePaymentRequest {
  static next = null
  static last = null
  constructor(methods, details) { FakePaymentRequest.last = { methods, details } }
  show() { return FakePaymentRequest.next() }
}
const paymentResponse = (details = { purchaseToken: 'token-da-compra-0123456789' }) => ({ details, complete: vi.fn().mockResolvedValue(undefined) })

const inApp = (on = true) => { on ? sessionStorage.setItem(ANDROID_APP_KEY, '1') : sessionStorage.removeItem(ANDROID_APP_KEY) }
const serverOn = () => billingAPI.config.mockResolvedValue({ data: { googlePlay: { enabled: true, products: [] } } })

beforeEach(() => {
  resetPlayBillingForTests()
  sessionStorage.clear()
  vi.clearAllMocks()
  delete window.getDigitalGoodsService
  global.PaymentRequest = FakePaymentRequest
  FakePaymentRequest.next = () => Promise.resolve(paymentResponse())
  FakePaymentRequest.last = null
  billingAPI.verifyGoogle.mockResolvedValue({ data: { applied: true, plan: 'pro', planExpiresAt: '2026-12-20T00:00:00.000Z', state: 'active' } })
  serverOn()
})
afterEach(() => { delete global.PaymentRequest })

describe('initPlayBilling', () => {
  it('fora do app Android (site comum) não faz nada e não chama o Google nem o servidor', async () => {
    fakeGoogle()
    await initPlayBilling()
    expect(getPlayBilling().status).toBe('unavailable')
    expect(window.getDigitalGoodsService).not.toHaveBeenCalled()
    expect(billingAPI.config).not.toHaveBeenCalled()
  })

  it('no app, mas o aparelho não tem a API de cobrança: indisponível', async () => {
    inApp()
    await initPlayBilling()
    expect(getPlayBilling().status).toBe('unavailable')
  })

  it('recurso desligado no servidor: indisponível (o app segue "sem compra")', async () => {
    inApp(); fakeGoogle()
    billingAPI.config.mockResolvedValue({ data: { googlePlay: { enabled: false, products: [] } } })
    await initPlayBilling()
    expect(getPlayBilling().status).toBe('unavailable')
  })

  it('tudo certo: pede ao Google os 4 produtos e fica pronto com os preços numéricos', async () => {
    inApp(); fakeGoogle()
    await initPlayBilling()
    const s = getPlayBilling()
    expect(s.status).toBe('ready')
    expect(window.getDigitalGoodsService).toHaveBeenCalledWith('https://play.google.com/billing')
    expect(service.getDetails).toHaveBeenCalledWith(PLAY_PRODUCT_IDS)
    expect(s.details.nancy_pro_mensal).toEqual({ currency: 'BRL', value: 9.9 })
    expect(s.details.nancy_elite_anual).toEqual({ currency: 'BRL', value: 334.8 })
  })

  it('NUNCA vende pela metade: faltando preço de um dos 4 produtos, fica indisponível', async () => {
    inApp(); fakeGoogle({ items: goodItems().filter((i) => i.itemId !== 'nancy_elite_anual') })
    await initPlayBilling()
    expect(getPlayBilling().status).toBe('unavailable')
    expect(getPlayBilling().details).toEqual({})
  })

  it.each([['preço zero', '0'], ['preço que não é número', 'abc'], ['preço negativo', '-5']])('%s no Google: indisponível', async (_n, value) => {
    inApp()
    fakeGoogle({ items: goodItems().map((i) => (i.itemId === 'nancy_pro_mensal' ? { ...i, price: { currency: 'BRL', value } } : i)) })
    await initPlayBilling()
    expect(getPlayBilling().status).toBe('unavailable')
  })

  it('produto de outro app ou item sem preço é ignorado, não quebra', async () => {
    inApp(); fakeGoogle({ items: [...goodItems(), { itemId: 'outro_app', price: { currency: 'BRL', value: '1' } }, { itemId: 'lixo' }, null] })
    await initPlayBilling()
    expect(getPlayBilling().status).toBe('ready')
    expect(Object.keys(getPlayBilling().details).sort()).toEqual([...PLAY_PRODUCT_IDS].sort())
  })

  it('falha do Google ou da rede deixa indisponível, e uma nova tentativa depois funciona', async () => {
    inApp(); fakeGoogle()
    window.getDigitalGoodsService.mockRejectedValueOnce(new Error('sem Play'))
    await initPlayBilling()
    expect(getPlayBilling().status).toBe('unavailable')
    await initPlayBilling()
    expect(getPlayBilling().status).toBe('ready')
  })

  it('chamadas ao mesmo tempo trabalham uma vez só; depois de pronto não repete', async () => {
    inApp(); fakeGoogle()
    await Promise.all([initPlayBilling(), initPlayBilling(), initPlayBilling()])
    expect(service.getDetails).toHaveBeenCalledTimes(1)
    await initPlayBilling()
    expect(service.getDetails).toHaveBeenCalledTimes(1)
  })
})

describe('purchase', () => {
  beforeEach(async () => { inApp(); fakeGoogle(); await initPlayBilling() })

  it('abre a compra do Google com o produto certo, entrega o token ao servidor e só então conclui', async () => {
    const resp = paymentResponse({ purchaseToken: 'tok-123456789012345678' })
    FakePaymentRequest.next = () => Promise.resolve(resp)
    const out = await purchase('nancy_pro_mensal')

    expect(FakePaymentRequest.last.methods).toEqual([{ supportedMethods: 'https://play.google.com/billing', data: { sku: 'nancy_pro_mensal' } }])
    expect(billingAPI.verifyGoogle).toHaveBeenCalledWith('tok-123456789012345678', 'nancy_pro_mensal')
    expect(resp.complete).toHaveBeenCalledWith('success')
    expect(out).toMatchObject({ applied: true, plan: 'pro' })
    expect(service.consume).toBeUndefined() // assinatura não é consumida
  })

  it.each(['nancy_gratis', undefined, '__proto__'])('produto desconhecido (%s): nem abre a tela do Google', async (id) => {
    await expect(purchase(id)).rejects.toMatchObject({ code: 'unavailable' })
    expect(FakePaymentRequest.last).toBeNull() // nem montou o pedido de compra
  })

  it('sem a cobrança pronta: recusa antes de qualquer coisa', async () => {
    resetPlayBillingForTests()
    await expect(purchase('nancy_pro_mensal')).rejects.toBeInstanceOf(PlayBillingError)
    await expect(purchase('nancy_pro_mensal')).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('a pessoa fecha a tela de compra (AbortError): "cancelled", sem falar com o servidor', async () => {
    FakePaymentRequest.next = () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' }))
    await expect(purchase('nancy_pro_mensal')).rejects.toMatchObject({ code: 'cancelled' })
    expect(billingAPI.verifyGoogle).not.toHaveBeenCalled()
  })

  it('outro erro ao abrir a compra: "failed"', async () => {
    FakePaymentRequest.next = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotSupportedError' }))
    await expect(purchase('nancy_pro_mensal')).rejects.toMatchObject({ code: 'failed' })
  })

  it('resposta sem token da compra: marca como falha e não chama o servidor', async () => {
    const resp = paymentResponse({})
    FakePaymentRequest.next = () => Promise.resolve(resp)
    await expect(purchase('nancy_pro_mensal')).rejects.toMatchObject({ code: 'failed' })
    expect(resp.complete).toHaveBeenCalledWith('fail')
    expect(billingAPI.verifyGoogle).not.toHaveBeenCalled()
  })

  it('servidor diz 409 (compra de outra conta ou plano ativo): "conflict" com a mensagem do servidor; a compra é marcada como falha', async () => {
    const resp = paymentResponse()
    FakePaymentRequest.next = () => Promise.resolve(resp)
    billingAPI.verifyGoogle.mockRejectedValue({ response: { status: 409, data: { error: 'Você já tem um plano ativo.' } } })
    await expect(purchase('nancy_pro_mensal')).rejects.toMatchObject({ code: 'conflict', status: 409, serverMessage: 'Você já tem um plano ativo.' })
    expect(resp.complete).toHaveBeenCalledWith('fail')
  })

  it('servidor fora do ar ou sem rede: "verify_failed" (a compra fica no Google e é refeita ao reabrir o app)', async () => {
    billingAPI.verifyGoogle.mockRejectedValue(new Error('Network Error'))
    await expect(purchase('nancy_pro_mensal')).rejects.toMatchObject({ code: 'verify_failed' })
    billingAPI.verifyGoogle.mockRejectedValue({ response: { status: 502, data: {} } })
    await expect(purchase('nancy_pro_mensal')).rejects.toMatchObject({ code: 'verify_failed', status: 502 })
  })
})

describe('restorePurchases', () => {
  it('reenvia ao servidor só as assinaturas do Nancy que o Google lista e devolve o que foi aplicado', async () => {
    inApp()
    fakeGoogle({ purchases: [
      { itemId: 'nancy_elite_anual', purchaseToken: 'tok-elite-0123456789abcd' },
      { itemId: 'outro_app', purchaseToken: 'tok-outro-0123456789abcd' },
      { itemId: 'nancy_pro_mensal' },
    ] })
    await initPlayBilling()
    const r = await restorePurchases()
    expect(billingAPI.verifyGoogle).toHaveBeenCalledTimes(1)
    expect(billingAPI.verifyGoogle).toHaveBeenCalledWith('tok-elite-0123456789abcd', 'nancy_elite_anual')
    expect(r).toHaveLength(1)
  })

  it('falha de uma compra (ex.: de outra conta) não impede as demais, e erro do Google não estoura', async () => {
    inApp()
    fakeGoogle({ purchases: [{ itemId: 'nancy_pro_mensal', purchaseToken: 'tok-a-0123456789abcdefg' }, { itemId: 'nancy_pro_anual', purchaseToken: 'tok-b-0123456789abcdefg' }] })
    await initPlayBilling()
    billingAPI.verifyGoogle.mockRejectedValueOnce({ response: { status: 409 } })
    expect(await restorePurchases()).toHaveLength(1)

    service.listPurchases.mockRejectedValue(new Error('indisponível'))
    expect(await restorePurchases()).toEqual([])
  })

  it('sem a cobrança pronta não consulta nada', async () => {
    expect(await restorePurchases()).toEqual([])
  })
})

describe('hidePurchaseUI (esconder preço e convite de compra)', () => {
  it('site comum: nunca esconde (vende pelo Mercado Pago)', () => {
    expect(hidePurchaseUI()).toBe(false)
  })

  it('app Android sem a cobrança do Google pronta: esconde (política de pagamentos do Google)', () => {
    inApp()
    expect(hidePurchaseUI()).toBe(true)
  })

  it('app Android com a cobrança pronta: mostra', async () => {
    inApp(); fakeGoogle()
    await initPlayBilling()
    expect(hidePurchaseUI()).toBe(false)
  })

  it('se a cobrança cair de novo (ex.: servidor desligado), volta a esconder', async () => {
    inApp(); fakeGoogle()
    await initPlayBilling()
    resetPlayBillingForTests(); inApp()
    expect(hidePurchaseUI()).toBe(true)
  })
})

describe('formatPlayPrice e manageSubscriptionUrl', () => {
  it('formata como real brasileiro e tem plano B para moeda inválida ou preço ausente', () => {
    expect(formatPlayPrice({ currency: 'BRL', value: 9.9 }).replace(/\s/g, ' ')).toBe('R$ 9,90')
    expect(formatPlayPrice({ currency: 'BRL', value: 334.8 }).replace(/\s/g, ' ')).toBe('R$ 334,80')
    expect(formatPlayPrice({ currency: 'x', value: 5 })).toBe('x 5')
    expect(formatPlayPrice(undefined)).toBe('')
  })

  it('o endereço de gerenciar leva à lista de assinaturas da Play Store com o pacote e o produto', () => {
    expect(manageSubscriptionUrl('pro', 'monthly')).toBe('https://play.google.com/store/account/subscriptions?package=br.com.myfinancepro.app&sku=nancy_pro_mensal')
    expect(manageSubscriptionUrl('elite', 'annual')).toContain('sku=nancy_elite_anual')
    expect(manageSubscriptionUrl('free', 'monthly')).toBe('https://play.google.com/store/account/subscriptions?package=br.com.myfinancepro.app')
  })

  it('os 4 IDs de produto são os mesmos que o servidor espera', () => {
    expect(PLAY_PRODUCT_IDS).toEqual(['nancy_pro_mensal', 'nancy_pro_anual', 'nancy_elite_mensal', 'nancy_elite_anual'])
    expect(PLAY_PRODUCTS.pro.monthly).toBe('nancy_pro_mensal')
  })
})
