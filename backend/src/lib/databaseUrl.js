'use strict'

// URL do banco que o Prisma usa (parâmetros de conexão). Separado de prisma.js para poder ser testado sem abrir conexão.
const MAX_CONNECTION_LIMIT = 20

const isProd      = (env) => env.NODE_ENV === 'production'
const isPgBouncer = (env) => (env.DATABASE_URL || '').includes(':6543') || (env.DATABASE_URL || '').includes('pgbouncer=true')

/**
 * Quantas conexões o Prisma mantém com o banco, e de onde veio o número. Ordem: o que a própria DATABASE_URL já diz
 * (connection_limit=) > DB_CONNECTION_LIMIT (inteiro de 1 a 20; valor inválido é ignorado) > padrão (pooler: 1; conexão
 * direta: 3 em produção e 5 fora dela).
 *
 * Com 1 conexão o Prisma atende UMA consulta por vez por instância: 8 pedidos ao mesmo tempo viram fila (medido na
 * homologação: ~0,6 s por consulta e o 8º pedido esperando ~10 s). DB_CONNECTION_LIMIT existe para testar mais conexões
 * sem mexer no código nem no segredo da URL.
 */
function resolveConnectionLimit(env = process.env) {
  const inUrl = /[?&]connection_limit=(\d+)/.exec(env.DATABASE_URL || '')
  if (inUrl) return { value: Number(inUrl[1]), source: 'DATABASE_URL' }
  const fromEnv = Number(env.DB_CONNECTION_LIMIT)
  if (env.DB_CONNECTION_LIMIT && Number.isInteger(fromEnv) && fromEnv >= 1 && fromEnv <= MAX_CONNECTION_LIMIT) {
    return { value: fromEnv, source: 'DB_CONNECTION_LIMIT' }
  }
  return { value: isPgBouncer(env) ? 1 : (isProd(env) ? 3 : 5), source: 'padrão' }
}

function buildUrl(env = process.env) {
  const base = env.DATABASE_URL || ''
  if (!base) return base
  const pgBouncer = isPgBouncer(env)

  const params = new URLSearchParams()

  if (!base.includes('connection_limit')) {
    params.set('connection_limit', String(resolveConnectionLimit(env).value))
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

  if (pgBouncer && !base.includes('pgbouncer=true')) {
    params.set('pgbouncer', 'true')
  }

  // Só adiciona `options=` se a URL ainda não tiver — Neon usa options=endpoint%3D...
  // para roteamento interno; adicionar um segundo `options=` causa P1000 (auth fail).
  if (!base.includes('options=')) {
    if (!pgBouncer && !base.includes('statement_timeout')) {
      const pgOpts = [
        'statement_timeout=15000',
        'idle_in_transaction_session_timeout=20000',
        'application_name=nancy',
      ].join(' -c ')
      params.set('options', `-c ${pgOpts}`)
    } else if (pgBouncer) {
      params.set('options', '-c application_name=nancy')
    }
  }

  const sep = base.includes('?') ? '&' : '?'
  const qs  = params.toString()
  return qs ? `${base}${sep}${qs}` : base
}

module.exports = { buildUrl, resolveConnectionLimit, MAX_CONNECTION_LIMIT }
