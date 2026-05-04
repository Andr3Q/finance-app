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
    const { name, amount } = req.body

    if (!name || !amount) {
      return res.status(400).json({ error: 'Nome e valor são obrigatórios.' })
    }

    const budget = await prisma.budget.create({
      data: { name, amount: parseFloat(amount), userId: req.userId }
    })
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

    if (salary === undefined || salary === null) {
      return res.status(400).json({ error: 'Salário é obrigatório.' })
    }

    const user = await prisma.user.update({
      where: { id: req.userId },
      data:  { salary: parseFloat(salary) }
    })
    res.json({ salary: user.salary })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar salário.' })
  }
})

// ── PUT /budget/:id ─────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id }            = req.params
    const { name, amount }  = req.body

    const existing = await prisma.budget.findFirst({ where: { id, userId: req.userId } })
    if (!existing) return res.status(404).json({ error: 'Conta fixa não encontrada.' })

    const budget = await prisma.budget.update({
      where: { id },
      data:  { name, amount: parseFloat(amount) }
    })
    res.json(budget)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar conta fixa.' })
  }
})

// ── DELETE /budget/:id ──────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const existing = await prisma.budget.findFirst({ where: { id, userId: req.userId } })
    if (!existing) return res.status(404).json({ error: 'Conta fixa não encontrada.' })

    await prisma.budget.delete({ where: { id } })
    res.json({ message: 'Conta fixa removida.' })
  } catch (error) {
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
    if (!category || !amount) {
      return res.status(400).json({ error: 'Categoria e valor são obrigatórios.' })
    }
    // upsert = cria se não existe, atualiza se já existe
    const limit = await prisma.categoryLimit.upsert({
      where:  { userId_category: { userId: req.userId, category } },
      update: { amount: parseFloat(amount) },
      create: { category, amount: parseFloat(amount), userId: req.userId }
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
    await prisma.categoryLimit.deleteMany({
      where: { userId: req.userId, category: req.params.category }
    })
    res.json({ message: 'Limite removido.' })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover limite.' })
  }
})

module.exports = router
