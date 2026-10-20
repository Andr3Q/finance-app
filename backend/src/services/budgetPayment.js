const prisma = require('../lib/prisma')
const { MAX_AMOUNT, TRANSACTION_PLAN_LIMITS } = require('../utils/constants')
const { parseDateInput, nowBrasilia, partsBrasilia } = require('../utils/helpers')

// Registra o pagamento de uma conta fixa (Budget) como uma Transaction
// vinculada (budgetId). Ponto único de verdade dessa regra de negócio —
// usado pelo botão "Marcar como paga" (budget.js) e pela ferramenta de IA
// pay_fixed_bill (agent.js), e também consultado por /transactions/auto-launch
// pra nunca lançar de novo uma conta que já foi paga por um desses dois
// caminhos. Antes disso, cada caminho criava a transação do seu jeito sem
// saber do outro — causa raiz do bug de duplicata relatado por testadores
// beta (pagar pela IA não impedia o "Lançar agora" de criar outra).
async function payBudget({ userId, budgetId, amount, dateStr, effectivePlan }) {
  const budget = await prisma.budget.findFirst({ where: { id: budgetId, userId } })
  if (!budget) return { ok: false, status: 404, error: 'Conta fixa não encontrada.' }

  const parsedAmount = (amount != null) ? Number(amount) : Number(budget.amount)
  if (!isFinite(parsedAmount) || parsedAmount <= 0) return { ok: false, status: 400, error: 'Valor deve ser maior que zero.' }
  if (parsedAmount > MAX_AMOUNT) return { ok: false, status: 400, error: 'Valor excede o limite permitido.' }

  let date, month, year
  if (dateStr) {
    const parsed = parseDateInput(dateStr)
    if (!parsed) return { ok: false, status: 400, error: 'Data inválida. Use YYYY-MM-DD.' }
    date = parsed
    ;({ month, year } = partsBrasilia(parsed))
  } else {
    date = new Date()
    ;({ month, year } = nowBrasilia())
  }

  // Mesma trava usada em create_transaction: mês já fechado (relatório em PDF
  // já enviado) não aceita mais lançamentos retroativos.
  const monthAlreadyClosed = await prisma.transaction.findFirst({
    where:  { userId, month, year, archived: true },
    select: { id: true },
  })
  if (monthAlreadyClosed) {
    return { ok: false, status: 409, error: `O mês ${month}/${year} já foi fechado e não aceita mais lançamentos retroativos.` }
  }

  const alreadyPaid = await prisma.transaction.findFirst({ where: { userId, budgetId, month, year } })
  if (alreadyPaid) {
    return {
      ok: false, status: 409, alreadyPaid: true,
      error: `"${budget.name}" já foi paga este mês (R$ ${Number(alreadyPaid.amount).toFixed(2)} em ${alreadyPaid.date.toISOString().slice(0, 10)}).`,
    }
  }

  const planLimit = TRANSACTION_PLAN_LIMITS[effectivePlan]
  if (planLimit) {
    const count = await prisma.transaction.count({ where: { userId, month, year, archived: false } })
    if (count >= planLimit) {
      return { ok: false, status: 403, limitReached: true, plan: effectivePlan, error: `Limite de ${planLimit} transações por mês atingido.` }
    }
  }

  try {
    const transaction = await prisma.transaction.create({
      data: {
        userId, budgetId,
        type: 'expense', category: 'fixed',
        description: budget.name,
        amount: parsedAmount, date, month, year,
      },
    })
    return { ok: true, transaction, budget }
  } catch (err) {
    // Rede de segurança contra corrida de 2 requests simultâneos — o
    // findFirst acima já cobre o caso comum (clique único, chamada única da
    // IA); isso só pega os dois passando pela checagem ao mesmo tempo.
    // Requer a constraint única [budgetId, month, year] no schema.
    if (err.code === 'P2002') {
      return { ok: false, status: 409, alreadyPaid: true, error: `"${budget.name}" já foi paga este mês.` }
    }
    throw err
  }
}

module.exports = { payBudget }
