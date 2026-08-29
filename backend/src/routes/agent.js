const express        = require('express')
const multer         = require('multer')
const Groq           = require('groq-sdk')
const { toFile }     = require('groq-sdk')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { transcribeLimiter } = require('../middleware/rateLimiter')
const { CATEGORY_LABELS, VALID_CATEGORIES, MONTHS, UUID_REGEX, MAX_AMOUNT } = require('../utils/constants')
const { nowBrasilia } = require('../utils/helpers')

const router = express.Router()
router.use(authMiddleware)

// ── Modelos ─────────────────────────────────────────────
// Modelo rápido (8B): previsão curta de 1 frase — velocidade importa
// Modelo qualidade (120B): chat + relatório — raciocínio importa
const MODEL_FAST    = 'llama-3.1-8b-instant'
const MODEL_QUALITY = 'openai/gpt-oss-120b'

// ── Singleton do cliente Groq ────────────────────────────
// Criado uma única vez ao carregar o módulo (não a cada requisição).
// timeout: 30s — evita requests penduradas indefinidamente.
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 30_000 })
  : null

function requireGroq(res) {
  if (!groq) {
    res.status(503).json({ error: 'Agente IA não configurado. Adicione GROQ_API_KEY no .env.' })
    return false
  }
  return true
}

// Verifica se o plano do usuário atende ao mínimo exigido.
// Retorna true se OK, false + resposta 403 se insuficiente.
// Usa limitReached:true para o interceptor do frontend não fazer logout.
async function requirePlan(req, res, minimum) {
  const RANKS = { free: 0, pro: 1, elite: 2 }
  const user  = await prisma.user.findUnique({
    where:  { id: req.userId },
    select: { plan: true, planExpiresAt: true, trialEndsAt: true },
  })
  const now          = new Date()
  // Trial expirado: plan='pro', planExpiresAt=null, trialEndsAt=<passado>
  const trialExpired = user?.trialEndsAt && user.trialEndsAt < now && !user.planExpiresAt
  const expired      = (user?.planExpiresAt && user.planExpiresAt < now) || trialExpired
  const plan         = expired ? 'free' : (user?.plan || 'free')
  if ((RANKS[plan] ?? 0) < (RANKS[minimum] ?? 0)) {
    res.status(403).json({
      error:        `Esta funcionalidade requer o plano ${minimum === 'elite' ? 'Elite' : 'Pro'}.`,
      limitReached: true,
      requiredPlan: minimum,
    })
    return false
  }
  return true
}

// ── Retry para erros transitórios ───────────────────────
// 429 = rate limit, 529 = Groq overloaded, 503 = servidor indisponível.
// Backoff crescente: 1s, 2s, 4s. 429 espera o dobro (2s, 4s, 8s).
async function withRetry(fn, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isRateLimit   = err.status === 429
      const isOverloaded  = err.status === 529 || err.status === 503
      const retryable     = isRateLimit || isOverloaded
      if (retryable && attempt < retries) {
        const base   = isRateLimit ? 2000 : 1000
        const jitter = Math.floor(Math.random() * 500)
        await new Promise(r => setTimeout(r, base * Math.pow(2, attempt) + jitter))
        continue
      }
      throw err
    }
  }
}

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
  {
    type: 'function',
    function: {
      name: 'update_transaction',
      description: 'Atualiza uma transação existente (valor, categoria, descrição ou tipo). Chame get_transactions ANTES para descobrir o id correto pelo que o usuário descreveu — nunca invente um id. Se mais de uma transação combinar com a descrição do usuário, pergunte qual delas antes de chamar esta ferramenta.',
      parameters: {
        type: 'object',
        properties: {
          id:          { type: 'string', description: 'id da transação, obtido via get_transactions.' },
          amount:      { anyOf: [{ type: 'number' }, { type: 'null' }], description: 'Novo valor positivo em reais. Null para não alterar.' },
          category:    { anyOf: [{ type: 'string', enum: VALID_CATEGORIES }, { type: 'null' }] },
          description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          type:        { anyOf: [{ type: 'string', enum: ['expense','income'] }, { type: 'null' }] },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_transaction',
      description: 'Exclui permanentemente uma transação. Chame get_transactions ANTES para descobrir o id correto pelo que o usuário descreveu — nunca invente um id. Se mais de uma transação combinar com a descrição do usuário, pergunte qual delas antes de excluir. Ação irreversível — se o pedido do usuário for ambíguo, prefira perguntar a excluir a errada.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'id da transação, obtido via get_transactions.' },
        },
        required: ['id'],
      },
    },
  },
]

