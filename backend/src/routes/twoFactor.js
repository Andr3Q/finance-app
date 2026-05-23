const express    = require('express')
const crypto     = require('crypto')
const bcrypt     = require('bcryptjs')
const jwt        = require('jsonwebtoken')
const speakeasy  = require('speakeasy')
const QRCode     = require('qrcode')
const prisma     = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { apiLimiter }  = require('../middleware/rateLimiter')

const router = express.Router()

// Deriva chave AES-256 do JWT_SECRET (uma vez na inicialização)
const ENC_KEY = crypto.scryptSync(
  process.env.JWT_SECRET || '__insecure_default__',
  'totp-enc-v1',
  32,
)

function encryptSecret(plain) {
  const iv      = crypto.randomBytes(12)
  const cipher  = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const enc     = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag     = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function decryptSecret(stored) {
  const buf = Buffer.from(stored, 'base64')
  const iv  = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const d   = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}

function verifyTotp(encryptedSecret, token) {
  try {
    const secret = decryptSecret(encryptedSecret)
    return speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 })
  } catch {
    return false
  }
}

// ── POST /auth/2fa/setup ────────────────────────────────
// Gera segredo + QR code. Salva segredo (não ativa ainda).
router.post('/setup', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { plan: true, twoFactorEnabled: true, name: true, email: true },
    })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
    if (!['pro', 'elite'].includes(user.plan)) {
      return res.status(403).json({ error: '2FA disponível apenas para planos Pro e Elite.' })
    }
    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA já está ativo.' })
    }

    const secret = speakeasy.generateSecret({
      name:   `FinançasPro (${user.email})`,
      length: 20,
    })

    const encryptedSecret = encryptSecret(secret.base32)
    await prisma.user.update({
      where: { id: req.userId },
      data:  { twoFactorSecret: encryptedSecret },
    })

    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url)
    res.json({ qrCode: qrDataUrl, manualKey: secret.base32 })
  } catch (err) {
    console.error('[2fa] setup:', err.message)
    res.status(500).json({ error: 'Erro ao configurar 2FA.' })
  }
})

// ── POST /auth/2fa/verify-setup ─────────────────────────
// Valida o código e ativa 2FA.
router.post('/verify-setup', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const { token } = req.body
    if (!token || typeof token !== 'string' || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ error: 'Código inválido. Digite os 6 dígitos.' })
    }

    const user = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    })
    if (!user?.twoFactorSecret) {
      return res.status(400).json({ error: 'Configure o 2FA antes de verificar.' })
    }
    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA já está ativo.' })
    }

    if (!verifyTotp(user.twoFactorSecret, token)) {
      return res.status(400).json({ error: 'Código incorreto. Tente novamente.' })
    }

    await prisma.user.update({
      where: { id: req.userId },
      data:  { twoFactorEnabled: true },
    })

    res.json({ ok: true })
  } catch (err) {
    console.error('[2fa] verify-setup:', err.message)
    res.status(500).json({ error: 'Erro ao ativar 2FA.' })
  }
})

// ── POST /auth/2fa/disable ──────────────────────────────
// Desativa 2FA. Exige senha para confirmar.
router.post('/disable', authMiddleware, apiLimiter, async (req, res) => {
  try {
    const { password } = req.body
    if (!password) return res.status(400).json({ error: 'Senha obrigatória.' })

    const user = await prisma.user.findUnique({
      where:  { id: req.userId },
      select: { password: true, twoFactorEnabled: true },
    })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
    if (!user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA não está ativo.' })
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.status(401).json({ error: 'Senha incorreta.' })

    await prisma.user.update({
      where: { id: req.userId },
      data:  { twoFactorEnabled: false, twoFactorSecret: null },
    })

    res.json({ ok: true })
  } catch (err) {
    console.error('[2fa] disable:', err.message)
    res.status(500).json({ error: 'Erro ao desativar 2FA.' })
  }
})

// ── POST /auth/2fa/verify-login ─────────────────────────
// Valida TOTP durante login. Recebe tempToken (JWT 5min) + código.
// Sem authMiddleware — usa o tempToken como credencial.
router.post('/verify-login', apiLimiter, async (req, res) => {
  try {
    const { tempToken, token } = req.body
    if (!tempToken) return res.status(400).json({ error: 'Token temporário ausente.' })
    if (!token || typeof token !== 'string' || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ error: 'Código inválido. Digite os 6 dígitos.' })
    }

    let payload
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET)
    } catch {
      return res.status(401).json({ error: 'Token expirado. Faça login novamente.' })
    }

    if (!payload.twofa) return res.status(401).json({ error: 'Token inválido.' })

    const user = await prisma.user.findUnique({
      where:  { id: payload.userId },
      select: { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true, twoFactorSecret: true },
    })
    if (!user?.twoFactorSecret) return res.status(401).json({ error: 'Usuário não encontrado.' })

    if (!verifyTotp(user.twoFactorSecret, token)) {
      return res.status(401).json({ error: 'Código incorreto.' })
    }

    const fullToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' })
    res.cookie('token', fullToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   24 * 60 * 60 * 1000,
      path:     '/',
    })

    const { twoFactorSecret: _s, ...userOut } = user
    res.json({ token: fullToken, user: userOut })
  } catch (err) {
    console.error('[2fa] verify-login:', err.message)
    res.status(500).json({ error: 'Erro ao validar código.' })
  }
})

module.exports = router
