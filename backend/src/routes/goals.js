const express        = require('express')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { sendPushToUser } = require('../services/pushService')

const router = express.Router()
router.use(authMiddleware)

const { UUID_REGEX, HEX_COLOR } = require('../utils/constants')

const normalizeGoal = (g) => ({ ...g, targetAmount: Number(g.targetAmount), currentAmount: Number(g.currentAmount) })

function validId(id) { return UUID_REGEX.test(id) }

router.get('/', async (req, res) => {
  try {
    const goals = await prisma.goal.findMany({
      where:   { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    })
    res.json(goals.map(normalizeGoal))
  } catch {
    res.status(500).json({ error: 'Erro ao listar metas.' })
  }
})

const MAX_AMOUNT = 999_999_999.99
const MAX_TITLE  = 80

router.post('/', async (req, res) => {
  try {
    const { title, targetAmount, currentAmount, color, deadline } = req.body
    if (!title || typeof title !== 'string' || !title.trim())
      return res.status(400).json({ error: 'Título é obrigatório.' })
    if (title.trim().length > MAX_TITLE)
      return res.status(400).json({ error: `Título deve ter no máximo ${MAX_TITLE} caracteres.` })
    const parsed = parseFloat(targetAmount)
    if (!parsed || parsed <= 0)
      return res.status(400).json({ error: 'Valor-alvo deve ser maior que zero.' })
    if (parsed > MAX_AMOUNT)
      return res.status(400).json({ error: 'Valor-alvo muito alto.' })
    const parsedCurrent = Math.max(0, parseFloat(currentAmount) || 0)
    if (parsedCurrent > MAX_AMOUNT)
      return res.status(400).json({ error: 'Valor atual muito alto.' })
    if (color !== undefined && !HEX_COLOR.test(color))
      return res.status(400).json({ error: 'Cor inválida. Use formato #RRGGBB.' })
    if (deadline !== undefined && deadline !== null && deadline !== '') {
      if (isNaN(new Date(deadline).getTime()))
        return res.status(400).json({ error: 'Data de prazo inválida.' })
    }

    // Verificação de plano: Free = 1 meta, Pro = 4, Elite = ilimitado
    const userData = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { plan: true, _count: { select: { goals: true } } },
    })
    const count = userData?._count.goals ?? 0
    if (req.userPlan === 'free' && count >= 1) {
      return res.status(403).json({
        error: 'Crie mais metas com o plano Pro ou Elite.',
        limitReached: true,
        plan: 'free',
      })
    }
    if (req.userPlan === 'pro' && count >= 4) {
      return res.status(403).json({
        error: 'Limite de 4 metas atingido no plano Pro.',
        limitReached: true,
        plan: 'pro',
      })
    }

    const goal = await prisma.goal.create({
      data: {
        title:         title.trim(),
        targetAmount:  parsed,
        currentAmount: parsedCurrent,
        color:         HEX_COLOR.test(color) ? color : '#4ac46e',
        deadline:      deadline ? new Date(deadline) : null,
        userId:        req.userId,
      },
    })
    res.status(201).json(normalizeGoal(goal))
  } catch {
    res.status(500).json({ error: 'Erro ao criar meta.' })
  }
})

router.patch('/:id', async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ error: 'ID inválido.' })

  // Pre-fetch para detectar conclusão de meta
  let prevGoal = null
  try {
    prevGoal = await prisma.goal.findUnique({
      where:  { id: req.params.id, userId: req.userId },
      select: { currentAmount: true, targetAmount: true, title: true },
    })
  } catch {}

  const { title, targetAmount, currentAmount, color, deadline } = req.body
  const data = {}

  if (title !== undefined) {
    const t = String(title).trim()
    if (t.length === 0)       return res.status(400).json({ error: 'Título não pode ser vazio.' })
    if (t.length > MAX_TITLE) return res.status(400).json({ error: `Título deve ter no máximo ${MAX_TITLE} caracteres.` })
    data.title = t
  }

  if (targetAmount !== undefined) {
    const v = parseFloat(targetAmount)
    if (isNaN(v) || v <= 0) return res.status(400).json({ error: 'Valor-alvo inválido.' })
    if (v > MAX_AMOUNT) return res.status(400).json({ error: 'Valor-alvo muito alto.' })
    data.targetAmount = v
  }

  if (currentAmount !== undefined) {
    const v = parseFloat(currentAmount)
    if (isNaN(v) || v < 0) return res.status(400).json({ error: 'Valor atual inválido.' })
    if (v > MAX_AMOUNT) return res.status(400).json({ error: 'Valor atual muito alto.' })
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

  if (Object.keys(data).length === 0)
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' })

  try {
    const updated = await prisma.goal.update({
      where: { id: req.params.id, userId: req.userId },
      data,
    })
    res.json(normalizeGoal(updated))

    if (prevGoal && Number(updated.targetAmount) > 0 && Number(prevGoal.targetAmount) > 0) {
      const prevPct = Number(prevGoal.currentAmount) / Number(prevGoal.targetAmount)
      const newPct  = Number(updated.currentAmount)  / Number(updated.targetAmount)
      const title   = updated.title || prevGoal.title

      if (prevPct < 0.5 && newPct >= 0.5 && newPct < 1) {
        sendPushToUser(req.userId, {
          title: '🎯 Metade do caminho!',
          body:  `Você já chegou a 50% da meta "${title}". Continue assim!`,
          url:   '/goals',
        }).catch(() => {})
      } else if (prevPct < 0.75 && newPct >= 0.75 && newPct < 1) {
        sendPushToUser(req.userId, {
          title: '🚀 Quase lá!',
          body:  `Falta pouco! Você atingiu 75% da meta "${title}".`,
          url:   '/goals',
        }).catch(() => {})
      } else if (prevPct < 1 && newPct >= 1) {
        sendPushToUser(req.userId, {
          title: '🏆 Meta concluída!',
          body:  `Parabéns! Você atingiu sua meta "${title}".`,
          url:   '/goals',
        }).catch(() => {})
      }
    }
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Meta não encontrada.' })
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
