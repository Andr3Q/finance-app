// ═══════════════════════════════════════════════════════
// 🔑 src/routes/auth.js — Autenticação
//
// Gerencia cadastro e login do usuário.
//
// Rotas disponíveis:
//   POST /auth/register → Cria novo usuário
//   POST /auth/login    → Valida credenciais e gera token JWT
//   GET  /auth/me       → Retorna dados do usuário logado
// ═══════════════════════════════════════════════════════

const express        = require('express')
const bcrypt         = require('bcryptjs')
const jwt            = require('jsonwebtoken')
const crypto         = require('crypto')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { sendResetEmail } = require('../services/emailService')
const { forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/rateLimiter')

const EMAIL_REGEX = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/

const isProd = process.env.NODE_ENV === 'production'

function setAuthCookie(res, token) {
  res.cookie('token', token, {
    httpOnly:  true,
    secure:    isProd,
    sameSite:  'strict',
    maxAge:    24 * 60 * 60 * 1000,
    path:      '/',
  })
}

const router = express.Router()

// ── POST /auth/register ─────────────────────────────────
// Cadastra um novo usuário no banco de dados.
// A senha é criptografada antes de salvar (nunca guardamos senha em texto puro!)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, salary } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' })
    }
    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) {
      return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' })
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' })
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' })
    }
    if (password.length > 72) {
      return res.status(400).json({ error: 'A senha deve ter no máximo 72 caracteres.' })
    }

    // Verifica se o e-mail já está cadastrado
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado.' })
    }

    // Criptografa a senha com bcrypt (salt = 10 rounds)
    const hashedPassword = await bcrypt.hash(password, 12)

    // Cria o usuário no banco
    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        salary: salary || 0,
        reportEmail: email // Por padrão, envia relatório para o próprio e-mail
      }
    })

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' })
    setAuthCookie(res, token)

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, salary: user.salary, reportEmail: user.reportEmail, plan: user.plan }
    })
  } catch (error) {
    console.error('Erro no register:', error)
    res.status(500).json({ error: 'Erro ao criar usuário.' })
  }
})

// ── POST /auth/login ────────────────────────────────────
// Valida e-mail e senha. Se corretos, retorna token JWT.
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' })
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' })
    }
    if (password.length > 72) {
      return res.status(400).json({ error: 'A senha deve ter no máximo 72 caracteres.' })
    }

    // Busca usuário pelo e-mail
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' })
    }

    // Compara a senha enviada com a senha criptografada no banco
    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' })
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' })
    setAuthCookie(res, token)

    res.json({
      user: { id: user.id, name: user.name, email: user.email, salary: user.salary, reportEmail: user.reportEmail, plan: user.plan }
    })
  } catch (error) {
    console.error('Erro no login:', error)
    res.status(500).json({ error: 'Erro ao fazer login.' })
  }
})

// ── GET /auth/me ────────────────────────────────────────
// Retorna os dados do usuário autenticado (rota protegida)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true }
    })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuário.' })
  }
})

// ── POST /auth/forgot-password ──────────────────────────
// Gera token de reset e envia link por e-mail
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body
    if (!email || !EMAIL_REGEX.test(email)) return res.status(400).json({ error: 'E-mail inválido.' })

    const user = await prisma.user.findUnique({ where: { email } })
    // Responde igual mesmo se não encontrar (evita descobrir e-mails cadastrados)
    if (!user) return res.json({ message: 'Se este e-mail existir, você receberá o link em breve.' })

    const rawToken  = crypto.randomBytes(32).toString('hex')
    const hash      = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiry    = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    await prisma.user.update({
      where: { id: user.id },
      data:  { resetToken: hash, resetTokenExpiry: expiry }
    })

    const appUrl    = process.env.APP_URL || 'https://financaspro-1042158013294.southamerica-east1.run.app'
    const resetLink = `${appUrl}/reset-password?token=${rawToken}`

    await sendResetEmail(user.email, user.name, resetLink)

    res.json({ message: 'Se este e-mail existir, você receberá o link em breve.' })
  } catch (error) {
    console.error('Erro no forgot-password:', error)
    res.status(500).json({ error: 'Erro ao processar solicitação.' })
  }
})

// ── POST /auth/reset-password ───────────────────────────
// Valida token e salva nova senha
router.post('/reset-password', resetPasswordLimiter, async (req, res) => {
  try {
    const { token, password } = req.body
    if (!token || !password) return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' })
    if (password.length < 8)  return res.status(400).json({ error: 'A senha deve ter pelo menos 8 caracteres.' })

    const hash = crypto.createHash('sha256').update(token).digest('hex')
    const user = await prisma.user.findFirst({
      where: {
        resetToken:       hash,
        resetTokenExpiry: { gt: new Date() } // token ainda válido
      }
    })

    if (!user) return res.status(400).json({ error: 'Link inválido ou expirado. Solicite um novo.' })

    const hashedPassword = await bcrypt.hash(password, 12)
    await prisma.user.update({
      where: { id: user.id },
      data:  { password: hashedPassword, resetToken: null, resetTokenExpiry: null }
    })

    res.json({ message: 'Senha redefinida com sucesso! Faça login com a nova senha.' })
  } catch (error) {
    console.error('Erro no reset-password:', error)
    res.status(500).json({ error: 'Erro ao redefinir senha.' })
  }
})

// ── POST /auth/upgrade ──────────────────────────────────
// Ativa o plano Pro — requer chave secreta do servidor (webhook do Mercado Pago)
router.post('/upgrade', authMiddleware, async (req, res) => {
  const { upgradeSecret } = req.body
  if (!upgradeSecret || upgradeSecret !== process.env.UPGRADE_SECRET) {
    return res.status(403).json({ error: 'Não autorizado.' })
  }
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data:  { plan: 'pro' },
      select: { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true }
    })
    res.json({ message: 'Plano atualizado para Pro!', user })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar plano.' })
  }
})

// ── POST /auth/logout ───────────────────────────────────
// Limpa o cookie de sessão
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/' })
  res.json({ message: 'Logout realizado.' })
})

// ── POST /auth/downgrade ────────────────────────────────
// Volta para o plano Free (cancelamento)
router.post('/downgrade', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data:  { plan: 'free' },
      select: { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true }
    })
    res.json({ message: 'Plano alterado para Free.', user })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar plano.' })
  }
})

module.exports = router
