// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Assinaturas (Nancy 2, tela 21) — celular. Relógio fixado em 21/out/2026.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const day = (n) => new Date(Date.UTC(2026, 9, 21, 15) - n * 86400000).toISOString()
const SUBS = [
  { description: 'Streaming de vídeo', amount: 55.9, lastDate: day(2) },
  { description: 'Música', amount: 21.9, lastDate: day(0) },
  { description: 'Armazenamento em nuvem', amount: 41.2, lastDate: day(40) },
]
const DASH = { summary: { totalExpenses: 0, totalIncome: 0, unpaidBudgetIds: [] }, transactions: [], limits: [], budgets: [] }

async function setup(page, { user = { ...TEST_USER, plan: 'elite' }, goto = '/assinaturas' } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'))
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/transactions/subscriptions**', r => r.fulfill(json(SUBS)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(DASH)))
  await page.route('**/api/goals**', r => r.fulfill(json([])))
  await page.goto(goto)
}

test.describe('Assinaturas', () => {
  test('cartão azul com o total, lista com interruptores ligados, a parada em vermelho e Metas aceso', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { name: 'Assinaturas' })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Detectadas pela Nancy IA')
    await expect(page.locator('.sb-sum-val')).toHaveText('R$ 119,00/mês')
    await expect(page.locator('.sb-name')).toHaveText(['Streaming de vídeo', 'Música', 'Armazenamento em nuvem'])
    await expect(page.locator('.sb-sub')).toHaveText(['R$ 55,90 · cobrada há 2 dias', 'R$ 21,90 · cobrada hoje', 'R$ 41,20 · cobrada há 40 dias'])
    await expect(page.locator('.sb-sub.stale')).toHaveCount(1)
    await expect(page.getByRole('switch', { checked: true })).toHaveCount(3)
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Metas')
    const m = await page.evaluate(() => {
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return { hero: cs('.fin-hero').backgroundColor, sum: cs('.sb-sum').backgroundColor, on: cs('.sb-switch.on').backgroundColor, theme: document.documentElement.getAttribute('data-theme') }
    })
    expect(m).toEqual({ hero: 'rgb(28, 72, 255)', sum: 'rgb(28, 72, 255)', on: 'rgb(25, 200, 132)', theme: 'light' })
  })

  test('desligar o interruptor vira lembrete nas Notificações e o bolinha do sino acende no Início', async ({ page }) => {
    await setup(page)
    await page.getByRole('switch', { name: /Música/ }).click()
    await expect(page.getByRole('switch', { name: /Música/ })).toHaveAttribute('aria-checked', 'false')

    await page.goto('/notificacoes')
    await expect(page.getByText('Cancelar Música?')).toBeVisible()
    await expect(page.getByText('R$ 21,90/mês · você pediu pra ser lembrado')).toBeVisible()
    await page.getByRole('button', { name: /Cancelar Música\?/ }).click()
    await expect(page).toHaveURL(/\/assinaturas$/)
    await expect(page.getByRole('switch', { name: /Música/ })).toHaveAttribute('aria-checked', 'false') // continua marcado
  })

  test('quem não é Elite vê o convite', async ({ page }) => {
    await setup(page, { user: { ...TEST_USER, plan: 'pro' } })
    await expect(page.getByText('Recurso Elite')).toBeVisible()
    await expect(page.locator('.sb-item')).toHaveCount(0)
  })

  test('o atalho "Assinaturas" das Metas abre a tela e voltar retorna às Metas', async ({ page }) => {
    await setup(page, { goto: '/goals' })
    await page.getByRole('button', { name: /Assinaturas/ }).click()
    await expect(page).toHaveURL(/\/assinaturas$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/goals$/)
  })
})
