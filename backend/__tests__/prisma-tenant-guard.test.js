'use strict'
// Testa a guarda multi-tenant de backend/src/lib/prisma.js DE VERDADE — sem
// mockar o módulo (ao contrário de todo o resto da suíte, que mocka Prisma
// pra testar as rotas). A guarda lança erro ANTES de tocar o banco (dentro
// de $allOperations, antes do `query(args)`), então não precisa de conexão
// real com Postgres pra confirmar que ela bloqueia — só pra confirmar que
// ela deixa passar (isso é validado à parte, com Postgres real).
const prisma = require('../src/lib/prisma')

const TENANT_MODELS = [
  'transaction', 'budget', 'categoryLimit', 'goal', 'pushSubscription',
  'installmentPlan', 'twoFactorBackupCode', 'processedPayment', 'accountUnlockToken',
]

describe('Guarda multi-tenant (lib/prisma.js)', () => {
  test.each(TENANT_MODELS)('%s.findMany sem userId no where lança erro', async (model) => {
    await expect(prisma[model].findMany({ where: { id: 'algum-id' } })).rejects.toThrow('[tenant-guard]')
  })

  test.each(TENANT_MODELS)('%s.findMany COM userId no where não é bloqueado pela guarda', async (model) => {
    // Não valida que a query teria sucesso contra um banco real (isso é
    // validado à parte) — só confirma que a guarda em si não lança.
    await expect(prisma[model].findMany({ where: { userId: 'user-1' } })).rejects.not.toThrow('[tenant-guard]')
  })

  test('deleteMany sem userId lança erro (padrão de ownership-check + delete atômico)', async () => {
    await expect(prisma.transaction.deleteMany({ where: { id: 'tx-1' } })).rejects.toThrow('[tenant-guard]')
  })

  test('update singular sem userId no where lança erro (o padrão mais fácil de esquecer)', async () => {
    await expect(prisma.budget.update({ where: { id: 'b-1' }, data: { name: 'x' } })).rejects.toThrow('[tenant-guard]')
  })

  test('update singular com userId embutido no where (extended where) não é bloqueado pela guarda', async () => {
    await expect(prisma.budget.update({ where: { id: 'b-1', userId: 'user-1' }, data: { name: 'x' } })).rejects.not.toThrow('[tenant-guard]')
  })

  test('where com AND contendo userId é reconhecido (não bloqueia)', async () => {
    await expect(prisma.transaction.findMany({ where: { AND: [{ month: 1 }, { userId: 'user-1' }] } })).rejects.not.toThrow('[tenant-guard]')
  })

  test('create sem userId em data lança erro', async () => {
    await expect(prisma.transaction.create({ data: { description: 'x', amount: 10 } })).rejects.toThrow('[tenant-guard]')
  })

  test('create com userId em data não é bloqueado pela guarda', async () => {
    await expect(prisma.transaction.create({ data: { description: 'x', amount: 10, userId: 'user-1' } })).rejects.not.toThrow('[tenant-guard]')
  })

  test('upsert sem userId no create lança erro', async () => {
    await expect(prisma.pushSubscription.upsert({
      where: { endpoint: 'https://x' }, create: { endpoint: 'https://x' }, update: {},
    })).rejects.toThrow('[tenant-guard]')
  })

  test('upsert com userId no create não é bloqueado pela guarda (where não precisa de userId — é chave única)', async () => {
    await expect(prisma.pushSubscription.upsert({
      where: { endpoint: 'https://x' }, create: { endpoint: 'https://x', userId: 'user-1' }, update: {},
    })).rejects.not.toThrow('[tenant-guard]')
  })

  test('findUnique não é bloqueado pela guarda mesmo sem userId (chave única, usado em fluxos pré-sessão)', async () => {
    await expect(prisma.accountUnlockToken.findUnique({ where: { tokenHash: 'abc' } })).rejects.not.toThrow('[tenant-guard]')
  })

  test('modelo sem userId (User) nunca é afetado pela guarda', async () => {
    await expect(prisma.user.findMany({ where: { plan: 'pro' } })).rejects.not.toThrow('[tenant-guard]')
  })

  test('.raw bypassa a guarda completamente — mesma query que a guarda bloquearia', async () => {
    await expect(prisma.raw.transaction.findMany({ where: { id: 'tx-1' } })).rejects.not.toThrow('[tenant-guard]')
  })
})
