const { PrismaClient } = require('@prisma/client')
const { buildUrl, resolveConnectionLimit } = require('./databaseUrl')

const isProd      = process.env.NODE_ENV === 'production'
const isPgBouncer = (process.env.DATABASE_URL || '').includes(':6543') ||
                    (process.env.DATABASE_URL || '').includes('pgbouncer=true')

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

{
  const { value, source } = resolveConnectionLimit(process.env)
  console.log(`[Prisma] ${isPgBouncer ? 'Modo PgBouncer ativo' : 'Conexão direta'} (connection_limit=${value}, origem: ${source})`)
}

// Códigos de erro Prisma que indicam falha transitória — recuperáveis com retry
const RETRYABLE = new Set(['P1001','P1002','P1008','P1017','P2024'])

function isRetryable(err) {
  return RETRYABLE.has(err.code) ||
    err.message?.includes('ConnectionReset') ||
    err.message?.includes('connection closed') ||
    err.message?.includes('Can\'t reach database')
}

// ── Guard-rail multi-tenant ──────────────────────────────────────────────
// Defesa em profundidade: hoje o único isolamento entre contas de usuário é
// a convenção manual `where: { userId }` escrita à mão em cada rota — nada
// automático pega se alguém esquecer. RLS está ligado no banco (migration.sql),
// mas sem nenhuma POLICY — bloqueia só acesso direto via PostgREST/Supabase
// REST, não protege as queries do próprio backend, que conecta como superuser.
// Esta camada barra, em runtime, qualquer query num modelo com `userId` que
// não filtre por ele — lança erro em vez de executar silenciosamente sem
// escopo. Escape hatch: os poucos call-sites legítimos sem userId disponível
// (lookup por token/segredo pré-sessão) usam module.exports.raw, abaixo,
// explicitamente e com comentário.
const TENANT_MODELS = new Set([
  'Transaction', 'Budget', 'CategoryLimit', 'Goal', 'PushSubscription',
  'InstallmentPlan', 'TwoFactorBackupCode', 'ProcessedPayment', 'AccountUnlockToken', 'UserAvatar',
])

// findUnique/findUniqueOrThrow ficam de fora de propósito — são lookups por
// chave única (id, ou outro campo @unique como token/endpoint), o padrão já
// usado pelos poucos fluxos pré-sessão legítimos (ex: token de desbloqueio de
// conta antes do usuário ter uma sessão). A defesa real de multi-tenancy está
// em find/update/delete "de muitos" e em singular por id, que é onde um
// esquecimento de fato vaza ou modifica dado de outro usuário.
const SCOPED_OPS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow',
  'update', 'updateMany', 'delete', 'deleteMany',
  'count', 'aggregate', 'groupBy',
])

function whereHasUserId(where) {
  if (!where || typeof where !== 'object') return false
  if (Object.prototype.hasOwnProperty.call(where, 'userId')) return true
  for (const key of ['AND', 'OR']) {
    const val = where[key]
    if (Array.isArray(val) && val.some(whereHasUserId)) return true
  }
  return false
}

function tenantGuard({ model, operation, args }) {
  if (!model || !TENANT_MODELS.has(model)) return

  if (operation === 'create') {
    if (!args?.data || !Object.prototype.hasOwnProperty.call(args.data, 'userId')) {
      throw new Error(`[tenant-guard] ${model}.create sem userId em data — use .raw se for intencional`)
    }
    return
  }
  if (operation === 'createMany') {
    const rows = Array.isArray(args?.data) ? args.data : [args?.data]
    if (rows.some(r => !r || !Object.prototype.hasOwnProperty.call(r, 'userId'))) {
      throw new Error(`[tenant-guard] ${model}.createMany com registro sem userId — use .raw se for intencional`)
    }
    return
  }
  if (operation === 'upsert') {
    // where do upsert precisa resolver um campo @unique (não dá pra exigir
    // userId ali) — a garantia real aqui é o branch create ter userId.
    if (!args?.create || !Object.prototype.hasOwnProperty.call(args.create, 'userId')) {
      throw new Error(`[tenant-guard] ${model}.upsert sem userId no create — use .raw se for intencional`)
    }
    return
  }
  if (SCOPED_OPS.has(operation) && !whereHasUserId(args?.where)) {
    throw new Error(`[tenant-guard] ${model}.${operation} sem userId no where — use .raw se for intencional`)
  }
}

// Middleware global: todas as queries retentam automaticamente em falha transitória,
// e queries em modelos com userId passam pela guarda multi-tenant acima.
// Elimina a necessidade de withRetry() em cada rota individualmente.
const prismaWithRetry = prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ operation, model, args, query }) {
        tenantGuard({ model, operation, args })
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
// Acesso direto — sem retry, sem a guarda multi-tenant acima. Escape hatch
// pra health check, migrations, e os poucos call-sites que legitimamente não
// têm userId disponível (fica a cargo de cada call-site comentar o motivo).
module.exports.raw = prisma