async function runTool(name, args, userId, effectivePlan) {
  if (name === 'get_transactions') {
    const br    = nowBrasilia()
    const month = (args.month != null && args.month > 0) ? Number(args.month) : br.month
    const year  = (args.year  != null && args.year  > 0) ? Number(args.year)  : br.year

    if (month < 1 || month > 12) return { error: 'Mês inválido. Use 1-12.' }

    const start = new Date(year, month - 1, 1)
    const end   = new Date(year, month, 0, 23, 59, 59)
    const txs   = await prisma.transaction.findMany({
      where:   { userId, date: { gte: start, lte: end } },
      orderBy: { date: 'desc' },
      take:    200,
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
    const { month, year } = nowBrasilia()
    const [txs, budgets, user] = await Promise.all([
      prisma.transaction.findMany({ where: { userId, month, year, archived: false } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { salary: true, plan: true } }),
    ])
    // Number(...) é obrigatório aqui: salary/amount são Prisma.Decimal, cujo
    // valueOf()/toJSON() retorna string de propósito (evita conversão implícita
    // perigosa) — sem isso, "+" concatena texto em vez de somar (ex: salário
    // "23000" + totalIncome 0 vira "230000", dado 10x errado indo pra IA).
    const totalIncome   = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
    const totalExpenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    const fixedTotal    = budgets.reduce((s, b) => s + Number(b.amount), 0)
    const salary        = Number(user?.salary || 0)
    return {
      month, year,
      salary, totalIncome, totalExpenses, fixedTotal,
      balance: salary + totalIncome - fixedTotal - totalExpenses,
      transactionCount: txs.length, plan: user?.plan,
      budgets: budgets.map(b => ({ name: b.name, amount: Number(b.amount) })),
    }
  }

  if (name === 'create_transaction') {
    const amount = Number(args.amount)
    if (!isFinite(amount) || amount <= 0) return { error: 'Valor inválido.' }
    if (amount > MAX_AMOUNT) return { error: 'Valor excede o limite permitido.' }
    if (!['expense','income'].includes(args.type)) return { error: 'Tipo inválido.' }
    if (!VALID_CATEGORIES.includes(args.category)) return { error: 'Categoria inválida.' }

    let txMonth, txYear, date
    if (args.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return { error: 'Data inválida. Use YYYY-MM-DD.' }
      const parsed = new Date(args.date)
      if (isNaN(parsed.getTime())) return { error: 'Data inválida.' }
      date    = parsed
      txMonth = parsed.getUTCMonth() + 1
      txYear  = parsed.getUTCFullYear()
    } else {
      date    = new Date()
      const br = nowBrasilia()
      txMonth  = br.month
      txYear   = br.year
    }

    // A rota manual POST /transactions sempre usa o mês atual — só a IA aceita
    // uma data arbitrária. Sem essa checagem, dava pra lançar uma transação viva
    // (archived:false) dentro de um mês já fechado (relatório em PDF já enviado),
    // quebrando a garantia de imutabilidade que /unpay, update_transaction e
    // delete_transaction respeitam em todo outro lugar.
    const monthAlreadyClosed = await prisma.transaction.findFirst({
      where:  { userId, month: txMonth, year: txYear, archived: true },
      select: { id: true },
    })
    if (monthAlreadyClosed) {
      return { error: `O mês ${txMonth}/${txYear} já foi fechado (relatório mensal já enviado) e não aceita mais lançamentos retroativos.` }
    }
    // Usa req.userPlan (efetivo, via authMiddleware) em vez do campo `plan` bruto
    // do banco, por consistência com o padrão C-01 usado nas outras rotas. Na
    // prática esta função só é alcançável com plano Elite — /chat já exige Elite
    // antes de rodar qualquer tool, com a mesma fórmula de expiração, então um
    // Pro ou Elite expirado nunca chega até aqui. PLAN_LIMITS não tem entrada
    // 'elite', ou seja, sem limite de transações por mês pra quem chega aqui hoje.
    const userData = await prisma.user.findUnique({
      where:  { id: userId },
      select: { _count: { select: { transactions: { where: { month: txMonth, year: txYear, archived: false } } } } }
    })
    const txCount = userData?._count?.transactions ?? 0
    const PLAN_LIMITS = { free: 20, pro: 35 }
    const planLimit = PLAN_LIMITS[effectivePlan]
    if (planLimit && txCount >= planLimit) {
      return { error: `Limite de ${planLimit} transações por mês atingido no plano ${effectivePlan === 'free' ? 'Gratuito' : 'Pro'}.` }
    }

    const tx = await prisma.transaction.create({
      data: {
        userId, type: args.type, amount,
        category: args.category,
        description: args.description ? String(args.description).slice(0, 255) : null,
        date,
        month: txMonth,
        year:  txYear,
      },
    })
    return {
      success: true, id: tx.id,
      message: `Transação criada: ${args.type === 'income' ? '+' : '-'}R$ ${amount.toFixed(2)} em ${CATEGORY_LABELS[args.category]}`,
    }
  }

  if (name === 'update_transaction') {
    if (!args.id || !UUID_REGEX.test(args.id)) return { error: 'id de transação inválido — chame get_transactions primeiro.' }

    const data = {}
    if (args.amount != null) {
      const amount = Number(args.amount)
      if (!isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return { error: 'Valor inválido.' }
      data.amount = amount
    }
    if (args.category != null) {
      if (!VALID_CATEGORIES.includes(args.category)) return { error: 'Categoria inválida.' }
      data.category = args.category
    }
    if (args.type != null) {
      if (!['expense','income'].includes(args.type)) return { error: 'Tipo inválido.' }
      data.type = args.type
    }
    if (args.description != null) data.description = String(args.description).slice(0, 255)
    if (Object.keys(data).length === 0) return { error: 'Nenhum campo para atualizar.' }

    // updateMany com userId + archived: mesma trava de transactions.js PUT /:id —
    // usuário não edita transação de outro usuário, nem de mês já fechado.
    const result = await prisma.transaction.updateMany({
      where: { id: args.id, userId, archived: false },
      data,
    })
    if (result.count === 0) return { error: 'Transação não encontrada (ou já pertence a um mês fechado, que não pode mais ser editado).' }

    const updated = await prisma.transaction.findUnique({ where: { id: args.id } })
    return {
      success: true,
      message: `Transação atualizada: ${updated.type === 'income' ? '+' : '-'}R$ ${Number(updated.amount).toFixed(2)} em ${CATEGORY_LABELS[updated.category] || updated.category}`,
    }
  }

  if (name === 'delete_transaction') {
    if (!args.id || !UUID_REGEX.test(args.id)) return { error: 'id de transação inválido — chame get_transactions primeiro.' }

    // deleteMany com userId + archived: mesma trava de transactions.js DELETE /:id
    const result = await prisma.transaction.deleteMany({
      where: { id: args.id, userId, archived: false },
    })
    if (result.count === 0) return { error: 'Transação não encontrada (ou já pertence a um mês fechado, que não pode mais ser excluída).' }

    return { success: true, message: 'Transação excluída com sucesso.' }
  }

  return { error: 'Ferramenta desconhecida.' }
}

function sanitizeHistory(history) {
  if (!Array.isArray(history)) return []
  const filtered = history
    .filter(m => m && typeof m === 'object' && ['user','assistant'].includes(m.role) && typeof m.content === 'string')
    .slice(-10)
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
  const totalChars = filtered.reduce((s, m) => s + m.content.length, 0)
  if (totalChars > 12000) return filtered.slice(-4)
  return filtered
}

function handleGroqError(err, res) {
  console.error('[AGENT]', err.status || '', err.message)
  if (err.status === 429 || err.status === 529) {
    return res.status(429).json({ error: 'Serviço de IA sobrecarregado. Aguarde alguns segundos e tente novamente.' })
  }
  if (err.status === 401) {
    return res.status(503).json({ error: 'Chave da IA inválida. Verifique o GROQ_API_KEY.' })
  }
  if (err.name === 'APITimeoutError' || err.code === 'ETIMEDOUT') {
    return res.status(504).json({ error: 'A IA demorou muito para responder. Tente novamente.' })
  }
  res.status(500).json({ error: 'Erro ao processar mensagem. Tente novamente.' })
}

const SYSTEM = `Você é o assistente financeiro pessoal do Nancy.
Responda sempre em português, de forma clara e objetiva.
Use as ferramentas disponíveis para buscar os dados reais do usuário — nunca invente números.
Ao analisar gastos, seja específico com valores. Ao criar transações, confirme o que foi registrado.

Para editar ou excluir uma transação que o usuário descreveu (ex: "exclui a conta de alimentação de 400", "muda o valor do mercado de 400 para 300"), SEMPRE chame get_transactions primeiro para encontrar o id correto — nunca invente ou adivinhe um id. Se mais de uma transação combinar com a descrição, liste as opções (com valor e data) e peça pro usuário confirmar qual delas antes de editar ou excluir. Exclusão é permanente e irreversível — na dúvida, pergunte antes de agir. Transações de meses já fechados não podem mais ser editadas nem excluídas; avise o usuário se isso acontecer.`

// ── Upload de áudio para transcrição ────────────────────
// Buffer em memória (arquivo curto, poucos segundos de fala) — sem gravar em
// disco. Formatos aceitos = exatamente os suportados pela API do Groq.
//
// Limite de 3MB (não 10MB): a 12kbps (opus em bitrate baixo), 3MB ainda cobre
// ~33 minutos de áudio — bem mais que os 60s reais que o app grava — mas reduz
// o pior caso de abuso (quem chama a API direto, ignorando o timer de 60s do
// navegador) e o footprint de memória por requisição sob concorrência no
// Cloud Run (512Mi, --concurrency 80 — buffers de 10MB simultâneos eram uma
// via real de OOM).
const AUDIO_MIME_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/flac']
const AUDIO_MAX_BYTES = 3 * 1024 * 1024
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: AUDIO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const type = (file.mimetype || '').split(';')[0].trim() // remove ";codecs=opus" etc.
    if (!AUDIO_MIME_TYPES.includes(type)) {
      return cb(new Error('Formato de áudio não suportado.'))
    }
    cb(null, true)
  },
})

