'use strict'
const crypto  = require('crypto')
const express = require('express')
const { gateLimiter } = require('./rateLimiter')

// Portão da HOMOLOGAÇÃO: com STAGING_GATE_KEY definida, só entra quem digitar a senha (cookie de 30 dias) ou mandar o cabeçalho
// x-staging-key (agente de QA, scripts). Sem a variável (produção, CI, desenvolvimento) é um no-op: a variável é lida a cada
// requisição e nada muda para quem não a define. O que tem segredo próprio fica fora do portão (veja OPEN).
const COOKIE    = 'staging_gate'
const MAX_AGE_S = 30 * 24 * 60 * 60
const OPEN = [
  /^\/health$/,                          // monitoramento (Keep-Alive, verificação pós-deploy)
  /^\/api\/cron\//,                      // crons: exigem x-cron-secret
  /^\/api\/admin\/seed-staging$/,        // seed do deploy: exige x-seed-secret e x-seed-password
  /^\/api\/payments\/webhook$/,          // webhook do Mercado Pago: assinatura HMAC
]

const gateKey  = () => process.env.STAGING_GATE_KEY || ''
const sign     = (key) => crypto.createHmac('sha256', key).update('nancy-staging-gate-v1').digest('hex')
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a)); const bb = Buffer.from(String(b))
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}
const readCookie = (req, name) => {
  const m = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='))
  return m ? decodeURIComponent(m.slice(name.length + 1)) : ''
}
const authorized = (req, key) => {
  const header = req.headers['x-staging-key']
  if (typeof header === 'string' && header && safeEqual(header, key)) return true
  const cookie = readCookie(req, COOKIE)
  return Boolean(cookie) && safeEqual(cookie, sign(key))
}
// só caminhos do próprio site: nada de //evil.com, https://evil.com ou barra invertida
const safeNext = (n) => (typeof n === 'string' && /^\/(?![/\\])[^\r\n]*$/.test(n) ? n : '/')
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

function page({ next = '/', error = '' } = {}) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Nancy — Homologação</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#1C48FF;font-family:system-ui,-apple-system,Segoe UI,sans-serif}
form{background:#fff;border-radius:20px;padding:28px;width:min(340px,86vw);box-shadow:0 12px 40px rgba(0,0,0,.25)}
h1{margin:0 0 6px;font-size:20px;color:#0B1B4D}p{margin:0 0 18px;color:#5b6577;font-size:14px}
input[type=password]{width:100%;box-sizing:border-box;padding:13px 14px;border:1.5px solid #cfd6e4;border-radius:12px;font-size:16px}
button{margin-top:14px;width:100%;padding:13px;border:0;border-radius:12px;background:#1C48FF;color:#fff;font-size:16px;font-weight:600}
.err{color:#c0262d;font-size:13px;margin:10px 0 0}</style></head><body>
<form method="post" action="/__gate"><h1>Homologação do Nancy</h1><p>Acesso restrito. Digite a senha da homologação.</p>
<input type="hidden" name="next" value="${esc(next)}"><input type="password" name="password" autocomplete="current-password" autofocus required>
${error ? `<div class="err">${esc(error)}</div>` : ''}<button type="submit">Entrar</button></form></body></html>`
}

function stagingGate() {
  // O Router só atende POST /__gate. A checagem de TODAS as requisições é uma função simples: um Router montado na raiz
  // travava os testes que congelam o Date (jest.useFakeTimers({ toFake: ['Date'] }) em purchaseBase/sheet).
  const login = express.Router()
  login.post('/__gate', gateLimiter, express.urlencoded({ extended: false, limit: '2kb' }), (req, res) => {
    const key  = gateKey()
    const next = safeNext(req.body && req.body.next)
    if (!safeEqual((req.body && req.body.password) || '', key)) {
      res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' })
      return res.status(401).type('html').send(page({ next, error: 'Senha incorreta.' }))
    }
    res.cookie(COOKIE, sign(key), { httpOnly: true, secure: req.secure, sameSite: 'lax', maxAge: MAX_AGE_S * 1000, path: '/' })
    res.redirect(303, next)
  })

  return function gate(req, res, next) {
    const key = gateKey()
    if (!key) return req.method === 'POST' && req.path === '/__gate' ? res.status(404).end() : next()
    if (req.method === 'POST' && req.path === '/__gate') return login(req, res, next)
    if (OPEN.some((re) => re.test(req.path)) || authorized(req, key)) return next()
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' })
    if (req.method === 'GET' && String(req.headers.accept || '').includes('text/html')) {
      return res.status(401).type('html').send(page({ next: safeNext(req.originalUrl) }))
    }
    return res.status(401).json({ error: 'Acesso restrito à homologação.' })
  }
}

module.exports = { stagingGate, safeNext }
