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
})
