const express        = require('express')
const router         = express.Router()
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')

const { UUID_REGEX } = require('../utils/constants')
const { nowBrasilia } = require('../utils/helpers')

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

    const updated = await prisma.installmentPlan.update({
      where: { id: plan.id },
      data:  { paidInstallments: nextPaid },
    })

    res.json(updated)
  } catch (err) {
    console.error('Erro ao pagar parcela:', err)
    res.status(500).json({ error: 'Erro ao registrar pagamento.' })
  }
})

// PATCH /installments/:id/unpay — desfaz a última parcela paga
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

    const updated = await prisma.installmentPlan.update({
      where: { id: plan.id },
      data:  { paidInstallments: plan.paidInstallments - 1 },
    })
    res.json(updated)
  } catch (err) {
    console.error('Erro ao desfazer parcela:', err)
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
    console.error('Erro ao remover parcelamento:', err)
    res.status(500).json({ error: 'Erro ao remover parcelamento.' })
  }
})

module.exports = router
