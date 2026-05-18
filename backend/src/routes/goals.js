const express        = require('express')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')

const router = express.Router()
router.use(authMiddleware)

router.get('/', async (req, res) => {
  try {
    const goals = await prisma.goal.findMany({
      where:   { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(goals)
  } catch {
    res.status(500).json({ error: 'Erro ao listar metas.' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { title, targetAmount, currentAmount, color, deadline } = req.body
    if (!title || typeof title !== 'string' || !title.trim())
      return res.status(400).json({ error: 'Título é obrigatório.' })
    const parsed = parseFloat(targetAmount)
    if (!parsed || parsed <= 0)
      return res.status(400).json({ error: 'Valor-alvo deve ser maior que zero.' })
    const goal = await prisma.goal.create({
      data: {
        title:         title.trim().slice(0, 80),
        targetAmount:  parsed,
        currentAmount: parseFloat(currentAmount) || 0,
        color:         color || '#4ac46e',
        deadline:      deadline ? new Date(deadline) : null,
        userId:        req.userId,
      },
    })
    res.status(201).json(goal)
  } catch {
    res.status(500).json({ error: 'Erro ao criar meta.' })
  }
})

router.patch('/:id', async (req, res) => {
  try {
    const existing = await prisma.goal.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!existing) return res.status(404).json({ error: 'Meta não encontrada.' })

    const { title, targetAmount, currentAmount, color, deadline } = req.body
    const data = {}
    if (title         !== undefined) data.title         = String(title).trim().slice(0, 80)
    if (targetAmount  !== undefined) data.targetAmount  = parseFloat(targetAmount)
    if (currentAmount !== undefined) data.currentAmount = parseFloat(currentAmount)
    if (color         !== undefined) data.color         = color
    if (deadline      !== undefined) data.deadline      = deadline ? new Date(deadline) : null

    const updated = await prisma.goal.update({ where: { id: req.params.id }, data })
    res.json(updated)
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar meta.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.goal.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!existing) return res.status(404).json({ error: 'Meta não encontrada.' })
    await prisma.goal.delete({ where: { id: req.params.id } })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Erro ao remover meta.' })
  }
})

module.exports = router