// Envelope do multer.single() que converte os próprios erros dele (arquivo
// grande demais, formato rejeitado pelo fileFilter) em 400 — sem isso, o
// erro cai no handler global de exceções do server.js e vira 500 genérico.
function handleAudioUpload(req, res, next) {
  audioUpload.single('audio')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Áudio muito grande. Limite de 3MB (~vários minutos de fala).' })
      }
      return res.status(400).json({ error: 'Erro ao processar o áudio enviado.' })
    }
    if (err) return res.status(400).json({ error: err.message || 'Formato de áudio não suportado.' })
    next()
  })
}

// ── POST /api/agent/transcribe ──────────────────────────
// Transcreve áudio gravado no navegador (registro de transação por voz).
// Substitui o reconhecimento de voz nativo do navegador (SpeechRecognition),
// que não é suportado de forma confiável no Safari/iOS nem no Firefox —
// gravar áudio (MediaRecorder) e transcrever no servidor funciona igual em
// qualquer navegador/aparelho.
router.post('/transcribe',
  transcribeLimiter,
  // Timeout maior que o global (30s, definido em server.js): o cliente Groq já
  // tem seu próprio timeout de 30s, mas esse relógio só começa a contar DEPOIS
  // do upload+parse do multipart. Sem esse ajuste, o timeout global do Express
  // podia cortar a conexão com 503 antes do Groq responder, mesmo quando a
  // transcrição terminaria com sucesso segundos depois.
  (req, res, next) => {
    res.setTimeout(60_000, () => {
      if (!res.headersSent) res.status(503).json({ error: 'Tempo de resposta esgotado.' })
    })
    next()
  },
  // Gate de plano/disponibilidade ANTES do multer processar o upload — evita
  // gastar banda e alocar memória parseando até 3MB para quem nem tem o plano
  // necessário (autenticação já rodou no authMiddleware do router, acima).
  async (req, res, next) => {
    if (!requireGroq(res)) return
    if (!await requirePlan(req, res, 'elite')) return // mesmo gate do /chat — voz é parte do recurso Elite
    next()
  },
  handleAudioUpload,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum áudio enviado.' })
      }
      if (req.file.size === 0) {
        return res.status(400).json({ error: 'Áudio vazio.' })
      }

      const file = await toFile(req.file.buffer, req.file.originalname || 'audio.webm')
      const transcription = await withRetry(() => groq.audio.transcriptions.create({
        file,
        model:            'whisper-large-v3-turbo',
        language:         'pt',
        response_format:  'json',
      }))

      const text = (transcription.text || '').trim()
      if (!text) {
        return res.status(422).json({ error: 'Não consegui entender o áudio. Tente falar novamente.' })
      }

      res.json({ text })
    } catch (err) {
      handleGroqError(err, res)
    }
  }
)

