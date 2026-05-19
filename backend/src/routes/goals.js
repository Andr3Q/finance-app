const express        = require('express')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')

const router = express.Router()
router.use(authMiddleware)

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_COLOR  = /^#[0-9A-F]{6}$/i

function validId(id) { return UUID_REGEX.test(id) }

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
    if (color !== undefined && !HEX_COLOR.test(color))
      return res.status(400).json({ error: 'Cor inválida. Use formato #RRGGBB.' })
    if (deadline !== undefined && deadline !== null && deadline !== '') {
      if (isNaN(new Date(deadline).getTime()))
        return res.status(400).json({ error: 'Data de prazo inválida.' })
    }
    const goal = await prisma.goal.create({
      data: {
        title:         title.trim().slice(0, 80),
        targetAmount:  parsed,
        currentAmount: Math.max(0, parseFloat(currentAmount) || 0),
        color:         HEX_COLOR.test(color) ? color : '#4ac46e',
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
    if (!validId(req.params.id))
      return res.status(400).json({ error: 'ID inválido.' })

    const existing = await prisma.goal.findFirst({
      where: { id: req.params.id, userId: req.userId },
    })
    if (!existing) return res.status(404).json({ error: 'Meta não encontrada.' })

    const { title, targetAmount, currentAmount, color, deadline } = req.body
    const data = {}

    if (title !== undefined)
      data.title = String(title).trim().slice(0, 80)

    if (targetAmount !== undefined) {
      const v = parseFloat(targetAmount)
      if (isNaN(v) || v <= 0) return res.status(400).json({ error: 'Valor-alvo inválido.' })
      data.targetAmount = v
    }

    if (currentAmount !== undefined) {
      const v = parseFloat(currentAmount)
      if (isNaN(v) || v < 0) return res.status(400).json({ error: 'Valor atual inválido.' })
      data.currentAmount = v
    }

    if (color !== undefined) {
      if (!HEX_COLOR.test(color)) return res.status(400).json({ error: 'Cor inválida. Use formato #RRGGBB.' })
      data.color = color
    }

    if (deadline !== undefined) {
      if (deadline === null || deadline === '') {
        data.deadline = null
      } else {
        const d = new Date(deadline)
        if (isNaN(d.getTime())) return res.status(400).json({ error: 'Data de prazo inválida.' })
        data.deadline = d
      }
    }

    // userId na constraint garante que um usuário nunca edita meta alheia
    const updated = await prisma.goal.update({
      where: { id: req.params.id, userId: req.userId },
      data,
    })
    res.json(updated)
  } catch {
    res.status(500).json({ error: 'Erro ao atualizar meta.' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    if (!validId(req.params.id))
      return res.status(400).json({ error: 'ID inválido.' })

    // userId na constraint garante que um usuário nunca apaga meta alheia
    const deleted = await prisma.goal.deleteMany({
      where: { id: req.params.id, userId: req.userId },
    })
    if (deleted.count === 0)
      return res.status(404).json({ error: 'Meta não encontrada.' })

    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Erro ao remover meta.' })
  }
})

module.exports = router
