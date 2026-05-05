// ═══════════════════════════════════════════════════════
// 🚀 src/server.js — Ponto de Entrada do Backend
// ═══════════════════════════════════════════════════════

require('dotenv').config()

const express      = require('express')
const cors         = require('cors')
const helmet       = require('helmet')
const compression  = require('compression')
const path         = require('path')

const { apiLimiter, authLimiter } = require('./middleware/rateLimiter')
const authRoutes        = require('./routes/auth')
const transactionRoutes = require('./routes/transactions')
const budgetRoutes      = require('./routes/budget')
const reportRoutes      = require('./routes/reports')

const app        = express()
const PORT       = process.env.PORT || 3001
const isProd     = process.env.NODE_ENV === 'production'
const publicPath = path.join(__dirname, '../public')

// ── Compressão ──────────────────────────────────────────
app.use(compression())

// ── Segurança: Headers HTTP ─────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
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
const allowedOrigins = [
  'https://finance-app-1042158013294.southamerica-east1.run.app',
]

app.use('/api/', cors({
  origin: isProd
    ? (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
        callback(new Error('CORS: origem não permitida'))
      }
    : true,
  credentials: true,
}))

// ── Body + Rate limit ───────────────────────────────────
app.use(express.json({ limit: '10kb' }))
app.use(express.urlencoded({ extended: true, limit: '10kb' }))
app.use('/api/', apiLimiter)

// ── Rotas da API ────────────────────────────────────────
app.use('/api/auth',         authLimiter, authRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/budget',       budgetRoutes)
app.use('/api/reports',      reportRoutes)

// ── Health Check ────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '✅ FinançasPro API rodando!', env: isProd ? 'production' : 'development' })
})

// ── Handler de Erros Global ─────────────────────────────
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message)
  res.status(err.status || 500).json({
    error: isProd ? 'Erro interno do servidor.' : err.message,
  })
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend rodando em http://localhost:${PORT}`)
  console.log(`📋 Ambiente: ${isProd ? 'PRODUÇÃO ☁️' : 'desenvolvimento 🛠️'}`)
})
