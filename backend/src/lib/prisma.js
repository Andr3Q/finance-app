const { PrismaClient } = require('@prisma/client')

const buildUrl = () => {
  const base  = process.env.DATABASE_URL || ''
  const sep   = base.includes('?') ? '&' : '?'
  if (base.includes('connection_limit')) return base
  const limit = process.env.NODE_ENV === 'production' ? 10 : 5
  return `${base}${sep}connection_limit=${limit}&pool_timeout=20&connect_timeout=15`
}

const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'error' }],
  datasources: { db: { url: buildUrl() } },
})

// Neon termina conexões ociosas (E57P01) — Prisma reconecta automaticamente.
// Suprime esse log esperado para não poluir o terminal.
prisma.$on('error', (e) => {
  if (e.message?.includes('terminating connection due to administrator command')) return
  console.error('[Prisma]', e.message)
})

// Neon free tier dorme após 5 min sem atividade.
// Ping a cada 4 min mantém o banco acordado enquanto o container estiver vivo.
if (process.env.NODE_ENV === 'production') {
  setInterval(async () => {
    try { await prisma.$queryRaw`SELECT 1` } catch { /* silencioso */ }
  }, 4 * 60 * 1000)
}

module.exports = prisma
