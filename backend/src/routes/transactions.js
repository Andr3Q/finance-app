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
const { sendPushToUser } = require('../services/pushService')
const { dashboardLimiter } = require('../middleware/rateLimiter')

const CATEGORY_LABELS = {
  food:'Alimentação', shopping:'Shopping', transport:'Transporte',
  health:'Saúde', leisure:'Lazer', education:'Educação',
  home:'Casa', income:'Entrada Extra', other:'Outros',
}
const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS)
const MAX_AMOUNT = 999_999_999.99

const router = express.Router()

// Aplica autenticação em TODAS as rotas deste arquivo
router.use(authMiddleware)

// ── GET /transactions/summary ───────────────────────────
// Calcula o resumo financeiro do mês atual:
// - Total de entradas (income)
// - Total de gastos (expense)
// - Saldo disponível (salário + entradas - contas fixas - gastos)
// - Percentual do orçamento usado
router.get('/summary', dashboardLimiter, async (req, res) => {
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

// ── GET /transactions/dashboard ────────────────────────
// Endpoint unificado: retorna summary + transactions + limits em 1 chamada
// Substitui as 3 chamadas separadas do Dashboard (3 round trips → 1)
router.get('/dashboard', dashboardLimiter, async (req, res) => {
  try {
    const now   = new Date()
    const month = now.getMonth() + 1
    const year  = now.getFullYear()

    const [transactions, budgets, user, limits] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: req.userId, month, year, archived: false },
        orderBy: { date: 'desc' }
      }),
      prisma.budget.findMany({ where: { userId: req.userId } }),
      prisma.user.findUnique({ where: { id: req.userId } }),
      prisma.categoryLimit.findMany({ where: { userId: req.userId } }),
    ])

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

    const totalExpenses   = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const totalIncome     = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const totalFixedCosts = budgets.reduce((s, b) => s + b.amount, 0)
    const autoLaunched    = user.autoLaunchMonth === month && user.autoLaunchYear === year
    const totalAvailable  = autoLaunched
      ? user.salary + totalIncome
      : user.salary + totalIncome - totalFixedCosts
    const currentBalance  = totalAvailable - totalExpenses
    const percentUsed     = totalAvailable > 0 ? Math.round((totalExpenses / totalAvailable) * 100) : 0

    res.json({
      summary: { salary: user.salary, totalIncome, totalFixedCosts, totalExpenses, totalAvailable, currentBalance, percentUsed, autoLaunched, month, year },
      transactions,
      limits,
    })
  } catch (err) {
    console.error('Erro no dashboard:', err)
    res.status(500).json({ error: 'Erro ao carregar dashboard.' })
  }
})

// ── GET /transactions/monthly-history ──────────────────
// Retorna resumo de receitas e despesas dos últimos N meses
// Query: ?months=6 (padrão 6, máx 12)
router.get('/monthly-history', dashboardLimiter, async (req, res) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months) || 6, 1), 12)
    const now    = new Date()

    // Monta lista dos meses desejados
    const slots = []
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      slots.push({ month: d.getMonth() + 1, year: d.getFullYear() })
    }

    const startSlot = slots[0]
    const txs = await prisma.transaction.findMany({
      where: {
        userId: req.userId,
        archived: false,
        OR: [
          { year: { gt: startSlot.year } },
          { year: startSlot.year, month: { gte: startSlot.month } },
        ],
      },
      select: { type: true, amount: true, month: true, year: true },
    })

    const map = {}
    slots.forEach(s => { map[`${s.year}-${s.month}`] = { ...s, income: 0, expenses: 0 } })
    txs.forEach(t => {
      const key = `${t.year}-${t.month}`
      if (map[key]) {
        if (t.type === 'income') map[key].income   += Number(t.amount)
        else                     map[key].expenses += Number(t.amount)
      }
    })

    res.json(Object.values(map))
  } catch (err) {
    console.error('Erro no histórico mensal:', err)
    res.status(500).json({ error: 'Erro ao carregar histórico.' })
  }
})

// ── GET /transactions/subscriptions ────────────────────
// Detecta gastos recorrentes nos últimos 3 meses
router.get('/subscriptions', dashboardLimiter, async (req, res) => {
  try {
    const now   = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1)

    const txs = await prisma.transaction.findMany({
      where: {
        userId:   req.userId,
        type:     'expense',
        archived: false,
        OR: [
          { year: { gt: start.getFullYear() } },
          { year: start.getFullYear(), month: { gte: start.getMonth() + 1 } },
        ],
      },
      select: { description: true, amount: true, category: true, month: true, year: true, date: true },
      orderBy: { date: 'desc' },
    })

    // Agrupa por descrição normalizada
    const groups = {}
    txs.forEach(t => {
      const key = t.description.trim().toLowerCase()
      if (!groups[key]) groups[key] = { description: t.description, category: t.category, amounts: [], months: new Set(), lastDate: t.date }
      groups[key].amounts.push(Number(t.amount))
      groups[key].months.add(`${t.year}-${t.month}`)
      if (new Date(t.date) > new Date(groups[key].lastDate)) groups[key].lastDate = t.date
    })

    // Filtra: mínimo 2 meses distintos
    const subscriptions = Object.values(groups)
      .filter(g => g.months.size >= 2)
      .map(g => {
        const avg = g.amounts.reduce((s, a) => s + a, 0) / g.amounts.length
        return { description: g.description, amount: Math.round(avg * 100) / 100, category: g.category, occurrences: g.amounts.length, months: g.months.size, lastDate: g.lastDate }
      })
      .sort((a, b) => b.amount - a.amount)

    res.json(subscriptions)
  } catch (err) {
    console.error('Erro nas assinaturas:', err)
    res.status(500).json({ error: 'Erro ao detectar assinaturas.' })
  }
})

