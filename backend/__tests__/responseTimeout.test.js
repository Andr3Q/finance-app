'use strict'
const { withResponseTimeout } = require('../src/lib/responseTimeout')

// O servidor pode continuar trabalhando (e fazendo ações da IA) depois de o limite de tempo responder 503: o app precisa
// saber disso para NÃO oferecer "tentar de novo" (que lançaria em dobro).
function fakeRes(headersSent = false) {
  const res = { headersSent, status: jest.fn(() => res), json: jest.fn(() => res), setTimeout: jest.fn((ms, cb) => { res.cb = cb; res.ms = ms }) }
  return res
}

describe('withResponseTimeout', () => {
  test('arma o limite pedido e segue a cadeia', () => {
    const res = fakeRes(); const next = jest.fn()
    withResponseTimeout(90_000)({}, res, next)
    expect(res.ms).toBe(90_000)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('ao estourar: 503 com timeout:true', () => {
    const res = fakeRes()
    withResponseTimeout(1000)({}, res, jest.fn())
    res.cb()
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith({ error: 'Tempo de resposta esgotado.', timeout: true })
  })

  test('se a resposta já saiu, não responde de novo', () => {
    const res = fakeRes(true)
    withResponseTimeout(1000)({}, res, jest.fn())
    res.cb()
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
  })
})
