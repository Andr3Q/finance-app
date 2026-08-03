const jwt    = require('jsonwebtoken')
const prisma = require('../lib/prisma')

async function authMiddleware(req, res, next) {
  const token = (req.headers['authorization']?.split(' ')[1]) || req.cookies?.token

  if (!token) {
    return res.status(401).json({ error: 'Token não encontrado. Faça login.' })
  }

  let decoded
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
  } catch {
    return res.status(403).json({ error: 'Token inválido ou expirado. Faça login novamente.' })
  }

  if (decoded.twofa) {
    return res.status(403).json({ error: 'Autenticação 2FA pendente. Conclua a verificação.' })
  }

  // Verifica se o usuário ainda existe e se o tokenVersion não foi invalidado
  // (ex: após reset de senha ou exclusão de conta).
  const user = await prisma.user.findUnique({
    where:  { id: decoded.userId },
    select: { tokenVersion: true },
  })
  if (!user || (decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    return res.status(401).json({ error: 'Sessão inválida. Faça login novamente.' })
  }

  req.userId = decoded.userId
  next()
}

module.exports = authMiddleware