// ── GET /transactions ───────────────────────────────────
// Lista transações do mês com suporte a paginação.
// Query params: ?page=1&limit=100&month=5&year=2026
router.get('/', dashboardLimiter, async (req, res) => {
  try {
    const now   = new Date()
    const month = req.query.month ? parseInt(req.query.month) : now.getMonth() + 1
    const year  = req.query.year  ? parseInt(req.query.year)  : now.getFullYear()

    if (month < 1 || month > 12 || !Number.isInteger(month)) {
      return res.status(400).json({ error: 'Mês inválido (1-12).' })
    }
    if (year < 1900 || year > 2100 || !Number.isInteger(year)) {
      return res.status(400).json({ error: 'Ano inválido.' })
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1)
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100))
    const skip  = (page - 1) * limit

    const where = { userId: req.userId, month, year, archived: false }

    const [data, total] = await Promise.all([
      prisma.transaction.findMany({ where, orderBy: { date: 'desc' }, skip, take: limit }),
      prisma.transaction.count({ where }),
    ])

    res.json({
      data,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      hasMore: skip + data.length < total,
    })
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
    if (parsedAmount > MAX_AMOUNT) {
      return res.status(400).json({ error: 'Valor excede o limite permitido.' })
    }
    if (!type || !category) {
      return res.status(400).json({ error: 'Tipo e categoria são obrigatórios.' })
    }
    if (!['expense', 'income'].includes(type)) {
      return res.status(400).json({ error: 'Tipo deve ser "expense" ou "income".' })
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Categoria inválida.' })
    }
    if (description !== undefined && (typeof description !== 'string' || description.length > 255)) {
      return res.status(400).json({ error: 'Descrição deve ter no máximo 255 caracteres.' })
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

    // Envia push notification (não bloqueia a resposta)
    setImmediate(async () => {
      try {
        const [expenses, incomes, user, budgets] = await Promise.all([
          prisma.transaction.aggregate({ where: { userId: req.userId, type: 'expense', month: now.getMonth()+1, year: now.getFullYear(), archived: false }, _sum: { amount: true } }),
          prisma.transaction.aggregate({ where: { userId: req.userId, type: 'income',  month: now.getMonth()+1, year: now.getFullYear(), archived: false }, _sum: { amount: true } }),
          prisma.user.findUnique({ where: { id: req.userId }, select: { salary: true } }),
          prisma.budget.aggregate({ where: { userId: req.userId }, _sum: { amount: true } }),
        ])
        const totalExpenses  = expenses._sum.amount || 0
        const totalIncomes   = incomes._sum.amount  || 0
        const totalFixed     = budgets._sum.amount  || 0
        const balance        = (user.salary + totalIncomes) - totalFixed - totalExpenses
        const balanceFmt     = balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        const amountFmt      = parsedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        const catLabel       = CATEGORY_LABELS[category] || category
        const descLabel      = description ? ` — ${description}` : ''

        await sendPushToUser(req.userId, {
          title: type === 'income' ? '💰 Entrada registrada' : '💸 Gasto registrado',
          body:  `${type === 'income' ? '+' : '−'}R$ ${amountFmt} em ${catLabel}${descLabel}\nSaldo: R$ ${balanceFmt}`,
          url:   '/dashboard',
        })
      } catch (e) { console.error('Push error:', e.message) }
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

    await prisma.transaction.delete({ where: { id, userId: req.userId } })
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
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel']
    if (!allowed.includes(file.mimetype) && !file.originalname.endsWith('.csv')) {
      return cb(new Error('Apenas arquivos CSV são permitidos.'))
    }
    cb(null, true)
  }
})

router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' })
    }

    const fileContent = req.file.buffer.toString('utf-8')

    // Plano Free: verifica o espaço restante antes de importar
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear  = now.getFullYear()
    const userPlan = await prisma.user.findUnique({ where: { id: req.userId }, select: { plan: true } })
    let freeLimit = null
    if (userPlan.plan === 'free') {
      const count = await prisma.transaction.count({
        where: { userId: req.userId, month: currentMonth, year: currentYear, archived: false }
      })
      if (count >= 30) {
        return res.status(403).json({
          error: 'Limite de 30 transações por mês atingido no plano Gratuito.',
          limitReached: true,
          plan: 'free'
        })
      }
      freeLimit = 30 - count
    }

    parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      delimiter: [',', ';']
    }, async (err, records) => {
      if (err) {
        return res.status(400).json({ error: 'Erro ao processar o arquivo CSV.' })
      }

      const MAX_CSV_ROWS = 500
      if (records.length > MAX_CSV_ROWS) {
        return res.status(400).json({ error: `O arquivo CSV deve ter no máximo ${MAX_CSV_ROWS} transações.` })
      }

      const transactions = []

      for (const record of records) {
        if (freeLimit !== null && transactions.length >= freeLimit) break

        const description = record['Descrição'] || record['Historico'] || record['description'] || record['HISTÓRICO'] || record['Detalhes'] || 'Importação'
        let amountStr = record['Valor'] || record['amount'] || record['VALOR'] || record['Lançamento'] || '0'

        amountStr = amountStr.toString().replace('R$', '').replace(/\./g, '').replace(',', '.').trim()
        const amount = parseFloat(amountStr)

        if (!isNaN(amount) && amount !== 0) {
          transactions.push({
            description: description.substring(0, 255),
            amount: Math.abs(amount),
            type: amount > 0 ? 'income' : 'expense',
            category: 'other',
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
