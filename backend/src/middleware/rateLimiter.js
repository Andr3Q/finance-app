const rateLimit = require('express-rate-limit')

const skip = () => process.env.NODE_ENV === 'test'

// req.ip já retorna o IP real do visitante quando Express tem trust proxy ativo
// (Cloud Run seta X-Forwarded-For e o proxy da Cloudflare está na cadeia de confiança).
// Não usar CF-Connecting-IP diretamente: qualquer cliente pode forjar esse header,
// permitindo bypass total do rate limiting.
const keyGenerator = (req) => req.userId || req.ip

const opts = { standardHeaders: true, legacyHeaders: false, skip, keyGenerator }

// Limite geral de API: 200 req / 15 min por IP
const apiLimiter = rateLimit({
  ...opts,
  windowMs: 15 * 60 * 1000,
  max:      200,
  message:  { error: 'Muitas requisições. Tente novamente em 15 minutos.' },
})

// Login: 10 tentativas / 15 min por IP — aplicado SOMENTE ao POST /auth/login.
// Não usar skipSuccessfulRequests aqui: logins inválidos sempre falham e devem contar.
// Aplicar em rota estreita evita bloquear /auth/me e /auth/logout quando o limite estoura.
// max seguro por padrão (10) — só relaxa em development explícito para facilitar testes
// Antes: `=== 'production' ? 10 : 50` → NODE_ENV ausente caía no else (50), sem proteção
const loginLimiter = rateLimit({
  ...opts,
  windowMs: 15 * 60 * 1000,
  max:      process.env.NODE_ENV === 'development' ? 50 : 10,
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
  message:      { error: 'Muitas requisições. Aguarde um momento.' },
})

// Fechamento mensal: 5 por hora (envia e-mail + gera PDF — operação custosa)
const reportLimiter = rateLimit({
  ...opts,
  windowMs:     60 * 60 * 1000,
  max:          5,
  message:      { error: 'Limite de fechamentos mensais atingido. Tente novamente em 1 hora.' },
})

// Registro de conta: 5 por hora por IP
const registerLimiter = rateLimit({
  ...opts,
  windowMs: 60 * 60 * 1000,
  max:      5,
  message:  { error: 'Muitas tentativas de cadastro. Tente novamente em 1 hora.' },
})

// Criação de preferência de pagamento: 10 por 15 min por usuário autenticado
// Evita que alguém crie preferências em loop gerando custo desnecessário no MP
const paymentLimiter = rateLimit({
  ...opts,
  windowMs:     15 * 60 * 1000,
  max:          10,
  message:      { error: 'Muitas tentativas de pagamento. Tente novamente em 15 minutos.' },
})

// 2FA: 10 tentativas / 15 min por IP — TOTP tem 10^6 possibilidades, impede brute-force
const twoFALimiter = rateLimit({
  ...opts,
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { error: 'Muitas tentativas de verificação. Tente novamente em 15 minutos.' },
})

// Export de dados: 5 por hora por usuário — cada chamada faz 6 joins pesados
const exportLimiter = rateLimit({
  ...opts,
  windowMs:     60 * 60 * 1000,
  max:          5,
  message:      { error: 'Limite de exportações atingido. Tente novamente em 1 hora.' },
})

// Verificação de e-mail: 3 reenvios / hora por usuário
const verifyEmailLimiter = rateLimit({
  ...opts,
  windowMs:     60 * 60 * 1000,
  max:          3,
  message:      { error: 'Muitas tentativas de reenvio. Tente novamente em 1 hora.' },
})


module.exports = {
  apiLimiter,
  loginLimiter,
  registerLimiter,
  agentLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  dashboardLimiter,
  reportLimiter,
  paymentLimiter,
  twoFALimiter,
  exportLimiter,
  verifyEmailLimiter,
}
