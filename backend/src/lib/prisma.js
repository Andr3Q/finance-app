const { PrismaClient } = require('@prisma/client')

const isProd      = process.env.NODE_ENV === 'production'
const isPgBouncer = (process.env.DATABASE_URL || '').includes(':6543') ||
                    (process.env.DATABASE_URL || '').includes('pgbouncer=true')

function buildUrl() {
  const base = process.env.DATABASE_URL || ''
  if (!base) return base

  const params = new URLSearchParams()

  if (!base.includes('connection_limit')) {
    params.set('connection_limit', isPgBouncer ? '1' : (isProd ? '8' : '5'))
  }
  if (!base.includes('pool_timeout'))    params.set('pool_timeout',    '30')
  if (!base.includes('connect_timeout')) params.set('connect_timeout', '10')

  // TCP keepalive no nível do driver (libpq): evita que NAT/firewall do Cloud Run
  // ou do Supabase feche conexões ociosas silenciosamente.
  // keepalives_idle=60: envia probe TCP depois de 60s sem tráfego
  // keepalives_interval=10: reenvio a cada 10s se não houver resposta
  // keepalives_count=3: após 3 falhas consecutivas, considera conexão morta
  if (!base.includes('keepalives')) {
    params.set('keepalives',          '1')
    params.set('keepalives_idle',     '60')
    params.set('keepalives_interval', '10')
    params.set('keepalives_count',    '3')
  }

  if (isPgBouncer && !base.includes('pgbouncer=true')) {
    params.set('pgbouncer', 'true')
  }

  // Só adiciona `options=` se a URL ainda não tiver — Neon usa options=endpoint%3D...
  // para roteamento interno; adicionar um segundo `options=` causa P1000 (auth fail).
  if (!base.includes('options=')) {
    if (!isPgBouncer && !base.includes('statement_timeout')) {
      const pgOpts = [
        'statement_timeout=15000',
        'idle_in_transaction_session_timeout=20000',
        'application_name=financaspro',
      ].join(' -c ')
      params.set('options', `-c ${pgOpts}`)
    } else if (isPgBouncer) {
      params.set('options', '-c application_name=financaspro')
    }
  }

  const sep = base.includes('?') ? '&' : '?'
  const qs  = params.toString()
  return qs ? `${base}${sep}${qs}` : base
}

// Log de queries lentas (>2s) em produção para identificar gargalos
const logConfig = isProd
  ? [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'query' },  // necessário para slow query log
    ]
  : [
      { emit: 'event', level: 'error' },
      { emit: 'event', level: 'warn'  },
      { emit: 'event', level: 'query' },
    ]

const prisma = new PrismaClient({
  log: logConfig,
  datasources: { db: { url: buildUrl() } },
})

prisma.$on('error', (e) => {
  // ConnectionReset (code 104) é normal: o servidor fecha conexões ociosas e o
  // Prisma reconecta automaticamente. Não é um erro acionável.
  if (e.message.includes('ConnectionReset') || e.message.includes('Connection reset')) return
  console.error('[Prisma] ERROR:', e.message)
})

// Loga queries lentas: >2s em produção, >500ms em desenvolvimento
const SLOW_THRESHOLD_MS = isProd ? 2000 : 500
prisma.$on('query', (e) => {
  if (e.duration > SLOW_THRESHOLD_MS) {
    console.warn(`[Prisma] SLOW QUERY ${e.duration}ms: ${e.query.slice(0, 120)}`)
  }
})

if (!isProd) {
  prisma.$on('warn', (e) => console.warn('[Prisma] WARN:', e.message))
}

if (isPgBouncer) {
  console.log('[Prisma] Modo PgBouncer ativo (connection_limit=1)')
} else {
  console.log('[Prisma] Conexão direta (connection_limit=' + (isProd ? 8 : 5) + ')')
}

// Códigos de erro Prisma que indicam falha transitória — recuperáveis com retry
const RETRYABLE = new Set(['P1001','P1002','P1008','P1017','P2024'])

function isRetryable(err) {
  return RETRYABLE.has(err.code) ||
    err.message?.includes('ConnectionReset') ||
    err.message?.includes('connection closed') ||
    err.message?.includes('Can\'t reach database')
}

// Middleware global: todas as queries retentam automaticamente em falha transitória.
// Elimina a necessidade de withRetry() em cada rota individualmente.
const prismaWithRetry = prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ operation, model, args, query }) {
        const MAX = 2
        for (let attempt = 0; attempt <= MAX; attempt++) {
          try {
            return await query(args)
          } catch (err) {
            if (attempt < MAX && isRetryable(err)) {
              await new Promise(r => setTimeout(r, 200 * (attempt + 1)))
              continue
            }
            throw err
          }
        }
      },
    },
  },
})

module.exports = prismaWithRetry
module.exports.raw = prisma  // acesso direto sem retry (health check, migrations)
