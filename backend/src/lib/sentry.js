// ── Sentry — inicializar antes de qualquer require de rota ──────────
// Require CONDICIONAL: @sentry/node v10 usa OpenTelemetry que patcha o
// sistema de módulos no load-time. Só carregamos quando SENTRY_DSN está
// definido — isso evita interferência com Jest (que nunca define SENTRY_DSN).
// Precisa ser um dos primeiros requires de server.js (antes de express e
// das rotas) pra instrumentação automática funcionar.
let Sentry = null
if (process.env.SENTRY_DSN) {
  Sentry = require('@sentry/node')
  Sentry.init({
    dsn:              process.env.SENTRY_DSN,
    environment:      process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0.1, // 10% das requisições (quota free: 10k/mês)
  })
}

// As rotas legadas (fora do domínio Goals) capturam o próprio erro em
// try/catch e respondem direto com res.status(...).json(...) — nunca
// chamam next(err), então nunca passavam pelo Sentry.setupExpressErrorHandler
// (server.js). Esse helper fecha essa lacuna sem precisar migrar as rotas
// pra arquitetura nova: chama no lugar de console.error cru no catch.
function reportError(err, context = {}) {
  console.error(context.tag || '[ERROR]', err.message)
  if (Sentry) Sentry.captureException(err, { extra: context })
}

module.exports = { Sentry, reportError }
