// ═══════════════════════════════════════════════════════
// 💳 src/routes/transactions.js — Gastos e Entradas
//
// Gerencia todas as transações financeiras do usuário.
//
// Rotas disponíveis (todas protegidas por JWT):
//   GET    /transactions         → Lista transações do mês atual
//   GET    /transactions/summary → Resumo: saldo, total gasto, etc.
//   POST   /transactions         → Registra novo gasto ou entrada
//   DELETE /transactions/:id     → Remove uma transação
// ═══════════════════════════════════════════════════════

const express          = require('express')
const { PrismaClient } = require('@prisma/client')
const authMiddleware   = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

// Aplica autenticação em TODAS as rotas deste arquivo
router.use(authMiddleware)

// ── GET /transactions/summary ───────────────────────────
// Calcula o resumo financeiro do mês atual:
// - Total de entradas (income)
// - Total de gastos (expense)
// - Saldo disponível (salário + entradas - contas fixas - gastos)
// - Percentual do orçamento usado
router.get('/summary', async (req, res) => {
  try {
    const now   = new Date()
    const month = now.getMonth() + 1  // getMonth() retorna 0-11, então somamos 1
    const year  = now.getFullYear()

    // Busca dados do usuário, contas fixas e transações do mês
    const [transactions, budgets, user] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: req.userId, month, year, archived: false }
      }),
      prisma.budget.findMany({ where: { userId: req.userId } }),
      prisma.user.findUnique({ where: { id: req.userId } })
    ])

    const totalExpenses   = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0)
    const totalIncome     = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0)
    const totalFixedCosts = budgets.reduce((sum, b) => sum + b.amount, 0)

    // Se as contas já foram lançadas como transações este mês,
    // não deduç os orçamentos novamente (evita dupla contagem)
    const autoLaunched = user.autoLaunchMonth === month && user.autoLaunchYear === year
    const totalAvailable = autoLaunched
      ? user.salary + totalIncome                    // fixas já estão em totalExpenses
      : user.salary + totalIncome - totalFixedCosts  // subtrai manualmente se não lançadas

    const currentBalance = totalAvailable - totalExpenses
    const percentUsed    = totalAvailable > 0 ? Math.round((totalExpenses / totalAvailable) * 100) : 0

    res.json({
      salary:         user.salary,
      totalIncome,
      totalFixedCosts,
      totalExpenses,
      totalAvailable,
      currentBalance,
      percentUsed,
      autoLaunched,   // informa o frontend se o lançamento já foi feito
      month,
      year
    })
  } catch (error) {
    console.error('Erro no summary:', error)
    res.status(500).json({ error: 'Erro ao calcular resumo.' })
  }
})

// ── GET /transactions ───────────────────────────────────
// Lista todas as transações do mês atual (não arquivadas)
router.get('/', async (req, res) => {
  try {
    const now   = new Date()
    const month = now.getMonth() + 1
    const year  = now.getFullYear()

    const transactions = await prisma.transaction.findMany({
      where:   { userId: req.userId, month, year, archived: false },
      orderBy: { date: 'desc' }  // Mais recentes primeiro
    })

    res.json(transactions)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao listar transações.' })
  }
})

// ── POST /transactions ──────────────────────────────────
// Registra uma nova transação (gasto ou entrada de dinheiro)
// Body esperado: { description, amount, type, category }
router.post('/', async (req, res) => {
  try {
    const { description, amount, type, category } = req.body

    if (!amount || !type || !category) {
      return res.status(400).json({ error: 'Valor, tipo e categoria são obrigatórios.' })
    }

    if (!['expense', 'income'].includes(type)) {
      return res.status(400).json({ error: 'Tipo deve ser "expense" ou "income".' })
    }

    const now = new Date()

    const transaction = await prisma.transaction.create({
      data: {
        description: description || '',
        amount:      parseFloat(amount),
        type,
        category,
        month:       now.getMonth() + 1,
        year:        now.getFullYear(),
        userId:      req.userId
      }
    })

    res.status(201).json(transaction)
  } catch (error) {
    console.error('Erro ao criar transação:', error)
    res.status(500).json({ error: 'Erro ao registrar transação.' })
  }
})

// ── DELETE /transactions/:id ────────────────────────────
// Remove uma transação pelo ID (apenas se pertencer ao usuário)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    // Verifica se a transação pertence ao usuário logado
    const transaction = await prisma.transaction.findFirst({
      where: { id, userId: req.userId }
    })

    if (!transaction) {
      return res.status(404).json({ error: 'Transação não encontrada.' })
    }

    await prisma.transaction.delete({ where: { id } })
    res.json({ message: 'Transação removida com sucesso.' })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao remover transação.' })
  }
})

// ── POST /transactions/auto-launch ─────────────────────
// Lança todas as contas fixas como transações do mês atual.
// Só executa uma vez por mês (controla pelo autoLaunchMonth/Year no User).
router.post('/auto-launch', async (req, res) => {
  try {
    const now   = new Date()
    const month = now.getMonth() + 1
    const year  = now.getFullYear()

    const user = await prisma.user.findUnique({ where: { id: req.userId } })

    // Verifica se já foi lançado este mês
    if (user.autoLaunchMonth === month && user.autoLaunchYear === year) {
      return res.json({ message: 'Contas fixas já foram lançadas este mês.', alreadyLaunched: true })
    }

    const budgets = await prisma.budget.findMany({ where: { userId: req.userId } })

    if (budgets.length === 0) {
      return res.status(400).json({ error: 'Nenhuma conta fixa cadastrada. Adicione em Configurações.' })
    }

    // Cria uma transação para cada conta fixa
    // A descrição começa com "[Fixa]" para identificação
    const transactions = await Promise.all(
      budgets.map(b => prisma.transaction.create({
        data: {
          description: `[Fixa] ${b.name}`,
          amount:      b.amount,
          type:        'expense',
          category:    'home',
          month,
          year,
          userId:      req.userId
        }
      }))
    )

    // Marca o mês/ano do lançamento no usuário
    await prisma.user.update({
      where: { id: req.userId },
      data:  { autoLaunchMonth: month, autoLaunchYear: year }
    })

    res.json({
      message:      `✅ ${transactions.length} contas fixas lançadas com sucesso!`,
      transactions,
      alreadyLaunched: false
    })
  } catch (error) {
    console.error('Erro no auto-launch:', error)
    res.status(500).json({ error: 'Erro ao lançar contas fixas.' })
  }
})

module.exports = router
