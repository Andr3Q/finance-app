// Lembretes de vencimento (Nancy 2, tela 22). As preferências ficam NESTE aparelho (localStorage) e
// alimentam os avisos das Notificações: cada conta fixa com dia de vencimento tem um interruptor e
// "quantos dias antes avisar"; o usuário também pode criar lembretes avulsos (ex.: IPVA, todo
// janeiro). Sem nada configurado, toda conta com vencimento avisa 2 dias antes.
const KEY = 'nancy:reminders'

export const DEFAULT_LEAD = 2
export const LEAD_OPTIONS = [0, 1, 2, 3, 5, 7]
export const leadLabel = (n) => (n === 0 ? 'no dia' : n === 1 ? '1 dia antes' : `${n} dias antes`)

const emptyState = () => ({ bills: {}, custom: [] })
const isLead = (n) => Number.isInteger(n) && n >= 0 && n <= 30

export function readReminders() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    if (!v || typeof v !== 'object') return emptyState()
    const bills = {}
    for (const [id, s] of Object.entries(v.bills && typeof v.bills === 'object' ? v.bills : {})) {
      if (s && typeof s === 'object') bills[id] = { on: s.on !== false, lead: isLead(s.lead) ? s.lead : DEFAULT_LEAD }
    }
    const custom = (Array.isArray(v.custom) ? v.custom : [])
      .filter(c => c && typeof c.id === 'string' && typeof c.name === 'string' && c.name.trim() && Number.isInteger(c.day) && c.day >= 1 && c.day <= 31)
      .map(c => ({ id: c.id, name: c.name.trim().slice(0, 60), day: c.day, month: Number.isInteger(c.month) && c.month >= 1 && c.month <= 12 ? c.month : null, lead: isLead(c.lead) ? c.lead : DEFAULT_LEAD, on: c.on !== false }))
    return { bills, custom }
  } catch {
    return emptyState()
  }
}

export function saveReminders(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage indisponível: só não fica guardado */ }
}

export const billSetting = (state, budgetId) => ({
  on:   state?.bills?.[budgetId]?.on ?? true,
  lead: state?.bills?.[budgetId]?.lead ?? DEFAULT_LEAD,
})

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const clampedDate = (year, monthIdx, day) => new Date(year, monthIdx, Math.min(day, new Date(year, monthIdx + 1, 0).getDate()))
export const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000)

/**
 * Próxima ocorrência (hoje conta) de um vencimento: todo mês no `day` (month = null) ou uma vez por
 * ano em `month`/`day`. Dia 31 num mês curto cai no último dia do mês.
 */
export function nextOccurrence(day, month, now = new Date()) {
  const today = startOfDay(now)
  if (month == null) {
    const thisMonth = clampedDate(today.getFullYear(), today.getMonth(), day)
    return thisMonth >= today ? thisMonth : clampedDate(today.getFullYear(), today.getMonth() + 1, day)
  }
  const thisYear = clampedDate(today.getFullYear(), month - 1, day)
  return thisYear >= today ? thisYear : clampedDate(today.getFullYear() + 1, month - 1, day)
}

export const dueText = (diff) => (diff === 0 ? 'vence hoje' : diff === 1 ? 'vence amanhã' : `vence em ${diff} dias`)
export const whenText = (diff) => (diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : `em ${diff} dias`)
