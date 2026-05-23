const express        = require('express')
const bcrypt         = require('bcryptjs')
const jwt            = require('jsonwebtoken')
const crypto         = require('crypto')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { sendResetEmail, sendRenewalReminderEmail, sendWelcomeEmail, sendTrialExpiryEmail, sendReferralRewardEmail } = require('../services/emailService')
const { forgotPasswordLimiter, resetPasswordLimiter, registerLimiter } = require('../middleware/rateLimiter')

const { EMAIL_REGEX, PASSWORD_REGEX, isProd } = require('../utils/constants')

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

async function rewardReferrer(referrer) {
  const BONUS_MS = 30 * 24 * 60 * 60 * 1000
  const now      = new Date()
  if (referrer.plan !== 'free' && referrer.planExpiresAt && referrer.planExpiresAt > now) {
    await prisma.user.update({
      where: { id: referrer.id },
      data:  { planExpiresAt: new Date(referrer.planExpiresAt.getTime() + BONUS_MS) },
    })
  } else if (referrer.trialEndsAt && referrer.trialEndsAt > now) {
    await prisma.user.update({
      where: { id: referrer.id },
      data:  { trialEndsAt: new Date(referrer.trialEndsAt.getTime() + BONUS_MS) },
    })
  } else {
    await prisma.user.update({
      where: { id: referrer.id },
      data:  { plan: 'pro', trialEndsAt: new Date(now.getTime() + BONUS_MS) },
    })
  }
}

// ── POST /auth/register ─────────────────────────────────
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { name, email, password, salary, referralCode: usedReferralCode } = req.body

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

    const parsedSalary = parseFloat(salary) || 0
    if (parsedSalary < 0 || parsedSalary > 999_999_999.99) {
      return res.status(400).json({ error: 'Salário inválido.' })
    }

    // Lookup referrer before creating user
    let referrer = null
    if (usedReferralCode && typeof usedReferralCode === 'string' && /^[A-F0-9]{8}$/i.test(usedReferralCode)) {
      referrer = await prisma.user.findUnique({
        where:  { referralCode: usedReferralCode.toUpperCase() },
        select: { id: true, name: true, email: true, plan: true, trialEndsAt: true, planExpiresAt: true },
      })
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const trialDays   = referrer ? 14 : 7
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
    const referralCode = crypto.randomBytes(4).toString('hex').toUpperCase()
    const user = await prisma.user.create({
      data: {
        name:        name.trim(),
        email:       normalizedEmail,
        password:    hashedPassword,
        salary:      parsedSalary,
        reportEmail: normalizedEmail,
        plan:        'pro',
        trialEndsAt,
        referralCode,
        referredBy:  referrer ? usedReferralCode.toUpperCase() : null,
      }
    })

    // Reward referrer + notificar — fire-and-forget
    if (referrer) {
      rewardReferrer(referrer).catch(() => {})
      sendReferralRewardEmail(referrer.email, referrer.name, user.name).catch(() => {})
    }

    // Welcome email — fire-and-forget
    sendWelcomeEmail(user.email, user.name, trialEndsAt).catch(() => {})

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' })
    setAuthCookie(res, token)

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, salary: user.salary, reportEmail: user.reportEmail, plan: user.plan, isOnTrial: true, trialEndsAt: trialEndsAt.toISOString(), referralCode }
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

    const normalizedEmail = email.toLowerCase().trim()
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    // Sempre executa bcrypt — sem isso, user inexistente retorna em ~1ms e user existente
    // em ~100ms, revelando quais e-mails estão cadastrados por timing attack.
    const passwordMatch = await bcrypt.compare(password, user?.password ?? DUMMY_HASH)

    const ip        = req.ip || req.headers['x-forwarded-for'] || null
    const userAgent = (req.headers['user-agent'] || '').slice(0, 200) || null

    if (!user || !passwordMatch) {
      // Audit: registra falha em background — não bloqueia resposta
      prisma.loginAudit.create({ data: { email: normalizedEmail, success: false, ip, userAgent } }).catch(() => {})
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' })
    }

    // Audit: registra login bem-sucedido em background
    prisma.loginAudit.create({ data: { email: normalizedEmail, success: true, ip, userAgent } }).catch(() => {})

    // 2FA: se ativo, emite token temporário (5 min) e aguarda o código TOTP
    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign({ userId: user.id, twofa: true }, process.env.JWT_SECRET, { expiresIn: '5m' })
      return res.json({ requires2FA: true, tempToken })
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' })
    setAuthCookie(res, token)

    res.json({
      token,
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
    const ME_SELECT = { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true, planExpiresAt: true, trialEndsAt: true, referralCode: true, twoFactorEnabled: true, autoLaunchMonth: true, autoLaunchYear: true, onboardingComplete: true, renewalReminderSent: true, trialReminderSent: true }

    let user = await prisma.user.findUnique({ where: { id: req.userId }, select: ME_SELECT })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

    const now = new Date()

    // Rebaixa para free se o plano pago expirou
    if (user.plan !== 'free' && user.planExpiresAt && user.planExpiresAt < now && !user.trialEndsAt) {
      user = await prisma.user.update({
        where:  { id: req.userId },
        data:   { plan: 'free', planExpiresAt: null },
        select: ME_SELECT,
      })
    }

    // Rebaixa para free se o trial expirou (sem plano pago ativo)
    let trialJustExpired = false
    if (user.trialEndsAt && user.trialEndsAt < now && (!user.planExpiresAt || user.planExpiresAt < now)) {
      trialJustExpired = true
      user = await prisma.user.update({
        where:  { id: req.userId },
        data:   { plan: 'free', trialEndsAt: null },
        select: ME_SELECT,
      })
    }

    // Lembrete de trial expirando: dispara aos 3 dias restantes (apenas uma vez)
    if (user.trialEndsAt && user.trialEndsAt > now && !user.trialReminderSent) {
      const daysLeft = Math.ceil((user.trialEndsAt - now) / (1000 * 60 * 60 * 24))
      if (daysLeft <= 3) {
        prisma.user.update({ where: { id: req.userId }, data: { trialReminderSent: true } }).catch(() => {})
        sendTrialExpiryEmail(user.email, user.name, daysLeft).catch(() => {})
      }
    }

    // Lembrete de renovação lazy: dispara na primeira visita com ≤7 dias restantes (apenas planos pagos)
    if (user.plan !== 'free' && user.planExpiresAt && !user.trialEndsAt && !user.renewalReminderSent) {
      const daysLeft = Math.ceil((user.planExpiresAt - now) / (1000 * 60 * 60 * 24))
      if (daysLeft > 0 && daysLeft <= 7) {
        prisma.user.update({ where: { id: req.userId }, data: { renewalReminderSent: true } }).catch(() => {})
        sendRenewalReminderEmail(user.email, user.name, user.plan, daysLeft).catch(() => {})
      }
    }

    // Lazy generate referral code for existing users who don't have one yet
    if (!user.referralCode) {
      let attempts = 0
      while (attempts < 5) {
        const code = crypto.randomBytes(4).toString('hex').toUpperCase()
        try {
          user = await prisma.user.update({ where: { id: req.userId }, data: { referralCode: code }, select: ME_SELECT })
          break
        } catch (e) {
          if (e.code === 'P2002') { attempts++; continue }
          break
        }
      }
    }

    const isOnTrial = !!user.trialEndsAt && user.trialEndsAt > now
    const { planExpiresAt, trialEndsAt, renewalReminderSent: _rrs, trialReminderSent: _trs, ...userOut } = user
    userOut.isOnTrial = isOnTrial
    if (isOnTrial) userOut.trialEndsAt = trialEndsAt.toISOString()
    if (userOut.plan !== 'free' && planExpiresAt) {
      userOut.planExpiresAt = planExpiresAt.toISOString()
    }
    if (trialJustExpired) userOut.trialJustExpired = true
    res.json(userOut)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuário.' })
  }
})

