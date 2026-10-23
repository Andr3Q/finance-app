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
const { parse }      = require('csv-parse/sync')
const { sendPushToUser } = require('../services/pushService')
const { dashboardLimiter } = require('../middleware/rateLimiter')

const { UUID_REGEX, MAX_AMOUNT, CATEGORY_LABELS, VALID_CATEGORIES, TRANSACTION_PLAN_LIMITS } = require('../utils/constants')
const { nowBrasilia, partsBrasilia, parseDateInput, computeFixedCostsStatus } = require('../utils/helpers')
const { reportError } = require('../lib/sentry')
const { buildMonthlyRecap, computeMonthMetrics, shiftMonth } = require('../services/monthlyRecap')
const { HISTORY_DAYS, DAY_MS, computeWeeklyTipStats } = require('../services/weeklyTip')

const router = express.Router()

// Prisma retorna Decimal como string — normaliza para number antes de enviar ao cliente
const normalizeTx = (t) => ({ ...t, amount: Number(t.amount) })

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
    const { month, year } = nowBrasilia()

    // Busca dados do usuário, contas fixas e transações do mês
    const [transactions, budgets, user] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: req.userId, month, year, archived: false }
      }),
      prisma.budget.findMany({ where: { userId: req.userId } }),
      prisma.user.findUnique({ where: { id: req.userId } })
    ])

    const totalExpenses   = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0)
    const totalIncome     = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0)
    const totalFixedCosts = budgets.reduce((sum, b) => sum + Number(b.amount), 0)

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

    // Só desconta de totalAvailable as contas fixas AINDA NÃO pagas este mês
    // (sem transação com budgetId vinculado) — ver computeFixedCostsStatus.
    const legacyAllLaunched = user.autoLaunchMonth === month && user.autoLaunchYear === year
    const { unpaidFixedCosts, unpaidBudgetIds } = computeFixedCostsStatus({ budgets, transactions, legacyAllLaunched })
    const salary       = Number(user.salary)
    const totalAvailable = salary + totalIncome - unpaidFixedCosts

    const currentBalance = totalAvailable - totalExpenses
    const percentUsed    = totalAvailable > 0 ? Math.round((totalExpenses / totalAvailable) * 100) : 0

    res.json({
      salary,
      totalIncome,
      totalFixedCosts,
      unpaidFixedCosts,
      unpaidBudgetIds,
      totalExpenses,
      totalAvailable,
      currentBalance,
      percentUsed,
      autoLaunched: unpaidFixedCosts === 0,   // informa o frontend se não há conta fixa pendente
      month,
      year
    })
  } catch (error) {
    reportError(error, { tag: 'Erro no summary' })
    res.status(500).json({ error: 'Erro ao calcular resumo.' })
  }
})

// ── GET /transactions/dashboard ────────────────────────
// Endpoint unificado: retorna summary + transactions + limits em 1 chamada
// Substitui as 3 chamadas separadas do Dashboard (3 round trips → 1)
router.get('/dashboard', dashboardLimiter, async (req, res) => {
  try {
    const { month, year } = nowBrasilia()

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

    const totalExpenses   = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    const totalIncome     = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const totalFixedCosts = budgets.reduce((s, b) => s + Number(b.amount), 0)
    const legacyAllLaunched = user.autoLaunchMonth === month && user.autoLaunchYear === year
    const { unpaidFixedCosts, unpaidBudgetIds } = computeFixedCostsStatus({ budgets, transactions, legacyAllLaunched })
    const salary          = Number(user.salary)
    const totalAvailable  = salary + totalIncome - unpaidFixedCosts
    const currentBalance  = totalAvailable - totalExpenses
    const percentUsed     = totalAvailable > 0 ? Math.round((totalExpenses / totalAvailable) * 100) : 0

    res.json({
      summary: {
        salary, totalIncome, totalFixedCosts, unpaidFixedCosts, unpaidBudgetIds,
        totalExpenses, totalAvailable, currentBalance, percentUsed,
        autoLaunched: unpaidFixedCosts === 0, month, year,
      },
      transactions: transactions.map(normalizeTx),
      limits: limits.map(l => ({ ...l, amount: Number(l.amount) })),
      budgets: budgets.map(b => ({ ...b, amount: Number(b.amount) })),
    })
  } catch (err) {
    reportError(err, { tag: 'Erro no dashboard' })
    res.status(500).json({ error: 'Erro ao carregar dashboard.' })
  }
})

