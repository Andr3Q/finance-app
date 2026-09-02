function nowBrasilia() {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date())
  const get = (type) => parseInt(parts.find(p => p.type === type).value)
  return { month: get('month'), year: get('year'), day: get('day') }
}

// Única fonte de verdade pro plano efetivo (considerando expiração de plano pago
// e de trial) — evita que planos expirados aceitem writes (C-01). Antes desta função
// existir, essa mesma conta era refeita em auth.js, reports.js e agent.js, cada uma
// com uma pequena divergência na guarda de trialEndsAt — foi exatamente essa
// divergência que causou o bug C-01.
function computeEffectivePlan(user, now = new Date()) {
  const planExpired   = user.plan !== 'free' && user.planExpiresAt && user.planExpiresAt < now && !user.trialEndsAt
  const trialExpired  = user.trialEndsAt && user.trialEndsAt < now && (!user.planExpiresAt || user.planExpiresAt < now)
  const effectivePlan = (planExpired || trialExpired) ? 'free' : user.plan
  return { effectivePlan, planExpired, trialExpired }
}

module.exports = { nowBrasilia, computeEffectivePlan }
