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
        month: date.getMonth() + 1,
        year:  date.getFullYear(),
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
  const filtered = history
    .filter(m => m && typeof m === 'object' && ['user','assistant'].includes(m.role) && typeof m.content === 'string')
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
  // Descarta mensagens mais antigas se contexto total for muito grande
  const totalChars = filtered.reduce((s, m) => s + m.content.length, 0)
  if (totalChars > 12000) return filtered.slice(-4)
  return filtered
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

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

// ── POST /api/agent/predict ─────────────────────────────
// Previsão curta (2 frases) sobre o fim do mês
router.post('/predict', async (req, res) => {
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'IA não configurada.' })
  try {
    const now         = new Date()
    const month       = now.getMonth() + 1
    const year        = now.getFullYear()
    const daysInMonth = new Date(year, month, 0).getDate()
    const dayOfMonth  = now.getDate()

    const [txs, budgets, user] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: req.userId, month, year, archived: false },
        select: { type: true, amount: true, category: true },
      }),
      prisma.budget.findMany({ where: { userId: req.userId } }),
      prisma.user.findUnique({ where: { id: req.userId }, select: { salary: true, name: true } }),
    ])

    if (txs.length === 0) return res.json({ prediction: null })

    const totalExpenses  = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    const totalIncome    = txs.filter(t => t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0)
    const salary         = user?.salary || 0
    const fixedCosts     = budgets.reduce((s, b) => s + Number(b.amount), 0)
    const totalAvailable = salary + totalIncome
    const pct            = totalAvailable > 0 ? Math.round(totalExpenses / totalAvailable * 100) : 0

    const byCategory = {}
    txs.filter(t => t.type === 'expense').forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount)
    })
    const topCat = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]

    const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const prompt = `Usuário: ${user?.name || 'usuário'}
Mês: ${MONTHS_PT[month - 1]} ${year} — dia ${dayOfMonth} de ${daysInMonth}
Disponível: R$ ${totalAvailable.toFixed(2)} | Gasto até agora: R$ ${totalExpenses.toFixed(2)} (${pct}%)
Principal categoria de gasto: ${CATEGORY_LABELS[topCat?.[0]] || topCat?.[0] || 'N/A'} (R$ ${topCat?.[1]?.toFixed(2) || '0,00'})

Escreva UMA frase curta e direta prevendo como o usuário vai terminar o mês financeiramente. Sem saudações, sem formatação, apenas a previsão.`

    const response = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages:    [
        { role: 'system', content: 'Consultor financeiro pessoal. Responda em português, máximo 1 frase, sem formatação.' },
        { role: 'user',   content: prompt },
      ],
      max_tokens:  120,
      temperature: 0.6,
    })

    res.json({ prediction: response.choices[0].message.content.trim() })
  } catch (err) {
    console.error('[AGENT/predict]', err.message)
    if (err.status === 429) return res.status(429).json({ error: 'Muitas requisições. Tente em instantes.' })
    res.status(500).json({ error: 'Erro ao gerar previsão.' })
  }
})

// ── POST /api/agent/monthly-report ─────────────────────
// Relatório IA completo do mês (max ~200 palavras)
router.post('/monthly-report', async (req, res) => {
  if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'IA não configurada.' })
  try {
    const now   = new Date()
    const month = Number(req.body?.month) || now.getMonth() + 1
    const year  = Number(req.body?.year)  || now.getFullYear()

    if (month < 1 || month > 12) return res.status(400).json({ error: 'Mês inválido.' })

    const [txs, budgets, user] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: req.userId, month, year, archived: false },
        select: { type: true, amount: true, category: true, description: true },
      }),
      prisma.budget.findMany({ where: { userId: req.userId } }),
      prisma.user.findUnique({ where: { id: req.userId }, select: { salary: true, name: true } }),
    ])

    if (txs.length === 0) return res.json({ report: 'Nenhuma transação registrada neste mês.', month, year })

    const totalExpenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    const totalIncome   = txs.filter(t => t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0)
    const salary        = user?.salary || 0
    const fixedCosts    = budgets.reduce((s, b) => s + Number(b.amount), 0)
    const balance       = salary + totalIncome - fixedCosts - totalExpenses

    const byCategory = {}
    txs.filter(t => t.type === 'expense').forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount)
    })
    const topCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([cat, amt]) => `${CATEGORY_LABELS[cat] || cat}: R$ ${amt.toFixed(2)}`).join(', ')

    const groq   = new Groq({ apiKey: process.env.GROQ_API_KEY })
    const prompt = `Analise ${MONTHS_PT[month - 1]}/${year} de ${user?.name || 'usuário'}:
Salário R$${salary.toFixed(2)} | Fixos R$${fixedCosts.toFixed(2)} | Extras R$${totalIncome.toFixed(2)} | Gasto R$${totalExpenses.toFixed(2)} | Saldo R$${balance.toFixed(2)}
Top gastos: ${topCats}
Transações: ${txs.length}

Gere relatório financeiro em 4 parágrafos curtos (máximo 180 palavras total):
1. Desempenho geral do mês (1-2 frases)
2. Principais gastos e destaques (1-2 frases)
3. Pontos de atenção (1 frase)
4. 2 sugestões práticas para o próximo mês

Sem títulos, sem marcadores, parágrafos separados por linha em branco. Tom direto e amigável.`

    const response = await groq.chat.completions.create({
      model:       'llama-3.3-70b-versatile',
      messages:    [
        { role: 'system', content: 'Consultor financeiro pessoal. Responda em português, estruturado e direto.' },
        { role: 'user',   content: prompt },
      ],
      max_tokens:  450,
      temperature: 0.65,
    })

    res.json({ report: response.choices[0].message.content.trim(), month, year })
  } catch (err) {
    console.error('[AGENT/monthly-report]', err.message)
    if (err.status === 429) return res.status(429).json({ error: 'Muitas requisições. Tente em instantes.' })
    res.status(500).json({ error: 'Erro ao gerar relatório.' })
  }
})

module.exports = router