// ── GET /transactions/monthly-history ──────────────────
// Retorna resumo de receitas e despesas dos últimos N meses
// Query: ?months=6 (padrão 6, máx 12)
// Inclui as transações ARQUIVADAS: o fechamento do mês arquiva as dele, e um histórico que as
// ignorasse zeraria justamente os meses já fechados. Além de income/expenses, cada mês traz o
// `saved` (resultado do mês) pela MESMA fórmula do resumo em stories e do cartão do Extrato
// (salário + entradas − contas fixas não pagas − saídas), pra os números baterem entre as telas.
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
    const [txs, budgets, user] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId: req.userId,
          OR: [
            { year: { gt: startSlot.year } },
            { year: startSlot.year, month: { gte: startSlot.month } },
          ],
        },
        select: { type: true, amount: true, month: true, year: true, budgetId: true, category: true },
      }),
      prisma.budget.findMany({ where: { userId: req.userId }, select: { id: true, amount: true } }),
      prisma.user.findUnique({ where: { id: req.userId }, select: { salary: true } }),
    ])

    const byMonth = {}
    txs.forEach(t => {
      const key = `${t.year}-${t.month}`
      ;(byMonth[key] = byMonth[key] || []).push(t)
    })

    const salary = Number(user?.salary || 0)
    res.json(slots.map(s => {
      const m = computeMonthMetrics({ transactions: byMonth[`${s.year}-${s.month}`] || [], budgets, salary })
      return { ...s, income: m.totalIncome, expenses: m.totalExpenses, saved: m.balance, active: m.active }
    }))
  } catch (err) {
    reportError(err, { tag: 'Erro no histórico mensal' })
    res.status(500).json({ error: 'Erro ao carregar histórico.' })
  }
})

// ── GET /transactions/subscriptions ────────────────────
// Detecta gastos recorrentes nos últimos 3 meses.
//
// ?strict=1 (story "Dicas IA", que afirma "N assinaturas somam R$ X/mês"; só
// plano Elite, como o detector de assinaturas da página de planos):
// devolve só o que se parece com assinatura de verdade — sem contas fixas
// (aluguel, luz... pagas por budgetId ou category 'fixed'), no máximo UMA
// cobrança por mês e valor estável (±10%). Sem isso, "Mercado" lançado todo
// mês ou o aluguel virariam "assinatura". Nesse modo inclui também meses
// já fechados (archived), senão quem usa o fechamento mensal nunca teria os
// 2 meses necessários. Sem o parâmetro, o comportamento é o de sempre.
const SUBSCRIPTION_MAX_VARIATION = 0.1

