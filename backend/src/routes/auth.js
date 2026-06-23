const express        = require('express')
const bcrypt         = require('bcryptjs')
const jwt            = require('jsonwebtoken')
const crypto         = require('crypto')
const prisma         = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { sendResetEmail, sendRenewalReminderEmail, sendWelcomeEmail, sendTrialExpiryEmail, sendReferralRewardEmail, sendWeeklyDigest, sendPlanExpiredEmail, sendVerificationEmail } = require('../services/emailService')
const { sendPushToUser } = require('../services/pushService')
const { forgotPasswordLimiter, resetPasswordLimiter, registerLimiter, loginLimiter, exportLimiter, verifyEmailLimiter } = require('../middleware/rateLimiter')

const { EMAIL_REGEX, PASSWORD_REGEX, isProd } = require('../utils/constants')

const APP_URL = process.env.APP_URL || ''

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
  const BONUS_MS = 10 * 24 * 60 * 60 * 1000  // 10 dias por indicação válida

  // Anti-abuso: conta apenas indicados que verificaram o e-mail (sem fake accounts)
  // Máximo de 5 recompensas por indicador — após isso, link funciona mas sem bônus
  const rewardedCount = await prisma.user.count({
    where: { referredBy: referrer.referralCode, emailVerified: true },
  })
  if (rewardedCount >= 5) return false  // limite atingido

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
  return true
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
      return res.status(400).json({ error: 'Não foi possível criar a conta com os dados informados.' })
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

    // Campanha "Primeiros 100": Elite grátis por 10 dias
    const userCount      = await prisma.user.count()
    const isEliteEligible = userCount < 100
    const trialPlan  = isEliteEligible ? 'elite' : 'pro'
    const trialDays  = isEliteEligible ? 10 : (referrer ? 14 : 7)
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000)
    const referralCode = crypto.randomBytes(4).toString('hex').toUpperCase()
    const verifyToken  = crypto.randomBytes(32).toString('hex')
    const verifyHash   = crypto.createHash('sha256').update(verifyToken).digest('hex')
    const verifyExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const user = await prisma.user.create({
      data: {
        name:               name.trim(),
        email:              normalizedEmail,
        password:           hashedPassword,
        salary:             parsedSalary,
        reportEmail:        normalizedEmail,
        plan:               trialPlan,
        trialEndsAt,
        referralCode,
        referredBy:         referrer ? usedReferralCode.toUpperCase() : null,
        emailVerified:      false,
        emailVerifyToken:   verifyHash,
        emailVerifyExpiry:  verifyExpiry,
      }
    })

    const verifyLink = `${APP_URL}/verify-email?token=${verifyToken}`

    // Welcome + verification emails — fire-and-forget
    sendWelcomeEmail(user.email, user.name, trialEndsAt).catch(() => {})
    sendVerificationEmail(user.email, user.name, verifyLink).catch(() => {})

    const token = jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '24h' })
    setAuthCookie(res, token)

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, salary: user.salary, reportEmail: user.reportEmail, plan: user.plan, isOnTrial: true, trialEndsAt: trialEndsAt.toISOString(), referralCode }
    })
  } catch (error) {
    console.error('[auth] register:', error.message)
    res.status(500).json({ error: 'Erro ao criar usuário.' })
  }
})

// ── POST /auth/login ────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
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

    const token = jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '24h' })
    setAuthCookie(res, token)

    res.json({
      user: { id: user.id, name: user.name, email: user.email, salary: user.salary, reportEmail: user.reportEmail, plan: user.plan, referralCode: user.referralCode || null }
    })
  } catch (error) {
    console.error('[auth] login:', error.message)
    res.status(500).json({ error: 'Erro ao fazer login.' })
  }
})

