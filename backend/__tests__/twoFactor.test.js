'use strict'

// Regressão: ENC_KEY (chave AES-256 dos segredos de 2FA) usava um valor fixo
// no código ('__insecure_default__') como fallback quando JWT_SECRET não
// estava definida — qualquer um com acesso ao código-fonte conseguiria
// decifrar o segredo TOTP de qualquer usuário. Agora o módulo falha ao
// carregar em vez de usar um valor fixo conhecido.
describe('twoFactor.js — chave de criptografia do 2FA', () => {
  const originalJwtSecret  = process.env.JWT_SECRET
  const originalTotpEncKey = process.env.TOTP_ENC_KEY

  afterEach(() => {
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET
    else process.env.JWT_SECRET = originalJwtSecret
    if (originalTotpEncKey === undefined) delete process.env.TOTP_ENC_KEY
    else process.env.TOTP_ENC_KEY = originalTotpEncKey
    jest.resetModules()
  })

  test('falha ao carregar o módulo se JWT_SECRET e TOTP_ENC_KEY estiverem ausentes', () => {
    delete process.env.JWT_SECRET
    delete process.env.TOTP_ENC_KEY
    jest.resetModules()

    expect(() => require('../src/routes/twoFactor')).toThrow(/JWT_SECRET/)
  })

  test('carrega normalmente quando JWT_SECRET está definida (sem TOTP_ENC_KEY)', () => {
    process.env.JWT_SECRET = 'test-secret-key-that-is-long-enough-for-jwt-256'
    delete process.env.TOTP_ENC_KEY
    jest.resetModules()

    expect(() => require('../src/routes/twoFactor')).not.toThrow()
  })

  test('carrega normalmente quando TOTP_ENC_KEY está definida (ignora JWT_SECRET)', () => {
    delete process.env.JWT_SECRET
    process.env.TOTP_ENC_KEY = 'a'.repeat(64) // 32 bytes em hex
    jest.resetModules()

    expect(() => require('../src/routes/twoFactor')).not.toThrow()
  })
})
