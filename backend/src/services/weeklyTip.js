// "Dica da semana" do story Dicas IA (tela 09 do Nancy 2). Funções puras — a
// rota (routes/agent.js) busca as transações e, só pra Pro/Elite, pede uma
// frase pra IA.
//
// Todos os NÚMEROS exibidos (categoria, % acima da média, quanto poupa) saem
// daqui, de forma determinística, das transações reais. A IA escreve só uma
// frase prática SEM números (validada em sanitizeAdvice) — assim ela nunca
// consegue inventar um valor em reais que o usuário leria como fato.

const { CATEGORY_LABELS } = require('../utils/constants')

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_DAYS      = 30
const BASELINE_WINDOWS = 3
// Quanto de histórico a rota precisa buscar (janela atual + 3 de referência).
const HISTORY_DAYS = WINDOW_DAYS * (BASELINE_WINDOWS + 1)

// Só vale apontar uma categoria a partir de 10% acima da média E de pelo menos
// R$ 30 a mais — evita "300% acima da média" quando a média era R$ 5.
const MIN_PCT    = 10
const MIN_EXCESS = 30
// Contas fixas, entradas e "Outros" não são algo que a pessoa consiga cortar
// com uma dica prática.
const NOT_ACTIONABLE = new Set(['fixed', 'income', 'other'])

const MAX_ADVICE_LENGTH = 140

const round2 = (n) => Math.round(n * 100) / 100
const brl    = (n) => Math.round(n).toLocaleString('pt-BR')

// Compara os últimos 30 dias com a média dos 3 períodos de 30 dias anteriores
// (só os que tiveram algum gasto registrado) e devolve a categoria com maior
// excesso em reais, ou null se não há base de comparação ou nada passou dos
// limites. Janelas móveis, e não "mês até agora", porque comparar um mês
// parcial com meses cheios subestimaria o gasto na primeira metade do mês.
//
// expenses: [{ category, amount, date }] — só despesas, dos últimos HISTORY_DAYS.
function computeWeeklyTipStats(expenses, now = new Date()) {
  const windows = Array.from({ length: BASELINE_WINDOWS + 1 }, () => ({ count: 0, byCategory: {} }))

  for (const t of expenses) {
    const age = now.getTime() - new Date(t.date).getTime()
    if (age < 0) continue // lançamento com data futura não entra
    const k = Math.floor(age / (WINDOW_DAYS * DAY_MS))
    if (k > BASELINE_WINDOWS) continue
    const w = windows[k]
    w.count++
    w.byCategory[t.category] = (w.byCategory[t.category] || 0) + Number(t.amount)
  }

  const current  = windows[0]
  const baseline = windows.slice(1).filter(w => w.count > 0)
  if (current.count === 0 || baseline.length === 0) return null

  let best = null
  for (const [category, cur] of Object.entries(current.byCategory)) {
    if (NOT_ACTIONABLE.has(category)) continue
    const avg = baseline.reduce((s, w) => s + (w.byCategory[category] || 0), 0) / baseline.length
    if (avg <= 0) continue
    const excess = cur - avg
    const pct    = Math.round((excess / avg) * 100)
    if (pct < MIN_PCT || excess < MIN_EXCESS) continue
    if (!best || excess > best.excess) {
      best = {
        category,
        label:   CATEGORY_LABELS[category] || category,
        pct,
        excess:  round2(excess),
        current: round2(cur),
        average: round2(avg),
        baselineWindows: baseline.length,
      }
    }
  }
  return best
}

// Frase final. Sem a IA (plano gratuito, IA fora do ar, resposta rejeitada):
// só o que os números provam. Com a IA: a frase prática + a mesma conta.
function composeTip(advice, stats) {
  if (!advice) return `Voltar à sua média em ${stats.label.toLowerCase()} poupa cerca de R$ ${brl(stats.excess)} por mês.`
  return `${advice} Voltar à média poupa cerca de R$ ${brl(stats.excess)} por mês.`
}

// Prompt só com o nome da categoria — nenhum texto digitado pelo usuário
// (descrições de transações) chega ao modelo.
function buildAdvicePrompt(stats) {
  return {
    system: 'Consultor financeiro pessoal. Responda em português do Brasil com UMA frase prática e específica, '
      + `de no máximo 110 caracteres, para reduzir o gasto da categoria informada. Sem números, sem valores em reais, `
      + 'sem saudações, sem aspas e sem formatação.',
    user: `Categoria: ${stats.label}\nO gasto dos últimos 30 dias está acima da média do usuário. Escreva a dica.`,
  }
}

// Aceita a resposta da IA só se for uma frase curta e sem NENHUM dígito (nem
// "R$ 280", nem "2 vezes") — qualquer número aqui seria inventado, os reais
// são injetados por composeTip. Devolve null pra cair no texto por regra.
function sanitizeAdvice(text) {
  if (typeof text !== 'string') return null
  let s = text.replace(/[*_#`>"“”]/g, '').replace(/\s+/g, ' ').trim()
  if (!s || s.length > MAX_ADVICE_LENGTH) return null
  if (/\d/.test(s)) return null
  if (/R\$/i.test(s)) return null
  if (!/[.!?]$/.test(s)) s += '.'
  return s
}

module.exports = {
  HISTORY_DAYS, DAY_MS, WINDOW_DAYS, BASELINE_WINDOWS, MIN_PCT, MIN_EXCESS,
  computeWeeklyTipStats, composeTip, buildAdvicePrompt, sanitizeAdvice,
}