// ── GET /auth/me ────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const ME_SELECT = { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true, planExpiresAt: true, trialEndsAt: true, referralCode: true, twoFactorEnabled: true, autoLaunchMonth: true, autoLaunchYear: true, onboardingComplete: true, renewalReminderSent: true, trialReminderSent: true, weeklyDigestSentAt: true, emailVerified: true, planPeriod: true, notifBudgetAlert: true, notifBudgetReminder: true, budgetReminderSentAt: true }

    let user = await prisma.user.findUnique({ where: { id: req.userId }, select: ME_SELECT })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

    const now = new Date()

    // LGPD: apaga logs de login com mais de 90 dias (fire-and-forget)
    prisma.loginAudit.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) } }
    }).catch(() => {})

    // Rebaixa para free se o plano pago expirou
    let planJustExpired = false
    if (user.plan !== 'free' && user.planExpiresAt && user.planExpiresAt < now && !user.trialEndsAt) {
      planJustExpired = true
      user = await prisma.user.update({
        where:  { id: req.userId },
        data:   { plan: 'free', planExpiresAt: null },
        select: ME_SELECT,
      })
    }
    if (planJustExpired) sendPlanExpiredEmail(user.email, user.name, 'paid').catch(() => {})

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
    if (trialJustExpired) sendPlanExpiredEmail(user.email, user.name, 'trial').catch(() => {})

    // Lembrete de trial expirando: dispara aos 3 dias restantes (apenas uma vez)
    if (user.trialEndsAt && user.trialEndsAt > now && !user.trialReminderSent) {
      const daysLeft = Math.ceil((user.trialEndsAt - now) / (1000 * 60 * 60 * 24))
      if (daysLeft <= 3) {
        prisma.user.update({ where: { id: req.userId }, data: { trialReminderSent: true } }).catch(() => {})
        sendTrialExpiryEmail(user.email, user.name, daysLeft).catch(() => {})
        const urgencyMsg = daysLeft <= 1 ? 'Seu trial expira hoje!' : `Seu trial expira em ${daysLeft} dias.`
        sendPushToUser(req.userId, {
          title: '⏰ Trial Pro expirando',
          body:  `${urgencyMsg} Assine para manter todos os recursos.`,
          url:   '/planos',
        }).catch(() => {})
      }
    }

    // Lembrete de renovação lazy: 30 dias antes para planos anuais, 7 dias para mensais
    if (user.plan !== 'free' && user.planExpiresAt && !user.trialEndsAt && !user.renewalReminderSent) {
      const daysLeft        = Math.ceil((user.planExpiresAt - now) / (1000 * 60 * 60 * 24))
      const reminderThreshold = user.planPeriod === 'annual' ? 30 : 7
      if (daysLeft > 0 && daysLeft <= reminderThreshold) {
        prisma.user.update({ where: { id: req.userId }, data: { renewalReminderSent: true } }).catch(() => {})
        sendRenewalReminderEmail(user.email, user.name, user.plan, daysLeft).catch(() => {})
      }
    }

    // Digest semanal lazy: dispara na primeira visita após 7+ dias do último envio
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    if (!user.weeklyDigestSentAt || user.weeklyDigestSentAt < sevenDaysAgo) {
      const since = user.weeklyDigestSentAt || sevenDaysAgo
      prisma.transaction.findMany({
        where: { userId: req.userId, date: { gte: since }, archived: false },
      }).then(async (txs) => {
        if (txs.length === 0) return
        const totalExpenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)
        const totalIncome   = txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
        const catCount = {}
        txs.filter(t => t.type === 'expense').forEach(t => { catCount[t.category] = (catCount[t.category] || 0) + Number(t.amount) })
        const topCategory = Object.keys(catCount).sort((a, b) => catCount[b] - catCount[a])[0] || null
        await prisma.user.update({ where: { id: req.userId }, data: { weeklyDigestSentAt: now } })
        sendWeeklyDigest(user.email, user.name, {
          totalExpenses, totalIncome, topCategory,
          transactionCount: txs.length,
          balance: Number(user.salary || 0) + totalIncome - totalExpenses,
        }).catch(() => {})
      }).catch(() => {})
    }

    // Lembrete de contas fixas lazy: uma vez por dia, avisa sobre vencimentos em até 3 dias
    if (user.notifBudgetReminder) {
      // "hoje" calculado no fuso de São Paulo (UTC-3) para não disparar o lembrete
      // um dia antes/depois da meia-noite local caso o servidor esteja em UTC.
      const SP_OFFSET_MS = 3 * 60 * 60 * 1000
      const nowInSP      = new Date(now.getTime() - SP_OFFSET_MS)
      const todayStartSP = new Date(Date.UTC(nowInSP.getUTCFullYear(), nowInSP.getUTCMonth(), nowInSP.getUTCDate()))
      const today        = new Date(todayStartSP.getTime() + SP_OFFSET_MS) // meia-noite SP em UTC
      const lastSent = user.budgetReminderSentAt ? new Date(user.budgetReminderSentAt) : null
      const alreadySentToday = lastSent && lastSent >= today
      if (!alreadySentToday) {
        prisma.budget.findMany({ where: { userId: req.userId, dueDay: { not: null } } })
          .then(async budgets => {
            if (!budgets.length) return
            const todayDay = now.getDate()
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
            const upcoming = budgets
              .map(b => {
                const diff = b.dueDay >= todayDay
                  ? b.dueDay - todayDay
                  : daysInMonth - todayDay + b.dueDay
                return { ...b, daysLeft: diff }
              })
              .filter(b => b.daysLeft <= 3)
            if (!upcoming.length) return
            await prisma.user.update({ where: { id: req.userId }, data: { budgetReminderSentAt: now } })
            for (const b of upcoming) {
              const when = b.daysLeft === 0 ? 'vence hoje' : b.daysLeft === 1 ? 'vence amanhã' : `vence em ${b.daysLeft} dias`
              const amt  = Number(b.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
              await sendPushToUser(req.userId, {
                title: `📅 ${b.name} ${when}`,
                body:  `R$ ${amt} — não esqueça de pagar.`,
                url:   '/settings',
              })
            }
          }).catch(() => {})
      }
    }

    // ── Notificação de contas fixas expiradas ───────────────
    // Lazy: dispara na próxima vez que o usuário logar após endDate passar.
    // endDateNotifSent garante que cada conta notifica apenas 1 vez.
    if (user.notifBudgetReminder) {
      prisma.budget.findMany({
        where: { userId: req.userId, endDate: { lte: now }, endDateNotifSent: false },
        select: { id: true, name: true, amount: true },
      }).then(async expiradas => {
        for (const b of expiradas) {
          await sendPushToUser(req.userId, {
            title: `📅 ${b.name} encerrou`,
            body:  `Essa conta fixa chegou ao fim. Você pode removê-la agora.`,
            url:   '/settings',
          })
          await prisma.budget.update({
            where: { id: b.id },
            data:  { endDateNotifSent: true },
          })
        }
      }).catch(() => {})
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
    const { planExpiresAt, trialEndsAt, renewalReminderSent: _rrs, trialReminderSent: _trs, weeklyDigestSentAt: _wds, emailVerified, planPeriod: _pp, budgetReminderSentAt: _brs, password: _pw, twoFactorSecret: _tfs, resetToken: _rt, ...userOut } = user
    userOut.emailVerified = emailVerified
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

    const resetLink = `${APP_URL}/reset-password?token=${rawToken}`

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
    // Desativa 2FA junto com o reset — o link de e-mail prova identidade do dono da conta.
    // Incrementa tokenVersion para invalidar todos os JWTs ativos emitidos antes do reset.
    await prisma.$transaction([
      prisma.twoFactorBackupCode.deleteMany({ where: { userId: user.id } }),
      prisma.user.update({
        where: { id: user.id },
        data:  { password: hashedPassword, resetToken: null, resetTokenExpiry: null, twoFactorEnabled: false, twoFactorSecret: null, tokenVersion: { increment: 1 } },
      }),
    ])

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
    const { password } = req.body
    if (!password) return res.status(400).json({ error: 'Senha obrigatória para confirmar o downgrade.' })

    const current = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { password: true },
    })
    if (!current) return res.status(404).json({ error: 'Usuário não encontrado.' })

    const valid = await bcrypt.compare(password, current.password)
    if (!valid) return res.status(401).json({ error: 'Senha incorreta.' })

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

