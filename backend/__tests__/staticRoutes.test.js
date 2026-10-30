'use strict'
const request = require('supertest')
jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))
jest.mock('../src/services/emailService', () => ({}))
jest.mock('../src/services/pushService', () => ({ sendPushToUser: jest.fn() }))

const app = require('../src/server')

// Achado N2-10: /favicon.ico devolvia a página HTML do app (200, text/html) no lugar de um ícone — leitores de feed, prévias de
// link e crawlers pedem esse caminho direto.
describe('GET /favicon.ico', () => {
  test('redireciona para o ícone do app (PNG), nunca devolve HTML', async () => {
    const res = await request(app).get('/favicon.ico')
    expect(res.status).toBe(301)
    expect(res.headers.location).toBe('/icon-192.png')
    expect(res.headers['content-type'] || '').not.toMatch(/html/)
  })

  test('o redirecionamento pode ser guardado em cache (o ícone quase nunca muda)', async () => {
    const res = await request(app).get('/favicon.ico')
    expect(res.headers['cache-control']).toMatch(/max-age=86400/)
  })
})
