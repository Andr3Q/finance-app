// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Notificações no desktop (design "Nancy Desktop", tela 14, 1440×898): um cartão de 906px com uma linha por aviso (ícone azul de 40px,
// título, texto e quando). Relógio fixo em 20/out/2026 22h.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 898 } })

const json = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }
const DASH = {
  summary: { salary: 15000, totalIncome: 0, totalFixedCosts: 200, unpaidFixedCosts: 200, unpaidBudgetIds: ['b1'], totalExpenses: 1230, totalAvailable: 15000, currentBalance: 13570, percentUsed: 8 },
  transactions: [{ id: 't1', type: 'expense', category: 'food', amount: 1230, description: 'Mercado', date: '2026-10-19T12:00:00Z', month: 10, year: 2026 }],
  limits: [{ category: 'food', amount: 1500 }],
  budgets: [{ id: 'b1', name: 'Academia', amount: 200, dueDay: 20, endDate: null }],
}

async function open(page, dash = DASH) {
  await page.addInitScript(() => { window.__nancySplashGone = false })
  await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
  await injectSession(page, U)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(U)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(dash)))
  await page.goto('/notificacoes')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
}
const box = (page, sel, i = 0) => page.evaluate(([s, n]) => { const b = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, [sel, i])

test.describe('Notificações desktop — medidas e visual do design', () => {
  test('cartão de 906px a 103px do alto; linha de 69,5px; ícone azul de 40px; título, texto e quando no lugar do design', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndn-item')).toHaveCount(2)
    expect(await box(page, '.ndn-card')).toMatchObject({ x: 312, y: 103, w: 906 })
    expect(await box(page, '.ndn-item')).toMatchObject({ x: 335, y: 126, w: 860, h: 69.5 })
    expect(await box(page, '.ndn-ico')).toMatchObject({ x: 335, y: 141, w: 40, h: 40 })
    expect(await box(page, '.ndn-name')).toMatchObject({ x: 389, y: 141 })
    expect(await page.locator('.ndn-ico').first().evaluate(e => { const c = getComputedStyle(e); return [c.backgroundColor, c.color, c.borderRadius] })).toEqual(['rgb(21, 70, 255)', 'rgb(255, 255, 255)', '12px'])
    const when = await box(page, '.ndn-when')
    expect(Math.round(when.x + when.w)).toBe(1195) // o "quando" termina na borda interna do cartão
    expect(await page.locator('.ndn-name').first().evaluate(e => { const c = getComputedStyle(e); return [c.fontSize, c.fontWeight] })).toEqual(['14.5px', '600'])
  })

  test('conteúdo: avisos calculados dos dados e o subtítulo "N novas" na barra de cima', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndn-name')).toHaveText(['Academia vence hoje', 'Alimentação em 82% do limite'])
    await expect(page.locator('.ndn-text').first()).toHaveText('R$ 200,00 · conta fixa')
    await expect(page.locator('.nds-topbar')).toContainText('2 novas')
  })
})

test.describe('Notificações desktop — funções', () => {
  test('tocar num aviso leva à tela dele; o atalho das preferências continua', async ({ page }) => {
    await open(page)
    await page.locator('.ndn-row', { hasText: 'Academia vence hoje' }).click()
    await expect(page).toHaveURL(/\/contas-do-mes$/)
    await page.goBack()
    await expect(page.locator('.ndn-card')).toBeVisible()
    await page.getByRole('button', { name: 'Preferências de notificação' }).click()
    await expect(page).toHaveURL(/\/settings\/notificacoes$/)
  })

  test('sem avisos mostra "Tudo em dia"', async ({ page }) => {
    await open(page, { summary: { salary: 15000, totalIncome: 0, totalFixedCosts: 0, unpaidFixedCosts: 0, unpaidBudgetIds: [], totalExpenses: 0, totalAvailable: 15000, currentBalance: 15000, percentUsed: 0 }, transactions: [], limits: [], budgets: [] })
    await expect(page.getByText('Tudo em dia')).toBeVisible()
    await expect(page.locator('.ndn-item')).toHaveCount(0)
  })
})