// ── POST /api/agent/chat ────────────────────────────────
router.post('/chat', async (req, res) => {
  if (!requireGroq(res)) return
  if (!await requirePlan(req, res, 'elite')) return

  const { message, history } = req.body

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Mensagem vazia.' })
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: 'Mensagem muito longa.' })
  }
  if (history !== undefined && (!Array.isArray(history) || history.length > 40)) {
    return res.status(400).json({ error: 'Histórico inválido.' })
  }

  const messages = [
    { role: 'system', content: SYSTEM },
    ...sanitizeHistory(history),
    { role: 'user', content: message.trim() },
  ]

  try {
    let response = await withRetry(() => groq.chat.completions.create({
      model:      MODEL_QUALITY,
      messages,
      tools:      TOOLS,
      tool_choice: 'auto',
      max_tokens: 1024,
    }))

    let msg        = response.choices[0].message
    let iterations = 0
    // Barreira técnica contra exclusão em massa — não apenas a instrução em
    // linguagem natural no prompt de sistema (que o modelo pode simplesmente
    // não seguir). No máximo 1 delete_transaction bem-sucedido por mensagem do
    // usuário, contando em todas as iterações do loop de tool_calls abaixo.
    let deleteCount = 0

    while (msg.tool_calls?.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
      iterations++

      // Executa todas as tool calls em paralelo — quando o modelo pede múltiplas
      // ferramentas ao mesmo tempo (ex: get_summary + get_transactions), não há
      // razão para esperar uma terminar antes de iniciar a outra.
      const toolResults = await Promise.all(
        msg.tool_calls.map(async (call) => {
          let args
          try { args = JSON.parse(call.function.arguments || '{}') } catch (e) {
            console.error(`[AGENT] parse args ${call.function.name}:`, e.message)
            args = {}
          }

          if (call.function.name === 'delete_transaction') {
            deleteCount++ // síncrono, antes de qualquer await — sem race entre chamadas paralelas
            if (deleteCount > 1) {
              const blocked = { error: 'Por segurança, só posso excluir uma transação por vez. Confirme e peça a próxima exclusão numa mensagem separada.' }
              return { role: 'tool', tool_call_id: call.id, content: JSON.stringify(blocked) }
            }
          }

          let result
          try {
            result = await runTool(call.function.name, args, req.userId, req.userPlan)
          } catch (toolErr) {
            console.error(`[AGENT] tool ${call.function.name}:`, toolErr.message)
            result = { error: 'Erro ao buscar dados. Tente novamente.' }
          }
          return { role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) }
        })
      )

      messages.push(msg, ...toolResults)

      response = await withRetry(() => groq.chat.completions.create({
        model:      MODEL_QUALITY,
        messages,
        tools:      TOOLS,
        tool_choice: 'auto',
        max_tokens: 1024,
      }))

      msg = response.choices[0].message
    }

    const reply = msg.content?.trim() || 'Não consegui gerar uma resposta. Tente novamente.'
    res.json({ reply })
  } catch (err) {
    handleGroqError(err, res)
  }
})


