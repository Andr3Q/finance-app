// Contas do Início (tela 08) que não existiam antes do redesenho. Puras, pra serem
// testáveis sem montar a tela. `summary` é o da rota /transactions/dashboard.

// Selo "+8,4% no mês": quanto o saldo disponível cresceu (ou encolheu) neste mês em
// relação ao início dele — salário menos as contas fixas reservadas. Sem salário
// informado não há base de comparação (retorna null: o selo some, nunca inventa).
export function monthGrowthPct(summary) {
  if (!summary) return null
  const start = (summary.salary || 0) - (summary.totalFixedCosts || 0)
  if (!(start > 0)) return null
  return ((summary.currentBalance - start) / start) * 100
}

// Banner "No ritmo atual, você termina outubro com R$ X sobrando": extrapola o gasto
// VARIÁVEL do mês (o que não é conta fixa já paga) até o último dia. É uma conta
// simples, sem IA — vale pra todos os planos. Só com 3+ dias de mês e algum
// movimento: antes disso o ritmo seria ruído. Arredondado a centavos.
export function projectedBalance(summary, day, daysInMonth) {
  if (!summary) return null
  if (day < 3 || (summary.totalExpenses || 0) + (summary.totalIncome || 0) <= 0) return null
  const paidFixed     = Math.max(0, (summary.totalFixedCosts || 0) - (summary.unpaidFixedCosts || 0))
  const variableSpent = Math.max(0, (summary.totalExpenses || 0) - paidFixed)
  const projected     = summary.currentBalance - (variableSpent / day) * (daysInMonth - day)
  return Math.round(projected * 100) / 100
}
