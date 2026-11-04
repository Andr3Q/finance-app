// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Análise do mês no desktop (design "Nancy Desktop", tela 18, 1440×898): "Gastos por categoria" (630px) à esquerda e, à direita (450px), o
// maior gasto variável em azul e o convite para a Nancy IA. Relógio fixo em 20/out/2026 22h.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 898 } })

const json = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }
const tx = (id, amount, category) => ({ id, description: category, amount, type: 'expense', category, date: '2026-10-12T12:00:00Z', month: 10, year: 2026, archived: false })
const DASH = {
  summary: { salary: 15000, totalIncome: 1800, totalFixedCosts: 5127, unpaidFixedCosts: 0, unpaidBudgetIds: [], totalExpenses: 7300, totalAvailable: 16800, currentBalance: 9500, percentUsed: 43 },
  transactions: [tx('a', 5080, 'fixed'), tx('b', 1165, 'food'), tx('c', 575, 'transport'), tx('d', 350, 'shopping'), tx('e', 130, 'health')], limits: [], budgets: [],
}

async function open(page) {
  await page.addInitScript(() => { window.__nancySplashGone = false })
  await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
  await injectSession(page, U)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(U)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(DASH)))
  await page.goto('/analise')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
  await expect(page.locator('.nda-item').first()).toBeVisible()
}
const box = (page, sel, i = 0) => page.evaluate(([s, n]) => { const b = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, [sel, i])

test.describe('Análise desktop — medidas e visual do design', () => {
  test('colunas 1,4fr/1fr (630 e 450, vão de 16) a 167px; cartão azul de 135px; convite logo abaixo', async ({ page }) => {
    await open(page)
    expect(await box(page, '.nda-cats')).toMatchObject({ x: 312, y: 167, w: 630 })
    expect(await box(page, '.nda-top')).toMatchObject({ x: 958, y: 167, w: 450, h: 135 })
    expect(await box(page, '.nda-ask')).toMatchObject({ x: 958, y: 318, w: 450 })
  })

  test('linhas de 50px de passo: ícone de 20px, barra de 10px e % de 40px na borda do cartão', async ({ page }) => {
    await open(page)
    const a = await box(page, '.nda-item', 0), b = await box(page, '.nda-item', 1)
    expect(Math.round(b.y - a.y)).toBe(50)
    expect(await box(page, '.nda-bar')).toMatchObject({ h: 10 })
    const pct = await box(page, '.nda-pct')
    expect(pct.w).toBe(40)
    expect(Math.round(pct.x + pct.w)).toBe(919) // borda interna do cartão
  })

  test('cores do design: cartão azul, barras na cor de cada categoria, convite com ícone verde', async ({ page }) => {
    await open(page)
    expect(await page.locator('.nda-top').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(21, 70, 255)')
    expect(await page.locator('.nda-ask-ico').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(18, 201, 133)')
    const cores = await page.locator('.nda-fill').evaluateAll(els => els.map(e => getComputedStyle(e).backgroundColor))
    expect(new Set(cores).size).toBe(5) // uma cor por categoria
    await expect(page.locator('.nda-eyebrow')).toHaveText('MAIOR GASTO VARIÁVEL')
    await expect(page.locator('.nda-top-name')).toHaveText('Alimentação')
  })
})

test.describe('Análise desktop — funções', () => {
  test('o convite leva à Nancy IA já com a pergunta; as abas levam às outras telas do Extrato', async ({ page }) => {
    let pergunta = null
    await open(page)
    await page.route('**/api/agent/chat', async r => { pergunta = r.request().postDataJSON().message; await r.fulfill(json({ reply: 'Claro!' })) }) // depois do open: a última rota registrada vale primeiro
    await page.locator('.nda-ask').click()
    await expect(page).toHaveURL(/\/nancy-ia$/)
    await expect.poll(() => pergunta).toMatch(/cortar R\$ 350/)
    await page.locator('.nds-sidebar .nds-item', { hasText: 'Extrato' }).click()
    await page.getByRole('button', { name: 'Análise' }).click()
    await expect(page).toHaveURL(/\/analise$/)
    await page.getByRole('button', { name: 'Parceladas' }).click()
    await expect(page).toHaveURL(/\/parcelados$/)
  })
})
