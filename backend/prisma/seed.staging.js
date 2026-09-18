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
      autoLaunchMonth: nowBrasilia().month,
      autoLaunchYear:  nowBrasilia().year,
    },
  })
  console.log('  ✓ Alice (free):', alice.id)

  // Transações de Alice
  // Mês/ano e datas no fuso de Brasília. O container roda em UTC: `new Date(year,
  // month-1, dia)` aqui dava meia-noite UTC, que em Brasília ainda é o dia
  // anterior — o "Salário" do dia 1º aparecia em 31 do mês passado.
  const { month, year } = nowBrasilia()
  const brt = (y, m, d) => parseDateInput(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`)

  await prisma.transaction.createMany({
    data: [
      { userId: alice.id, description: 'Salário',          amount: 5000, type: 'income',  category: 'salary',   date: brt(year, month, 5),  month, year, archived: false },
      { userId: alice.id, description: 'Aluguel',           amount: 1200, type: 'expense', category: 'fixed',    date: brt(year, month, 10), month, year, archived: false },
      { userId: alice.id, description: 'Plano de celular',  amount:   60, type: 'expense', category: 'fixed',    date: brt(year, month, 12), month, year, archived: false },
      { userId: alice.id, description: 'Academia',          amount:   90, type: 'expense', category: 'fixed',    date: brt(year, month, 15), month, year, archived: false },
      { userId: alice.id, description: 'Supermercado',      amount:  450, type: 'expense', category: 'food',     date: brt(year, month, 12), month, year, archived: false },
      { userId: alice.id, description: 'Freelance extra',   amount: 1500, type: 'income',  category: 'freelance',date: brt(year, month, 15), month, year, archived: false },
      { userId: alice.id, description: 'Conta de luz',      amount:  180, type: 'expense', category: 'utilities',date: brt(year, month, 18), month, year, archived: false },
      { userId: alice.id, description: 'Internet',          amount:  120, type: 'expense', category: 'utilities',date: brt(year, month, 20), month, year, archived: false },
      { userId: alice.id, description: 'Restaurante',       amount:   85, type: 'expense', category: 'food',     date: brt(year, month, 22), month, year, archived: false },
    ],
  })

  // Metas de Alice
  await prisma.goal.createMany({
    data: [
      { userId: alice.id, title: 'Reserva de emergência', targetAmount: 15000, currentAmount: 3200, color: '#4ac46e', deadline: brt(year+1, 12, 31) },
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
      { userId: bob.id, description: 'Salário empresa',  amount: 8500, type: 'income',  category: 'salary',   date: brt(year, month, 1),  month, year, archived: false },
      { userId: bob.id, description: 'Financiamento',    amount: 2100, type: 'expense', category: 'fixed',    date: brt(year, month, 5),  month, year, archived: false },
      { userId: bob.id, description: 'Plano de saúde',   amount:  520, type: 'expense', category: 'fixed',    date: brt(year, month, 8),  month, year, archived: false },
      { userId: bob.id, description: 'Netflix',          amount:   45, type: 'expense', category: 'fixed',    date: brt(year, month, 10), month, year, archived: false },
      { userId: bob.id, description: 'Seguro do carro',  amount:  280, type: 'expense', category: 'fixed',    date: brt(year, month, 25), month, year, archived: false },
      { userId: bob.id, description: 'Combustível',      amount:  350, type: 'expense', category: 'transport',date: brt(year, month, 8),  month, year, archived: false },
      { userId: bob.id, description: 'Bônus trimestral', amount: 2000, type: 'income',  category: 'bonus',    date: brt(year, month, 12),  month, year, archived: false },
      { userId: bob.id, description: 'Supermercado',     amount:  680, type: 'expense', category: 'food',     date: brt(year, month, 14), month, year, archived: false },
      { userId: bob.id, description: 'Farmácia',         amount:   95, type: 'expense', category: 'health',   date: brt(year, month, 17), month, year, archived: false },
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

  await prisma.transaction.createMany({
    data: [
      { userId: elite.id, description: 'Salário',           amount: 15000, type: 'income',  category: 'salary',   date: brt(year, month, 5),  month, year, archived: false },
      { userId: elite.id, description: 'Aluguel',            amount:  3500, type: 'expense', category: 'fixed',    date: brt(year, month, 5),  month, year, archived: false },
      { userId: elite.id, description: 'Plano de saúde',     amount:   850, type: 'expense', category: 'fixed',    date: brt(year, month, 8),  month, year, archived: false },
      { userId: elite.id, description: 'Internet fibra',     amount:   150, type: 'expense', category: 'fixed',    date: brt(year, month, 15), month, year, archived: false },
      { userId: elite.id, description: 'Academia premium',   amount:   200, type: 'expense', category: 'fixed',    date: brt(year, month, 20), month, year, archived: false },
      { userId: elite.id, description: 'Conta de luz',       amount:   380, type: 'expense', category: 'fixed',    date: brt(year, month, 22), month, year, archived: false },
      { userId: elite.id, description: 'Supermercado',       amount:   920, type: 'expense', category: 'food',     date: brt(year, month, 10), month, year, archived: false },
      { userId: elite.id, description: 'Restaurante sushi',  amount:   245, type: 'expense', category: 'food',     date: brt(year, month, 14), month, year, archived: false },
      { userId: elite.id, description: 'Combustível',        amount:   480, type: 'expense', category: 'transport',date: brt(year, month, 12), month, year, archived: false },
      { userId: elite.id, description: 'Uber',               amount:    95, type: 'expense', category: 'transport',date: brt(year, month, 18), month, year, archived: false },
      { userId: elite.id, description: 'Farmácia',           amount:   130, type: 'expense', category: 'health',   date: brt(year, month, 16), month, year, archived: false },
      { userId: elite.id, description: 'Roupa',              amount:   350, type: 'expense', category: 'shopping', date: brt(year, month, 20), month, year, archived: false },
      { userId: elite.id, description: 'Dividendos',         amount:  1800, type: 'income',  category: 'bonus',    date: brt(year, month, 25), month, year, archived: false },
    ],
  })
  console.log('  ✓ Transações de Admin criadas\n')

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
