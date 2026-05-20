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
const crypto       = require('crypto')
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

// ── Request ID — rastreamento de logs por requisição ───
// Cada request recebe um UUID único. Retornado no header X-Request-Id
// para correlacionar erros do frontend com logs do Cloud Run.
app.use((req, res, next) => {
  const id = crypto.randomUUID()
  req.id = id
  res.setHeader('X-Request-Id', id)
  next()
})

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

// Bloqueia APIs de hardware desnecessárias — reduz superfície de ataque
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  next()
})

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

// Previne cache de respostas de API em proxies/CDNs — dados financeiros nunca devem
// ser servidos de cache (um proxy poderia retornar dados de outro usuário)
app.use('/api/', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})

// ── Timeout por requisição (30s) ────────────────────────
// DEVE ficar antes das rotas — registrar depois das rotas não tem efeito.
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    if (!res.headersSent) res.status(503).json({ error: 'Tempo de resposta esgotado.' })
  })
  next()
})

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

// Cache do health check — atualizado em background pelo keepalive (15s)
// TTL de 30s: /health quase nunca toca no banco durante um request
const _health = { ts: 0, ok: true, db_ms: 0 }

// Atualiza o cache em background — separa latência de DB da latência de resposta HTTP
async function refreshHealth() {
  const t0 = Date.now()
  try {
    await Promise.race([
      prismaHealth.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ])
    Object.assign(_health, { ts: Date.now(), ok: true, db_ms: Date.now() - t0 })
  } catch (err) {
    Object.assign(_health, { ts: Date.now(), ok: false, db_ms: Date.now() - t0 })
    console.error(`[HEALTH] keepalive falhou: ${err.message}`)
  }
}

// /health — serve do cache em memória; query real só se keepalive parou há >30s
app.get('/health', async (req, res) => {
  const now = Date.now()

  if (now - _health.ts < 30_000 && _health.ts > 0) {
    const status = _health.ok ? 'ok' : 'degraded'
    if (!_health.ok) return res.status(503).json({ status, db_ms: _health.db_ms, cached: true })
    return res.json({ status, db_ms: _health.db_ms, cached: true })
  }

  // Fallback: cache expirou (keepalive falhou por >30s) — query direta
  await refreshHealth()
  const status = _health.ok ? 'ok' : 'degraded'
  if (!_health.ok) return res.status(503).json({ status, db_ms: _health.db_ms })
  res.json({ status, db_ms: _health.db_ms })
})

// ── Handler de Erros Global ─────────────────────────────
// Inclui tratamento de erros Prisma para retornar status HTTP correto
// em vez de sempre retornar 500.
app.use((err, req, res, next) => {
  // Unique constraint (ex: e-mail duplicado)
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'Recurso já existe.' })
  }
  // Record not found (ex: update/delete de ID inexistente)
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Recurso não encontrado.' })
  }
  // Foreign key constraint violation
  if (err.code === 'P2003') {
    return res.status(400).json({ error: 'Referência inválida.' })
  }

  const reqId = req.id || '-'
  console.error(`[ERROR] ${reqId} ${req.method} ${req.path}:`, err.message)
  res.status(err.status || 500).json({ error: 'Erro interno do servidor.' })
})

// ── API 404 — deve vir antes do SPA catch-all ──────────
// Sem este handler, uma rota GET inexistente em /api/* retornaria
// o index.html do React em vez de um JSON de erro.
app.use('/api/', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' })
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

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend rodando em http://localhost:${PORT}`)
  console.log(`📋 Ambiente: ${isProd ? 'PRODUÇÃO ☁️' : 'desenvolvimento 🛠️'}`)
  if (isProd && allowedOrigins.length === 0) {
    console.warn('⚠️  ALLOWED_ORIGINS não configurado — CORS bloqueará todas as origens em produção!')
  }
  // Conecta e aquece o cache do health imediatamente
  prismaHealth.$connect()
    .then(() => refreshHealth())
    .catch(() => {})

  // Keepalive a cada 15s: mantém pool vivo E garante cache do health sempre fresco
  // (intervalo 15s < TTL 30s → /health nunca faz query durante um request HTTP)
  if (isProd) {
    setInterval(refreshHealth, 15_000)
  }
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
