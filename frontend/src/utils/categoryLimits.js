// Limites por categoria (Nancy 2, tela Limites): quanto já foi gasto no mês em cada categoria e em que
// pé está cada teto. A Nancy "avisa quando passar de 80%" é o texto do design; o aviso das Notificações
// tem o próprio corte (LIMIT_WARN_PCT em notificationsFeed.js).
export const LIMIT_CATEGORIES = ['food', 'transport', 'shopping', 'health', 'leisure', 'education', 'home', 'other']

export const WARN_PCT = 80

/** Gasto do mês por categoria (só despesas). */
export function spentByCategory(transactions = []) {
  const spent = {}
  for (const t of transactions) {
    if (t.type === 'expense') spent[t.category] = (spent[t.category] || 0) + Number(t.amount)
  }
  return spent
}

const cents = (n) => Math.round(n * 100) / 100

/**
 * Situação de um teto: 'ok' (sobra), 'warn' (a partir de 80%) ou 'over' (estourou ou chegou no teto).
 * `pct` é exato (largura da barra); `used` é o número mostrado, que nunca diz 100% antes de estourar.
 */
export function limitStatus(amount, spent) {
  const limit = Number(amount)
  const used  = Number(spent) || 0
  const pct   = limit > 0 ? (used / limit) * 100 : 0
  if (used >= limit) return { state: 'over', pct, used: Math.round(pct), over: cents(used - limit), left: 0 }
  const rounded = Math.min(99, Math.round(pct))
  return { state: pct >= WARN_PCT ? 'warn' : 'ok', pct, used: rounded, over: 0, left: cents(limit - used) }
}