// ── POST /auth/complete-onboarding ─────────────────────
router.post('/complete-onboarding', authMiddleware, async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.userId },
      data:  { onboardingComplete: true },
    })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Erro ao finalizar onboarding.' })
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

// ── DELETE /auth/account ────────────────────────────────
// LGPD Art. 18: direito à exclusão. Remove todos os dados do usuário.
// Requer confirmação da senha para evitar exclusão acidental ou por sessão sequestrada.
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body
    if (!password) return res.status(400).json({ error: 'Senha obrigatória para confirmar exclusão.' })

    const user = await prisma.user.findUnique({ where: { id: req.userId } })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(401).json({ error: 'Senha incorreta.' })

    // Remove dados auxiliares que não têm cascade via FK
    await prisma.$transaction([
      prisma.loginAudit.deleteMany({ where: { email: user.email } }),
      prisma.processedPayment.deleteMany({ where: { userId: req.userId } }),
      prisma.user.delete({ where: { id: req.userId } }),
      // transactions, budgets, goals, installmentPlans, pushSubscriptions:
      // deletados automaticamente por onDelete: Cascade no schema
    ])

    res.clearCookie('token', { httpOnly: true, secure: isProd, sameSite: 'strict', path: '/' })
    res.json({ message: 'Conta excluída com sucesso. Seus dados foram removidos permanentemente.' })
  } catch (error) {
    console.error('[auth] delete-account:', error.message)
    res.status(500).json({ error: 'Erro ao excluir conta.' })
  }
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

// ── PUT /auth/password ──────────────────────────────────
// Troca de senha autenticada. Exige senha atual + nova senha.
router.put('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias.' })
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 72) {
      return res.status(400).json({ error: 'A nova senha deve ter entre 8 e 72 caracteres.' })
    }
    if (!PASSWORD_REGEX.test(newPassword)) {
      return res.status(400).json({ error: 'A nova senha deve conter maiúscula, minúscula e número.' })
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { password: true } })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

    const match = await bcrypt.compare(currentPassword, user.password)
    if (!match) return res.status(401).json({ error: 'Senha atual incorreta.' })

    if (await bcrypt.compare(newPassword, user.password)) {
      return res.status(400).json({ error: 'A nova senha não pode ser igual à senha atual.' })
    }

    const hashed = await bcrypt.hash(newPassword, 12)
    await prisma.user.update({ where: { id: req.userId }, data: { password: hashed } })

    res.json({ ok: true })
  } catch (err) {
    console.error('[auth] password:', err.message)
    res.status(500).json({ error: 'Erro ao alterar senha.' })
  }
})

// ── GET /auth/referral-stats ────────────────────────────
router.get('/referral-stats', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { referralCode: true },
    })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

    const referredCount = await prisma.user.count({
      where: { referredBy: user.referralCode },
    })

    res.json({ referralCode: user.referralCode, referredCount })
  } catch {
    res.status(500).json({ error: 'Erro ao buscar dados de referência.' })
  }
})

module.exports = router
