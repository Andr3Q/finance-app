'use strict'
const express = require('express')
const { agentLimiter, transcribeLimiter } = require('../src/middleware/rateLimiter')

// A cota por hora do chat da IA (40 mensagens) devolve ao usuário o pedido que falhou por culpa do PROVEDOR (sobrecarga, fora do
// ar) — ~8 "Tentar de novo" com a IA sobrecarregada levaram a cota de 12 a 4 (QA N2-7) — mas NÃO pode devolver o que o próprio
// cliente cancelou: a chamada ao Groq continua e o teto de custo deixaria de valer (achado da revisão independente).
// Nos testes o limiter fica desligado (skip lê NODE_ENV a cada pedido): aqui ele é ligado só durante cada teste, num servidor
// HTTP de verdade (cancelar um pedido exige uma conexão de verdade, supertest não cancela).
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
let seq = 0
let server, base, prevEnv

function start(handler, limiter = agentLimiter) {
  const app = express()
  app.use((req, res, next) => { req.userId = req.headers['x-user']; next() })
  app.use(limiter)
  app.post('/chat', handler)
  return new Promise(resolve => { server = app.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; resolve() }) })
}
const post = (user, init = {}) => fetch(`${base}/chat`, { method: 'POST', headers: { 'x-user': user }, ...init })
const remaining = (res) => Number(res.headers.get('ratelimit-remaining'))

beforeEach(() => { prevEnv = process.env.NODE_ENV; process.env.NODE_ENV = 'production' })
afterEach(async () => { process.env.NODE_ENV = prevEnv; if (server) await new Promise(r => server.close(r)); server = null })

describe('cota por hora da IA e pedidos que não deram certo', () => {
  test('falha do provedor (marcada em res.locals.aiProviderFailed) é devolvida: a sobra não cai', async () => {
    await start((req, res) => { res.locals.aiProviderFailed = true; res.status(429).json({ error: 'Serviço de IA sobrecarregado.' }) })
    const user = `falha-${++seq}`
    const a = await post(user); const b = await post(user); const c = await post(user)
    expect([remaining(a), remaining(b), remaining(c)]).toEqual([39, 39, 39]) // se a falha custasse cota: 39, 38, 37
    expect(a.status).toBe(429) // continua respondendo o erro do provedor (não é o limite por hora)
  })

  test('resposta boa gasta a cota', async () => {
    await start((req, res) => res.json({ reply: 'oi' }))
    const user = `ok-${++seq}`
    const a = await post(user); const b = await post(user)
    expect([remaining(a), remaining(b)]).toEqual([39, 38])
  })

  test('erro que NÃO é do provedor (validação, plano) continua gastando a cota: o limite existe para frear abuso', async () => {
    await start((req, res) => res.status(400).json({ error: 'Mensagem inválida.' }))
    const user = `400-${++seq}`
    const a = await post(user); const b = await post(user)
    expect([remaining(a), remaining(b)]).toEqual([39, 38])
  })

  test('pedido CANCELADO pelo cliente não devolve a cota (a chamada ao provedor segue rodando)', async () => {
    let ran = 0
    await start(async (req, res) => { ran++; await sleep(150); if (!res.writableEnded && !res.destroyed) res.json({ reply: 'tarde demais' }) })
    const user = `abort-${++seq}`
    const ac = new AbortController()
    const aborted = post(user, { signal: ac.signal }).catch(() => 'cancelado')
    await sleep(40)
    ac.abort()
    expect(await aborted).toBe('cancelado')
    await sleep(300) // o servidor termina o handler e dispara os eventos de fim da conexão
    const next = await post(user)
    expect(ran).toBe(2)                 // o handler rodou nos dois (o custo do provedor existiu)
    expect(remaining(next)).toBe(38)    // e os dois contaram; se o cancelamento fosse devolvido: 39
  })

  test('o limite continua valendo: o 41º pedido bom é barrado com a mensagem de limite por hora', async () => {
    await start((req, res) => res.json({ reply: 'oi' }))
    const user = `limite-${++seq}`
    for (let i = 0; i < 40; i++) await post(user)
    const barrado = await post(user)
    expect(barrado.status).toBe(429)
    expect((await barrado.json()).error).toMatch(/Limite de mensagens para a IA atingido/)
  })

  test('a transcrição de voz tem a mesma regra (balde próprio de 20/h)', async () => {
    await start((req, res) => { res.locals.aiProviderFailed = true; res.status(503).json({ error: 'fora do ar' }) }, transcribeLimiter)
    const user = `voz-${++seq}`
    const a = await post(user); const b = await post(user)
    expect([remaining(a), remaining(b)]).toEqual([19, 19])
  })
})
