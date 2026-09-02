const prisma = require('../lib/prisma')
const { sendTrialExpiryEmail, sendRenewalReminderEmail } = require('../services/emailService')
const { sendPushToUser } = require('../services/pushService')
const { reportError } = require('../lib/sentry')

const TRIAL_REMINDER_DAYS = 3
const RENEWAL_MAX_LOOKAHEAD_DAYS = 30 // maior limiar entre os dois planPeriod (anual)

// Verifica e, se devido, envia o lembrete de vencimento de UM usuário — trial
// ou renovação de plano pago (mutuamente exclusivos, já que renovação exige
// trialEndsAt ausente). Marca a flag ANTES de enviar o e-mail: se o envio
// falhar depois, o pior caso é o usuário não ser avisado dessa vez, não
// receber o mesmo lembrete duas vezes.
async function remindUserIfDue(user, now = new Date()) {
  if (user.trialEndsAt && user.trialEndsAt > now && !user.trialReminderSent) {
    const daysLeft = Math.ceil((user.trialEndsAt - now) / (1000 * 60 * 60 * 24))
    if (daysLeft <= TRIAL_REMINDER_DAYS) {
      await prisma.user.update({ where: { id: user.id }, data: { trialReminderSent: true } })
      await sendTrialExpiryEmail(user.email, user.name, daysLeft)
      const urgencyMsg = daysLeft <= 1 ? 'Seu trial expira hoje!' : `Seu trial expira em ${daysLeft} dias.`
      sendPushToUser(user.id, {
        title: '⏰ Trial Pro expirando',
        body:  `${urgencyMsg} Assine para manter todos os recursos.`,
        url:   '/planos',
      }).catch(() => {})
      return 'trial'
    }
    return null
  }

  if (user.plan !== 'free' && user.planExpiresAt && !user.trialEndsAt && !user.renewalReminderSent) {
    const daysLeft   = Math.ceil((user.planExpiresAt - now) / (1000 * 60 * 60 * 24))
    const threshold  = user.planPeriod === 'annual' ? 30 : 7
    if (daysLeft > 0 && daysLeft <= threshold) {
      await prisma.user.update({ where: { id: user.id }, data: { renewalReminderSent: true } })
      await sendRenewalReminderEmail(user.email, user.name, user.plan, daysLeft)
      return 'renewal'
    }
    return null
  }

  return null
}

// Varredura diária: encontra todo mundo cujo lembrete está no prazo — não
// depende do usuário abrir o app, ao contrário de remindUserIfDue quando
// chamado a partir de GET /auth/me.
async function sweepPendingPlanReminders(now = new Date()) {
  const result = { trialReminders: 0, renewalReminders: 0, errors: 0 }

  const trialCutoff = new Date(now.getTime() + TRIAL_REMINDER_DAYS * 24 * 60 * 60 * 1000)
  const trialCandidates = await prisma.user.findMany({
    where:  { trialEndsAt: { gt: now, lte: trialCutoff }, trialReminderSent: false },
    select: { id: true, email: true, name: true, plan: true, planExpiresAt: true, planPeriod: true, trialEndsAt: true, trialReminderSent: true, renewalReminderSent: true },
  })

  const renewalCutoff = new Date(now.getTime() + RENEWAL_MAX_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000)
  const renewalCandidates = await prisma.user.findMany({
    where: {
      plan:                { not: 'free' },
      planExpiresAt:       { gt: now, lte: renewalCutoff },
      trialEndsAt:         null,
      renewalReminderSent: false,
    },
    select: { id: true, email: true, name: true, plan: true, planExpiresAt: true, planPeriod: true, trialEndsAt: true, trialReminderSent: true, renewalReminderSent: true },
  })

  for (const user of [...trialCandidates, ...renewalCandidates]) {
    try {
      const kind = await remindUserIfDue(user, now)
      if (kind === 'trial')   result.trialReminders++
      if (kind === 'renewal') result.renewalReminders++
    } catch (err) {
      result.errors++
      reportError(err, { tag: '[planReminders] sweep', userId: user.id })
    }
  }

  return result
}

module.exports = { remindUserIfDue, sweepPendingPlanReminders }
