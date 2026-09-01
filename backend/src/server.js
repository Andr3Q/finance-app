// ═══════════════════════════════════════════════════════
// 🚀 src/server.js — Ponto de Entrada do Backend
// ═══════════════════════════════════════════════════════

// Ignora SIGPIPE globalmente — libpq (Prisma) e subprocessos nativos (trivy, npm)
// podem gerar SIGPIPE em conexões TCP/pipes quebrados. Sem este handler o processo morre.
process.on('SIGPIPE', () => {})

// Monorepo: tenta .env no CWD (docker-compose / produção); se não encontrar,
// busca na raiz do projeto (desenvolvimento direto via `npm run dev:backend`)
const path = require('path')
require('dotenv').config()
if (!process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })
}

// ── Sentry — inicializar antes de qualquer require de rota ──────────
// (comentário completo do motivo em lib/sentry.js — precisa rodar aqui em
// cima, antes de express/rotas, pra instrumentação automática funcionar)
const { Sentry } = require('./lib/sentry')

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

const { apiLimiter, agentLimiter } = require('./middleware/rateLimiter')
const authRoutes          = require('./routes/auth')
const transactionRoutes   = require('./routes/transactions')
const budgetRoutes        = require('./routes/budget')
const reportRoutes        = require('./routes/reports')
const notificationRoutes  = require('./routes/notifications')
const agentRoutes         = require('./routes/agent')
const goalRoutes          = require('./interfaces/http/routes/goals')
const installmentRoutes   = require('./routes/installments')
const paymentRoutes       = require('./routes/payments')
const twoFactorRoutes     = require('./routes/twoFactor')
const monitorRoutes       = require('./routes/monitor')
const adminRoutes         = require('./routes/admin')
const errorHandler        = require('./interfaces/http/middlewares/errorHandler')

// ── Logger estruturado (pino) ───────────────────────────
const logger = require('./lib/logger')


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

// ── Request logging estruturado ─────────────────────────
// Registra cada resposta com método, path, status e latência.
// Em produção o JSON vai para Cloud Run → GCP Log Explorer.
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    logger.info({ method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - start, reqId: req.id })
  })
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
      scriptSrc:   ["'self'", 'https://static.cloudflareinsights.com'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      fontSrc:     ["'self'", 'data:', 'https://fonts.gstatic.com'],
      connectSrc:  ["'self'", 'https://api.groq.com', 'https://static.cloudflareinsights.com'],
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

// Bloqueia APIs de hardware desnecessárias — reduz superfície de ataque.
// ⚠️ ATENÇÃO: microphone=(self) é obrigatório, NUNCA troque para microphone=().
// O AgentChat grava áudio (MediaRecorder) para registro de transações por voz,
// transcrito via Whisper/Groq em POST /api/agent/transcribe — allowlist vazia
// bloqueia essa função por completo mesmo com o usuário concedendo permissão
// no navegador, porque este header tem prioridade sobre a concessão manual do
// usuário. Já causou um incidente em produção (2026-08) por exatamente isso.
// Protegido por teste em __tests__/security.test.js — rode-o antes de alterar.
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')
  next()
})

