'use strict'
// Endpoint de seed para staging — bloqueado em produção
const express = require('express')
const crypto  = require('crypto')
const router  = express.Router()
const path    = require('path')

router.post('/seed-staging', async (req, res) => {
  const secret = process.env.STAGING_SEED_SECRET
  if (!secret) {
    return res.status(403).json({ error: 'Não disponível neste ambiente.' })
  }

  const provided = Buffer.from(req.headers['x-seed-secret'] || '')
  const expected = Buffer.from(secret)
  const valid = provided.length === expected.length &&
    crypto.timingSafeEqual(provided, expected)
  if (!valid) {
    return res.status(401).json({ error: 'Não autorizado.' })
  }

  try {
    const seedPath = path.join(__dirname, '../../prisma/seed.staging.js')
    // Limpa o cache do require para permitir re-execução
    delete require.cache[require.resolve(seedPath)]
    require(seedPath)
    res.json({ ok: true, message: 'Seed iniciado em background.' })
  } catch (err) {
    console.error('[admin] seed-staging error:', err.message)
    res.status(500).json({ error: 'Erro ao executar seed.' })
  }
})

module.exports = router
