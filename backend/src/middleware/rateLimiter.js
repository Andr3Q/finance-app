// ═══════════════════════════════════════════════════════
// 🛡️ middleware/rateLimiter.js — Proteção contra Brute Force
// ═══════════════════════════════════════════════════════

const rateLimit = require('express-rate-limit')

const opts = { standardHeaders: true, legacyHeaders: false }

// Limite geral de API: 200 req / 15 min por IP
const apiLimiter = rateLimit({
  ...opts,
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
})

// Autenticação: 10 tentativas / 15 min por IP (brute force)
const authLimiter = rateLimit({
  ...opts,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
})

// Agente IA: 40 mensagens / hora (limita custo de API)
const agentLimiter = rateLimit({
  ...opts,
  windowMs: 60 * 60 * 1000,
  max: 40,
  message: { error: 'Limite de mensagens para a IA atingido. Tente novamente em 1 hora.' },
})

// Recuperação de senha: 5 tentativas / hora (anti-spam de e-mail)
const forgotPasswordLimiter = rateLimit({
  ...opts,
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de recuperação de senha. Tente novamente em 1 hora.' },
})

// Reset de senha: 10 tentativas / 15 min (anti brute-force de token)
const resetPasswordLimiter = rateLimit({
  ...opts,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Muitas tentativas de redefinição de senha. Tente novamente em 15 minutos.' },
})

// Dashboard / rotas pesadas: 30 req / min por usuário autenticado
const dashboardLimiter = rateLimit({
  ...opts,
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.userId || req.ip,
  message: { error: 'Muitas requisições. Aguarde um momento.' },
})

module.exports = { apiLimiter, authLimiter, agentLimiter, forgotPasswordLimiter, resetPasswordLimiter, dashboardLimiter }
