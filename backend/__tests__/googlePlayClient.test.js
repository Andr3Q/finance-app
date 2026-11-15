'use strict'

// Cliente da API do Google Play: autenticação por conta de serviço e as duas chamadas. fetch mockado; chave RSA gerada no teste.
const crypto = require('crypto')
const jwt    = require('jsonwebtoken')

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' })
const PUBLIC_PEM  = publicKey.export({ type: 'spki', format: 'pem' })
const SA_EMAIL = 'nancy-play@projeto-teste.iam.gserviceaccount.com'
const saJson = () => JSON.stringify({ client_email: SA_EMAIL, private_key: PRIVATE_PEM, token_uri: 'https://oauth2.googleapis.com/token' })

const client = require('../src/services/storeBilling/googlePlayClient')

const ok = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })
const tokenResponse = () => ok({ access_token: 'ya29.token-de-teste', expires_in: 3600 })

let fetchMock
beforeEach(() => {
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = saJson()
  client.resetCache()
  fetchMock = jest.fn()
  global.fetch = fetchMock
})
afterEach(() => { delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON })

describe('isConfigured', () => {
  it('só liga com a chave da conta de serviço válida', () => {
    expect(client.isConfigured()).toBe(true)
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = 'isto não é json'
    expect(client.isConfigured()).toBe(false)
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({ client_email: SA_EMAIL })
    expect(client.isConfigured()).toBe(false)
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
    expect(client.isConfigured()).toBe(false)
  })
})

describe('getSubscription', () => {
  it('pede o token com um JWT assinado pela conta de serviço e consulta a assinatura (v2) com o pacote e o token codificados', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(ok({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' }))
    const res = await client.getSubscription('tok/com+simbolos')
    expect(res).toEqual({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' })

    const [tokenUrl, tokenOpts] = fetchMock.mock.calls[0]
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token')
    const form = new URLSearchParams(tokenOpts.body)
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer')
    const claims = jwt.verify(form.get('assertion'), PUBLIC_PEM, { algorithms: ['RS256'] })
    expect(claims).toMatchObject({ iss: SA_EMAIL, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token' })

    const [apiUrl, apiOpts] = fetchMock.mock.calls[1]
    expect(apiUrl).toBe('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/br.com.myfinancepro.app/purchases/subscriptionsv2/tokens/tok%2Fcom%2Bsimbolos')
    expect(apiOpts.method).toBe('GET')
    expect(apiOpts.headers.authorization).toBe('Bearer ya29.token-de-teste')
  })

  it('reaproveita o token de acesso enquanto vale (uma autenticação para várias chamadas)', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValue(ok({}))
    await client.getSubscription('a'.repeat(30))
    await client.getSubscription('b'.repeat(30))
    expect(fetchMock.mock.calls.filter(([u]) => u === 'https://oauth2.googleapis.com/token')).toHaveLength(1)
  })

  it('erro da API vira GoogleApiError com o status (o 401 limpa o token para o próximo pedido gerar outro)', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(ok({}, 404))
    await expect(client.getSubscription('c'.repeat(30))).rejects.toMatchObject({ name: 'GoogleApiError', status: 404 })

    fetchMock.mockReset()
    fetchMock.mockResolvedValueOnce(ok({}, 401)).mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(ok({ ok: 1 }))
    await expect(client.getSubscription('d'.repeat(30))).rejects.toMatchObject({ status: 401 })
    await expect(client.getSubscription('d'.repeat(30))).resolves.toEqual({ ok: 1 })
  })

  it('falha de rede ou tempo esgotado vira GoogleApiError (status 0), sem vazar detalhes', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { name: 'FetchError' }))
    await expect(client.getSubscription('e'.repeat(30))).rejects.toMatchObject({ name: 'GoogleApiError', status: 0, message: 'Falha de rede ao falar com o Google.' })
    client.resetCache()
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    await expect(client.getSubscription('f'.repeat(30))).rejects.toMatchObject({ status: 0, message: 'Tempo esgotado ao falar com o Google.' })
  })

  it('o Google recusar a conta de serviço é erro claro, e sem configuração nada vai à rede', async () => {
    fetchMock.mockResolvedValueOnce(ok({ error: 'invalid_grant' }, 400))
    await expect(client.getSubscription('g'.repeat(30))).rejects.toMatchObject({ message: 'O Google recusou a conta de serviço.' })

    client.resetCache(); fetchMock.mockReset()
    delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
    await expect(client.getSubscription('h'.repeat(30))).rejects.toMatchObject({ message: 'Conta de serviço do Google não configurada.' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('acknowledge', () => {
  it('confirma a compra pelo endereço da assinatura (produto + token) com POST', async () => {
    fetchMock.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(ok({}, 204))
    await expect(client.acknowledge('nancy_pro', 'tok-123')).resolves.toEqual({})
    const [url, opts] = fetchMock.mock.calls[1]
    expect(url).toBe('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/br.com.myfinancepro.app/purchases/subscriptions/nancy_pro/tokens/tok-123:acknowledge')
    expect(opts.method).toBe('POST')
  })
})
