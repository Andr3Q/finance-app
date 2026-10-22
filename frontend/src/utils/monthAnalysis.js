// Análise do mês (Nancy 2, tela 17): contas feitas só com o que o Início já carrega
// (GET /transactions/dashboard: transações do mês + salário e entradas). Função pura.

// Cor de cada categoria nas barras (as cinco primeiras seguem o design)
export const CATEGORY_COLORS = {
  fixed: '#1C48FF', food: '#19C884', transport: '#6FA0FF', shopping: '#0F9D63', health: '#B6C2DC',
  leisure: '#8B7CF6', education: '#F5A524', home: '#4FC3F7', other: '#99A5BE',
}

const FIXED = 'fixed'

/**
 * @param {Array}  transactions transações do mês
 * @param {object} summary      { salary, totalIncome } do dashboard
 * @returns {{ total, variableTotal, base, categories, top, cutTarget }}
 *   categories: [{ category, amount, pctOfBase, barPct }] do maior pro menor
 *   top: maior categoria variável (tudo menos "Contas fixas") com a fatia dos gastos variáveis
 */
export function analyzeMonth(transactions = [], summary = null) {
  const byCat = {}
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    byCat[t.category] = (byCat[t.category] || 0) + Number(t.amount)
  }
  const entries = Object.entries(byCat).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const total         = entries.reduce((s, [, v]) => s + v, 0)
  const variableTotal = entries.filter(([c]) => c !== FIXED).reduce((s, [, v]) => s + v, 0)
  // % de cada categoria sobre a renda do mês (salário + entradas); sem renda cadastrada, sobre os gastos
  const income = Number(summary?.salary || 0) + Number(summary?.totalIncome || 0)
  const base   = income > 0 ? income : total
  const max    = entries.length ? entries[0][1] : 0

  const categories = entries.map(([category, amount]) => ({
    category, amount,
    pctOfBase: base > 0 ? Math.round((amount / base) * 100) : 0,
    barPct:    max > 0 ? Math.max(2, (amount / max) * 100) : 0,
  }))

  const topEntry = entries.find(([c]) => c !== FIXED)
  const top = topEntry ? {
    category: topEntry[0], amount: topEntry[1],
    pctOfVariable: Math.round((topEntry[1] / variableTotal) * 100),
  } : null

  // sugestão de quanto tentar cortar: 15% dos gastos variáveis, em múltiplos de R$ 50 (mínimo 50)
  const cutTarget = variableTotal >= 100 ? Math.max(50, Math.round((variableTotal * 0.15) / 50) * 50) : 0

  return { total, variableTotal, base, categories, top, cutTarget }
}
