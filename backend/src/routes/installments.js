const express        = require('express')
const router         = express.Router()
const { PrismaClient } = require('@prisma/client')
const authMiddleware = require('../middleware/auth')

const prisma = new PrismaClient()

function nowBrasilia() {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: 'numeric',
  }).formatToParts(new Date())
  const get = (type) => parseInt(parts.find(p => p.type === type).value)
  return { month: get('month'), year: get('year') }
}

router.use(authMiddleware)

// GET /installments
router.get('/', async (req, res) => {
  try {
    const plans = await prisma.installmentPlan.findMany({
      where:   { userId: req.userId },
      orderBy: { createdAt: 'asc' },
    })
    res.json(plans)
  } catch (err) {
    console.error('Erro ao listar parcelamentos:', err)
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
    res.status(201).json(plan)
  } catch (err) {
    console.error('Erro ao criar parcelamento:', err)
    res.status(500).json({ error: 'Erro ao criar parcelamento.' })
  }
})

// PATCH /installments/:id/pay — marca próxima parcela como paga e cria transação
router.patch('/:id/pay', async (req, res) => {
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

    const [updated] = await prisma.$transaction([
      prisma.installmentPlan.update({
        where: { id: plan.id },
        data:  { paidInstallments: nextPaid },
      }),
      prisma.transaction.create({
        data: {
          description: `${plan.name} (${nextPaid}/${plan.totalInstallments})`,
          amount:      plan.amount,
          type:        'expense',
          category:    'fixed',
          month,
          year,
          userId:      req.userId,
        },
      }),
    ])

    res.json(updated)
  } catch (err) {
    console.error('Erro ao pagar parcela:', err)
    res.status(500).json({ error: 'Erro ao registrar pagamento.' })
  }
})

// DELETE /installments/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await prisma.installmentPlan.deleteMany({
      where: { id: req.params.id, userId: req.userId },
    })
    if (result.count === 0) return res.status(404).json({ error: 'Parcelamento não encontrado.' })
    res.json({ message: 'Parcelamento removido.' })
  } catch (err) {
    console.error('Erro ao remover parcelamento:', err)
    res.status(500).json({ error: 'Erro ao remover parcelamento.' })
  }
})

module.exports = router