router.get('/subscriptions', dashboardLimiter, async (req, res) => {
  try {
    const strict = req.query.strict === '1' || req.query.strict === 'true'
    // A detecção automática de assinaturas é um recurso do plano Elite (página
    // de planos) — a story "Dicas IA" a usa, então o modo strict respeita o
    // mesmo plano, no servidor. Quem não é Elite recebe lista vazia (a story
    // simplesmente não mostra o slide), sem erro nem modal de upgrade.
    if (strict && req.userPlan !== 'elite') return res.json([])
    const now    = new Date()
    const start  = new Date(now.getFullYear(), now.getMonth() - 2, 1)

    const txs = await prisma.transaction.findMany({
      where: {
        userId:   req.userId,
        type:     'expense',
        ...(strict ? {} : { archived: false }),
        OR: [
          { year: { gt: start.getFullYear() } },
          { year: start.getFullYear(), month: { gte: start.getMonth() + 1 } },
        ],
      },
      select: { description: true, amount: true, category: true, month: true, year: true, date: true, budgetId: true },
      orderBy: { date: 'desc' },
    })

    // Agrupa por descrição normalizada
    const groups = {}
    txs.forEach(t => {
      const key = t.description.trim().toLowerCase()
      if (!groups[key]) groups[key] = { description: t.description, category: t.category, amounts: [], months: new Set(), perMonth: {}, fixedLinked: false, lastDate: t.date }
      groups[key].amounts.push(Number(t.amount))
      groups[key].months.add(`${t.year}-${t.month}`)
      groups[key].perMonth[`${t.year}-${t.month}`] = (groups[key].perMonth[`${t.year}-${t.month}`] || 0) + 1
      if (t.budgetId || t.category === 'fixed') groups[key].fixedLinked = true
      if (new Date(t.date) > new Date(groups[key].lastDate)) groups[key].lastDate = t.date
    })

    // Filtra: mínimo 2 meses distintos (e, no modo strict, o que parece assinatura)
    const looksLikeSubscription = (g) => {
      if (g.fixedLinked) return false
      if (Object.values(g.perMonth).some(c => c > 1)) return false
      const avg = g.amounts.reduce((s, a) => s + a, 0) / g.amounts.length
      return avg > 0 && (Math.max(...g.amounts) - Math.min(...g.amounts)) / avg <= SUBSCRIPTION_MAX_VARIATION
    }
    const subscriptions = Object.values(groups)
      .filter(g => g.months.size >= 2)
      .filter(g => !strict || looksLikeSubscription(g))
      .map(g => {
        const avg = g.amounts.reduce((s, a) => s + a, 0) / g.amounts.length
        return { description: g.description, amount: Math.round(avg * 100) / 100, category: g.category, occurrences: g.amounts.length, months: g.months.size, lastDate: g.lastDate }
      })
      .sort((a, b) => b.amount - a.amount)

    res.json(subscriptions)
  } catch (err) {
    reportError(err, { tag: 'Erro nas assinaturas' })
    res.status(500).json({ error: 'Erro ao detectar assinaturas.' })
  }
})

// ── GET /transactions/monthly-recap ────────────────────
// Dados do "Resumo em stories" (tela 09). ?offset=0 (mês atual) até -11.
// Diferente do monthly-history, inclui transações ARQUIVADAS (meses já
// fechados) — é justamente o mês passado que o resumo costuma mostrar.
router.get('/monthly-recap', dashboardLimiter, async (req, res) => {
  try {
    const offset = req.query.offset === undefined ? 0 : Number(req.query.offset)
    if (!Number.isInteger(offset) || offset > 0 || offset < -11)
      return res.status(400).json({ error: 'offset deve ser um inteiro entre -11 e 0.' })

    const target = shiftMonth(nowBrasilia(), offset)

    const [transactions, budgets, goals, user] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: req.userId, year: { gte: target.year - 1 } },
        select: { type: true, amount: true, category: true, month: true, year: true, budgetId: true },
      }),
      prisma.budget.findMany({ where: { userId: req.userId }, select: { id: true, amount: true } }),
      prisma.goal.findMany({ where: { userId: req.userId }, select: { title: true, targetAmount: true, currentAmount: true } }),
      prisma.user.findUnique({ where: { id: req.userId }, select: { salary: true } }),
    ])
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

    res.json(buildMonthlyRecap({ target, transactions, budgets, goals, salary: Number(user.salary) }))
  } catch (err) {
    reportError(err, { tag: 'Erro no resumo mensal' })
    res.status(500).json({ error: 'Erro ao montar o resumo.' })
  }
})

// ── GET /transactions/weekly-tip-available ─────────────
// A "Dica da Nancy IA" só existe quando há base de comparação (gasto nos últimos 30 dias E em algum dos 3 períodos anteriores,
// com alguma categoria passando dos limites). O Início e as Notificações usam isto pra só anunciar a dica (anel do story, aviso)
// quando ela existe — antes anunciavam sempre e o story abria vazio ("Ainda sem dicas por aqui"). Só a conta, sem IA e sem
// passar pelo limite de mensagens do chat (GET /agent/weekly-tip faz parte dele).
router.get('/weekly-tip-available', dashboardLimiter, async (req, res) => {
  try {
    const now = new Date()
    const expenses = await prisma.transaction.findMany({
      where:  { userId: req.userId, type: 'expense', date: { gte: new Date(now.getTime() - HISTORY_DAYS * DAY_MS) } },
      select: { category: true, amount: true, date: true },
    })
    res.json({ available: computeWeeklyTipStats(expenses, now) !== null })
  } catch (err) {
    reportError(err, { tag: 'Erro na disponibilidade da dica' })
    res.status(500).json({ error: 'Erro ao verificar a dica.' })
  }
})