// ── POST /auth/verify-email ─────────────────────────────
// Pública — recebe o token no body (não na URL) para evitar exposição em logs.
// O link do e-mail aponta para a rota do frontend que lê o token da URL
// e o envia via POST body, evitando que apareça em logs de acesso do servidor.
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token inválido.' })
    }
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    const user = await prisma.user.findFirst({
      where: { emailVerifyToken: hash, emailVerifyExpiry: { gt: new Date() } },
    })
    if (!user) return res.status(400).json({ error: 'Link inválido ou expirado. Solicite um novo na página de configurações.' })

    await prisma.user.update({
      where: { id: user.id },
      data:  { emailVerified: true, emailVerifyToken: null, emailVerifyExpiry: null },
    })

    // Recompensa diferida: se esse usuário foi indicado, libera o bônus para o indicador
    // (verificação de e-mail garante que não é conta fake — mecanismo anti-abuso)
    if (user.referredBy) {
      prisma.user.findUnique({
        where:  { referralCode: user.referredBy },
        select: { id: true, plan: true, trialEndsAt: true, planExpiresAt: true, referralCode: true, name: true, email: true },
      }).then(referrer => {
        if (referrer) rewardReferrer(referrer).then(rewarded => {
          if (rewarded) sendReferralRewardEmail(referrer.email, referrer.name, user.name).catch(() => {})
        }).catch(() => {})
      }).catch(() => {})
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('[auth] verify-email:', err.message)
    res.status(500).json({ error: 'Erro ao verificar e-mail.' })
  }
})

