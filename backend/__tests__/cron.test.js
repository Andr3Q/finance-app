'use strict'
const request = require('supertest')

jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))
jest.mock('../src/jobs/planReminders', () => ({
  sweepPendingPlanReminders: jest.fn(),
}))

const app = require('../src/server')
const { sweepPendingPlanReminders } = require('../src/jobs/planReminders')

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
