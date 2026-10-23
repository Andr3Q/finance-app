'use strict'
// ═══════════════════════════════════════════════════════
// 🌱 seed.staging.js — Dados Realistas para Staging / E2E
//
// Cria usuários de teste com dados financeiros consistentes
// para validar os 91 testes Playwright em ambiente isolado.
//
// Usuários criados:
//   • alice@staging.test / Staging123!  (plano free, sem 2FA)
//   • bob@staging.test   / Staging123!  (plano pro, expirado em 30 dias)
//   • admin@staging.test / Staging123!  (plano elite)
//
// Executar:
//   node prisma/seed.staging.js
// ═══════════════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client')
const bcrypt           = require('bcryptjs')
const { nowBrasilia, parseDateInput } = require('../src/utils/helpers')

const prisma = new PrismaClient()

const HASH = (pwd) => bcrypt.hashSync(pwd, 10)
const STAGING_PASS = 'Staging123!'

async function main() {
  if (!process.env.STAGING_SEED_SECRET) {
    console.error('❌ seed.staging.js requer STAGING_SEED_SECRET configurado. Abortando.')
    process.exit(1)
  }

  console.log('🌱 Iniciando seed de staging...\n')

  // ── Limpar dados anteriores (ordem inversa de FK) ──
  await prisma.$transaction([
    prisma.loginAudit.deleteMany(),
    prisma.processedPayment.deleteMany(),
    prisma.pushSubscription.deleteMany(),
    prisma.twoFactorBackupCode.deleteMany(),
    prisma.installmentPlan.deleteMany(),
    prisma.goal.deleteMany(),
    prisma.budget.deleteMany(),
    prisma.categoryLimit.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.user.deleteMany(),
  ])
  console.log('  ✓ Banco limpo\n')

  // ── Datas e atalhos ──────────────────────────────
  // Mês/ano e datas no fuso de Brasília. O container roda em UTC: `new Date(year,
  // month-1, dia)` aqui dava meia-noite UTC, que em Brasília ainda é o dia
  // anterior — um lançamento do dia 1º aparecia em 31 do mês passado.
  const { month, year, day: today } = nowBrasilia()
  const brt = (y, m, d) => parseDateInput(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  // Mês de n meses atrás (n = 0 é o atual).
  const ym = (n) => { const d = new Date(Date.UTC(year, month - 1 - n, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 } }
  // Lançamentos do mês atual nunca ficam no futuro (a dica da semana, o ritmo e o calendário ignoram data futura):
  // o dia pedido vira no máximo "hoje". Meses anteriores usam o dia pedido.
  const dayOf = (n, d) => (n === 0 ? Math.min(d, today) : d)
  const tx = (userId, n, d, description, amount, type, category, extra = {}) => {
    const { y, m } = ym(n)
    return { userId, description, amount, type, category, date: brt(y, m, dayOf(n, d)), month: m, year: y, archived: false, ...extra }
  }

  // O SALÁRIO entra pelo campo `salary` do usuário (o app soma sozinho em todo mês). NÃO crie aqui um lançamento
  // "Salário": ele seria contado em dobro no saldo e nas Entradas. Categorias: só as que o app oferece
  // (food, shopping, transport, health, leisure, education, home, fixed, income, other).

  // ── Usuário 1: Alice (free) ──────────────────────
  const alice = await prisma.user.create({
    data: {
      name:            'Alice Staging',
      email:           'alice@staging.test',
      password:        HASH(STAGING_PASS),
      salary:          5000,
      plan:            'free',
      emailVerified:   true,
      onboardingComplete: true,
      autoLaunchMonth: month,
      autoLaunchYear:  year,
    },
  })
  console.log('  ✓ Alice (free):', alice.id)

  // Contas fixas de Alice: Aluguel, Plano de celular e Academia já pagos neste mês (lançamento ligado à conta, como o app
  // faz ao "Marcar como paga"); Internet (dia 20) fica pendente pra testar o pagamento.
  const aBud = {}
  for (const [key, name, amount, dueDay] of [['rent', 'Aluguel', 1200, 10], ['phone', 'Plano de celular', 60, 12], ['gym', 'Academia', 90, 15], ['net', 'Internet', 120, 20]]) {
    aBud[key] = await prisma.budget.create({ data: { userId: alice.id, name, amount, dueDay } })
  }
  const aliceTx = []
  for (const n of [2, 1, 0]) {
    aliceTx.push(
      tx(alice.id, n, 10, 'Aluguel',          1200, 'expense', 'fixed', { budgetId: aBud.rent.id }),
      tx(alice.id, n, 12, 'Plano de celular',   60, 'expense', 'fixed', { budgetId: aBud.phone.id }),
      tx(alice.id, n, 15, 'Academia',           90, 'expense', 'fixed', { budgetId: aBud.gym.id }),
      tx(alice.id, n, 12, 'Supermercado',     [450, 410, 380][n], 'expense', 'food'),
      tx(alice.id, n, 18, 'Conta de luz',     [180, 170, 165][n], 'expense', 'home'),
      tx(alice.id, n, 22, 'Restaurante',      [85, 60, 70][n],    'expense', 'food'),
    )
    if (n > 0) aliceTx.push(tx(alice.id, n, 20, 'Internet', 120, 'expense', 'fixed', { budgetId: aBud.net.id }))
  }
  aliceTx.push(tx(alice.id, 0, 15, 'Freelance extra', 1500, 'income', 'income'), tx(alice.id, 1, 15, 'Freelance extra', 800, 'income', 'income'))
  await prisma.transaction.createMany({ data: aliceTx })

  await prisma.goal.createMany({
    data: [
      { userId: alice.id, title: 'Reserva de emergência', targetAmount: 15000, currentAmount: 3200, color: '#4ac46e', deadline: brt(year + 1, 12, 31) },
      { userId: alice.id, title: 'Viagem ao exterior',     targetAmount:  8000, currentAmount:  500, color: '#007e8a' },
    ],
  })
  await prisma.categoryLimit.createMany({ data: [{ userId: alice.id, category: 'food', amount: 500 }] }) // 535 gastos: já estourou
  console.log('  ✓ Dados de Alice criados\n')

  // ── Usuário 2: Bob (pro) ─────────────────────────
  const planExpiry = new Date(Date.now() + 30 * 24 * 3600 * 1000)
  const bob = await prisma.user.create({
    data: {
      name:            'Bob Staging',
      email:           'bob@staging.test',
      password:        HASH(STAGING_PASS),
      salary:          8500,
      plan:            'pro',
      planExpiresAt:   planExpiry,
      planPeriod:      'monthly',
      emailVerified:   true,
      onboardingComplete: true,
      autoLaunchMonth: month,
      autoLaunchYear:  year,
    },
  })
  console.log('  ✓ Bob (pro):', bob.id)

  // Contas fixas de Bob: as quatro primeiras pagas neste mês; Seguro do carro e IPTU pendentes.
  const bBud = {}
  for (const [key, name, amount, dueDay] of [['fin', 'Financiamento', 2100, 5], ['health', 'Plano de saúde', 520, 8], ['nflx', 'Netflix', 45, 10], ['car', 'Seguro do carro', 280, 25], ['iptu', 'IPTU', 150, 28]]) {
    bBud[key] = await prisma.budget.create({ data: { userId: bob.id, name, amount, dueDay } })
  }
  const bobTx = []
  for (const n of [2, 1, 0]) {
    bobTx.push(
      tx(bob.id, n, 5,  'Financiamento',  2100, 'expense', 'fixed', { budgetId: bBud.fin.id }),
      tx(bob.id, n, 8,  'Plano de saúde',  520, 'expense', 'fixed', { budgetId: bBud.health.id }),
      tx(bob.id, n, 10, 'Netflix',          45, 'expense', 'fixed', { budgetId: bBud.nflx.id }),
      tx(bob.id, n, 8,  'Combustível',  [350, 320, 300][n], 'expense', 'transport'),
      tx(bob.id, n, 14, 'Supermercado', [680, 540, 520][n], 'expense', 'food'),
      tx(bob.id, n, 17, 'Farmácia',     [95, 60, 60][n],    'expense', 'health'),
    )
    if (n > 0) bobTx.push(tx(bob.id, n, 25, 'Seguro do carro', 280, 'expense', 'fixed', { budgetId: bBud.car.id }))
  }
  bobTx.push(tx(bob.id, 0, 12, 'Bônus trimestral', 2000, 'income', 'income'))
  await prisma.transaction.createMany({ data: bobTx })

  // Parcelamento de Bob
  await prisma.installmentPlan.create({
    data: {
      userId:            bob.id,
      name:              'Notebook Dell',
      totalInstallments: 12,
      paidInstallments:  3,
      amount:            450,
      startMonth:        month - 3 > 0 ? month - 3 : 12 + (month - 3),
      startYear:         month - 3 > 0 ? year : year - 1,
    },
  })
  await prisma.categoryLimit.createMany({ data: [{ userId: bob.id, category: 'health', amount: 100 }] }) // 95: perto do limite
  console.log('  ✓ Dados de Bob criados\n')

  // ── Usuário 3: Admin (elite) ─────────────────────
  const elite = await prisma.user.create({
    data: {
      name:            'Admin Elite',
      email:           'admin@staging.test',
      password:        HASH(STAGING_PASS),
      salary:          15000,
      plan:            'elite',
      planExpiresAt:   new Date(Date.now() + 365 * 24 * 3600 * 1000),
      planPeriod:      'annual',
      emailVerified:   true,
      onboardingComplete: true,
      autoLaunchMonth: month,
      autoLaunchYear:  year,
    },
  })
  console.log('  ✓ Admin (elite):', elite.id)

  // Contas fixas de Admin: cinco pagas neste mês; Condomínio (dia 28) pendente.
  const eBud = {}
  for (const [key, name, amount, dueDay] of [['rent', 'Aluguel', 3500, 5], ['health', 'Plano de saúde', 850, 8], ['net', 'Internet fibra', 150, 15], ['gym', 'Academia premium', 200, 20], ['light', 'Conta de luz', 380, 22], ['condo', 'Condomínio', 600, 28]]) {
    eBud[key] = await prisma.budget.create({ data: { userId: elite.id, name, amount, dueDay } })
  }
  const eliteTx = []
  for (const n of [2, 1, 0]) {
    eliteTx.push(
      tx(elite.id, n, 5,  'Aluguel',           3500, 'expense', 'fixed', { budgetId: eBud.rent.id }),
      tx(elite.id, n, 8,  'Plano de saúde',     850, 'expense', 'fixed', { budgetId: eBud.health.id }),
      tx(elite.id, n, 15, 'Internet fibra',     150, 'expense', 'fixed', { budgetId: eBud.net.id }),
      tx(elite.id, n, 20, 'Academia premium',   200, 'expense', 'fixed', { budgetId: eBud.gym.id }),
      tx(elite.id, n, 22, 'Conta de luz',       380, 'expense', 'fixed', { budgetId: eBud.light.id }),
      tx(elite.id, n, 10, 'Supermercado',  [920, 700, 650][n], 'expense', 'food'),
      tx(elite.id, n, 14, 'Restaurante sushi', [245, 150, 120][n], 'expense', 'food'),
      tx(elite.id, n, 12, 'Combustível',   [480, 450, 430][n], 'expense', 'transport'),
      tx(elite.id, n, 18, 'Uber',          [95, 80, 70][n],    'expense', 'transport'),
      tx(elite.id, n, 16, 'Farmácia',      [130, 90, 100][n],  'expense', 'health'),
      // assinaturas: mesmo nome e valor todo mês (o Elite as detecta na tela Assinaturas)
      tx(elite.id, n, 3,  'Netflix',            55.9, 'expense', 'leisure'),
      tx(elite.id, n, 4,  'Spotify',            21.9, 'expense', 'leisure'),
    )
  }
  eliteTx.push(
    tx(elite.id, 0, 20, 'Roupa', 350, 'expense', 'shopping'),
    tx(elite.id, 0, 25, 'Dividendos', 1800, 'income', 'income'),
    tx(elite.id, 1, 25, 'Dividendos', 1500, 'income', 'income'),
  )
  await prisma.transaction.createMany({ data: eliteTx })
  await prisma.goal.createMany({
    data: [
      { userId: elite.id, title: 'Reserva de emergência', targetAmount: 60000, currentAmount: 24000, color: '#4ac46e', deadline: brt(year + 1, 6, 30) },
      { userId: elite.id, title: 'Viagem de férias',      targetAmount: 12000, currentAmount:  1500, color: '#4f8ef7' },
    ],
  })
  await prisma.categoryLimit.createMany({
    data: [
      { userId: elite.id, category: 'food',      amount: 1000 }, // 1.165 gastos: estourou
      { userId: elite.id, category: 'transport', amount:  600 }, // 575: perto do limite
      { userId: elite.id, category: 'shopping',  amount:  800 }, // 350: folga
    ],
  })
  console.log('  ✓ Dados de Admin criados\n')

  // ── Login audits (simula histórico) ─────────────
  await prisma.loginAudit.createMany({
    data: [
      { email: alice.email, success: true,  ip: '192.168.1.1', userAgent: 'Mozilla/5.0 Staging' },
      { email: alice.email, success: false, ip: '10.0.0.1',    userAgent: 'curl/7.88 (staging probe)' },
      { email: bob.email,   success: true,  ip: '192.168.1.2', userAgent: 'Mozilla/5.0 Staging' },
      { email: elite.email, success: true,  ip: '192.168.1.3', userAgent: 'Mozilla/5.0 Staging' },
    ],
  })

  console.log('\n✅ Seed concluído!')
  console.log('   alice@staging.test  / Staging123!  (free)')
  console.log('   bob@staging.test    / Staging123!  (pro, expira em 30d)')
  console.log('   admin@staging.test  / Staging123!  (elite)')
}

main()
  .catch(e => { console.error('❌ Erro no seed:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
