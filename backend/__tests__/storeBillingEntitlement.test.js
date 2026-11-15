'use strict'

// Regras que transformam uma assinatura da Google Play em plano do Nancy (services/storeBilling/*). Prisma mockado.
jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))

const prisma = require('./__mocks__/prisma')
const { resolvePlayProduct, listPlayProducts } = require('../src/services/storeBilling/catalog')
const { parseGoogleSubscription, accessEnd, applyGoogleState, revokeGooglePurchase } = require('../src/services/storeBilling/entitlement')

const NOW = new Date('2026-11-20T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const iso = (ms) => new Date(NOW.getTime() + ms).toISOString()

// Resposta do Google no formato SubscriptionPurchaseV2 (só os campos que o Nancy lê).
const google = (over = {}) => ({
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
  lineItems: [{ productId: 'nancy_pro_mensal', expiryTime: iso(30 * DAY), autoRenewingPlan: { autoRenewEnabled: true } }],
  ...over,
})

describe('catálogo da Google Play', () => {
  it('cada produto já diz o plano e o período do Nancy', () => {
    expect(resolvePlayProduct('nancy_pro_mensal')).toEqual({ plan: 'pro', period: 'monthly' })
    expect(resolvePlayProduct('nancy_pro_anual')).toEqual({ plan: 'pro', period: 'annual' })
    expect(resolvePlayProduct('nancy_elite_mensal')).toEqual({ plan: 'elite', period: 'monthly' })
    expect(resolvePlayProduct('nancy_elite_anual')).toEqual({ plan: 'elite', period: 'annual' })
  })

  it('recusa produto desconhecido, inclusive nomes herdados do Object e valores que não são texto', () => {
    expect(resolvePlayProduct('outro_app')).toBeNull()
    expect(resolvePlayProduct('nancy_pro')).toBeNull()          // sem o período não é um produto que o Nancy vende
    expect(resolvePlayProduct('nancy_pro_semanal')).toBeNull()
    expect(resolvePlayProduct('__proto__')).toBeNull()
    expect(resolvePlayProduct('constructor')).toBeNull()
    expect(resolvePlayProduct(undefined)).toBeNull()
    expect(resolvePlayProduct(['nancy_pro_mensal'])).toBeNull()
  })

  it('a resposta não deixa mexer no catálogo', () => {
    const r = resolvePlayProduct('nancy_pro_mensal'); r.plan = 'elite'
    expect(resolvePlayProduct('nancy_pro_mensal').plan).toBe('pro')
  })

  it('lista os 4 produtos que precisam existir no Play Console', () => {
    expect(listPlayProducts().map((p) => p.productId).sort()).toEqual(['nancy_elite_anual', 'nancy_elite_mensal', 'nancy_pro_anual', 'nancy_pro_mensal'])
  })
})

describe('parseGoogleSubscription', () => {
  it('lê plano, período, validade, renovação automática e confirmação', () => {
    const p = parseGoogleSubscription(google())
    expect(p).toMatchObject({ ok: true, productId: 'nancy_pro_mensal', plan: 'pro', period: 'monthly', state: 'active', autoRenewing: true, acknowledged: false, testPurchase: false })
    expect(p.expiresAt.toISOString()).toBe(iso(30 * DAY))
    expect(parseGoogleSubscription(google({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' })).acknowledged).toBe(true)
    expect(parseGoogleSubscription(google({ testPurchase: {} })).testPurchase).toBe(true)
  })

  it.each([
    ['SUBSCRIPTION_STATE_ACTIVE', 'active'], ['SUBSCRIPTION_STATE_CANCELED', 'canceled'], ['SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'grace'],
    ['SUBSCRIPTION_STATE_ON_HOLD', 'on_hold'], ['SUBSCRIPTION_STATE_PAUSED', 'paused'], ['SUBSCRIPTION_STATE_EXPIRED', 'expired'],
    ['SUBSCRIPTION_STATE_PENDING', 'pending'], ['SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED', 'expired'],
  ])('estado %s vira "%s"', (estado, esperado) => {
    expect(parseGoogleSubscription(google({ subscriptionState: estado })).state).toBe(esperado)
  })

  it('não reconhece estado novo, produto desconhecido, data ruim nem resposta vazia', () => {
    expect(parseGoogleSubscription(google({ subscriptionState: 'SUBSCRIPTION_STATE_NOVO' }))).toMatchObject({ ok: false })
    expect(parseGoogleSubscription(google({ lineItems: [{ productId: 'x' }] }))).toMatchObject({ ok: false })
    expect(parseGoogleSubscription(google({ lineItems: [] }))).toMatchObject({ ok: false })
    expect(parseGoogleSubscription(google({ lineItems: [{ productId: 'nancy_pro_mensal', expiryTime: 'ontem' }] }))).toMatchObject({ ok: false })
    expect(parseGoogleSubscription(null)).toMatchObject({ ok: false })
  })

  it('o plano base que o Google informa não decide nada: só o produto manda', () => {
    const p = parseGoogleSubscription(google({ lineItems: [{ productId: 'nancy_elite_mensal', offerDetails: { basePlanId: 'qualquer-coisa' }, expiryTime: iso(DAY) }] }))
    expect(p).toMatchObject({ ok: true, plan: 'elite', period: 'monthly' })
  })

  it('escolhe a linha que o Nancy conhece quando há mais de uma', () => {
    const p = parseGoogleSubscription(google({
      lineItems: [
        { productId: 'outro', expiryTime: iso(DAY) },
        { productId: 'nancy_elite_anual', expiryTime: iso(300 * DAY) },
      ],
    }))
    expect(p).toMatchObject({ ok: true, plan: 'elite', period: 'annual' })
  })
})

describe('accessEnd (até quando o estado garante acesso)', () => {
  const parsed = (state, ms) => ({ state, expiresAt: ms === null ? null : new Date(NOW.getTime() + ms) })

  it('ativa e cancelada dão acesso até a validade; vencida não dá', () => {
    expect(accessEnd(parsed('active', 5 * DAY), NOW).getTime()).toBe(NOW.getTime() + 5 * DAY)
    expect(accessEnd(parsed('canceled', 5 * DAY), NOW).getTime()).toBe(NOW.getTime() + 5 * DAY)
    expect(accessEnd(parsed('active', -DAY), NOW)).toBeNull()
    expect(accessEnd(parsed('canceled', null), NOW)).toBeNull()
  })

  it('carência mantém o acesso; se a data já passou, dá 3 dias a partir do aviso', () => {
    expect(accessEnd(parsed('grace', 2 * DAY), NOW).getTime()).toBe(NOW.getTime() + 2 * DAY)
    expect(accessEnd(parsed('grace', -DAY), NOW).getTime()).toBe(NOW.getTime() + 3 * DAY)
  })

  it('suspensa, pausada, vencida e pendente não dão acesso', () => {
    for (const s of ['on_hold', 'paused', 'expired', 'pending']) expect(accessEnd(parsed(s, 5 * DAY), NOW)).toBeNull()
  })
})

describe('applyGoogleState', () => {
  const TOKEN = 'token-da-compra-0123456789'
  const parsedActive = () => parseGoogleSubscription(google())

  beforeEach(() => {
    prisma.storePurchase.upsert.mockReset().mockResolvedValue({})
    prisma.storePurchase.update.mockReset().mockResolvedValue({})
    prisma.user.findUnique.mockReset()
    prisma.user.update.mockReset().mockResolvedValue({})
  })

  it('ativa o plano: grava a compra e escreve plano, validade, período e fonte; limpa o teste e o aviso de renovação', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'free', planExpiresAt: null, planSource: null })
    const r = await applyGoogleState({ userId: 'u1', purchaseToken: TOKEN, parsed: parsedActive(), now: NOW })

    expect(r).toMatchObject({ applied: true, plan: 'pro', state: 'active' })
    expect(prisma.storePurchase.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where:  { provider_purchaseToken: { provider: 'google_play', purchaseToken: TOKEN } },
      create: expect.objectContaining({ userId: 'u1', provider: 'google_play', purchaseToken: TOKEN, plan: 'pro', period: 'monthly', state: 'active' }),
    }))
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data:  { plan: 'pro', planExpiresAt: new Date(NOW.getTime() + 30 * DAY), planPeriod: 'monthly', planSource: 'google_play', trialEndsAt: null, renewalReminderSent: false },
    })
  })

  it('renovação do mesmo plano da Play empurra a validade para frente', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'pro', planExpiresAt: new Date(NOW.getTime() + DAY), planSource: 'google_play' })
    const r = await applyGoogleState({ userId: 'u1', purchaseToken: TOKEN, parsed: parsedActive(), now: NOW })
    expect(r.applied).toBe(true)
    expect(prisma.user.update.mock.calls[0][0].data.planExpiresAt).toEqual(new Date(NOW.getTime() + 30 * DAY))
  })

  it('quem está em teste grátis (plano pago sem validade) passa a ter o plano comprado', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'pro', planExpiresAt: null, planSource: null })
    expect((await applyGoogleState({ userId: 'u1', purchaseToken: TOKEN, parsed: parsedActive(), now: NOW })).applied).toBe(true)
  })

  it('NÃO sobrescreve plano válido de outra fonte (site): grava a compra, não mexe no usuário', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'elite', planExpiresAt: new Date(NOW.getTime() + 10 * DAY), planSource: 'mercadopago' })
    const r = await applyGoogleState({ userId: 'u1', purchaseToken: TOKEN, parsed: parsedActive(), now: NOW })
    expect(r).toMatchObject({ applied: false, reason: 'other_source_active' })
    expect(prisma.storePurchase.upsert).toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('plano do site já vencido não impede a compra pela Play', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'pro', planExpiresAt: new Date(NOW.getTime() - DAY), planSource: 'mercadopago' })
    expect((await applyGoogleState({ userId: 'u1', purchaseToken: TOKEN, parsed: parsedActive(), now: NOW })).applied).toBe(true)
  })

  it('suspensão da Play (sem acesso) faz a validade parar, se ESTE era o plano da Play', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'pro', planExpiresAt: new Date(NOW.getTime() + 2 * DAY), planSource: 'google_play' })
    const parsed = parseGoogleSubscription(google({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD', lineItems: [{ productId: 'nancy_pro_mensal', expiryTime: iso(-DAY) }] }))
    const r = await applyGoogleState({ userId: 'u1', purchaseToken: TOKEN, parsed, now: NOW })
    expect(r).toMatchObject({ applied: true, ended: true })
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { planExpiresAt: new Date(NOW.getTime() - DAY) } })
  })

  it('vencimento de compra antiga não encurta plano que veio de outra fonte', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'pro', planExpiresAt: new Date(NOW.getTime() + 20 * DAY), planSource: 'mercadopago' })
    const parsed = parseGoogleSubscription(google({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }))
    const r = await applyGoogleState({ userId: 'u1', purchaseToken: TOKEN, parsed, now: NOW })
    expect(r).toMatchObject({ applied: false, reason: 'no_access' })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('usuário que sumiu: grava a compra e não quebra', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    expect(await applyGoogleState({ userId: 'u1', purchaseToken: TOKEN, parsed: parsedActive(), now: NOW })).toMatchObject({ applied: false, reason: 'user_not_found' })
  })
})

describe('revokeGooglePurchase (reembolso/estorno)', () => {
  beforeEach(() => {
    prisma.storePurchase.update.mockReset().mockResolvedValue({})
    prisma.user.findUnique.mockReset()
    prisma.user.update.mockReset().mockResolvedValue({})
  })

  it('marca a compra como revogada e encerra o acesso agora, se era o plano da Play', async () => {
    prisma.user.findUnique.mockResolvedValue({ planSource: 'google_play' })
    const r = await revokeGooglePurchase({ purchase: { id: 'p1', userId: 'u1' }, now: NOW })
    expect(r).toMatchObject({ applied: true, ended: true })
    expect(prisma.storePurchase.update).toHaveBeenCalledWith({ where: { id: 'p1', userId: 'u1' }, data: { state: 'revoked', autoRenewing: false } })
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { planExpiresAt: NOW } })
  })

  it('se o plano atual é de outra fonte, só marca a compra e não mexe no usuário', async () => {
    prisma.user.findUnique.mockResolvedValue({ planSource: 'mercadopago' })
    const r = await revokeGooglePurchase({ purchase: { id: 'p1', userId: 'u1' }, now: NOW })
    expect(r.applied).toBe(false)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})
