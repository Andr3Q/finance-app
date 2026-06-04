const express    = require('express')
const crypto     = require('crypto')
const bcrypt     = require('bcryptjs')
const jwt        = require('jsonwebtoken')
const speakeasy  = require('speakeasy')
const QRCode     = require('qrcode')
const prisma     = require('../lib/prisma')
const authMiddleware = require('../middleware/auth')
const { twoFALimiter } = require('../middleware/rateLimiter')

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

function hashBackupCode(code) {
  return crypto.createHmac('sha256', process.env.JWT_SECRET || '__insecure_default__').update(code).digest('hex')
}

function generateBackupCodes() {
  const codes = []
  for (let i = 0; i < 10; i++) {
    const raw  = crypto.randomBytes(4).toString('hex').toUpperCase()
    const part = [raw.slice(0, 4), raw.slice(4)].join('-')
    codes.push(part)
  }
  return codes
}

function issueFullToken(res, userId) {
  const fullToken = jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '24h' })
  res.cookie('token', fullToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   24 * 60 * 60 * 1000,
    path:     '/',
  })
  return fullToken
}

// ── POST /auth/2fa/setup ────────────────────────────────
// Gera segredo + QR code. Salva segredo (não ativa ainda).
router.post('/setup', authMiddleware, twoFALimiter, async (req, res) => {
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
      name:   `Nancy (${user.email})`,
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
// Valida o código, ativa 2FA e gera 10 backup codes (retornados uma única vez).
router.post('/verify-setup', authMiddleware, twoFALimiter, async (req, res) => {
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

    const plainCodes = generateBackupCodes()
    const now        = new Date()

    await prisma.$transaction([
      prisma.user.update({
        where: { id: req.userId },
        data:  { twoFactorEnabled: true },
      }),
      // Remove eventuais códigos antigos (retry de setup)
      prisma.twoFactorBackupCode.deleteMany({ where: { userId: req.userId } }),
      ...plainCodes.map(code =>
        prisma.twoFactorBackupCode.create({
          data: { userId: req.userId, codeHash: hashBackupCode(code), createdAt: now },
        })
      ),
    ])

    res.json({ ok: true, backupCodes: plainCodes })
  } catch (err) {
    console.error('[2fa] verify-setup:', err.message)
    res.status(500).json({ error: 'Erro ao ativar 2FA.' })
  }
})

// ── POST /auth/2fa/disable ──────────────────────────────
// Desativa 2FA. Exige senha. Apaga backup codes.
router.post('/disable', authMiddleware, twoFALimiter, async (req, res) => {
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

    await prisma.$transaction([
      prisma.twoFactorBackupCode.deleteMany({ where: { userId: req.userId } }),
      prisma.user.update({
        where: { id: req.userId },
        data:  { twoFactorEnabled: false, twoFactorSecret: null },
      }),
    ])

    res.json({ ok: true })
  } catch (err) {
    console.error('[2fa] disable:', err.message)
    res.status(500).json({ error: 'Erro ao desativar 2FA.' })
  }
})

// ── POST /auth/2fa/verify-login ─────────────────────────
// Valida TOTP durante login. Recebe tempToken (JWT 5min) + código.
// Sem authMiddleware — usa o tempToken como credencial.
router.post('/verify-login', twoFALimiter, async (req, res) => {
  try {
    const { tempToken, token } = req.body
    if (!tempToken) return res.status(400).json({ error: 'Token temporário ausente.' })
    if (!token || typeof token !== 'string' || !/^\d{6}$/.test(token)) {
      return res.status(400).json({ error: 'Código inválido. Digite os 6 dígitos.' })
    }

    let payload
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    } catch {
      return res.status(401).json({ error: 'Token expirado. Faça login novamente.' })
    }

    if (!payload.twofa) return res.status(401).json({ error: 'Token inválido.' })

    const user = await prisma.user.findUnique({
      where:  { id: payload.userId },
      select: { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true, twoFactorSecret: true, twoFactorEnabled: true },
    })
    if (!user?.twoFactorEnabled || !user?.twoFactorSecret) {
      return res.status(401).json({ error: 'Usuário não encontrado.' })
    }

    if (!verifyTotp(user.twoFactorSecret, token)) {
      return res.status(401).json({ error: 'Código incorreto.' })
    }

    const fullToken = issueFullToken(res, user.id)
    const { twoFactorSecret: _s, ...userOut } = user
    res.json({ token: fullToken, user: userOut })
  } catch (err) {
    console.error('[2fa] verify-login:', err.message)
    res.status(500).json({ error: 'Erro ao validar código.' })
  }
})

