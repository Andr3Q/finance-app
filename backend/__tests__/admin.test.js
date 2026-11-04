'use strict'
const request = require('supertest')

jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))
jest.mock('../src/services/emailService', () => {
  const fn = () => jest.fn().mockResolvedValue(true)
  return {
    sendEmail: fn(), sendWelcomeEmail: fn(), sendVerificationEmail: fn(),
    sendResetEmail: fn(), sendRenewalReminderEmail: fn(), sendTrialExpiryEmail: fn(),
    sendReferralRewardEmail: fn(), sendWeeklyDigest: fn(), sendPlanExpiredEmail: fn(),
    sendMonthlyReport: fn(), sendPlanActivationEmail: fn(),
  }
})
jest.mock('../src/services/pushService', () => ({ sendPushToUser: jest.fn().mockResolvedValue(true) }))
// O seed real apaga as tabelas e usa o Prisma de verdade: aqui ele é trocado por um módulo que só registra o que viu ao ser carregado.
jest.mock('../prisma/seed.staging.js', () => { global.__seedVisto = { senha: process.env.STAGING_SEED_PASSWORD }; return {} })

const app = require('../src/server')

// Regressão: /api/admin/seed-staging (que apaga TODAS as tabelas via
// seed.staging.js) só era bloqueado em produção porque STAGING_SEED_SECRET
// nunca é configurado no Cloud Run de prod — sem checagem própria no código.
// Agora existe uma segunda trava independente via K_SERVICE (nome do serviço
// que a própria Cloud Run injeta), que bloqueia mesmo se o secret um dia for
// configurado por engano em produção. NODE_ENV não serve pra essa checagem
// porque o staging também sobe com NODE_ENV=production.
describe('POST /api/admin/seed-staging', () => {
  const originalKService = process.env.K_SERVICE
  const originalSecret   = process.env.STAGING_SEED_SECRET

  afterEach(() => {
    if (originalKService === undefined) delete process.env.K_SERVICE
    else process.env.K_SERVICE = originalKService
    if (originalSecret === undefined) delete process.env.STAGING_SEED_SECRET
    else process.env.STAGING_SEED_SECRET = originalSecret
  })

  test('bloqueado quando K_SERVICE é o nome do serviço de produção (finance-app), mesmo com secret configurado', async () => {
    process.env.K_SERVICE            = 'finance-app'
    process.env.STAGING_SEED_SECRET  = 'algum-secret-valido'

    const res = await request(app)
      .post('/api/admin/seed-staging')
      .set('x-seed-secret', 'algum-secret-valido')

    expect(res.status).toBe(403)
  })

  test('não bloqueado por K_SERVICE quando é o serviço de staging (finance-app-staging)', async () => {
    process.env.K_SERVICE           = 'finance-app-staging'
    process.env.STAGING_SEED_SECRET = 'algum-secret-valido'

    const res = await request(app)
      .post('/api/admin/seed-staging')
      .set('x-seed-secret', 'header-errado')

    // Passa pela trava de K_SERVICE e cai na checagem de secret (401, não 403) —
    // confirma que staging não é afetado pela nova trava de produção.
    expect(res.status).toBe(401)
  })

  test('bloqueado (403) quando STAGING_SEED_SECRET não está configurado (comportamento pré-existente)', async () => {
    delete process.env.K_SERVICE
    delete process.env.STAGING_SEED_SECRET

    const res = await request(app)
      .post('/api/admin/seed-staging')
      .set('x-seed-secret', 'qualquer-coisa')

    expect(res.status).toBe(403)
  })

  test('401 quando o header x-seed-secret não bate com o secret configurado', async () => {
    delete process.env.K_SERVICE
    process.env.STAGING_SEED_SECRET = 'secret-correto'

    const res = await request(app)
      .post('/api/admin/seed-staging')
      .set('x-seed-secret', 'secret-errado')

    expect(res.status).toBe(401)
  })

  // A senha das contas de seed vem do chamador (segredo do GitHub no deploy). O repositório é público e a homologação responde pela
  // internet: uma senha fixa no código deixava qualquer pessoa entrar como administrador Elite (achado da rodada de SRE, 2026-11-04).
  describe('senha das contas de seed (cabeçalho x-seed-password)', () => {
    const staging = () => { process.env.K_SERVICE = 'finance-app-staging'; process.env.STAGING_SEED_SECRET = 'secret-correto' }

    test('400 sem a senha: o seed não roda sem senha própria', async () => {
      staging()
      const res = await request(app).post('/api/admin/seed-staging').set('x-seed-secret', 'secret-correto')
      expect(res.status).toBe(400)
      expect(global.__seedVisto).toBeUndefined()
    })

    test('400 com senha curta demais (menos de 12 caracteres)', async () => {
      staging()
      const res = await request(app).post('/api/admin/seed-staging').set('x-seed-secret', 'secret-correto').set('x-seed-password', 'curta123')
      expect(res.status).toBe(400)
      expect(global.__seedVisto).toBeUndefined()
    })

    test('o secret errado continua dando 401 antes de qualquer outra coisa (a senha não é lida)', async () => {
      staging()
      const res = await request(app).post('/api/admin/seed-staging').set('x-seed-secret', 'errado').set('x-seed-password', 'uma-senha-longa-123')
      expect(res.status).toBe(401)
      expect(global.__seedVisto).toBeUndefined()
    })

    test('com secret e senha válidos: o seed recebe a senha na carga e ela some do ambiente depois', async () => {
      staging()
      const res = await request(app).post('/api/admin/seed-staging').set('x-seed-secret', 'secret-correto').set('x-seed-password', 'uma-senha-longa-123')
      expect(res.status).toBe(200)
      expect(global.__seedVisto).toEqual({ senha: 'uma-senha-longa-123' })
      expect(process.env.STAGING_SEED_PASSWORD).toBeUndefined() // não fica na memória do processo
    })

    test('em produção (K_SERVICE=finance-app) nem com a senha certa: 403 e o seed não carrega', async () => {
      process.env.K_SERVICE = 'finance-app'; process.env.STAGING_SEED_SECRET = 'secret-correto'
      delete global.__seedVisto
      const res = await request(app).post('/api/admin/seed-staging').set('x-seed-secret', 'secret-correto').set('x-seed-password', 'uma-senha-longa-123')
      expect(res.status).toBe(403)
      expect(global.__seedVisto).toBeUndefined()
    })
  })
})
