const express        = require('express')
const Groq           = require('groq-sdk')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')

const router = express.Router()
router.use(authMiddleware)

const CATEGORY_LABELS = {
  food:'Alimentação', shopping:'Shopping', transport:'Transporte',
  health:'Saúde', leisure:'Lazer', education:'Educação',
  home:'Casa', income:'Entrada Extra', other:'Outros',
}

const VALID_CATEGORIES = Object.keys(CATEGORY_LABELS)
const MAX_TOOL_ITERATIONS = 5

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description: 'Busca as transações do usuário no mês atual ou num mês específico.',
      parameters: {
        type: 'object',
        properties: {
          month: { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Mês (1-12). Null para mês atual.' },
          year:  { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Ano. Null para ano atual.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_summary',
      description: 'Retorna o resumo financeiro: saldo, entradas, saídas, orçamento e contas fixas.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_transaction',
      description: 'Cria uma nova transação quando o usuário pedir para registrar um gasto ou entrada.',
      parameters: {
        type: 'object',
        properties: {
          type:        { type: 'string', enum: ['expense','income'] },
          amount:      { type: 'number', description: 'Valor positivo em reais.' },
          category:    { type: 'string', enum: VALID_CATEGORIES },
          description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          date:        { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'YYYY-MM-DD. Null para hoje.' },
        },
        required: ['type', 'amount', 'category'],
      },
    },
  },
]

async function runTool(name, args, userId) {
  if (name === 'get_transactions') {
    const now   = new Date()
    const month = (args.month != null && args.month > 0) ? Number(args.month) : (now.getMonth() + 1)
    const year  = (args.year  != null && args.year  > 0) ? Number(args.year)  : now.getFullYear()

    if (month < 1 || month > 12) return { error: 'Mês inválido. Use 1-12.' }

    const start = new Date(year, month - 1, 1)
    const end   = new Date(year, month, 0, 23, 59, 59)
    const txs   = await prisma.transaction.findMany({
      where: { userId, date: { gte: start, lte: end } },
      orderBy: { date: 'desc' },
    })
    return txs.map(t => ({
      id: t.id, type: t.type, amount: t.amount,
      category: t.category,
      categoryLabel: CATEGORY_LABELS[t.category] || t.category,
      description: t.description,
      date: t.date.toISOString().slice(0, 10),
    }))
  }

  if (name === 'get_summary') {
    const now   = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    const [txs, budgets, user] = await Promise.all([
      prisma.transaction.findMany({ where: { userId, date: { gte: start, lte: end } } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { salary: true, plan: true } }),
    ])
    const totalIncome   = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const totalExpenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const fixedTotal    = budgets.reduce((s, b) => s + b.amount, 0)
    const salary        = user?.salary || 0
    return {
      month: now.getMonth() + 1, year: now.getFullYear(),
      salary, totalIncome, totalExpenses, fixedTotal,
      balance: salary + totalIncome - fixedTotal - totalExpenses,
      transactionCount: txs.length, plan: user?.plan,
      budgets: budgets.map(b => ({ name: b.name, amount: b.amount })),
    }
  }

  if (name === 'create_transaction') {
    const amount = Number(args.amount)
    if (!amount || amount <= 0)    return { error: 'Valor inválido.' }
    if (!['expense','income'].includes(args.type)) return { error: 'Tipo inválido.' }
    if (!VALID_CATEGORIES.includes(args.category)) return { error: 'Categoria inválida.' }

    let date = new Date()
    if (args.date) {
      const parsed = new Date(args.date)
      if (!isNaN(parsed)) date = parsed
    }

    const tx = await prisma.transaction.create({
      data: {
        userId, type: args.type, amount,
        category: args.category,
        description: args.description || null,
        date,
      },
    })
    return {
      success: true, id: tx.id,
      message: `Transação criada: ${args.type === 'income' ? '+' : '-'}R$ ${amount.toFixed(2)} em ${CATEGORY_LABELS[args.category]}`,
    }
  }

  return { error: 'Ferramenta desconhecida.' }
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return []
  return history
    .filter(m => m && typeof m === 'object' && ['user','assistant'].includes(m.role) && typeof m.content === 'string')
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
}

const SYSTEM = `Você é o assistente financeiro pessoal do FinançasPro.
Responda sempre em português, de forma clara e objetiva.
Use as ferramentas disponíveis para buscar os dados reais do usuário — nunca invente números.
Ao analisar gastos, seja específico com valores. Ao criar transações, confirme o que foi registrado.`

// POST /api/agent/chat
router.post('/chat', async (req, res) => {
  if (!process.env.GROQ_API_KEY) {
    return res.status(503).json({ error: 'Agente IA não configurado. Adicione GROQ_API_KEY no .env.' })
  }

  const { message, history } = req.body

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Mensagem vazia.' })
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: 'Mensagem muito longa.' })
  }

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

  const messages = [
    { role: 'system', content: SYSTEM },
    ...sanitizeHistory(history),
    { role: 'user', content: message.trim() },
  ]

  try {
    let response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: 1024,
    })

    let msg        = response.choices[0].message
    let iterations = 0

    // Loop agêntico com limite de iterações para evitar loop infinito
    while (msg.tool_calls?.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
      iterations++
      messages.push(msg)

      for (const call of msg.tool_calls) {
        let args = {}
        try {
          args = JSON.parse(call.function.arguments || '{}')
        } catch {
          args = {}
        }

        let result
        try {
          result = await runTool(call.function.name, args, req.userId)
        } catch (toolErr) {
          console.error(`[AGENT] tool ${call.function.name}:`, toolErr.message)
          result = { error: 'Erro ao buscar dados. Tente novamente.' }
        }

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify(result).slice(0, 8000),
        })
      }

      response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 1024,
      })

      msg = response.choices[0].message
    }

    const reply = msg.content?.trim() || 'Não consegui gerar uma resposta. Tente novamente.'
    res.json({ reply })
  } catch (err) {
    console.error('[AGENT]', err.message)

    if (err.status === 429) {
      return res.status(429).json({ error: 'Muitas requisições. Aguarde alguns segundos e tente novamente.' })
    }
    if (err.status === 401) {
      return res.status(503).json({ error: 'Chave da IA inválida. Verifique o GROQ_API_KEY no .env.' })
    }

    res.status(500).json({ error: 'Erro ao processar mensagem. Tente novamente.' })
  }
})

module.exports = router
