// ═══════════════════════════════════════════════════════
// 🔐 src/middleware/auth.js — Proteção de Rotas
//
// Um "middleware" é uma função que intercepta a requisição
// ANTES de ela chegar na rota. Este verifica se o usuário
// está logado (tem um token JWT válido).
//
// Fluxo: Requisição → authMiddleware → Rota protegida
//
// Token JWT = uma string codificada que prova que o usuário
// fez login. Ex: "Bearer eyJhbGciOiJIUzI1NiIs..."
// ═══════════════════════════════════════════════════════

const jwt = require('jsonwebtoken')

function authMiddleware(req, res, next) {
  // Prefer HttpOnly cookie; fall back to Authorization header for API clients
  const token = (req.headers['authorization']?.split(' ')[1]) || req.cookies?.token

  if (!token) {
    return res.status(401).json({ error: 'Token não encontrado. Faça login.' })
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    req.userId = decoded.userId
    next()
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido ou expirado. Faça login novamente.' })
  }
}

module.exports = authMiddleware