// ── GET /transactions ───────────────────────────────────
// Lista transações do mês com suporte a paginação.
// Query params: ?page=1&limit=100&month=5&year=2026
router.get('/', dashboardLimiter, async (req, res) => {
  try {
    const nowBrt = nowBrasilia()
    const month  = req.query.month ? parseInt(req.query.month) : nowBrt.month
    const year   = req.query.year  ? parseInt(req.query.year)  : nowBrt.year

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
      data: data.map(normalizeTx),
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
router.post('/', dashboardLimiter, async (req, res) => {
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

    const { month: currentMonth, year: currentYear } = nowBrasilia()

    // Verifica limite de plano e cria a transação atomicamente para evitar race condition
    // (dois requests simultâneos poderiam ambos passar na verificação antes de qualquer insert)
    let transaction
    try {
      transaction = await prisma.$transaction(async (tx) => {
        const userData = await tx.user.findUnique({
          where:  { id: req.userId },
          select: {
            plan: true,
            _count: { select: { transactions: { where: { month: currentMonth, year: currentYear, archived: false } } } }
          }
        })
        const txCount = userData._count.transactions
        if (req.userPlan === 'free' && txCount >= 20) {
          const err = new Error('Limite de 20 transações por mês atingido no plano Gratuito.')
          err.limitReached = true
          err.plan = 'free'
          throw err
        }
        if (req.userPlan === 'pro' && txCount >= 35) {
          const err = new Error('Limite de 35 transações por mês atingido no plano Pro.')
          err.limitReached = true
          err.plan = 'pro'
          throw err
        }
        return tx.transaction.create({
          data: {
            description: (description || '').substring(0, 255),
            amount:      parsedAmount,
            type,
            category,
            month:       currentMonth,
            year:        currentYear,
            userId:      req.userId
          }
        })
      })
    } catch (err) {
      if (err.limitReached) {
        return res.status(403).json({ error: err.message, limitReached: true, plan: err.plan })
      }
      throw err
    }

    // Envia push notification (não bloqueia a resposta)
    setImmediate(async () => {
      try {
        const [expenses, incomes, user, budgets] = await Promise.all([
          prisma.transaction.aggregate({ where: { userId: req.userId, type: 'expense', month: currentMonth, year: currentYear, archived: false }, _sum: { amount: true } }),
          prisma.transaction.aggregate({ where: { userId: req.userId, type: 'income',  month: currentMonth, year: currentYear, archived: false }, _sum: { amount: true } }),
          prisma.user.findUnique({ where: { id: req.userId }, select: { salary: true, notifBudgetAlert: true, budgetAlertMonth: true, budgetAlertYear: true } }),
          prisma.budget.aggregate({ where: { userId: req.userId }, _sum: { amount: true } }),
        ])
        const totalExpenses  = Number(expenses._sum.amount || 0)
        const totalIncomes   = Number(incomes._sum.amount  || 0)
        const totalFixed     = Number(budgets._sum.amount  || 0)
        const balance        = (Number(user.salary) + totalIncomes) - totalFixed - totalExpenses
        const balanceFmt     = balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        const amountFmt      = parsedAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
        const catLabel       = CATEGORY_LABELS[category] || category
        const descLabel      = description ? ` — ${description}` : ''

        await sendPushToUser(req.userId, {
          title: type === 'income' ? '💰 Entrada registrada' : '💸 Gasto registrado',
          body:  `${type === 'income' ? '+' : '−'}R$ ${amountFmt} em ${catLabel}${descLabel}\nSaldo: R$ ${balanceFmt}`,
          url:   '/dashboard',
        })

        // Alerta de limite de categoria (apenas para despesas com limite configurado)
        if (type === 'expense') {
          const limit = await prisma.categoryLimit.findUnique({
            where: { userId_category: { userId: req.userId, category } },
          })
          // "Alerta de limite" (Preferências) desliga também o aviso por categoria; sem a preferência carregada, avisa
          if (limit && Number(limit.amount) > 0 && user?.notifBudgetAlert !== false) {
            const catTotal = await prisma.transaction.aggregate({
              where:  { userId: req.userId, type: 'expense', category, month: currentMonth, year: currentYear, archived: false },
              _sum:   { amount: true },
            })
            const spent    = Number(catTotal._sum.amount || 0)
            const limitAmt = Number(limit.amount)
            const pct      = spent / limitAmt
            const spentFmt = spent.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
            const limitFmt = limitAmt.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

            if (pct >= 1) {
              await sendPushToUser(req.userId, {
                title: `🚨 Limite de ${catLabel} atingido`,
                body:  `Você gastou R$ ${spentFmt} de R$ ${limitFmt} (100%).`,
                url:   '/transactions',
              })
            } else if (pct >= 0.8) {
              const pctLabel = Math.round(pct * 100)
              await sendPushToUser(req.userId, {
                title: `⚠️ ${pctLabel}% do limite de ${catLabel}`,
                body:  `R$ ${spentFmt} gastos de R$ ${limitFmt} neste mês.`,
                url:   '/transactions',
              })
            }
          }

          // Alerta de orçamento geral: 80% do salário + entradas gastos no mês (1x por mês)
          if (user?.notifBudgetAlert) {
            const alreadySent = user.budgetAlertMonth === currentMonth && user.budgetAlertYear === currentYear
            if (!alreadySent) {
              const monthlyIncome = (Number(user.salary) || 0) + totalIncomes
              if (monthlyIncome > 0 && totalExpenses / monthlyIncome >= 0.8) {
                await prisma.user.update({
                  where: { id: req.userId },
                  data:  { budgetAlertMonth: currentMonth, budgetAlertYear: currentYear },
                })
                const pct      = Math.round((totalExpenses / monthlyIncome) * 100)
                const expFmt   = totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                await sendPushToUser(req.userId, {
                  title: `⚠️ ${pct}% do orçamento mensal usado`,
                  body:  `Você gastou R$ ${expFmt} este mês. Fique de olho!`,
                  url:   '/dashboard',
                })
              }
            }
          }
        }
      } catch (e) { reportError(e, { tag: 'Push error' }) }
    })

    res.status(201).json(normalizeTx(transaction))
  } catch (error) {
    reportError(error, { tag: 'Erro ao criar transação' })
    res.status(500).json({ error: 'Erro ao registrar transação.' })
  }
})

// ── PUT /transactions/:id ───────────────────────────────
router.put('/:id', dashboardLimiter, async (req, res) => {
  const { id } = req.params
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'ID inválido.' })

  const { description, amount, type, category, date } = req.body
  const data = {}

  if (description !== undefined) data.description = String(description).slice(0, 255).trim()

  if (amount !== undefined) {
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0 || n > MAX_AMOUNT) {
      return res.status(400).json({ error: 'Valor inválido.' })
    }
    data.amount = n
  }

  if (type !== undefined) {
    if (!['expense', 'income'].includes(type)) return res.status(400).json({ error: 'Tipo inválido.' })
    data.type = type
  }

  if (category !== undefined) {
    if (!VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'Categoria inválida.' })
    data.category = category
  }

  if (date !== undefined) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]*)?$/.test(date)) {
      return res.status(400).json({ error: 'Data inválida. Use o formato YYYY-MM-DD.' })
    }
    const d = parseDateInput(date)
    if (!d) return res.status(400).json({ error: 'Data inválida.' })
    const { month, year } = partsBrasilia(d)
    data.date  = d
    data.month = month
    data.year  = year
  }

  if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar.' })

  try {
    // updateMany com userId + archived garante que o usuário só edita a própria transação
    // (padrão idêntico ao deleteMany abaixo — sem findFirst separado)
    const result = await prisma.transaction.updateMany({
      where: { id, userId: req.userId, archived: false },
      data,
    })
    if (result.count === 0) return res.status(404).json({ error: 'Transação não encontrada.' })

    const updated = await prisma.transaction.findUnique({ where: { id } })
    res.json(normalizeTx(updated))
  } catch (error) {
    reportError(error, { tag: 'Erro ao atualizar transação' })
    res.status(500).json({ error: 'Erro ao atualizar transação.' })
  }
})

