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
      autoLaunchMonth: new Date().getMonth() + 1,
      autoLaunchYear:  new Date().getFullYear(),
    },
  })
  console.log('  ✓ Alice (free):', alice.id)

  // Transações de Alice
  const now = new Date()
  const month = now.getMonth() + 1
  const year  = now.getFullYear()

  await prisma.transaction.createMany({
    data: [
      { userId: alice.id, description: 'Salário',          amount: 5000, type: 'income',  category: 'salary',   date: new Date(year, month-1, 5),  month, year, archived: false },
      { userId: alice.id, description: 'Aluguel',           amount: 1200, type: 'expense', category: 'housing',  date: new Date(year, month-1, 10), month, year, archived: false },
      { userId: alice.id, description: 'Supermercado',      amount:  450, type: 'expense', category: 'food',     date: new Date(year, month-1, 12), month, year, archived: false },
      { userId: alice.id, description: 'Freelance extra',   amount: 1500, type: 'income',  category: 'freelance',date: new Date(year, month-1, 15), month, year, archived: false },
      { userId: alice.id, description: 'Conta de luz',      amount:  180, type: 'expense', category: 'utilities',date: new Date(year, month-1, 18), month, year, archived: false },
      { userId: alice.id, description: 'Internet',          amount:  120, type: 'expense', category: 'utilities',date: new Date(year, month-1, 20), month, year, archived: false },
      { userId: alice.id, description: 'Restaurante',       amount:   85, type: 'expense', category: 'food',     date: new Date(year, month-1, 22), month, year, archived: false },
    ],
  })

  // Metas de Alice
  await prisma.goal.createMany({
    data: [
      { userId: alice.id, title: 'Reserva de emergência', targetAmount: 15000, currentAmount: 3200, color: '#4ac46e', deadline: new Date(year+1, 11, 31) },
      { userId: alice.id, title: 'Viagem ao exterior',     targetAmount:  8000, currentAmount:  500, color: '#007e8a' },
    ],
  })

  // Contas fixas de Alice
  await prisma.budget.createMany({
    data: [
      { userId: alice.id, name: 'Aluguel',   amount: 1200, dueDay: 10 },
      { userId: alice.id, name: 'Internet',  amount:  120, dueDay: 20 },
      { userId: alice.id, name: 'Academia',  amount:   90, dueDay: 15 },
    ],
  })
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

  await prisma.transaction.createMany({
    data: [
      { userId: bob.id, description: 'Salário empresa',  amount: 8500, type: 'income',  category: 'salary',   date: new Date(year, month-1, 1), month, year, archived: false },
      { userId: bob.id, description: 'Financiamento',    amount: 2100, type: 'expense', category: 'housing',  date: new Date(year, month-1, 5), month, year, archived: false },
      { userId: bob.id, description: 'Combustível',      amount:  350, type: 'expense', category: 'transport',date: new Date(year, month-1, 8), month, year, archived: false },
      { userId: bob.id, description: 'Bônus trimestral', amount: 2000, type: 'income',  category: 'bonus',    date: new Date(year, month-1,12), month, year, archived: false },
    ],
  })

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
