'use strict'

// ────────────────────────────────────────────────────────────────────
// logger.js — Logger estruturado centralizado (pino)
//
// • Produção  → JSON puro (Cloud Run captura stdout e indexa no GCP
//               Log Explorer, permitindo filtros por campo)
// • Dev       → pino-pretty com cores para leitura humana
// • Test      → nível 'silent' para não poluir saída dos testes
// ────────────────────────────────────────────────────────────────────
const pino = require('pino')

const isTest = process.env.NODE_ENV === 'test'
const isDev  = process.env.NODE_ENV === 'development'

module.exports = pino({
  level: process.env.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
  base: { service: 'finance-api', env: process.env.NODE_ENV ?? 'production' },

  // pino-pretty apenas em desenvolvimento — produção usa JSON puro
  ...(isDev && {
    transport: { target: 'pino-pretty', options: { colorize: true } },
  }),
})