// ── POST /auth/2fa/use-backup-code ──────────────────────
// Login alternativo usando código de recuperação (XXXX-XXXX).
// Sem authMiddleware — usa tempToken como credencial.
router.post('/use-backup-code', twoFALimiter, async (req, res) => {
  try {
    const { tempToken, backupCode } = req.body
    if (!tempToken) return res.status(400).json({ error: 'Token temporário ausente.' })
    if (!backupCode || typeof backupCode !== 'string' || !/^[A-F0-9]{4}-[A-F0-9]{4}$/i.test(backupCode)) {
      return res.status(400).json({ error: 'Código de recuperação inválido.' })
    }

    let payload
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    } catch {
      return res.status(401).json({ error: 'Token expirado. Faça login novamente.' })
    }

    if (!payload.twofa) return res.status(401).json({ error: 'Token inválido.' })

    const codeHash = hashBackupCode(backupCode.toUpperCase())

    const backupEntry = await prisma.twoFactorBackupCode.findFirst({
      where: { userId: payload.userId, codeHash, usedAt: null },
    })
    if (!backupEntry) {
      return res.status(401).json({ error: 'Código de recuperação inválido ou já utilizado.' })
    }

    // Marca como usado
    await prisma.twoFactorBackupCode.update({
      where: { id: backupEntry.id },
      data:  { usedAt: new Date() },
    })

    const user = await prisma.user.findUnique({
      where:  { id: payload.userId },
      select: { id: true, name: true, email: true, salary: true, reportEmail: true, plan: true },
    })
    if (!user) return res.status(401).json({ error: 'Usuário não encontrado.' })

    const fullToken = issueFullToken(res, user.id)
    res.json({ token: fullToken, user })
  } catch (err) {
    console.error('[2fa] use-backup-code:', err.message)
    res.status(500).json({ error: 'Erro ao usar código de recuperação.' })
  }
})

// ── GET /auth/2fa/backup-codes-count ───────────────────
// Retorna quantos backup codes ainda estão disponíveis.
router.get('/backup-codes-count', authMiddleware, async (req, res) => {
  try {
    const count = await prisma.twoFactorBackupCode.count({
      where: { userId: req.userId, usedAt: null },
    })
    res.json({ count })
  } catch (err) {
    console.error('[2fa] backup-codes-count:', err.message)
    res.status(500).json({ error: 'Erro ao buscar códigos.' })
  }
})

// ── POST /auth/2fa/regenerate-backup-codes ──────────────
// Gera novos 10 backup codes. Exige senha.
router.post('/regenerate-backup-codes', authMiddleware, twoFALimiter, async (req, res) => {
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

    const plainCodes = generateBackupCodes()
    const now        = new Date()

    await prisma.$transaction([
      prisma.twoFactorBackupCode.deleteMany({ where: { userId: req.userId } }),
      ...plainCodes.map(code =>
        prisma.twoFactorBackupCode.create({
          data: { userId: req.userId, codeHash: hashBackupCode(code), createdAt: now },
        })
      ),
    ])

    res.json({ backupCodes: plainCodes })
  } catch (err) {
    console.error('[2fa] regenerate-backup-codes:', err.message)
    res.status(500).json({ error: 'Erro ao regenerar códigos.' })
  }
})

module.exports = router
