import { CATEGORY_LABELS, MONTHS } from '../constants/index.js'
import { fmt } from './format.js'

// Avisos da tela "Notificações" (Nancy 2, tela 13), calculados na hora a partir dos mesmos
// dados que o Início já carrega (GET /transactions/dashboard): nada é guardado nem
// inventado — cada aviso existe porque a condição dele é verdadeira agora. Por isso o
// "quando" é o que dá pra afirmar de verdade ("hoje", "amanhã", "este mês"), e não uma
// hora exata que o app não registra. Função pura: o Início usa pra decidir o pontinho do
// sino e a tela de Notificações usa pra listar, e os dois sempre concordam.

// A partir de quanto do limite de uma categoria o aviso aparece.
export const LIMIT_WARN_PCT = 70
// A partir de que dia do mês o "Resumo de <mês> pronto" aparece (o mês já está quase fechado).
export const RECAP_FROM_DAY = 25

const pad      = (n) => String(n).padStart(2, '0')
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
const dayKey   = (d) => `${monthKey(d)}-${pad(d.getDate())}`
const money    = (n) => `R$ ${fmt(n)}`
// "R$ 335" quando redondo (como no design), "R$ 335,40" quando tem centavos.
const moneyCompact = (n) => (Number.isInteger(n) ? `R$ ${n.toLocaleString('pt-BR')}` : money(n))

/**
 * @param {object}  p
 * @param {Date}    p.now
 * @param {object}  p.summary       summary do /transactions/dashboard (unpaidBudgetIds, totalExpenses...)
 * @param {Array}   p.transactions  transações do mês (do mesmo endpoint)
 * @param {Array}   p.limits        limites por categoria { category, amount }
 * @param {Array}   p.budgets       contas fixas { id, name, amount, dueDay, endDate }
 * @param {object}  p.salaryNotif   getSalaryNotif() — { status: 'today'|'tomorrow'|'soon', msg } ou null
 * @param {object}  p.trialNotif    getTrialNotif(user) — { msg } ou null
 * @param {number}  p.recapSlides   quantas histórias o resumo tem (opcional; só melhora o texto)
 * @returns {Array<{ id, kind, title, body, when, action }>} já na ordem de importância
 */
export function buildNotifications({
  now = new Date(), summary = null, transactions = [], limits = [], budgets = [],
  salaryNotif = null, trialNotif = null, recapSlides = null,
} = {}) {
  const items = []
  const today       = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), today)
  const unpaid = new Set(summary?.unpaidBudgetIds ?? [])

  // Contas fixas que vencem hoje ou amanhã e ainda não foram registradas como pagas.
  for (const b of budgets) {
    if (!b.dueDay || !unpaid.has(b.id)) continue
    if (b.endDate && new Date(b.endDate) < startOfToday) continue // conta com prazo já encerrada
    const due  = Math.min(b.dueDay, daysInMonth) // dia 31 num mês de 30 dias vence no último dia
    const diff = due - today
    if (diff !== 0 && diff !== 1) continue
    items.push({
      id: `bill:${b.id}:${dayKey(now)}`, kind: 'bill', rank: diff === 0 ? 0 : 6,
      title: `${b.name} ${diff === 0 ? 'vence hoje' : 'vence amanhã'}`,
      body:  `${money(b.amount)} · conta fixa`,
      when:  diff === 0 ? 'hoje' : 'amanhã',
      action: { type: 'route', to: '/contas-do-mes' },
    })
  }

  // Dia de salário (5º dia útil) — o app já calcula isso em getSalaryNotif().
  if (salaryNotif) {
    const copy = {
      today:    { body: 'Seu salário deve cair hoje. Quer registrar?',   when: 'hoje',     rank: 1 },
      tomorrow: { body: 'Seu salário deve cair amanhã. Quer registrar?', when: 'amanhã',   rank: 7 },
      soon:     { body: salaryNotif.msg,                                 when: 'em breve', rank: 8 },
    }[salaryNotif.status]
    if (copy) {
      items.push({
        id: `salary:${monthKey(now)}:${salaryNotif.status}`, kind: 'salary', rank: copy.rank,
        title: 'Lembrete de salário', body: copy.body, when: copy.when,
        action: { type: 'new-transaction', transactionType: 'income' },
      })
    }
  }

  if (trialNotif) {
    items.push({
      id: `trial:${dayKey(now)}`, kind: 'trial', rank: 2,
      title: 'Trial Pro', body: trialNotif.msg, when: 'hoje',
      action: { type: 'route', to: '/planos' },
    })
  }

  // Categorias perto de estourar (ou já estouradas) o limite do mês.
  const spentBy = {}
  for (const t of transactions) {
    if (t.type === 'expense') spentBy[t.category] = (spentBy[t.category] || 0) + Number(t.amount)
  }
  for (const l of limits) {
    const limit = Number(l.amount)
    if (!(limit > 0)) continue
    const spent = spentBy[l.category] || 0
    const pct   = Math.round((spent / limit) * 100)
    const label = CATEGORY_LABELS[l.category] || l.category
    if (spent >= limit) {
      items.push({
        id: `limit:${l.category}:${monthKey(now)}:over`, kind: 'limit', rank: 3,
        title: `${label} passou do limite`,
        body:  `${moneyCompact(Math.round((spent - limit) * 100) / 100)} acima do teto do mês.`,
        when: 'este mês', action: { type: 'route', to: '/goals' },
      })
    } else if (pct >= LIMIT_WARN_PCT) {
      items.push({
        id: `limit:${l.category}:${monthKey(now)}:warn`, kind: 'limit', rank: 4,
        title: `${label} em ${pct}% do limite`,
        body:  `Faltam ${moneyCompact(Math.round((limit - spent) * 100) / 100)} até o teto do mês.`,
        when: 'este mês', action: { type: 'route', to: '/goals' },
      })
    }
  }

  // Resumo do mês, quando o mês já está acabando e teve movimento.
  const hasMovement = (summary?.totalExpenses || 0) + (summary?.totalIncome || 0) > 0
  if (today >= RECAP_FROM_DAY && hasMovement) {
    items.push({
      id: `recap:${monthKey(now)}`, kind: 'recap', rank: 5,
      title: `Resumo de ${MONTHS[now.getMonth()].toLowerCase()} pronto`,
      body:  recapSlides ? `Veja seu mês em ${recapSlides} ${recapSlides === 1 ? 'história' : 'histórias'}` : 'Veja seu mês em histórias',
      when: 'hoje', action: { type: 'story', monthOffset: 0 },
    })
  }

  // sort estável (Node/navegadores modernos): mesma importância mantém a ordem de inserção
  return items.sort((a, b) => a.rank - b.rank)
}

// ── "Novas": quais avisos o usuário ainda não viu neste aparelho ─────────────────────
// Os ids já levam o período (dia/mês), então um aviso do mesmo tipo volta a ser novo no dia
// ou no mês seguinte. Só um indicador visual, guardado no aparelho (localStorage).
const STORAGE_KEY = 'nancy:notifs-read'
const KEEP_MS = 60 * 24 * 60 * 60 * 1000 // descarta registros com mais de 60 dias

export function readNotifIds() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

export function markNotifsRead(ids, now = Date.now()) {
  try {
    const read = readNotifIds()
    for (const id of ids) read[id] = now
    for (const k of Object.keys(read)) if (now - read[k] > KEEP_MS) delete read[k]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(read))
  } catch {
    // storage indisponível: o sino só deixa de apagar o pontinho
  }
}

export const countUnread = (items, readMap) => items.filter(i => !readMap[i.id]).length
