const express        = require('express')
const router         = express.Router()
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')

const { UUID_REGEX } = require('../utils/constants')
const { nowBrasilia } = require('../utils/helpers')
const { reportError } = require('../lib/sentry')

router.use(authMiddleware)

const normalizePlan = (p) => ({ ...p, amount: Number(p.amount) })

// GET /installments
router.get('/', async (req, res) => {
  try {
    const plans = await prisma.installmentPlan.findMany({
      where:   { userId: req.userId },
      orderBy: { createdAt: 'asc' },
    })
    res.json(plans.map(normalizePlan))
  } catch (err) {
    reportError(err, { tag: 'Erro ao listar parcelamentos' })
    res.status(500).json({ error: 'Erro ao carregar parcelamentos.' })
  }
})

// POST /installments
router.post('/', async (req, res) => {
  try {
    const { name, amount, totalInstallments } = req.body

    if (!name || !amount || !totalInstallments) {
      return res.status(400).json({ error: 'Nome, valor e total de parcelas são obrigatórios.' })
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) {
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' })
    }

    const parsedAmount = parseFloat(String(amount).replace(',', '.'))
    const parsedTotal  = parseInt(totalInstallments)

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Valor inválido.' })
    }
    if (isNaN(parsedTotal) || parsedTotal < 2 || parsedTotal > 360) {
      return res.status(400).json({ error: 'Total de parcelas deve ser entre 2 e 360.' })
    }

    if (!['pro', 'elite'].includes(req.userPlan)) {
      return res.status(403).json({ error: 'Parcelamentos são exclusivos do plano Pro.', limitReached: true })
    }

    const existing = await prisma.installmentPlan.count({ where: { userId: req.userId } })
    if (existing >= 50) {
      return res.status(400).json({ error: 'Limite de 50 parcelamentos atingido. Remova os concluídos.' })
    }

    const { month, year } = nowBrasilia()

    const plan = await prisma.installmentPlan.create({
      data: {
        name:              name.trim(),
        amount:            parsedAmount,
        totalInstallments: parsedTotal,
        paidInstallments:  0,
        startMonth:        month,
        startYear:         year,
        userId:            req.userId,
      },
    })
    res.status(201).json(normalizePlan(plan))
  } catch (err) {
    reportError(err, { tag: 'Erro ao criar parcelamento' })
    res.status(500).json({ error: 'Erro ao criar parcelamento.' })
  }
})

// PATCH /installments/:id/pay — marca próxima parcela como paga e cria transação
router.patch('/:id/pay', async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) return res.status(400).json({ error: 'ID inválido.' })
  try {
    const plan = await prisma.installmentPlan.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!plan) return res.status(404).json({ error: 'Parcelamento não encontrado.' })
    if (plan.paidInstallments >= plan.totalInstallments) {
      return res.status(400).json({ error: 'Todas as parcelas já foram pagas.' })
    }

    const nextPaid = plan.paidInstallments + 1
    const { month, year } = nowBrasilia()

    let updatedPlan, transaction
    try {
      ;({ updatedPlan, transaction } = await prisma.$transaction(async (db) => {
        // Claim atômico: só avança se paidInstallments continuar igual ao valor
        // lido acima (lock otimista). Duas requisições concorrentes (duplo
        // clique, retry de rede) partem do mesmo paidInstallments — só a
        // primeira a commitar aqui ganha a corrida; a segunda recebe count:0
        // e aborta ANTES de criar a transação de despesa, evitando duplicata.
        const claim = await db.installmentPlan.updateMany({
          where: { id: plan.id, userId: req.userId, paidInstallments: plan.paidInstallments },
          data:  { paidInstallments: { increment: 1 } },
        })
        if (claim.count === 0) {
          const err = new Error('Parcela já paga por outra requisição.')
          err.code = 'CONCURRENT_PAY'
          throw err
        }

        const transaction = await db.transaction.create({
          data: {
            description: `${plan.name} (parcela ${nextPaid}/${plan.totalInstallments})`,
            amount:      plan.amount,
            type:        'expense',
            category:    'shopping',
            month,
            year,
            userId:      req.userId,
          },
        })
        const updatedPlan = await db.installmentPlan.update({
          where: { id: plan.id },
          data:  { lastTransactionId: transaction.id },
        })
        return { updatedPlan, transaction }
      }))
    } catch (err) {
      if (err.code === 'CONCURRENT_PAY') {
        return res.status(409).json({ error: 'Essa parcela já foi paga em outra requisição. Atualize a página.' })
      }
      throw err
    }

    res.json({ plan: normalizePlan(updatedPlan), transaction: { ...transaction, amount: Number(transaction.amount) } })
  } catch (err) {
    reportError(err, { tag: 'Erro ao pagar parcela' })
    res.status(500).json({ error: 'Erro ao registrar pagamento.' })
  }
})

// PATCH /installments/:id/unpay — desfaz a última parcela paga e remove a transação criada
router.patch('/:id/unpay', async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) return res.status(400).json({ error: 'ID inválido.' })
  try {
    const plan = await prisma.installmentPlan.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!plan) return res.status(404).json({ error: 'Parcelamento não encontrado.' })
    if (plan.paidInstallments === 0) {
      return res.status(400).json({ error: 'Nenhuma parcela paga para desfazer.' })
    }

    // Localiza a transação da parcela ATUAL pela descrição determinística criada em
    // /pay — não pode depender só de lastTransactionId, que guarda o ID do ÚLTIMO
    // pagamento e fica null após o 1º /unpay. Desfazer 2+ parcelas em sequência com
    // a lógica antiga decrementava o contador mas não removia a transação seguinte,
    // deixando-a órfã (e duplicada se a parcela fosse paga de novo depois).
    const targetDescription = `${plan.name} (parcela ${plan.paidInstallments}/${plan.totalInstallments})`
    const txToRemove = await prisma.transaction.findFirst({
      where: {
        userId:      req.userId,
        description: targetDescription,
        category:    'shopping',
        type:        'expense',
      },
      orderBy: { date: 'desc' },
    })

    const ops = [
      prisma.installmentPlan.update({
        where: { id: plan.id },
        data:  { paidInstallments: plan.paidInstallments - 1, lastTransactionId: null },
      }),
    ]
    // Remove a transação encontrada, se existir (deleteMany é safe — não lança erro se não existir)
    if (txToRemove) {
      ops.push(
        prisma.transaction.deleteMany({
          where: { id: txToRemove.id, userId: req.userId },
        })
      )
    }

    const [updated] = await prisma.$transaction(ops)
    res.json(normalizePlan(updated))
  } catch (err) {
    reportError(err, { tag: 'Erro ao desfazer parcela' })
    res.status(500).json({ error: 'Erro ao desfazer parcela.' })
  }
})

// DELETE /installments/:id
router.delete('/:id', async (req, res) => {
  if (!UUID_REGEX.test(req.params.id)) return res.status(400).json({ error: 'ID inválido.' })
  try {
    const result = await prisma.installmentPlan.deleteMany({
      where: { id: req.params.id, userId: req.userId },
    })
    if (result.count === 0) return res.status(404).json({ error: 'Parcelamento não encontrado.' })
    res.json({ message: 'Parcelamento removido.' })
  } catch (err) {
    reportError(err, { tag: 'Erro ao remover parcelamento' })
    res.status(500).json({ error: 'Erro ao remover parcelamento.' })
  }
})

module.exports = router
