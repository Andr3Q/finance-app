// ═══════════════════════════════════════════════════════
// 🚀 src/server.js — Ponto de Entrada do Backend
// ═══════════════════════════════════════════════════════

require('dotenv').config()

const express = require('express')
const cors    = require('cors')
const path    = require('path')

const authRoutes        = require('./routes/auth')
const transactionRoutes = require('./routes/transactions')
const budgetRoutes      = require('./routes/budget')
const reportRoutes      = require('./routes/reports')

const app    = express()
const PORT   = process.env.PORT || 3001
const isProd = process.env.NODE_ENV === 'production'

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// ── Rotas da API (prefixo /api) ─────────────────────────
// Dev: Vite proxy encaminha /api/* → aqui sem o /api
// Prod: frontend chama /api/* direto neste servidor
app.use('/api/auth',         authRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/budget',       budgetRoutes)
app.use('/api/reports',      reportRoutes)

// ── Health Check ────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: '✅ FinançasPro API rodando!', env: isProd ? 'production' : 'development' })
})

// ── Produção: serve o frontend React compilado ──────────
if (isProd) {
  const publicPath = path.join(__dirname, '../../public')
  app.use(express.static(publicPath))
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'))
  })
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend rodando em http://localhost:${PORT}`)
  console.log(`📋 Ambiente: ${isProd ? 'PRODUÇÃO ☁️' : 'desenvolvimento 🛠️'}`)
})
