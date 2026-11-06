'use strict'
const fs      = require('fs')
const os      = require('os')
const path    = require('path')
const express = require('express')
const request = require('supertest')
const { staticAssets } = require('../src/middleware/staticAssets')

// Arquivo do app que não existe no servidor (troca de versão) NÃO pode voltar como a página inicial com status 200:
// o service worker do celular guardava esse HTML no lugar do arquivo e o app travava em "Algo deu errado" até a versão seguinte.
describe('staticAssets (/assets)', () => {
  let dir, app
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nancy-assets-'))
    fs.writeFileSync(path.join(dir, 'Goals-abc123.js'), 'export default 1')
    fs.writeFileSync(path.join(dir, 'index-abc123.css'), 'body{margin:0}')
    app = express()
    app.use('/assets', staticAssets(dir))
    // o "catch-all" do app (a página inicial para qualquer rota): é ele que NÃO pode atender /assets
    app.get('*', (_req, res) => res.status(200).type('html').send('<!doctype html><title>Nancy</title>'))
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('arquivo que existe: 200, com o tipo certo, cache de 1 ano e CORS aberto', async () => {
    const res = await request(app).get('/assets/Goals-abc123.js')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/javascript/)
    expect(res.headers['cache-control']).toMatch(/max-age=31536000.*immutable/)
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect((await request(app).get('/assets/index-abc123.css')).headers['content-type']).toMatch(/css/)
  })

  it('arquivo que NÃO existe: 404 em texto, nunca a página inicial (HTML) com 200, e não pode ser guardado em cache', async () => {
    for (const p of ['/assets/Goals-ZZZZZZZZ.js', '/assets/index-ZZZZZZZZ.css', '/assets/sub/pasta/x.woff2', '/assets/']) {
      const res = await request(app).get(p)
      expect(res.status).toBe(404)
      expect(res.headers['content-type']).not.toMatch(/html/)
      expect(res.text).not.toMatch(/<!doctype/i)
      expect(res.headers['cache-control']).toBe('no-store')
    }
  })

  it('o resto do app continua com a página inicial (rotas do React) — só /assets é 404', async () => {
    const res = await request(app).get('/dashboard')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/html/)
  })
})
