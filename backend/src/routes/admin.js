'use strict'
// Endpoint de seed para staging — bloqueado em produção
const express = require('express')
const crypto  = require('crypto')
const router  = express.Router()
const path    = require('path')

// Nome do serviço de produção no Cloud Run (deploy.yml: `SERVICE: finance-app`).
// NODE_ENV não serve pra distinguir prod de staging aqui — o staging também
// sobe com NODE_ENV=production (deploy-staging.yml) pra ter o mesmo
// comportamento de performance/logs. K_SERVICE é injetada automaticamente
// pelo próprio Cloud Run com o nome do serviço implantado (variável de
// ambiente documentada da plataforma, não definida por nós) — é um sinal que
// não depende de nenhum secret estar (ou deixar de estar) configurado.
const PRODUCTION_SERVICE_NAME = 'finance-app'

router.post('/seed-staging', async (req, res) => {
  // Trava de código independente de STAGING_SEED_SECRET nunca estar configurada
  // em produção — hoje a proteção real é só essa ausência de configuração no
  // Cloud Run de prod; isso adiciona uma segunda trava que não depende de
  // "esquecer de configurar um secret" continuar sendo verdade pra sempre.
  // seed.staging.js faz DELETE de todas as tabelas — não pode ter chance de
  // rodar em produção por engano.
  if (process.env.K_SERVICE === PRODUCTION_SERVICE_NAME) {
    return res.status(403).json({ error: 'Não disponível neste ambiente.' })
  }

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
