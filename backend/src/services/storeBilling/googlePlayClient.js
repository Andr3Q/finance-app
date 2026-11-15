'use strict'
/* global fetch, AbortController -- globais do Node 18+ (o eslint do projeto não as declara) */

// Cliente mínimo da API do Google Play Developer (androidpublisher v3), sem dependência nova: assina o JWT da conta de serviço
// com o jsonwebtoken (já usado no app) e chama a API com fetch. Só faz duas coisas: consultar uma assinatura e confirmar
// ("acknowledge") a compra — o Google devolve o dinheiro ao cliente se a compra não for confirmada em 3 dias.
//
// Configuração (segredos NUNCA no código nem no chat):
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  JSON inteiro da chave da conta de serviço (Secret Manager -> variável do Cloud Run)
//   GOOGLE_PLAY_PACKAGE_NAME          opcional; padrão br.com.myfinancepro.app
// Sem GOOGLE_PLAY_SERVICE_ACCOUNT_JSON o recurso fica DESLIGADO (isConfigured() = false) e nada chama o Google.
const jwt = require('jsonwebtoken')
const { PLAY_PACKAGE_NAME } = require('./catalog')

const API_BASE  = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
const SCOPE     = 'https://www.googleapis.com/auth/androidpublisher'
const TIMEOUT_MS = 8000

class GoogleApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'GoogleApiError'
    this.status = status
  }
}

function readServiceAccount() {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    const sa = JSON.parse(raw)
    if (typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string') return null
    return { email: sa.client_email, key: sa.private_key, tokenUri: sa.token_uri || 'https://oauth2.googleapis.com/token' }
  } catch {
    return null
  }
}

const isConfigured = () => readServiceAccount() !== null

let cached = { token: null, expiresAt: 0 }

async function fetchWithTimeout(url, options) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: ctrl.signal })
  } catch (err) {
    throw new GoogleApiError(err.name === 'AbortError' ? 'Tempo esgotado ao falar com o Google.' : 'Falha de rede ao falar com o Google.', 0)
  } finally {
    clearTimeout(timer)
  }
}

async function accessToken() {
  const now = Date.now()
  if (cached.token && cached.expiresAt - 60_000 > now) return cached.token
  const sa = readServiceAccount()
  if (!sa) throw new GoogleApiError('Conta de serviço do Google não configurada.', 0)

  const iat = Math.floor(now / 1000)
  const assertion = jwt.sign({ iss: sa.email, scope: SCOPE, aud: sa.tokenUri, iat, exp: iat + 3600 }, sa.key, { algorithm: 'RS256' })
  const res = await fetchWithTimeout(sa.tokenUri, {
    method:  'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  })
  if (!res.ok) throw new GoogleApiError('O Google recusou a conta de serviço.', res.status)
  const data = await res.json().catch(() => null)
  if (!data?.access_token) throw new GoogleApiError('Resposta inesperada do Google ao autenticar.', res.status)
  cached = { token: data.access_token, expiresAt: now + (Number(data.expires_in) || 3600) * 1000 }
  return cached.token
}

async function call(method, url, body) {
  const token = await accessToken()
  const res = await fetchWithTimeout(url, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body:    body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 401) cached = { token: null, expiresAt: 0 } // token revogado: o próximo pedido gera outro
  if (!res.ok) throw new GoogleApiError(`Google Play API respondeu ${res.status}.`, res.status)
  return res.status === 204 ? {} : res.json().catch(() => ({}))
}

// Estado ATUAL da assinatura (SubscriptionPurchaseV2). É a fonte da verdade: o servidor sempre consulta, nunca confia em aviso nem no app.
function getSubscription(purchaseToken) {
  return call('GET', `${API_BASE}/${encodeURIComponent(PLAY_PACKAGE_NAME)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`)
}

// Confirma a compra (tem que acontecer em até 3 dias; repetir é inofensivo).
function acknowledge(productId, purchaseToken) {
  return call('POST', `${API_BASE}/${encodeURIComponent(PLAY_PACKAGE_NAME)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, {})
}

const resetCache = () => { cached = { token: null, expiresAt: 0 } } // só para testes

module.exports = { isConfigured, getSubscription, acknowledge, GoogleApiError, resetCache }