// Sitemap dinâmico — ANTES do express.static (arquivo estático removido do frontend/public)
app.get('/sitemap.xml', (req, res) => {
  const BASE = process.env.APP_URL || 'https://myfinancepro.com.br'
  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${BASE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${BASE}/planos</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>${BASE}/register</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>
  <url><loc>${BASE}/login</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${BASE}/privacidade</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>
  <url><loc>${BASE}/termos</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>
</urlset>`)
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

  // Runtime config para o frontend — chave PostHog como env var (não baked na imagem)
  // Deve vir antes do express.static para o Express interceptar antes de procurar arquivo
  app.get('/app-config.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.send(`window.__APP_CONFIG__=${JSON.stringify({
      posthogKey:  process.env.POSTHOG_KEY  || '',
      posthogHost: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
    })};`)
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
// 2FA deve ser registrado ANTES de /api/auth (prefixo mais específico primeiro)
app.use('/api/auth/2fa',     twoFactorRoutes)
app.use('/api/auth',          authRoutes)
app.use('/api/transactions',  transactionRoutes)
app.use('/api/budget',        budgetRoutes)
app.use('/api/reports',       reportRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/agent',        agentLimiter, agentRoutes)
app.use('/api/goals',        goalRoutes)
app.use('/api/installments', installmentRoutes)
app.use('/api/payments',     paymentRoutes)
app.use('/api/monitor',     monitorRoutes)
app.use('/api/admin',       adminRoutes)

// ── Health endpoints (antes do SPA catch-all) ───────────
// Cliente DEDICADO ao health check — completamente separado do pool principal.
// Isso evita que $disconnect() ou lentidão no health afetem rotas reais.
const { PrismaClient: PrismaHealthClient } = require('@prisma/client')
const _hcUrl = (() => {
  const base = process.env.DATABASE_URL || ''
  if (!base) return base
  try {
    const u = new URL(base)
    if (!u.searchParams.has('connection_limit')) u.searchParams.set('connection_limit', '1')
    if (!u.searchParams.has('connect_timeout'))  u.searchParams.set('connect_timeout',  '8')
    if (!u.searchParams.has('pool_timeout'))      u.searchParams.set('pool_timeout',     '8')
    return u.toString()
  } catch { return base }
})()
const prismaHealth = new PrismaHealthClient({
  log: [{ emit: 'event', level: 'error' }],
  datasources: { db: { url: _hcUrl } },
})
prismaHealth.$on('error', () => {})  // suprime logs duplicados do cliente de health

// /ping — resposta imediata sem tocar no banco (mede latência do servidor)
app.get('/ping', apiLimiter, (req, res) => {
  res.json({ status: 'ok', ts: Date.now() })
})

// Cache do health check — atualizado em background pelo keepalive (15s)
// TTL de 30s: /health quase nunca toca no banco durante um request
const _health = { ts: 0, ok: true, db_ms: 0 }
let _healthFailStreak = 0

async function tryPing(timeoutMs = 8000) {
  await Promise.race([
    prismaHealth.$queryRaw`SELECT 1`,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ])
}

async function refreshHealth() {
  const t0 = Date.now()
  try {
    await tryPing()
    _healthFailStreak = 0
    Object.assign(_health, { ts: Date.now(), ok: true, db_ms: Date.now() - t0 })
  } catch (err) {
    _healthFailStreak++
    // Marca degraded só após 3 falhas consecutivas — reconexões transitórias são normais
    const ok = _healthFailStreak < 3
    Object.assign(_health, { ts: Date.now(), ok, db_ms: Date.now() - t0 })
    if (!ok) logger.error({ msg: '[HEALTH] DB indisponível', streak: _healthFailStreak, err: err.message })
  }
}

// /health — serve do cache em memória; query real só se keepalive parou há >30s
app.get('/health', apiLimiter, async (req, res) => {
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

// ── Sentry error handler — captura todas as exceções não tratadas ───
// Deve ficar ANTES do handler de domínio para enviar o erro ao Sentry
// antes de formatar a resposta HTTP.
if (Sentry) Sentry.setupExpressErrorHandler(app)

// ── ErrorHandler de domínio (AppError → resposta HTTP) ──
// Intercept domain errors before the global handler.
app.use(errorHandler)

// ── Handler de Erros Global ─────────────────────────────
// Inclui tratamento de erros Prisma para retornar status HTTP correto
// em vez de sempre retornar 500.
app.use((err, req, res, _next) => {
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
  // Connection pool timeout
  if (err.code === 'P2024') {
    return res.status(503).json({ error: 'Serviço temporariamente indisponível.' })
  }

  const reqId     = req.id || '-'
  const statusCode = err.status || 500
  logger.error({ msg: 'Exceção não tratada', reqId, method: req.method, path: req.path, err: err.message })

  res.status(statusCode).json({ error: 'Erro interno do servidor.' })
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

// Exporta o app para uso em testes (supertest) sem chamar listen
module.exports = app

if (require.main === module || process.env.NODE_ENV !== 'test') {
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info({ msg: `Backend rodando em http://localhost:${PORT}`, port: PORT })
  logger.info({ msg: `Ambiente: ${isProd ? 'PRODUÇÃO' : 'desenvolvimento'}`, isProd })
  if (isProd && allowedOrigins.length === 0) {
    logger.warn({ msg: 'ALLOWED_ORIGINS não configurado — CORS bloqueará todas as origens em produção!' })
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
  logger.info({ msg: 'Encerrando servidor...', signal })
  server.close(async () => {
    await prismaHealth.$disconnect()
    logger.info({ msg: 'Servidor encerrado.' })
    process.exit(0)
  })
  setTimeout(() => { logger.error({ msg: 'Forçando encerramento — timeout atingido.' }); process.exit(1) }, 15000)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
} // end if (require.main === module || process.env.NODE_ENV !== 'test')
