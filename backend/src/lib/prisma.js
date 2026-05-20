const { PrismaClient } = require('@prisma/client')

const isProd      = process.env.NODE_ENV === 'production'
const isPgBouncer = (process.env.DATABASE_URL || '').includes(':6543') ||
                    (process.env.DATABASE_URL || '').includes('pgbouncer=true')

function buildUrl() {
  const base = process.env.DATABASE_URL || ''
  if (!base) return base

  const params = new URLSearchParams()

  // PgBouncer (porta 6543) exige connection_limit=1 — o próprio pooler gerencia
  // as conexões reais com o PostgreSQL. Com conexão direta usamos até 10.
  if (!base.includes('connection_limit')) {
    params.set('connection_limit', isPgBouncer ? '1' : (isProd ? '10' : '5'))
  }
  if (!base.includes('pool_timeout'))    params.set('pool_timeout',    '20')
  if (!base.includes('connect_timeout')) params.set('connect_timeout', '10')

  // pgbouncer=true instrui o Prisma a não usar prepared statements persistentes
  // (incompatível com PgBouncer transaction mode)
  if (isPgBouncer && !base.includes('pgbouncer=true')) {
    params.set('pgbouncer', 'true')
  }

  // Opções PostgreSQL de sessão (não suportadas no modo transaction do PgBouncer)
  if (!isPgBouncer && !base.includes('statement_timeout')) {
    const pgOpts = [
      'statement_timeout=15000',
      'idle_in_transaction_session_timeout=20000',
      'application_name=financaspro',
    ].join(' -c ')
    params.set('options', `-c ${pgOpts}`)
  } else if (isPgBouncer && !base.includes('application_name')) {
    params.set('options', '-c application_name=financaspro')
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
  console.log('[Prisma] Conexão direta (connection_limit=' + (isProd ? 10 : 5) + ')')
}

module.exports = prisma
