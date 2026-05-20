const rateLimit = require('express-rate-limit')

const opts = { standardHeaders: true, legacyHeaders: false }

// Limite geral de API: 200 req / 15 min por IP
const apiLimiter = rateLimit({
  ...opts,
  windowMs: 15 * 60 * 1000,
  max:      200,
  message:  { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
})

// Autenticação: 5 tentativas / 15 min por IP
// skipSuccessfulRequests: logins bem-sucedidos não consomem a cota — só tentativas falhas
const authLimiter = rateLimit({
  ...opts,
  windowMs:               15 * 60 * 1000,
  max:                    5,
  skipSuccessfulRequests: true,
  message:  { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
})

// Agente IA: 40 mensagens / hora (limita custo de API)
const agentLimiter = rateLimit({
  ...opts,
  windowMs: 60 * 60 * 1000,
  max:      40,
  message:  { error: 'Limite de mensagens para a IA atingido. Tente novamente em 1 hora.' },
})

// Recuperação de senha: 3 tentativas / hora — reduzido de 5 para limitar spam de e-mail
const forgotPasswordLimiter = rateLimit({
  ...opts,
  windowMs: 60 * 60 * 1000,
  max:      3,
  message:  { error: 'Muitas tentativas de recuperação de senha. Tente novamente em 1 hora.' },
})

// Reset de senha: 10 tentativas / 15 min (anti brute-force de token)
const resetPasswordLimiter = rateLimit({
  ...opts,
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { error: 'Muitas tentativas de redefinição de senha. Tente novamente em 15 minutos.' },
})

// Dashboard / rotas pesadas: 30 req / min por usuário autenticado
const dashboardLimiter = rateLimit({
  ...opts,
  windowMs:     60 * 1000,
  max:          30,
  keyGenerator: (req) => req.userId || req.ip,
  message:      { error: 'Muitas requisições. Aguarde um momento.' },
})

// Fechamento mensal: 5 por hora (envia e-mail + gera PDF — operação custosa)
const reportLimiter = rateLimit({
  ...opts,
  windowMs:     60 * 60 * 1000,
  max:          5,
  keyGenerator: (req) => req.userId || req.ip,
  message:      { error: 'Limite de fechamentos mensais atingido. Tente novamente em 1 hora.' },
})

module.exports = {
  apiLimiter,
  authLimiter,
  agentLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  dashboardLimiter,
  reportLimiter,
}
