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

const express        = require('express')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const multer         = require('multer')
const { parse }      = require('csv-parse')

const router = express.Router()

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

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

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
    const parsedAmount = parseFloat(amount)

    if (!isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Valor deve ser um número maior que zero.' })
    }
    if (!type || !category) {
      return res.status(400).json({ error: 'Tipo e categoria são obrigatórios.' })
    }
    if (!['expense', 'income'].includes(type)) {
      return res.status(400).json({ error: 'Tipo deve ser "expense" ou "income".' })
    }

    // Limite do plano Free: 30 transações por mês
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { plan: true } })
    if (user.plan === 'free') {
      const now = new Date()
      const count = await prisma.transaction.count({
        where: { userId: req.userId, month: now.getMonth() + 1, year: now.getFullYear(), archived: false }
      })
      if (count >= 30) {
        return res.status(403).json({
          error: 'Limite de 30 transações por mês atingido no plano Gratuito.',
          limitReached: true,
          plan: 'free'
        })
      }
    }

    const now = new Date()

    const transaction = await prisma.transaction.create({
      data: {
        description: (description || '').substring(0, 255),
        amount:      parsedAmount,
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

// ── POST /transactions/import ───────────────────────────
// Importa transações de um arquivo CSV (ex: extrato bancário)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } })

router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' })
    }

    const fileContent = req.file.buffer.toString('utf-8')
    
    parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      delimiter: [',', ';']
    }, async (err, records) => {
      if (err) {
        return res.status(400).json({ error: 'Erro ao processar o arquivo CSV.' })
      }

      const transactions = []
      const now = new Date()
      const currentMonth = now.getMonth() + 1
      const currentYear = now.getFullYear()

      for (const record of records) {
        // Tenta inferir os campos comuns em extratos (Data, Descrição, Valor)
        const description = record['Descrição'] || record['Historico'] || record['description'] || record['HISTÓRICO'] || record['Detalhes'] || 'Importação'
        let amountStr = record['Valor'] || record['amount'] || record['VALOR'] || record['Lançamento'] || '0'
        
        // Tratar formato numérico do Brasil (ex: 1.500,00 -> 1500.00)
        amountStr = amountStr.toString().replace('R$', '').replace(/\./g, '').replace(',', '.').trim()
        const amount = parseFloat(amountStr)

        if (!isNaN(amount) && amount !== 0) {
          const type = amount > 0 ? 'income' : 'expense'
          
          transactions.push({
            description: description.substring(0, 255), // Limita tamanho da string
            amount: Math.abs(amount),
            type: type,
            category: 'other', // Categoria padrão
            month: currentMonth,
            year: currentYear,
            userId: req.userId
          })
        }
      }

      if (transactions.length === 0) {
        return res.status(400).json({ error: 'Nenhuma transação válida encontrada no arquivo.' })
      }

      try {
        await prisma.transaction.createMany({ data: transactions })
        res.json({
          message: `✅ ${transactions.length} transações importadas com sucesso!`,
          count: transactions.length
        })
      } catch (saveError) {
        console.error('Erro ao salvar transações do CSV:', saveError)
        if (!res.headersSent) res.status(500).json({ error: 'Erro ao salvar transações.' })
      }
    })

  } catch (error) {
    console.error('Erro na importação:', error)
    res.status(500).json({ error: 'Erro ao importar extrato.' })
  }
})

module.exports = router
