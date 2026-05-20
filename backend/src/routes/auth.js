const express        = require('express')
const bcrypt         = require('bcryptjs')
const jwt            = require('jsonwebtoken')
const crypto         = require('crypto')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { sendResetEmail } = require('../services/emailService')
const { forgotPasswordLimiter, resetPasswordLimiter } = require('../middleware/rateLimiter')

const EMAIL_REGEX    = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/
const isProd = process.env.NODE_ENV === 'production'

// Gerado uma única vez na inicialização — bcrypt.compare é sempre executado
// mesmo quando o e-mail não existe, prevenindo timing attack que revelaria
// quais e-mails estão cadastrados (email enumeration via response time).
const DUMMY_HASH = bcrypt.hashSync('__timing_guard__', 12)

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
    if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
      return res.status(400).json({ error: 'A senha deve ter entre 8 e 72 caracteres.' })
    }
    // Exige a mesma complexidade do reset-password — evita senhas fracas na criação
    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({ error: 'A senha deve conter maiúscula, minúscula e número.' })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado.' })
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: {
        name:        name.trim(),
        email:       normalizedEmail,
        password:    hashedPassword,
        salary:      salary || 0,
        reportEmail: normalizedEmail,  // era `email` — agora usa o e-mail normalizado
      }
    })

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' })
    setAuthCookie(res, token)

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, salary: user.salary, reportEmail: user.reportEmail, plan: user.plan }
    })
  } catch (error) {
    console.error('[auth] register:', error.message)
    res.status(500).json({ error: 'Erro ao criar usuário.' })
  }
})

// ── POST /auth/login ────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' })
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' })
    }
    if (typeof password !== 'string' || password.length > 72) {
      return res.status(400).json({ error: 'Senha inválida.' })
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })

    // Sempre executa bcrypt — sem isso, user inexistente retorna em ~1ms e user existente
    // em ~100ms, revelando quais e-mails estão cadastrados por timing attack.
    const passwordMatch = await bcrypt.compare(password, user?.password ?? DUMMY_HASH)

    if (!user || !passwordMatch) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' })
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' })
    setAuthCookie(res, token)

    res.json({
      user: { id: user.id, name: user.name, email: user.email, salary: user.salary, reportEmail: user.reportEmail, plan: user.plan }
    })
  } catch (error) {
    console.error('[auth] login:', error.message)
    res.status(500).json({ error: 'Erro ao fazer login.' })
  }
})

// ── GET /auth/me ────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true }
    })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuário.' })
  }
})

// ── POST /auth/forgot-password ──────────────────────────
router.post('/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' })
    }

    // Normaliza antes de consultar — evita divergência entre register (normalizado) e lookup
    const normalizedEmail = email.toLowerCase().trim()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    // Resposta idêntica independente de existir ou não — evita email enumeration
    if (!user) return res.json({ message: 'Se este e-mail existir, você receberá o link em breve.' })

    const rawToken  = crypto.randomBytes(32).toString('hex')
    const hash      = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiry    = new Date(Date.now() + 60 * 60 * 1000)

    await prisma.user.update({
      where: { id: user.id },
      data:  { resetToken: hash, resetTokenExpiry: expiry }
    })

    const appUrl    = process.env.APP_URL || 'https://finance-app-1042158013294.southamerica-east1.run.app'
    const resetLink = `${appUrl}/reset-password?token=${rawToken}`

    await sendResetEmail(user.email, user.name, resetLink)

    res.json({ message: 'Se este e-mail existir, você receberá o link em breve.' })
  } catch (error) {
    console.error('[auth] forgot-password:', error.message)
    res.status(500).json({ error: 'Erro ao processar solicitação.' })
  }
})

// ── POST /auth/reset-password ───────────────────────────
router.post('/reset-password', resetPasswordLimiter, async (req, res) => {
  try {
    const { token, password } = req.body
    if (!token || !password) {
      return res.status(400).json({ error: 'Token e nova senha são obrigatórios.' })
    }
    if (typeof password !== 'string' || password.length > 72) {
      return res.status(400).json({ error: 'Senha inválida.' })
    }
    if (!PASSWORD_REGEX.test(password)) {
      return res.status(400).json({ error: 'Mínimo 8 caracteres com letra maiúscula, minúscula e número.' })
    }

    const hash = crypto.createHash('sha256').update(token).digest('hex')
    const user = await prisma.user.findFirst({
      where: { resetToken: hash, resetTokenExpiry: { gt: new Date() } }
    })

    if (!user) return res.status(400).json({ error: 'Link inválido ou expirado. Solicite um novo.' })

    const hashedPassword = await bcrypt.hash(password, 12)
    await prisma.user.update({
      where: { id: user.id },
      data:  { password: hashedPassword, resetToken: null, resetTokenExpiry: null }
    })

    res.json({ message: 'Senha redefinida com sucesso! Faça login com a nova senha.' })
  } catch (error) {
    console.error('[auth] reset-password:', error.message)
    res.status(500).json({ error: 'Erro ao redefinir senha.' })
  }
})

// ── POST /auth/upgrade ──────────────────────────────────
router.post('/upgrade', authMiddleware, async (req, res) => {
  const { upgradeSecret } = req.body
  const secret = process.env.UPGRADE_SECRET

  // timingSafeEqual impede brute-force por timing — lê tempo de strcmp na resposta
  const valid = secret
    && typeof upgradeSecret === 'string'
    && upgradeSecret.length === secret.length
    && crypto.timingSafeEqual(Buffer.from(upgradeSecret), Buffer.from(secret))

  if (!valid) {
    return res.status(403).json({ error: 'Não autorizado.' })
  }
  try {
    const user = await prisma.user.update({
      where:  { id: req.userId },
      data:   { plan: 'pro' },
      select: { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true }
    })
    res.json({ message: 'Plano atualizado para Pro!', user })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar plano.' })
  }
})

// ── PUT /auth/profile ────────────────────────────────────
// Atualiza nome e/ou e-mail de relatório do usuário
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, reportEmail } = req.body
    const data = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Nome deve ter entre 2 e 100 caracteres.' })
      }
      data.name = name.trim()
    }

    if (reportEmail !== undefined) {
      if (!EMAIL_REGEX.test(reportEmail)) {
        return res.status(400).json({ error: 'E-mail de relatório inválido.' })
      }
      data.reportEmail = reportEmail.toLowerCase().trim()
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar.' })
    }

    const user = await prisma.user.update({
      where:  { id: req.userId },
      data,
      select: { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true }
    })
    res.json({ user })
  } catch (error) {
    console.error('[auth] profile:', error.message)
    res.status(500).json({ error: 'Erro ao atualizar perfil.' })
  }
})

// ── POST /auth/logout ───────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token', { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/' })
  res.json({ message: 'Logout realizado.' })
})

// ── POST /auth/downgrade ────────────────────────────────
router.post('/downgrade', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where:  { id: req.userId },
      data:   { plan: 'free' },
      select: { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true }
    })
    res.json({ message: 'Plano alterado para Free.', user })
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar plano.' })
  }
})

module.exports = router