// ── POST /api/agent/predict ─────────────────────────────
// Usa modelo rápido (8B) — apenas 1 frase curta, velocidade > qualidade.
router.post('/predict', async (req, res) => {
  if (!requireGroq(res)) return
  if (!await requirePlan(req, res, 'pro')) return
  try {
    const { month, year, day: dayOfMonth } = nowBrasilia()
    const daysInMonth = new Date(year, month, 0).getDate()

    const [txs, user] = await Promise.all([
      prisma.transaction.findMany({
        where: { userId: req.userId, month, year, archived: false },
        select: { type: true, amount: true, category: true },
      }),
      prisma.user.findUnique({ where: { id: req.userId }, select: { salary: true, name: true } }),
    ])

    if (txs.length === 0) return res.json({ prediction: null })

    const totalExpenses  = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
    const totalIncome    = txs.filter(t => t.type === 'income').reduce((s, t)  => s + Number(t.amount), 0)
    const salary         = Number(user?.salary || 0)
    const totalAvailable = salary + totalIncome
    const pct            = totalAvailable > 0 ? Math.round(totalExpenses / totalAvailable * 100) : 0

    const byCategory = {}
    txs.filter(t => t.type === 'expense').forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount)
    })
    const topCat = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]

    const prompt = `Usuário: ${user?.name || 'usuário'}
Mês: ${MONTHS[month - 1]} ${year} — dia ${dayOfMonth} de ${daysInMonth}
Disponível: R$ ${totalAvailable.toFixed(2)} | Gasto até agora: R$ ${totalExpenses.toFixed(2)} (${pct}%)
Principal categoria de gasto: ${CATEGORY_LABELS[topCat?.[0]] || topCat?.[0] || 'N/A'} (R$ ${topCat?.[1]?.toFixed(2) || '0,00'})

Escreva UMA frase curta e direta prevendo como o usuário vai terminar o mês financeiramente. Sem saudações, sem formatação, apenas a previsão.`

    const response = await withRetry(() => groq.chat.completions.create({
      model:       MODEL_FAST,
      messages:    [
        { role: 'system', content: 'Consultor financeiro pessoal. Responda em português, máximo 1 frase, sem formatação.' },
        { role: 'user',   content: prompt },
      ],
      max_tokens:  120,
      temperature: 0.6,
    }))

    res.json({ prediction: response.choices[0].message.content.trim() })
  } catch (err) {
    handleGroqError(err, res)
  }
})