// ── DELETE /transactions/:id ────────────────────────────
// Remove uma transação pelo ID (apenas se pertencer ao usuário)
router.delete('/:id', dashboardLimiter, async (req, res) => {
  const { id } = req.params
  if (!UUID_REGEX.test(id)) return res.status(400).json({ error: 'ID inválido.' })
  try {
    // deleteMany com userId evita findFirst prévio — 1 query em vez de 2
    // userId na where garante que um usuário nunca apaga transação alheia
    const result = await prisma.transaction.deleteMany({ where: { id, userId: req.userId } })
    if (result.count === 0) return res.status(404).json({ error: 'Transação não encontrada.' })
    res.json({ message: 'Transação removida com sucesso.' })
  } catch (error) {
    reportError(error, { tag: 'Erro ao remover transação' })
    res.status(500).json({ error: 'Erro ao remover transação.' })
  }
})

// ── POST /transactions/auto-launch ─────────────────────
// Lança as contas fixas AINDA PENDENTES como transações do mês atual —
// "pendente" = sem nenhuma transação com budgetId vinculado neste mês/ano.
// Isso inclui contas já pagas individualmente antes (botão "Marcar como
// paga" ou chat de IA, ver services/budgetPayment.js) — essas são puladas,
// nunca lançadas de novo. Antes disso, este endpoint lançava TODAS as contas
// incondicionalmente na primeira chamada do mês (controlado só por uma flag
// global autoLaunchMonth/Year no User), então uma conta paga individualmente
// ANTES de clicar "Lançar agora" sempre duplicava — bug real relatado por
// testadores beta e confirmado em QA.
router.post('/auto-launch', dashboardLimiter, async (req, res) => {
  try {
    const { month, year } = nowBrasilia()

    const [budgets, paidBudgetIds] = await Promise.all([
      prisma.budget.findMany({ where: { userId: req.userId } }),
      prisma.transaction.findMany({
        where:  { userId: req.userId, month, year, budgetId: { not: null } },
        select: { budgetId: true },
      }).then(rows => new Set(rows.map(r => r.budgetId))),
    ])

    if (budgets.length === 0) {
      return res.status(400).json({ error: 'Nenhuma conta fixa cadastrada. Adicione em Configurações.' })
    }

    let budgetsToLaunch = budgets.filter(b => !paidBudgetIds.has(b.id))
    if (budgetsToLaunch.length === 0) {
      return res.json({ message: 'Todas as contas fixas já foram pagas este mês.', alreadyLaunched: true })
    }

    // Verifica limite de transações/mês do plano antes de criar
    const planLimit = TRANSACTION_PLAN_LIMITS[req.userPlan]
    if (planLimit) {
      const currentCount = await prisma.transaction.count({
        where: { userId: req.userId, month, year, archived: false }
      })
      const remaining = planLimit - currentCount
      if (remaining <= 0) {
        return res.status(403).json({
          error: `Limite de ${planLimit} transações por mês atingido. Não foi possível lançar as contas fixas.`,
          limitReached: true,
          plan: req.userPlan,
        })
      }
      if (budgetsToLaunch.length > remaining) budgetsToLaunch = budgetsToLaunch.slice(0, remaining)
    }

    // createMany insere N contas em 1 round trip ao banco (vs N inserts individuais).
    // skipDuplicates é a rede de segurança contra corrida (2 requests simultâneos
    // decidindo "essa conta ainda não foi paga" ao mesmo tempo) — a constraint única
    // [budgetId, month, year] do schema barra a 2ª tentativa pra mesma conta, e
    // skipDuplicates faz isso silenciosamente em vez de derrubar o lote inteiro.
    const result = await prisma.transaction.createMany({
      skipDuplicates: true,
      data: budgetsToLaunch.map(b => ({
        description: b.name,
        amount:      b.amount,
        type:        'expense',
        category:    'fixed',
        budgetId:    b.id,
        month,
        year,
        userId:      req.userId,
      })),
    })

    res.json({
      message:         `✅ ${result.count} ${result.count === 1 ? 'conta fixa lançada' : 'contas fixas lançadas'} com sucesso!`,
      count:           result.count,
      alreadyLaunched: false,
    })
  } catch (error) {
    reportError(error, { tag: 'Erro no auto-launch' })
    res.status(500).json({ error: 'Erro ao lançar contas fixas.' })
  }
})

