// ═══════════════════════════════════════════════════════
// 🏠 src/routes/budget.js — Contas Fixas Mensais
//
// Gerencia as contas fixas do usuário (aluguel, luz, etc.)
// e também permite atualizar o salário.
//
// Rotas (todas protegidas por JWT):
//   GET    /budget         → Lista todas as contas fixas
//   POST   /budget         → Adiciona nova conta fixa
//   PUT    /budget/:id     → Atualiza uma conta fixa
//   DELETE /budget/:id     → Remove uma conta fixa
//   PUT    /budget/salary  → Atualiza o salário mensal
// ═══════════════════════════════════════════════════════

const express        = require('express')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')

const { UUID_REGEX, MAX_AMOUNT, VALID_CATEGORIES } = require('../utils/constants')

const router = express.Router()

router.use(authMiddleware)

// ── GET /budget ─────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const budgets = await prisma.budget.findMany({
      where:   { userId: req.userId },
      orderBy: { name: 'asc' }
    })
    res.json(budgets)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar contas fixas.' })
  }
})

// ── POST /budget ────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, amount, dueDay } = req.body

    const parsedAmount = parseFloat(amount)
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Nome é obrigatório.' })
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Nome deve ter no máximo 100 caracteres.' })
    }
    if (!isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero.' })
    }
    if (parsedAmount > MAX_AMOUNT) {
      return res.status(400).json({ error: 'Valor excede o limite permitido.' })
    }
    if (dueDay !== undefined && dueDay !== null) {
      const parsedDueDay = parseInt(dueDay, 10)
      if (!Number.isInteger(parsedDueDay) || parsedDueDay < 1 || parsedDueDay > 31) {
        return res.status(400).json({ error: 'Dia de vencimento deve ser entre 1 e 31.' })
      }
    }

    // Limite do plano Free: plan + count em 1 query (evita 2 round trips)
    const userData = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { plan: true, _count: { select: { budgets: true } } }
    })
    if (userData?.plan === 'free' && userData._count.budgets >= 15) {
      return res.status(403).json({
        error: 'Limite de 15 contas fixas atingido no plano Gratuito.',
        limitReached: true,
        plan: 'free'
      })
    }
    if (userData?.plan === 'pro' && userData._count.budgets >= 35) {
      return res.status(403).json({
        error: 'Limite de 35 contas fixas atingido no plano Pro.',
        limitReached: true,
        plan: 'pro'
      })
    }

    const createData = { name: name.trim(), amount: parsedAmount, userId: req.userId }
    if (dueDay !== undefined && dueDay !== null) createData.dueDay = parseInt(dueDay, 10)

    const budget = await prisma.budget.create({ data: createData })
    res.status(201).json(budget)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar conta fixa.' })
  }
})

// ── PUT /budget/salary ──────────────────────────────────
// Atualiza o salário — deve vir ANTES do /:id para não conflitar
router.put('/salary', async (req, res) => {
  try {
    const { salary } = req.body

    const parsed = parseFloat(salary)
    if (!isFinite(parsed) || parsed < 0) {
      return res.status(400).json({ error: 'Salário inválido.' })
    }
    if (parsed > 999_999_999.99) {
      return res.status(400).json({ error: 'Salário excede o limite permitido.' })
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data:  { salary: parsed }
    })
    res.json({ salary: user.salary })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar salário.' })
  }
})

// ── PUT /budget/:id ─────────────────────────────────────
router.put('/:id', async (req, res) => {
  const { id } = req.params
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'ID inválido.' })

  const { name, amount, dueDay } = req.body
  const updateData = {}

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      return res.status(400).json({ error: 'Nome inválido.' })
    }
    updateData.name = name.trim()
  }
  if (amount !== undefined) {
    const parsed = parseFloat(amount)
    if (!isFinite(parsed) || parsed <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero.' })
    }
    if (parsed > MAX_AMOUNT) {
      return res.status(400).json({ error: 'Valor excede o limite permitido.' })
    }
    updateData.amount = parsed
  }
  if (dueDay !== undefined) {
    if (dueDay === null) {
      updateData.dueDay = null
    } else {
      const parsedDueDay = parseInt(dueDay, 10)
      if (!Number.isInteger(parsedDueDay) || parsedDueDay < 1 || parsedDueDay > 31) {
        return res.status(400).json({ error: 'Dia de vencimento deve ser entre 1 e 31.' })
      }
      updateData.dueDay = parsedDueDay
    }
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
  }

  try {
    // update com userId na where = ownership check + update em 1 query (sem findFirst prévio)
    const budget = await prisma.budget.update({ where: { id, userId: req.userId }, data: updateData })
    res.json(budget)
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Conta fixa não encontrada.' })
    console.error('Erro ao atualizar conta fixa:', err)
    res.status(500).json({ error: 'Erro ao atualizar conta fixa.' })
  }
})

// ── DELETE /budget/:id ──────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'ID inválido.' })
  try {
    // deleteMany com userId = ownership check em 1 query (sem findFirst prévio)
    const result = await prisma.budget.deleteMany({ where: { id, userId: req.userId } })
    if (result.count === 0) return res.status(404).json({ error: 'Conta fixa não encontrada.' })
    res.json({ message: 'Conta fixa removida.' })
  } catch (error) {
    console.error('Erro ao remover conta fixa:', error)
    res.status(500).json({ error: 'Erro ao remover conta fixa.' })
  }
})

// ── GET /budget/category-limits ────────────────────────
// Lista todos os limites por categoria do usuário
router.get('/category-limits', async (req, res) => {
  try {
    const limits = await prisma.categoryLimit.findMany({ where: { userId: req.userId } })
    res.json(limits)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar limites.' })
  }
})

// ── POST /budget/category-limits ───────────────────────
// Cria ou atualiza o limite de uma categoria (upsert)
router.post('/category-limits', async (req, res) => {
  try {
    const { category, amount } = req.body
    if (!category || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Categoria e valor são obrigatórios.' })
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Categoria inválida.' })
    }
    const parsedCatAmount = parseFloat(amount)
    if (!isFinite(parsedCatAmount) || parsedCatAmount <= 0) {
      return res.status(400).json({ error: 'Valor deve ser maior que zero.' })
    }
    if (parsedCatAmount > MAX_AMOUNT) {
      return res.status(400).json({ error: 'Valor excede o limite permitido.' })
    }

    // Limites por categoria são exclusivos do plano Pro
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { plan: true } })
    if (user.plan === 'free') {
      return res.status(403).json({
        error: 'Limites por categoria são exclusivos do plano Pro.',
        limitReached: true,
        plan: 'free'
      })
    }
    // upsert = cria se não existe, atualiza se já existe
    const limit = await prisma.categoryLimit.upsert({
      where:  { userId_category: { userId: req.userId, category } },
      update: { amount: parsedCatAmount },
      create: { category, amount: parsedCatAmount, userId: req.userId }
    })
    res.json(limit)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar limite.' })
  }
})

// ── DELETE /budget/category-limits/:category ────────────
// Remove o limite de uma categoria
router.delete('/category-limits/:category', async (req, res) => {
  try {
    if (!VALID_CATEGORIES.includes(req.params.category)) {
      return res.status(400).json({ error: 'Categoria inválida.' })
    }
    await prisma.categoryLimit.deleteMany({
      where: { userId: req.userId, category: req.params.category }
    })
    res.json({ message: 'Limite removido.' })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover limite.' })
  }
})

module.exports = router
