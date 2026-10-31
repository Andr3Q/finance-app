'use strict'
const { buildUrl, resolveConnectionLimit, MAX_CONNECTION_LIMIT } = require('../src/lib/databaseUrl')

// Referência CONGELADA do construtor de URL de antes do DB_CONNECTION_LIMIT (copiado de prisma.js): prova que, sem a
// variável, a URL que o Prisma recebe é exatamente a mesma de antes — só a origem do connection_limit ganhou uma opção.
function legacyBuildUrl(env) {
  const isProd = env.NODE_ENV === 'production'
  const isPgBouncer = (env.DATABASE_URL || '').includes(':6543') || (env.DATABASE_URL || '').includes('pgbouncer=true')
  const base = env.DATABASE_URL || ''
  if (!base) return base
  const params = new URLSearchParams()
  if (!base.includes('connection_limit')) params.set('connection_limit', isPgBouncer ? '1' : (isProd ? '3' : '5'))
  if (!base.includes('pool_timeout'))    params.set('pool_timeout',    '30')
  if (!base.includes('connect_timeout')) params.set('connect_timeout', '10')
  if (!base.includes('keepalives')) {
    params.set('keepalives', '1'); params.set('keepalives_idle', '60'); params.set('keepalives_interval', '10'); params.set('keepalives_count', '3')
  }
  if (isPgBouncer && !base.includes('pgbouncer=true')) params.set('pgbouncer', 'true')
  if (!base.includes('options=')) {
    if (!isPgBouncer && !base.includes('statement_timeout')) {
      params.set('options', `-c ${['statement_timeout=15000', 'idle_in_transaction_session_timeout=20000', 'application_name=nancy'].join(' -c ')}`)
    } else if (isPgBouncer) {
      params.set('options', '-c application_name=nancy')
    }
  }
  const sep = base.includes('?') ? '&' : '?'
  const qs = params.toString()
  return qs ? `${base}${sep}${qs}` : base
}

const POOLER = 'postgresql://postgres.abc:segredo@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true'
const POOLER_NO_FLAG = 'postgresql://postgres.abc:segredo@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
const DIRECT = 'postgresql://postgres:segredo@db.abc.supabase.co:5432/postgres'
const EXPLICIT = 'postgresql://postgres:segredo@host:6543/postgres?pgbouncer=true&connection_limit=2'

describe('buildUrl — sem DB_CONNECTION_LIMIT é igual ao de antes', () => {
  test.each([
    ['pooler (homologação/produção)', { DATABASE_URL: POOLER, NODE_ENV: 'production' }],
    ['pooler sem o aviso pgbouncer=true (porta 6543)', { DATABASE_URL: POOLER_NO_FLAG, NODE_ENV: 'production' }],
    ['conexão direta em produção', { DATABASE_URL: DIRECT, NODE_ENV: 'production' }],
    ['conexão direta em desenvolvimento', { DATABASE_URL: DIRECT, NODE_ENV: 'development' }],
    ['URL com connection_limit próprio', { DATABASE_URL: EXPLICIT, NODE_ENV: 'production' }],
    ['URL com opções já definidas', { DATABASE_URL: `${DIRECT}?options=endpoint%3Dabc`, NODE_ENV: 'production' }],
    ['sem DATABASE_URL', { NODE_ENV: 'production' }],
  ])('%s', (_, env) => {
    expect(buildUrl(env)).toBe(legacyBuildUrl(env))
  })

  test('o pooler continua com 1 conexão e pgbouncer ligado (o padrão não mudou)', () => {
    const url = buildUrl({ DATABASE_URL: POOLER_NO_FLAG, NODE_ENV: 'production' })
    expect(url).toContain('connection_limit=1')
    expect(url).toContain('pgbouncer=true')
    expect(url).toContain('options=-c+application_name%3Dnancy')
  })
})

describe('DB_CONNECTION_LIMIT — mais conexões sem mexer no código nem no segredo', () => {
  test('no pooler, 5 vira connection_limit=5 e o resto da URL fica igual', () => {
    const env = { DATABASE_URL: POOLER, NODE_ENV: 'production', DB_CONNECTION_LIMIT: '5' }
    const url = buildUrl(env)
    expect(url).toContain('connection_limit=5')
    expect(url).not.toContain('connection_limit=1')
    expect(url.replace('connection_limit=5', 'connection_limit=1')).toBe(legacyBuildUrl({ ...env, DB_CONNECTION_LIMIT: undefined }))
  })

  test('vale também na conexão direta', () => {
    expect(buildUrl({ DATABASE_URL: DIRECT, NODE_ENV: 'production', DB_CONNECTION_LIMIT: '8' })).toContain('connection_limit=8')
  })

  test('aceita de 1 a 20; fora disso ou texto/decimal/vazio é ignorado (cai no padrão)', () => {
    for (const ok of ['1', '2', '10', String(MAX_CONNECTION_LIMIT)]) {
      expect(resolveConnectionLimit({ DATABASE_URL: POOLER, DB_CONNECTION_LIMIT: ok })).toEqual({ value: Number(ok), source: 'DB_CONNECTION_LIMIT' })
    }
    for (const bad of ['0', '-3', '21', '999', '2.5', 'abc', '5; DROP', '', ' ', 'NaN', 'Infinity']) {
      expect(resolveConnectionLimit({ DATABASE_URL: POOLER, DB_CONNECTION_LIMIT: bad })).toEqual({ value: 1, source: 'padrão' })
    }
  })

  test('o que a própria URL já diz tem prioridade sobre a variável', () => {
    expect(resolveConnectionLimit({ DATABASE_URL: EXPLICIT, DB_CONNECTION_LIMIT: '9' })).toEqual({ value: 2, source: 'DATABASE_URL' })
    expect(buildUrl({ DATABASE_URL: EXPLICIT, DB_CONNECTION_LIMIT: '9' })).toBe(legacyBuildUrl({ DATABASE_URL: EXPLICIT }))
  })

  test('padrões: pooler 1; direto 3 em produção e 5 fora dela', () => {
    expect(resolveConnectionLimit({ DATABASE_URL: POOLER, NODE_ENV: 'production' }).value).toBe(1)
    expect(resolveConnectionLimit({ DATABASE_URL: DIRECT, NODE_ENV: 'production' }).value).toBe(3)
    expect(resolveConnectionLimit({ DATABASE_URL: DIRECT, NODE_ENV: 'development' }).value).toBe(5)
  })
})
