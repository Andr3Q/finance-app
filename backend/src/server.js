// ═══════════════════════════════════════════════════════
// 🚀 src/server.js — Ponto de Entrada do Backend
// ═══════════════════════════════════════════════════════

require('dotenv').config()

// ── Validação de variáveis obrigatórias na inicialização ─
const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL']
const missing = REQUIRED_ENV.filter(k => !process.env[k])
if (missing.length) {
  console.error(`[FATAL] Variáveis de ambiente ausentes: ${missing.join(', ')}`)
  process.exit(1)
}

const express      = require('express')
const cors         = require('cors')
const helmet       = require('helmet')
const compression  = require('compression')
const cookieParser = require('cookie-parser')
const path         = require('path')

const { apiLimiter, authLimiter, agentLimiter, forgotPasswordLimiter } = require('./middleware/rateLimiter')
const authRoutes          = require('./routes/auth')
const transactionRoutes   = require('./routes/transactions')
const budgetRoutes        = require('./routes/budget')
const reportRoutes        = require('./routes/reports')
const notificationRoutes  = require('./routes/notifications')
const monitorAlertRoute   = require('./routes/monitorAlert')
const agentRoutes         = require('./routes/agent')
const goalRoutes          = require('./routes/goals')

const app        = express()
const PORT       = process.env.PORT || 3001
const isProd     = process.env.NODE_ENV === 'production'
const publicPath = path.join(__dirname, '../public')

// Cloud Run senta atrás de um proxy — necessário para o rate-limit
// identificar IPs corretamente pelo X-Forwarded-For
app.set('trust proxy', 1)

// ── Compressão ──────────────────────────────────────────
app.use(compression())

// ── Segurança: Headers HTTP ─────────────────────────────
app.use(helmet({
  // CSP: restringe de onde scripts, estilos e conexões podem vir
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],  // Vite injeta estilos inline
      imgSrc:      ["'self'", 'data:', 'blob:'],
      fontSrc:     ["'self'", 'data:'],
      connectSrc:  ["'self'", 'https://api.groq.com'],
      objectSrc:   ["'none'"],
      frameAncestors: ["'none'"],
      baseUri:     ["'self'"],
      formAction:  ["'self'"],
    },
  },
  // HSTS: força HTTPS por 1 ano — browser nunca faz downgrade para HTTP
  hsts: {
    maxAge:            31536000,
    includeSubDomains: true,
  },
  crossOriginEmbedderPolicy: false,  // necessário para Vite assets
}))

// ── Arquivos estáticos com CORS aberto ──────────────────
// Vite gera <script type="module" crossorigin> — o browser exige
// Access-Control-Allow-Origin mesmo em same-origin. Solução: cors(*)
// nos assets (são arquivos públicos, sem credenciais).
if (isProd) {
  app.use('/assets',
    cors({ origin: '*' }),
    express.static(path.join(publicPath, 'assets'), { maxAge: '1y', immutable: true })
  )

  app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript')
    res.setHeader('Service-Worker-Allowed', '/')
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.sendFile(path.join(publicPath, 'sw.js'))
  })

  app.use(express.static(publicPath, { maxAge: 0 }))
}

// ── CORS restrito apenas para rotas de API ──────────────
// Configura via ALLOWED_ORIGINS no .env (vírgula separada)
// Ex: ALLOWED_ORIGINS=https://app.exemplo.com,https://outro.com
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

const devOrigins = ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173']

app.use('/api/', cors({
  origin: (origin, callback) => {
    // Requests sem Origin = same-origin (browser nunca envia Origin em same-origin)
    if (!origin) return callback(null, true)
    const allowed = isProd ? allowedOrigins : devOrigins
    if (allowed.includes(origin)) return callback(null, true)
    callback(new Error('CORS: origem não permitida'))
  },
  credentials: true,
}))

// ── Cookies + Body + Rate limit ────────────────────────
app.use(cookieParser())
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))
app.use('/api/', apiLimiter)

// ── Rotas da API ────────────────────────────────────────
app.use('/api/auth',          authLimiter, authRoutes)
app.use('/api/transactions',  transactionRoutes)
app.use('/api/budget',        budgetRoutes)
app.use('/api/reports',       reportRoutes)
app.use('/api/monitor-alert', monitorAlertRoute)
app.use('/api/notifications', notificationRoutes)
app.use('/api/agent',        agentLimiter, agentRoutes)
app.use('/api/goals',        goalRoutes)

// ── Health endpoints (antes do SPA catch-all) ───────────
const prismaHealth = require('./lib/prisma')

// /ping — resposta imediata sem tocar no banco (mede latência do servidor)
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', ts: Date.now() })
})

// /health — verifica banco de dados
app.get('/health', async (req, res) => {
  try {
    await prismaHealth.$queryRaw`SELECT 1`
    res.json({ status: 'ok' })
  } catch {
    res.status(503).json({ status: 'degraded' })
  }
})

// ── Handler de Erros Global ─────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message)
  res.status(err.status || 500).json({ error: 'Erro interno do servidor.' })
})

// ── SPA catch-all (depois de todas as rotas de API) ─────
if (isProd) {
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.sendFile(path.join(publicPath, 'index.html'))
  })
}

// ── Timeout por requisição (30s) ────────────────────────
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    res.status(503).json({ error: 'Tempo de resposta esgotado.' })
  })
  next()
})

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend rodando em http://localhost:${PORT}`)
  console.log(`📋 Ambiente: ${isProd ? 'PRODUÇÃO ☁️' : 'desenvolvimento 🛠️'}`)
  if (isProd && allowedOrigins.length === 0) {
    console.warn('⚠️  ALLOWED_ORIGINS não configurado — CORS bloqueará todas as origens em produção!')
  }
  // Aquece a conexão com o banco imediatamente após o servidor subir,
  // para que a primeira request real não pague o custo de conectar.
  prismaHealth.$connect().catch(() => {})
})

// ── Graceful shutdown ───────────────────────────────────
const shutdown = (signal) => {
  console.log(`[${signal}] Encerrando servidor...`)
  server.close(async () => {
    await prismaHealth.$disconnect()
    console.log('Servidor encerrado.')
    process.exit(0)
  })
  setTimeout(() => { console.error('Forçando encerramento.'); process.exit(1) }, 15000)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
