const { PrismaClient } = require('@prisma/client')

// Singleton — uma única conexão compartilhada por todas as rotas.
// Evita múltiplos pools de conexão que esgotam o limite do PostgreSQL no Cloud Run.
const prisma = new PrismaClient({
  log: ['error'],
  datasources: {
    db: {
      url: (() => {
        const base = process.env.DATABASE_URL || ''
        // Adiciona parâmetros de pool se ainda não existirem
        const sep = base.includes('?') ? '&' : '?'
        if (base.includes('connection_limit')) return base
        return `${base}${sep}connection_limit=3&pool_timeout=15&connect_timeout=15`
      })()
    }
  }
})

module.exports = prisma
