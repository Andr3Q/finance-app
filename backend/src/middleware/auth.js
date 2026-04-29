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
  // Pega o cabeçalho "Authorization" da requisição
  // Ex: "Bearer eyJhbGciOiJIUzI1NiIs..."
  const authHeader = req.headers['authorization']
  const token      = authHeader && authHeader.split(' ')[1] // Pega só o token, sem "Bearer"

  // Se não tiver token, rejeita com erro 401 (Não autorizado)
  if (!token) {
    return res.status(401).json({ error: 'Token não encontrado. Faça login.' })
  }

  try {
    // Verifica se o token é válido e não expirou
    // jwt.verify() retorna os dados que foram guardados no token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Guarda o userId no objeto req para as rotas acessarem
    req.userId = decoded.userId

    // Chama next() para continuar para a rota
    next()
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido ou expirado. Faça login novamente.' })
  }
}

module.exports = authMiddleware
