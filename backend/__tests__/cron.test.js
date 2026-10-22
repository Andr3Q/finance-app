'use strict'
const request = require('supertest')

jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))
jest.mock('../src/jobs/planReminders', () => ({
  sweepPendingPlanReminders: jest.fn(),
}))
jest.mock('../src/jobs/weeklyDigest', () => ({
  sweepWeeklyDigests: jest.fn(),
}))

const app = require('../src/server')
const { sweepPendingPlanReminders } = require('../src/jobs/planReminders')
const { sweepWeeklyDigests } = require('../src/jobs/weeklyDigest')

const ENDPOINT = '/api/cron/plan-reminders'

describe('POST /api/cron/plan-reminders', () => {
  afterEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret'
  })

  test('401 sem o header x-cron-secret', async () => {
    const res = await request(app).post(ENDPOINT)
    expect(res.status).toBe(401)
  })

  test('401 com segredo errado', async () => {
    const res = await request(app).post(ENDPOINT).set('x-cron-secret', 'segredo-errado')
    expect(res.status).toBe(401)
  })

  test('503 quando CRON_SECRET não está configurado no servidor', async () => {
    delete process.env.CRON_SECRET
    const res = await request(app).post(ENDPOINT).set('x-cron-secret', 'qualquer-coisa')
    expect(res.status).toBe(503)
  })

  test('200 e devolve as contagens com o segredo correto', async () => {
    sweepPendingPlanReminders.mockResolvedValue({ trialReminders: 2, renewalReminders: 1, errors: 0 })
    const res = await request(app).post(ENDPOINT).set('x-cron-secret', 'test-cron-secret')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ trialReminders: 2, renewalReminders: 1, errors: 0 })
    expect(res.body.ts).toBeDefined()
  })

  test('500 quando a varredura lança erro', async () => {
    sweepPendingPlanReminders.mockRejectedValue(new Error('DB fora do ar'))
    const res = await request(app).post(ENDPOINT).set('x-cron-secret', 'test-cron-secret')
    expect(res.status).toBe(500)
  })
})

describe('POST /api/cron/weekly-digest', () => {
  const URL = '/api/cron/weekly-digest'
  afterEach(() => { process.env.CRON_SECRET = 'test-cron-secret' })

  test('401 sem segredo ou com segredo errado, e nada é enviado', async () => {
    expect((await request(app).post(URL)).status).toBe(401)
    expect((await request(app).post(URL).set('x-cron-secret', 'errado')).status).toBe(401)
    expect(sweepWeeklyDigests).not.toHaveBeenCalled()
  })

  test('503 quando CRON_SECRET não está configurado', async () => {
    delete process.env.CRON_SECRET
    expect((await request(app).post(URL).set('x-cron-secret', 'x')).status).toBe(503)
  })

  test('200 com as contagens quando o segredo está certo', async () => {
    sweepWeeklyDigests.mockResolvedValue({ sent: 3, skipped: 2, errors: 0 })
    const res = await request(app).post(URL).set('x-cron-secret', 'test-cron-secret')
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ sent: 3, skipped: 2, errors: 0 })
  })

  test('500 quando o envio lança erro', async () => {
    sweepWeeklyDigests.mockRejectedValue(new Error('DB fora do ar'))
    expect((await request(app).post(URL).set('x-cron-secret', 'test-cron-secret')).status).toBe(500)
  })
})
