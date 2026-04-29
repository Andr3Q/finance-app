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

const express       = require('express')
const bcrypt        = require('bcryptjs')
const jwt           = require('jsonwebtoken')
const { PrismaClient } = require('@prisma/client')
const authMiddleware   = require('../middleware/auth')

const router = express.Router()
const prisma = new PrismaClient()

// ── POST /auth/register ─────────────────────────────────
// Cadastra um novo usuário no banco de dados.
// A senha é criptografada antes de salvar (nunca guardamos senha em texto puro!)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, salary } = req.body

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' })
    }

    // Verifica se o e-mail já está cadastrado
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado.' })
    }

    // Criptografa a senha com bcrypt (salt = 10 rounds)
    const hashedPassword = await bcrypt.hash(password, 10)

    // Cria o usuário no banco
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        salary: salary || 0,
        reportEmail: email // Por padrão, envia relatório para o próprio e-mail
      }
    })

    // Gera token JWT válido por 7 dias
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' })

    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, salary: user.salary }
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

    // Busca usuário pelo e-mail
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' })
    }

    // Compara a senha enviada com a senha criptografada no banco
    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos.' })
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' })

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, salary: user.salary }
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
      select: { id: true, name: true, email: true, salary: true, reportEmail: true }
    })
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar usuário.' })
  }
})

module.exports = router
