'use strict'

// Verificação do token OIDC que o Pub/Sub manda nos avisos da Google Play. Chaves RSA geradas no teste; certificados do Google mockados.
const crypto = require('crypto')
const jwt    = require('jsonwebtoken')

const pair  = () => crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const goodKeys  = pair()
const otherKeys = pair()
const pem = (k, type) => k.export({ type, format: 'pem' })
const GOOD_PRIVATE  = pem(goodKeys.privateKey, 'pkcs8')
const GOOD_PUBLIC   = pem(goodKeys.publicKey, 'spki')
const OTHER_PRIVATE = pem(otherKeys.privateKey, 'pkcs8')

const AUDIENCE = 'https://nancy.exemplo/api/billing/google/rtdn'
const PUSH_SA  = 'pubsub-push@projeto-teste.iam.gserviceaccount.com'

const { verifyPubSubPush, resetCertCache } = require('../src/services/storeBilling/pubsubAuth')

const sign = (over = {}, { key = GOOD_PRIVATE, kid = 'k1', opts = {} } = {}) =>
  jwt.sign({ email: PUSH_SA, email_verified: true, ...over }, key, { algorithm: 'RS256', keyid: kid, audience: AUDIENCE, issuer: 'https://accounts.google.com', expiresIn: '1h', ...opts })
const req = (token) => ({ headers: token === undefined ? {} : { authorization: `Bearer ${token}` } })

let fetchMock
beforeEach(() => {
  process.env.GOOGLE_PLAY_RTDN_AUDIENCE = AUDIENCE
  process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT = PUSH_SA
  resetCertCache()
  fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ k1: GOOD_PUBLIC }) })
  global.fetch = fetchMock
})
afterEach(() => { delete process.env.GOOGLE_PLAY_RTDN_AUDIENCE; delete process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT })

describe('verifyPubSubPush', () => {
  it('aceita o token do Google com a audience e a conta de serviço certas', async () => {
    expect(await verifyPubSubPush(req(sign()))).toEqual({ ok: true })
  })

  it('sem configuração recusa tudo com 503 (não existe modo permissivo) e nem vai à rede', async () => {
    delete process.env.GOOGLE_PLAY_RTDN_AUDIENCE
    expect(await verifyPubSubPush(req(sign()))).toMatchObject({ ok: false, status: 503 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sem cabeçalho, com esquema errado ou lixo no lugar do token: 401', async () => {
    expect(await verifyPubSubPush(req(undefined))).toMatchObject({ ok: false, status: 401 })
    expect(await verifyPubSubPush({ headers: { authorization: 'Basic abc' } })).toMatchObject({ ok: false, status: 401 })
    expect(await verifyPubSubPush(req('isto.nao.e-jwt'))).toMatchObject({ ok: false, status: 401 })
  })

  it('recusa audience errada, emissor errado, token vencido e e-mail de outra conta', async () => {
    expect(await verifyPubSubPush(req(sign({}, { opts: { audience: 'https://outro.site/rtdn' } })))).toMatchObject({ ok: false, status: 401 })
    expect(await verifyPubSubPush(req(sign({}, { opts: { issuer: 'https://atacante.exemplo' } })))).toMatchObject({ ok: false, status: 401 })
    expect(await verifyPubSubPush(req(sign({}, { opts: { expiresIn: -60 } })))).toMatchObject({ ok: false, status: 401 })
    expect(await verifyPubSubPush(req(sign({ email: 'atacante@gmail.com' })))).toMatchObject({ ok: false, status: 401 })
    expect(await verifyPubSubPush(req(sign({ email_verified: false })))).toMatchObject({ ok: false, status: 401 })
  })

  it('recusa token assinado com outra chave (não é do Google) e algoritmo diferente de RS256', async () => {
    expect(await verifyPubSubPush(req(sign({}, { key: OTHER_PRIVATE })))).toMatchObject({ ok: false, status: 401 })
    const hs = jwt.sign({ email: PUSH_SA, email_verified: true }, 'segredo', { algorithm: 'HS256', keyid: 'k1', audience: AUDIENCE, issuer: 'https://accounts.google.com' })
    expect(await verifyPubSubPush(req(hs))).toMatchObject({ ok: false, status: 401 })
  })

  it('chave nova do Google (kid desconhecido): busca os certificados de novo uma vez; se continuar desconhecida, 401', async () => {
    expect(await verifyPubSubPush(req(sign({}, { kid: 'k1' })))).toEqual({ ok: true })
    fetchMock.mockClear()
    expect(await verifyPubSubPush(req(sign({}, { kid: 'k-novo' })))).toMatchObject({ ok: false, status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1) // 1 nova busca forçada
  })

  it('guarda os certificados em cache (várias verificações, uma busca)', async () => {
    await verifyPubSubPush(req(sign())); await verifyPubSubPush(req(sign())); await verifyPubSubPush(req(sign()))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Google fora do ar ao buscar os certificados: 503 (o Pub/Sub tenta de novo), não 401', async () => {
    fetchMock.mockReset().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    expect(await verifyPubSubPush(req(sign()))).toMatchObject({ ok: false, status: 503 })
  })
})
