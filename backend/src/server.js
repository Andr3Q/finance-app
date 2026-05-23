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

const { apiLimiter, authLimiter, agentLimiter, paymentLimiter } = require('./middleware/rateLimiter')
const authRoutes          = require('./routes/auth')
const transactionRoutes   = require('./routes/transactions')
const budgetRoutes        = require('./routes/budget')
const reportRoutes        = require('./routes/reports')
const notificationRoutes  = require('./routes/notifications')
const monitorAlertRoute   = require('./routes/monitorAlert')
const agentRoutes         = require('./routes/agent')
const goalRoutes          = require('./routes/goals')
const installmentRoutes   = require('./routes/installments')
const paymentRoutes       = require('./routes/payments')
const securityRoutes      = require('./routes/security')
const monitorRoutes       = require('./routes/monitor')
const twoFactorRoutes     = require('./routes/twoFactor')
const { runAllScans }     = require('./services/securityScanner')

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

// ── Monitor admin — login / logout / dashboard ──────────
const MONITOR_PWD = process.env.MONITOR_SECRET || ''
const MONITOR_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; connect-src 'self'; font-src 'self' data:; object-src 'none'; frame-ancestors 'none';"

// Compara strings em tempo constante, independente do comprimento
function monitorSafeEq(a, b) {
  try {
    const ha = crypto.createHmac('sha256', 'cmp').update(String(a)).digest()
    const hb = crypto.createHmac('sha256', 'cmp').update(String(b)).digest()
    return crypto.timingSafeEqual(ha, hb)
  } catch { return false }
}

// Token de sessão = HMAC do segredo — sem estado, sem banco
function monitorSessionToken() {
  return crypto.createHmac('sha256', MONITOR_PWD || 'no-secret').update('monitor-session-v1').digest('hex')
}

function monitorLoginHtml(hasError) {
  const errBlock = hasError
    ? `<div class="err"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Senha incorreta. Tente novamente.</div>`
    : ''
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Finance Monitor</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0d0f14;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#12151c;border:1px solid #ffffff12;border-radius:14px;padding:36px 30px;width:100%;max-width:340px}
.logo{font-size:17px;font-weight:800;margin-bottom:4px;display:flex;align-items:center;gap:8px}
.logo em{color:#4ac46e;font-style:normal}
.badge{background:#4ac46e18;border:1px solid #4ac46e30;border-radius:20px;color:#4ac46e;font-size:10px;font-weight:800;padding:2px 8px;letter-spacing:.5px}
.sub{font-size:13px;color:#8892a4;margin:4px 0 24px}
.err{background:#ef444418;border:1px solid #ef444330;border-radius:8px;padding:10px 13px;font-size:13px;color:#ef4444;margin-bottom:18px;display:flex;align-items:center;gap:8px}
label{display:block;font-size:11px;color:#8892a4;font-weight:700;margin-bottom:6px;text-transform:uppercase;letter-spacing:.6px}
input{width:100%;background:#181c25;border:1px solid #ffffff15;border-radius:8px;padding:11px 13px;color:#e2e8f0;font-size:14px;outline:none;transition:border-color .2s}
input:focus{border-color:#4ac46e60;box-shadow:0 0 0 3px #4ac46e10}
button{width:100%;margin-top:14px;background:#4ac46e;border:none;border-radius:9px;padding:12px;color:#0d0f14;font-size:14px;font-weight:800;cursor:pointer;transition:opacity .15s}
button:hover{opacity:.88}
</style>
</head>
<body>
<div class="card">
  <div class="logo">📡 <em>Finance</em> Monitor <span class="badge">ADMIN</span></div>
  <div class="sub">Acesso restrito ao painel de monitoramento</div>
  ${errBlock}
  <form method="POST" action="/monitor-login">
    <label for="pwd">Senha de acesso</label>
    <input type="password" id="pwd" name="password" autofocus autocomplete="current-password" placeholder="••••••••••••••••"/>
    <button type="submit">Entrar →</button>
  </form>
</div>
</body>
</html>`
}

app.get('/monitor-login', (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.send(monitorLoginHtml(!!req.query.err))
})

app.post('/monitor-login', (req, res) => {
  const pwd = (req.body?.password || '').trim()
  if (!MONITOR_PWD || !pwd || !monitorSafeEq(pwd, MONITOR_PWD)) {
    return res.redirect('/monitor-login?err=1')
  }
  res.cookie('_ms', monitorSessionToken(), {
    httpOnly: true,
    secure:   isProd,
    sameSite: 'strict',
    maxAge:   8 * 3600 * 1000, // 8h
    path:     '/',
  })
  res.redirect('/monitor.html')
})

app.get('/monitor-logout', (req, res) => {
  res.clearCookie('_ms', { path: '/' })
  res.redirect('/monitor-login')
})

app.get('/monitor.html', (req, res) => {
  if (!isProd) {
    // Em dev o arquivo é servido pelo Vite — não passa por aqui
    return res.status(404).send('Use o servidor Vite em desenvolvimento.')
  }
  if (!MONITOR_PWD) return res.status(503).send('MONITOR_SECRET não configurado.')
  const token = req.cookies?._ms
  if (!token || !monitorSafeEq(token, monitorSessionToken())) {
    return res.redirect('/monitor-login')
  }
  res.setHeader('Content-Security-Policy', MONITOR_CSP)
  res.setHeader('Cache-Control', 'no-store')
  res.sendFile(path.join(publicPath, 'monitor.html'))
})

// ── Rotas da API ────────────────────────────────────────
app.use('/api/auth',          authLimiter, authRoutes)
app.use('/api/transactions',  transactionRoutes)
app.use('/api/budget',        budgetRoutes)
app.use('/api/reports',       reportRoutes)
app.use('/api/monitor-alert', apiLimiter, monitorAlertRoute)
app.use('/api/notifications', notificationRoutes)
app.use('/api/agent',        agentLimiter, agentRoutes)
app.use('/api/goals',        goalRoutes)
app.use('/api/installments', installmentRoutes)
app.use('/api/payments',     paymentLimiter, paymentRoutes)
app.use('/api/security',     apiLimiter,     securityRoutes)
app.use('/api/monitor',      apiLimiter,     monitorRoutes)
app.use('/api/auth/2fa',     apiLimiter,     twoFactorRoutes)

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
    if (!ok) console.error(`[HEALTH] DB indisponível (streak ${_healthFailStreak}): ${err.message}`)
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

  // Scans de segurança: primeiro após 3min (app estável), depois a cada 6h
  // Intervalo reduzido de 1h→6h: trivy escaneia /app inteiro e é pesado
  setTimeout(() => {
    runAllScans().catch(() => {})
    setInterval(() => runAllScans().catch(() => {}), 6 * 3_600_000)
  }, 3 * 60_000)
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