// ── POST /transactions/import ───────────────────────────
// Importa transações de um arquivo CSV (ex: extrato bancário)

// Detecta o separador decimal em vez de assumir sempre pt-BR — um CSV com
// decimal americano ("1234.56") teria o ponto removido pela lógica antiga
// e o valor virava 100x maior (123456), silenciosamente, sem erro.
function parseCsvAmount(raw) {
  let s = raw.toString().replace('R$', '').trim()
  const lastComma = s.lastIndexOf(',')
  const lastDot   = s.lastIndexOf('.')

  if (lastComma === -1 && lastDot === -1) return parseFloat(s)

  if (lastComma > lastDot) {
    // ',' é o separador mais à direita → decimal pt-BR ("1.234,56"). '.' = milhar.
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    // '.' é o separador mais à direita (ou único). 3 dígitos após ele = milhar
    // pt-BR sem decimais ("1.234" → 1234); qualquer outra contagem = decimal ("1234.56").
    const digitsAfter = s.length - lastDot - 1
    s = digitsAfter === 3 ? s.replace(/\./g, '') : s.replace(/,/g, '')
  }
  return parseFloat(s)
}

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

router.post('/import', dashboardLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' })
    }

    const fileContent  = req.file.buffer.toString('utf-8')
    const now          = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear  = now.getFullYear()

    // Plano Free: plan + count em 1 query
    const userData = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: {
        plan: true,
        _count: { select: { transactions: { where: { month: currentMonth, year: currentYear, archived: false } } } }
      }
    })
    let importLimit = null
    if (req.userPlan === 'free' || req.userPlan === 'pro') {
      const planLimit    = req.userPlan === 'pro' ? 35 : 20
      const currentCount = userData._count.transactions
      if (currentCount >= planLimit) {
        return res.status(403).json({
          error: `Limite de ${planLimit} transações por mês atingido.`,
          limitReached: true,
          plan: userData.plan
        })
      }
      importLimit = planLimit - currentCount
    }

    // Versão síncrona — elimina o mixing de callback+async que causava
    // bug de "headers already sent" quando a Promise rejeitava dentro do callback
    let records
    try {
      records = parse(fileContent, {
        columns:          true,
        skip_empty_lines: true,
        delimiter:        [',', ';'],
      })
    } catch {
      return res.status(400).json({ error: 'Erro ao processar o arquivo CSV.' })
    }

    const MAX_CSV_ROWS = 500
    if (records.length > MAX_CSV_ROWS) {
      return res.status(400).json({ error: `O arquivo CSV deve ter no máximo ${MAX_CSV_ROWS} transações.` })
    }

    const transactions = []
    for (const record of records) {
      if (importLimit !== null && transactions.length >= importLimit) break

      const description = (
        record['Descrição'] || record['Historico'] || record['description'] ||
        record['HISTÓRICO'] || record['Detalhes'] || 'Importação'
      )
      const amountRaw = record['Valor'] || record['amount'] || record['VALOR'] || record['Lançamento'] || '0'
      const amount    = parseCsvAmount(amountRaw)

      if (!isNaN(amount) && amount !== 0 && Math.abs(amount) <= MAX_AMOUNT) {
        transactions.push({
          description: String(description).replace(/[\x00-\x1F\x7F]/g, ' ').trim().substring(0, 255) || 'Importação',
          amount:      Math.abs(amount),
          type:        amount > 0 ? 'income' : 'expense',
          category:    'other',
          month:       currentMonth,
          year:        currentYear,
          userId:      req.userId,
        })
      }
    }

    if (transactions.length === 0) {
      return res.status(400).json({ error: 'Nenhuma transação válida encontrada no arquivo.' })
    }

    await prisma.transaction.createMany({ data: transactions })
    res.json({
      message: `✅ ${transactions.length} transações importadas com sucesso!`,
      count:   transactions.length,
    })

  } catch (error) {
    reportError(error, { tag: 'Erro na importação' })
    res.status(500).json({ error: 'Erro ao importar extrato.' })
  }
})

module.exports = router
