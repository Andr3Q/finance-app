'use strict'
/* global fetch -- globais do Node 18+ (o eslint do projeto não as declara) */

// Os avisos do Google (renovou, cancelou, reembolsou...) chegam por Pub/Sub "push" em /api/billing/google/rtdn. Quem garante que o
// aviso é do Google é o token OIDC que o Pub/Sub manda no cabeçalho Authorization: assinado pelo Google, com o endereço desta rota
// como "audience" e o e-mail da conta de serviço que configuramos na assinatura. Verificamos TUDO isso (assinatura, emissor, audience
// e e-mail) com o jsonwebtoken; sem a configuração abaixo a rota recusa tudo (não existe modo permissivo).
//   GOOGLE_PLAY_RTDN_AUDIENCE         URL exata configurada na assinatura do Pub/Sub (ex.: https://.../api/billing/google/rtdn)
//   GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT  e-mail da conta de serviço que o Pub/Sub usa para assinar o push
const jwt = require('jsonwebtoken')

const CERTS_URL = 'https://www.googleapis.com/oauth2/v1/certs'
const CERTS_TTL_MS = 60 * 60 * 1000
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

let certCache = { certs: null, fetchedAt: 0 }

async function loadCerts(force = false) {
  if (!force && certCache.certs && Date.now() - certCache.fetchedAt < CERTS_TTL_MS) return certCache.certs
  const res = await fetch(CERTS_URL)
  if (!res.ok) throw new Error(`certificados do Google: HTTP ${res.status}`)
  const certs = await res.json()
  if (!certs || typeof certs !== 'object') throw new Error('certificados do Google em formato inesperado')
  certCache = { certs, fetchedAt: Date.now() }
  return certs
}

// { ok:true } ou { ok:false, status, reason }.
async function verifyPubSubPush(req) {
  const audience = process.env.GOOGLE_PLAY_RTDN_AUDIENCE
  const expectedEmail = process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT
  if (!audience || !expectedEmail) return { ok: false, status: 503, reason: 'Avisos do Google Play não configurados.' }

  const match = /^Bearer (.+)$/.exec(req.headers?.authorization || '')
  if (!match) return { ok: false, status: 401, reason: 'Sem credencial.' }
  const token = match[1]

  const decoded = jwt.decode(token, { complete: true })
  const kid = decoded?.header?.kid
  if (!kid || decoded.header.alg !== 'RS256') return { ok: false, status: 401, reason: 'Credencial inválida.' }

  let pem
  try {
    pem = (await loadCerts())[kid]
    if (!pem) pem = (await loadCerts(true))[kid] // o Google troca as chaves de tempos em tempos
  } catch {
    return { ok: false, status: 503, reason: 'Não foi possível obter as chaves do Google agora.' }
  }
  if (!pem) return { ok: false, status: 401, reason: 'Credencial inválida.' }

  let payload
  try {
    payload = jwt.verify(token, pem, { algorithms: ['RS256'], audience, issuer: ISSUERS })
  } catch {
    return { ok: false, status: 401, reason: 'Credencial inválida.' }
  }
  if (payload.email !== expectedEmail || payload.email_verified !== true) return { ok: false, status: 401, reason: 'Credencial de outra conta.' }
  return { ok: true }
}

const resetCertCache = () => { certCache = { certs: null, fetchedAt: 0 } } // só para testes

module.exports = { verifyPubSubPush, resetCertCache }
