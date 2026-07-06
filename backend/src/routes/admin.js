'use strict'
// Endpoint de seed para staging — bloqueado em produção
const express = require('express')
const router  = express.Router()
const path    = require('path')

router.post('/seed-staging', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Não disponível em produção.' })
  }

  const secret = process.env.STAGING_SEED_SECRET
  if (!secret || req.headers['x-seed-secret'] !== secret) {
    return res.status(401).json({ error: 'Não autorizado.' })
  }

  try {
    const seedPath = path.join(__dirname, '../../prisma/seed.staging.js')
    // Limpa o cache do require para permitir re-execução
    delete require.cache[require.resolve(seedPath)]
    require(seedPath)
    res.json({ ok: true, message: 'Seed iniciado em background.' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

module.exports = router
