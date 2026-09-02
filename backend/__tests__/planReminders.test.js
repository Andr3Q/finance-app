'use strict'

jest.mock('../src/lib/prisma', () => require('./__mocks__/prisma'))
jest.mock('../src/services/emailService', () => ({
  sendTrialExpiryEmail:    jest.fn().mockResolvedValue(true),
  sendRenewalReminderEmail: jest.fn().mockResolvedValue(true),
}))
jest.mock('../src/services/pushService', () => ({
  sendPushToUser: jest.fn().mockResolvedValue(true),
}))
jest.mock('../src/lib/sentry', () => ({
  reportError: jest.fn(),
}))

const prisma = require('./__mocks__/prisma')
const { sendTrialExpiryEmail, sendRenewalReminderEmail } = require('../src/services/emailService')
const { sendPushToUser } = require('../src/services/pushService')
const { reportError } = require('../src/lib/sentry')
const { remindUserIfDue, sweepPendingPlanReminders } = require('../src/jobs/planReminders')

const NOW = new Date('2026-09-02T12:00:00Z')
const daysFromNow = (n) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000)

const baseUser = (overrides = {}) => ({
  id: 'user-1', email: 'user@example.com', name: 'Usuário Teste',
  plan: 'pro', planExpiresAt: null, planPeriod: 'monthly',
  trialEndsAt: null, trialReminderSent: false, renewalReminderSent: false,
  ...overrides,
})

describe('remindUserIfDue', () => {
  test('trial vencendo em 2 dias → envia e marca a flag', async () => {
    const user = baseUser({ plan: 'pro', trialEndsAt: daysFromNow(2), trialReminderSent: false })
    const kind = await remindUserIfDue(user, NOW)
    expect(kind).toBe('trial')
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { trialReminderSent: true } })
    expect(sendTrialExpiryEmail).toHaveBeenCalledWith('user@example.com', 'Usuário Teste', 2)
    expect(sendPushToUser).toHaveBeenCalled()
  })

  test('trial vencendo em 10 dias → fora da janela, não envia', async () => {
    const user = baseUser({ trialEndsAt: daysFromNow(10) })
    const kind = await remindUserIfDue(user, NOW)
    expect(kind).toBeNull()
    expect(sendTrialExpiryEmail).not.toHaveBeenCalled()
  })

  test('trial já lembrado → não envia de novo', async () => {
    const user = baseUser({ trialEndsAt: daysFromNow(1), trialReminderSent: true })
    const kind = await remindUserIfDue(user, NOW)
    expect(kind).toBeNull()
    expect(sendTrialExpiryEmail).not.toHaveBeenCalled()
  })

  test('plano mensal vencendo em 5 dias → envia lembrete de renovação', async () => {
    const user = baseUser({ plan: 'pro', planPeriod: 'monthly', planExpiresAt: daysFromNow(5) })
    const kind = await remindUserIfDue(user, NOW)
    expect(kind).toBe('renewal')
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { renewalReminderSent: true } })
    expect(sendRenewalReminderEmail).toHaveBeenCalledWith('user@example.com', 'Usuário Teste', 'pro', 5)
  })

  test('plano mensal vencendo em 10 dias → fora da janela de 7 dias, não envia', async () => {
    const user = baseUser({ plan: 'pro', planPeriod: 'monthly', planExpiresAt: daysFromNow(10) })
    const kind = await remindUserIfDue(user, NOW)
    expect(kind).toBeNull()
    expect(sendRenewalReminderEmail).not.toHaveBeenCalled()
  })

  test('plano anual vencendo em 25 dias → dentro da janela de 30 dias, envia', async () => {
    const user = baseUser({ plan: 'elite', planPeriod: 'annual', planExpiresAt: daysFromNow(25) })
    const kind = await remindUserIfDue(user, NOW)
    expect(kind).toBe('renewal')
    expect(sendRenewalReminderEmail).toHaveBeenCalledWith('user@example.com', 'Usuário Teste', 'elite', 25)
  })

  test('renovação já lembrada → não envia de novo', async () => {
    const user = baseUser({ plan: 'pro', planExpiresAt: daysFromNow(3), renewalReminderSent: true })
    const kind = await remindUserIfDue(user, NOW)
    expect(kind).toBeNull()
    expect(sendRenewalReminderEmail).not.toHaveBeenCalled()
  })

  test('usuário com trial ativo E planExpiresAt vencido não dispara renovação (trial tem prioridade)', async () => {
    // Cenário do C-01: plano pago "vencido" mas ainda dentro de um trial ativo
    const user = baseUser({ plan: 'pro', planExpiresAt: daysFromNow(-10), trialEndsAt: daysFromNow(20) })
    const kind = await remindUserIfDue(user, NOW)
    expect(kind).toBeNull()
    expect(sendRenewalReminderEmail).not.toHaveBeenCalled()
  })
})

describe('sweepPendingPlanReminders', () => {
  test('varre candidatos de trial e renovação, soma contagens, isola erros por usuário', async () => {
    const trialUser   = baseUser({ id: 'u-trial',   trialEndsAt: daysFromNow(1) })
    const renewalUser = baseUser({ id: 'u-renewal', planExpiresAt: daysFromNow(3) })
    const brokenUser  = baseUser({ id: 'u-broken',  trialEndsAt: daysFromNow(1) })

    prisma.user.findMany
      .mockResolvedValueOnce([trialUser, brokenUser]) // candidatos de trial
      .mockResolvedValueOnce([renewalUser])            // candidatos de renovação

    // 1ª chamada (trialUser) resolve normalmente; 2ª chamada (brokenUser) falha —
    // confirma que 1 usuário com erro não aborta a varredura dos demais
    sendTrialExpiryEmail
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('Resend fora do ar'))

    const result = await sweepPendingPlanReminders(NOW)

    expect(result.trialReminders).toBe(1)
    expect(result.renewalReminders).toBe(1)
    expect(result.errors).toBe(1)
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ tag: '[planReminders] sweep', userId: 'u-broken' }))
  })

  test('sem candidatos → contagens zeradas, sem chamadas de e-mail', async () => {
    prisma.user.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const result = await sweepPendingPlanReminders(NOW)
    expect(result).toEqual({ trialReminders: 0, renewalReminders: 0, errors: 0 })
    expect(sendTrialExpiryEmail).not.toHaveBeenCalled()
    expect(sendRenewalReminderEmail).not.toHaveBeenCalled()
  })
})
