// Cálculos da "Planilha IA" (tela 12 do Nancy desktop). Funções puras — a rota só busca os dados e delega pra cá, o que deixa
// tudo testável sem banco.
//
// A planilha mostra três meses reais (dois atrás e o atual) e dois de previsão. "Montada automaticamente" quer dizer que cada
// conta fixa, parcela, entrada e gasto que a pessoa registra já é uma linha — não há digitação na planilha. A previsão não é
// um modelo de IA: é a média dos meses reais com movimento (variáveis e entradas), o valor atual das contas fixas e o que
// resta de cada parcela. Salário e contas fixas não têm histórico (só o valor de hoje), então o salário vale o atual em todos
// os meses; o pago de cada conta fixa vem das transações ligadas a ela (budgetId).

const { shiftMonth } = require('./monthlyRecap')
const { CATEGORY_LABELS } = require('../utils/constants')

const SHORT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']
const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// meses mostrados: dois atrás e o atual (reais) + dois à frente (previsão)
const OFFSETS = [-2, -1, 0, 1, 2]
const ACTUAL = 3

const round2 = (n) => Math.round(n * 100) / 100
const key = (ym) => `${ym.year}-${ym.month}`
const idx = (ym) => ym.year * 12 + (ym.month - 1)

// parcela paga vira uma transação de compras com esta marca na descrição (routes/installments.js): sai dos gastos variáveis,
// porque a mesma parcela já aparece na linha dela em "Parcelas"
const INSTALLMENT_TX = /\(parcela \d+\/\d+\)\s*$/

// Janela de datas que a rota precisa buscar (do primeiro mês real em diante).
function sheetWindow(now) {
  return shiftMonth(now, OFFSETS[0])
}

function sum(values) {
  return round2(values.reduce((s, v) => s + (v || 0), 0))
}

// média dos meses reais "ativos" (com qualquer transação): meses antes de a pessoa começar não contam como zero
function forecastAverage(actual, activeFlags) {
  const used = actual.filter((_, i) => activeFlags[i])
  if (used.length === 0) return 0
  return round2(used.reduce((s, v) => s + (v || 0), 0) / used.length)
}

/**
 * @param {object} p
 * @param {{month:number,year:number}} p.now
 * @param {Array}  p.transactions  desde o primeiro mês real (inclusive as arquivadas pelo fechamento)
 * @param {Array}  p.budgets       contas fixas atuais ({ id, name, amount, dueDay, endDate })
 * @param {Array}  p.installments  parcelamentos ({ name, amount, totalInstallments, paidInstallments, startMonth, startYear })
 * @param {number} p.salary
 */
