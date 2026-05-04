// ═══════════════════════════════════════════════════════
// 🛡️ middleware/rateLimiter.js — Proteção contra Brute Force
// ═══════════════════════════════════════════════════════

const rateLimit = require('express-rate-limit')

// Limite geral de API: 100 req / 15 min por IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' }
})

// Limite específico de autenticação: 10 tentativas / 15 min por IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
})

module.exports = { apiLimiter, authLimiter }