// ── POST /api/agent/monthly-report ─────────────────────
router.post('/monthly-report', async (req, res) => {
  if (!requireGroq(res)) return
  if (!await requirePlan(req, res, 'elite')) return
  try {
    const br    = nowBrasilia()
    const month = Number(req.body?.month) || br.month
    const year  = Number(req.body?.year)  || br.year

    if (month < 1 || month > 12)     return res.status(400).json({ error: 'Mês inválido.' })
    if (year  < 2020 || year > 2100) return res.status(400).json({ error: 'Ano inválido.' })

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
    const salary        = Number(user?.salary || 0)
    const fixedCosts    = budgets.reduce((s, b) => s + Number(b.amount), 0)
    const balance       = salary + totalIncome - fixedCosts - totalExpenses

    const byCategory = {}
    txs.filter(t => t.type === 'expense').forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount)
    })
    const topCats = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([cat, amt]) => `${CATEGORY_LABELS[cat] || cat}: R$ ${amt.toFixed(2)}`).join(', ')

    const prompt = `Analise ${MONTHS[month - 1]}/${year} de ${user?.name || 'usuário'}:
Salário R$${salary.toFixed(2)} | Fixos R$${fixedCosts.toFixed(2)} | Extras R$${totalIncome.toFixed(2)} | Gasto R$${totalExpenses.toFixed(2)} | Saldo R$${balance.toFixed(2)}
Top gastos: ${topCats}
Transações: ${txs.length}

Gere relatório financeiro em 4 parágrafos curtos (máximo 180 palavras total):
1. Desempenho geral do mês (1-2 frases)
2. Principais gastos e destaques (1-2 frases)
3. Pontos de atenção (1 frase)
4. 2 sugestões práticas para o próximo mês

Sem títulos, sem marcadores, parágrafos separados por linha em branco. Tom direto e amigável.`

    const response = await withRetry(() => groq.chat.completions.create({
      model:       MODEL_QUALITY,
      messages:    [
        { role: 'system', content: 'Consultor financeiro pessoal. Responda em português, estruturado e direto.' },
        { role: 'user',   content: prompt },
      ],
      max_tokens:  450,
      temperature: 0.65,
    }))

    res.json({ report: response.choices[0].message.content.trim(), month, year })
  } catch (err) {
    handleGroqError(err, res)
  }
})

module.exports = router