function buildSheet({ now, transactions, budgets, installments, salary }) {
  const months = OFFSETS.map((o, i) => {
    const ym = shiftMonth(now, o)
    return { ...ym, key: key(ym), label: SHORT[ym.month - 1], kind: i < ACTUAL - 1 ? 'past' : i === ACTUAL - 1 ? 'current' : 'forecast' }
  })
  const byMonth = {}
  for (const t of transactions) (byMonth[`${t.year}-${t.month}`] ||= []).push(t)
  const txIn = (m) => byMonth[m.key] || []
  const active = months.slice(0, ACTUAL).map(m => txIn(m).length > 0)
  const withForecast = (actualValues) => [...actualValues, ...OFFSETS.slice(ACTUAL).map(() => forecastAverage(actualValues, active))]

  const sections = []
  const addSection = (id, label, rows) => {
    const cols = months.map((_, c) => sum(rows.map(r => r.values[c])))
    sections.push({ id, label, rows, total: cols })
  }

  // ── Receitas ──────────────────────────────────────────
  const income = []
  if (salary > 0) income.push({ id: 'salary', label: 'Salário', values: months.map(() => round2(salary)), edit: { kind: 'salary' } })
  const incomeGroups = new Map()
  months.slice(0, ACTUAL).forEach((m, c) => {
    for (const t of txIn(m)) {
      if (t.type !== 'income') continue
      const name = (t.description || CATEGORY_LABELS[t.category] || 'Entrada').trim() || 'Entrada'
      const k = name.toLowerCase()
      if (!incomeGroups.has(k)) incomeGroups.set(k, { label: name, vals: [0, 0, 0], total: 0 })
      const g = incomeGroups.get(k)
      g.vals[c] += Number(t.amount)
      g.total += Number(t.amount)
    }
  })
  const sorted = [...incomeGroups.values()].sort((a, b) => b.total - a.total)
  const shown = sorted.slice(0, 4), rest = sorted.slice(4)
  for (const g of shown) income.push({ id: `income:${g.label.toLowerCase()}`, label: g.label, values: withForecast(g.vals.map(round2)) })
  if (rest.length) {
    const vals = [0, 1, 2].map(c => round2(rest.reduce((s, g) => s + g.vals[c], 0)))
    income.push({ id: 'income:other', label: 'Outras entradas', values: withForecast(vals) })
  }
  addSection('income', 'Receitas', income)

  // ── Contas fixas ──────────────────────────────────────
  const ordered = [...budgets].sort((a, b) => (a.dueDay ?? 99) - (b.dueDay ?? 99) || String(a.name).localeCompare(String(b.name), 'pt-BR'))
  const fixed = ordered.map(b => {
    const amount = Number(b.amount)
    const values = months.map((m, c) => {
      if (c < ACTUAL) {
        const paid = txIn(m).filter(t => t.budgetId === b.id && t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
        if (paid > 0) return round2(paid)
        return m.kind === 'current' ? round2(amount) : null // mês atual sem pagamento mostra o valor previsto da conta
      }
      // conta com prazo (parcelas de boleto etc.): some depois do mês final
      if (b.endDate) {
        const end = new Date(b.endDate)
        const endIdx = end.getUTCFullYear() * 12 + end.getUTCMonth()
        if (idx(m) > endIdx) return null
      }
      return round2(amount)
    })
    return { id: `budget:${b.id}`, label: b.name, values, edit: { kind: 'budget', id: b.id } }
  })
  // contas pagas cuja conta fixa já foi excluída (a transação perde o vínculo) continuam como gasto fixo
  const budgetIds = new Set(budgets.map(b => b.id))
  const orphan = months.slice(0, ACTUAL).map(m => round2(txIn(m)
    .filter(t => t.type === 'expense' && t.category === 'fixed' && !(t.budgetId && budgetIds.has(t.budgetId)))
    .reduce((s, t) => s + Number(t.amount), 0)))
  if (orphan.some(v => v > 0)) fixed.push({ id: 'fixed:other', label: 'Outras contas fixas', values: withForecast(orphan) })
  addSection('fixed', 'Contas fixas', fixed)

  // ── Parcelas ──────────────────────────────────────────
  const inst = []
  for (const p of installments) {
    const start = p.startYear * 12 + (p.startMonth - 1)
    const values = months.map(m => {
      const i = idx(m) - start
      return i >= 0 && i < p.totalInstallments ? round2(Number(p.amount)) : null
    })
    if (values.every(v => v === null)) continue // parcelamento que já acabou ou ainda não começou
    inst.push({ id: `installment:${p.id ?? p.name}`, label: `${p.name} (${p.paidInstallments}/${p.totalInstallments})`, values })
  }
  addSection('installments', 'Parcelas', inst)

  // ── Variáveis ─────────────────────────────────────────
  const varCats = Object.keys(CATEGORY_LABELS).filter(c => c !== 'fixed' && c !== 'income')
  const variable = []
  for (const cat of varCats) {
    const vals = months.slice(0, ACTUAL).map(m => round2(txIn(m)
      .filter(t => t.type === 'expense' && t.category === cat && !t.budgetId && !INSTALLMENT_TX.test(t.description || ''))
      .reduce((s, t) => s + Number(t.amount), 0)))
    if (vals.every(v => v === 0)) continue
    variable.push({ id: `category:${cat}`, label: CATEGORY_LABELS[cat], values: withForecast(vals) })
  }
  addSection('variable', 'Variáveis', variable)

  const [inc, fix, par, vari] = sections.map(s => s.total)
  const net = months.map((_, c) => round2(inc[c] - fix[c] - par[c] - vari[c]))

  return {
    months: months.map(({ key: k, label, month, year, kind }) => ({ key: k, label, month, year, kind })),
    sections, net,
    monthName: MONTH_NAMES[now.month - 1],
  }
}

// Últimos acontecimentos que viraram linha ou mudaram a previsão — só o que os dados provam (o app não guarda um histórico de
// ações, então não há "conta adicionada"): parcelas registradas, entradas e contas fixas que mudaram de valor de um mês pro outro.
function buildFeed({ now, transactions, installments, budgets, limit = 4 }) {
  const events = []
  const nextName = MONTH_NAMES[shiftMonth(now, 1).month - 1]

  for (const t of transactions) {
    const when = new Date(t.date)
    if (t.type === 'expense' && INSTALLMENT_TX.test(t.description || '')) {
      const m = /^(.*) \(parcela (\d+)\/(\d+)\)\s*$/.exec(t.description)
      if (m && installments.some(p => p.name === m[1]))
        events.push({ kind: 'installment', text: `Parcela ${m[2]}/${m[3]} da ${m[1]} registrada`, at: when })
    } else if (t.type === 'income') {
      const label = (t.description || CATEGORY_LABELS[t.category] || 'Entrada').trim()
      const month = MONTH_NAMES[t.month - 1]
      events.push({ kind: 'income', text: `${label} de R$ ${Number(t.amount).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} → coluna de ${month} atualizada`, at: when })
    }
  }

  // conta fixa paga neste mês por valor diferente do mês passado
  const prev = shiftMonth(now, -1)
  for (const b of budgets) {
    const paidIn = (ym) => transactions.filter(t => t.budgetId === b.id && t.month === ym.month && t.year === ym.year && t.type === 'expense')
    const cur = paidIn(now), old = paidIn(prev)
    if (!cur.length || !old.length) continue
    const a = cur.reduce((s, t) => s + Number(t.amount), 0), z = old.reduce((s, t) => s + Number(t.amount), 0)
    if (z <= 0) continue
    const pct = Math.round(((a - z) / z) * 100)
    if (pct === 0) continue
    const last = cur.reduce((x, t) => (new Date(t.date) > x ? new Date(t.date) : x), new Date(0))
    events.push({ kind: 'bill', text: `${b.name} ${pct > 0 ? 'subiu' : 'caiu'} ${Math.abs(pct)}% → previsão de ${nextName} ajustada`, at: last })
  }

  return events
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map(e => ({ kind: e.kind, text: e.text, at: e.at.toISOString() }))
}

module.exports = { buildSheet, buildFeed, sheetWindow, OFFSETS, ACTUAL, INSTALLMENT_TX, MONTH_NAMES }
