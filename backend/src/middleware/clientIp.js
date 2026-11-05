'use strict'
const crypto = require('crypto')
const net    = require('net')

// O site passa por um Worker do Cloudflare (myfinancepro.com.br → Cloud Run) e o IP de saída do Worker muda a cada
// requisição: req.ip NÃO é o do visitante. O Worker manda o IP real em x-nancy-client-ip junto de um segredo
// compartilhado (x-nancy-edge). Só confiamos nesse IP quando o segredo bate (comparação em tempo constante); sem
// EDGE_SECRET configurado, ou com segredo errado/ausente/IP inválido, vale req.ip como antes, então nada quebra.
function safeEqual(a, b) {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

function clientIpMiddleware(req, _res, next) {
  const secret = process.env.EDGE_SECRET            // lido a cada requisição: facilita testar e girar o segredo
  const given  = req.headers['x-nancy-edge']
  const ip     = req.headers['x-nancy-client-ip']
  const trusted = Boolean(secret) && typeof given === 'string' && typeof ip === 'string'
    && safeEqual(given, secret) && net.isIP(ip.trim()) !== 0
  req.clientIp = trusted ? ip.trim() : req.ip
  next()
}

module.exports = { clientIpMiddleware }
