// O app inteiro raciocina em horário de Brasília (o servidor roda em UTC).
// Brasil não tem horário de verão desde 2019: UTC-3 fixo.
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000

// Dia/mês/ano de um instante no fuso de Brasília.
function partsBrasilia(date = new Date()) {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: 'numeric', day: 'numeric',
  }).formatToParts(date)
  const get = (type) => parseInt(parts.find(p => p.type === type).value)
  return { month: get('month'), year: get('year'), day: get('day') }
}

function nowBrasilia() {
  return partsBrasilia()
}

// Converte a data recebida pela API em Date. "YYYY-MM-DD" (input[type=date])
// vira meia-noite de BRASÍLIA. `new Date('YYYY-MM-DD')` puro dá meia-noite UTC,
// que em Brasília ainda é 21h do dia ANTERIOR — toda a interface mostrava as
// datas 1 dia atrasadas, e uma transação do dia 1º sumia do Calendário (caía
// em 31 do mês anterior). String ISO com hora é um instante real e passa
// direto. Retorna null se inválida (inclusive dia inexistente, ex: 2026-02-31).
function parseDateInput(str) {
  if (typeof str !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
  if (!m) {
    const d = new Date(str)
    return isNaN(d.getTime()) ? null : d
  }
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const utc = new Date(Date.UTC(y, mo - 1, d))
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) return null
  return new Date(utc.getTime() + BRASILIA_OFFSET_MS)
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

// Única fonte de verdade pro "quanto das contas fixas ainda não foi pago este
// mês" — usado pra calcular saldo disponível em /transactions/summary,
// /transactions/dashboard e reports.js (relatório mensal + PDF + e-mail),
// cada um antes refazia essa conta com a flag binária user.autoLaunchMonth/Year
// ("tudo lançado" ou "nada lançado"). Generaliza pra pagamento PARCIAL: uma
// conta fixa conta como paga quando existe uma Transaction com budgetId
// apontando pra ela neste mês/ano (ver services/budgetPayment.js) — só essas
// são descontadas de totalFixedCosts, as outras continuam "reservadas".
//
// legacyAllLaunched preserva o comportamento antigo (desconta zero) só
// durante o mês em que a migration foi publicada, pra quem já tinha chamado
// o auto-launch ANTES dessa mudança (transações sem budgetId, category
// 'fixed', criadas pelo mecanismo antigo) — sem isso, o saldo desse usuário
// cairia de repente ao recarregar a página, descontando de novo contas que
// na prática já estão em totalExpenses. Deixa de fazer qualquer diferença a
// partir do mês seguinte (a flag nunca mais bate com o mês atual).
function computeFixedCostsStatus({ budgets, transactions, legacyAllLaunched = false }) {
  const totalFixedCosts = budgets.reduce((s, b) => s + Number(b.amount), 0)
  if (legacyAllLaunched) {
    return { totalFixedCosts, unpaidFixedCosts: 0, unpaidBudgetIds: [] }
  }
  const paidBudgetIds   = new Set(transactions.filter(t => t.budgetId).map(t => t.budgetId))
  const unpaidBudgets   = budgets.filter(b => !paidBudgetIds.has(b.id))
  const unpaidFixedCosts = unpaidBudgets.reduce((s, b) => s + Number(b.amount), 0)
  return { totalFixedCosts, unpaidFixedCosts, unpaidBudgetIds: unpaidBudgets.map(b => b.id) }
}

module.exports = { nowBrasilia, partsBrasilia, parseDateInput, computeEffectivePlan, computeFixedCostsStatus }
