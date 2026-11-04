// ═══════════════════════════════════════════════════════
// src/services/purchaseBase.js — "A Nancy está usando" do Analisador de compras (tela 38 do desktop)
//
// Os números do usuário que a análise cruza com o valor da compra: renda, contas fixas, parcelas em andamento, gasto variável
// médio, o que sobra por mês e o saldo. Só leitura e conta pura: nada de modelo de IA — o nome "IA" é do design.
// ═══════════════════════════════════════════════════════

const { shiftMonth, computeMonthMetrics } = require('./monthlyRecap')
const { INSTALLMENT_TX } = require('./sheet')

const round2 = (n) => Math.round(n * 100) / 100
const PREVIOUS_MONTHS = 3 // quantos meses fechados entram na média do gasto variável

// o gasto "variável" é o que não é conta fixa e não é parcela paga (a parcela já entra em "Parcelas atuais")
const isVariable = (t) => t.type === 'expense' && t.category !== 'fixed' && !t.budgetId && !INSTALLMENT_TX.test(t.description || '')

// primeiro mês que a rota precisa buscar
function baseWindow(now) {
  return shiftMonth(now, -PREVIOUS_MONTHS)
}

/**
 * @param {object} p
 * @param {{month:number,year:number}} p.now
 * @param {Array}  p.transactions   desde baseWindow(now), com as arquivadas ({ type, category, amount, description, month, year, budgetId, archived })
 * @param {Array}  p.budgets        contas fixas atuais ({ id, amount, endDate })
 * @param {Array}  p.installments   parcelamentos ({ amount, totalInstallments, paidInstallments })
 * @param {number} p.salary
 * @param {boolean} [p.legacyAllLaunched]  mesma regra do Início (computeFixedCostsStatus)
 */
function buildPurchaseBase({ now, transactions, budgets, installments, salary, legacyAllLaunched = false }) {
  const nowIdx = now.year * 12 + (now.month - 1)
  const inMonth = (t, ym) => t.month === ym.month && t.year === ym.year
  const current = transactions.filter(t => inMonth(t, now) && !t.archived)

  // ── mês atual: o mesmo resumo e a mesma nota do Início, para o saldo e a saúde baterem com o que a pessoa vê lá ──
  const metrics = computeMonthMetrics({ transactions: current, budgets, salary, legacyAllLaunched })
  const balance = metrics.balance
  const score = metrics.score ?? 0 // sem base (nada disponível no mês) a nota é a mais baixa

  // ── contas fixas: as que ainda valem neste mês (conta com prazo some depois do mês final) ──
  const fixedTotal = budgets
    .filter(b => {
      if (!b.endDate) return true
      const end = new Date(b.endDate)
      return end.getUTCFullYear() * 12 + end.getUTCMonth() >= nowIdx
    })
    .reduce((s, b) => s + Number(b.amount), 0)

  // ── parcelas: o que ainda está sendo pago por mês ──
  const installmentsMonthly = installments
    .filter(p => p.paidInstallments < p.totalInstallments)
    .reduce((s, p) => s + Number(p.amount), 0)

  // ── gasto variável médio: dos meses FECHADOS com movimento (o mês atual, no começo, subestimaria); sem histórico, o que já saiu neste mês ──
  const previous = []
  for (let i = 1; i <= PREVIOUS_MONTHS; i++) {
    const ym = shiftMonth(now, -i)
    const txs = transactions.filter(t => inMonth(t, ym))
    if (txs.length > 0) previous.push(txs.filter(isVariable).reduce((s, t) => s + Number(t.amount), 0))
  }
  const hasHistory = previous.length > 0
  const variableAvg = hasHistory
    ? previous.reduce((s, v) => s + v, 0) / previous.length
    : current.filter(isVariable).reduce((s, t) => s + Number(t.amount), 0)

  // sobra mensal média; nunca zero (a análise divide por ela)
  const leftover = Math.max(1, salary - fixedTotal - installmentsMonthly - variableAvg)

  return {
    income: round2(salary),
    fixedTotal: round2(fixedTotal),
    installmentsMonthly: round2(installmentsMonthly),
    variableAvg: round2(variableAvg),
    monthlyCost: round2(fixedTotal + variableAvg),
    leftover: round2(leftover),
    balance: round2(balance),
    score,
    hasHistory,
  }
}

module.exports = { buildPurchaseBase, baseWindow }