// ── POST /auth/resend-verification ─────────────────────
router.post('/resend-verification', authMiddleware, verifyEmailLimiter, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { email: true, name: true, emailVerified: true },
    })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
    if (user.emailVerified) return res.status(400).json({ error: 'E-mail já verificado.' })

    const rawToken  = crypto.randomBytes(32).toString('hex')
    const hash      = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiry    = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await prisma.user.update({
      where: { id: req.userId },
      data:  { emailVerifyToken: hash, emailVerifyExpiry: expiry },
    })

    const verifyLink = `${APP_URL}/verify-email?token=${rawToken}`
    sendVerificationEmail(user.email, user.name, verifyLink).catch(() => {})

    res.json({ ok: true })
  } catch (err) {
    console.error('[auth] resend-verification:', err.message)
    res.status(500).json({ error: 'Erro ao reenviar verificação.' })
  }
})

// ── GET /auth/export-data ───────────────────────────────
// LGPD Art. 15: direito de acesso. Retorna todos os dados do usuário em JSON.
router.get('/export-data', authMiddleware, exportLimiter, async (req, res) => {
  try {
    const [user, transactions, budgets, goals, installments, categoryLimits] = await Promise.all([
      prisma.user.findUnique({
        where:  { id: req.userId },
        select: { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true, planExpiresAt: true, trialEndsAt: true, referralCode: true, referredBy: true, createdAt: true, twoFactorEnabled: true, onboardingComplete: true },
      }),
      prisma.transaction.findMany({ where: { userId: req.userId }, orderBy: { date: 'desc' } }),
      prisma.budget.findMany({ where: { userId: req.userId } }),
      prisma.goal.findMany({ where: { userId: req.userId } }),
      prisma.installmentPlan.findMany({ where: { userId: req.userId } }),
      prisma.categoryLimit.findMany({ where: { userId: req.userId } }),
    ])

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })

    const exportData = {
      exportedAt:     new Date().toISOString(),
      profile:        user,
      transactions,
      budgets,
      goals,
      installmentPlans: installments,
      categoryLimits,
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="nancy-dados-${new Date().toISOString().slice(0,10)}.json"`)
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.json(exportData)
  } catch (err) {
    console.error('[auth] export-data:', err.message)
    res.status(500).json({ error: 'Erro ao exportar dados.' })
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

    const [referredCount, rewardedCount] = await Promise.all([
      prisma.user.count({ where: { referredBy: user.referralCode } }),
      prisma.user.count({ where: { referredBy: user.referralCode, emailVerified: true } }),
    ])

    res.json({
      referralCode:  user.referralCode,
      referredCount,                          // total de cadastros com o link
      rewardedCount,                          // verificados (recompensas efetivamente recebidas)
      maxReferrals:  5,
      limitReached:  rewardedCount >= 5,
      bonusDays:     10,
    })
  } catch {
    res.status(500).json({ error: 'Erro ao buscar dados de referência.' })
  }
})

// ── PUT /auth/notifications ──────────────────────────────
router.put('/notifications', authMiddleware, async (req, res) => {
  try {
    const { notifBudgetAlert, notifBudgetReminder } = req.body
    const data = {}
    if (typeof notifBudgetAlert   === 'boolean') data.notifBudgetAlert   = notifBudgetAlert
    if (typeof notifBudgetReminder === 'boolean') data.notifBudgetReminder = notifBudgetReminder
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nenhum campo válido.' })
    await prisma.user.update({ where: { id: req.userId }, data })
    res.json({ ok: true })
  } catch {
    res.status(500).json({ error: 'Erro ao salvar preferências.' })
  }
})

module.exports = router
