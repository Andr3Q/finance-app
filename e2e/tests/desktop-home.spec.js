// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Início no desktop (design "Nancy Desktop", tela 08, 1440×1136): saldo com atalhos, carrossel de resumos (230px), três números,
// últimas transações e, na coluna de 320px, saúde financeira, próximas contas e Nancy IA. Relógio fixo em 20/out/2026 22h.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 1136 } })

const json = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }
const tx = (id, description, amount, type, category, day) => ({ id, description, amount, type, category, date: `2026-10-${day}T12:00:00Z`, month: 10, year: 2026, archived: false })
const DASH = {
  summary: { salary: 15000, totalIncome: 1800, totalFixedCosts: 5127, unpaidFixedCosts: 247, unpaidBudgetIds: [], totalExpenses: 7300, totalAvailable: 23500, currentBalance: 23500, percentUsed: 31 },
  transactions: [tx('t1', 'Academia', 200, 'expense', 'fixed', '20'), tx('t2', 'Mercado', 240, 'expense', 'food', '20'), tx('t3', 'Combustível', 430, 'expense', 'transport', '19'), tx('t4', 'Roupa', 350, 'expense', 'shopping', '19'), tx('t5', 'Dividendos', 1800, 'income', 'income', '18')],
  limits: [], budgets: [{ id: 'b1', name: 'Academia', amount: 200, dueDay: 20 }, { id: 'b2', name: 'Celular', amount: 47, dueDay: 25 }],
}
const RECAP = (o = {}) => ({ hasData: true, month: 10, year: 2026, prevMonth: 9, saved: 9500, totalIncome: 10800, totalExpenses: 7300, topExpenses: [{ category: 'fixed', label: 'Aluguel', amount: 3500 }], fixedTotal: 6, fixedPaid: 6, score: 79, scorePrev: 75, suggestedGoal: 2000, savedDeltaPct: 32, expensesDeltaPct: -3, fixedSharePct: 70, isBestOfYear: true, nextStep: null, belowAverage: null, ...o })

async function open(page, dash = DASH) {
  // os testes tratam a abertura como terminada (helpers/test.js); aqui o carrossel precisa ver a abertura de verdade para só começar depois dela
  await page.addInitScript(() => { window.__nancySplashGone = false })
  await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
  await injectSession(page, U)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(U)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(dash)))
  await page.route('**/api/transactions/stories-bundle**', r => r.fulfill(json({ userId: U.id, resumo: [RECAP(), RECAP({ month: 9 })], metas: [] })))
  await page.goto('/dashboard')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 }) // a abertura (≈4s) cobre a tela
  await expect(page.locator('[data-testid=balance], .home-balance-val')).toBeVisible()
}
const box = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, sel)

test.describe('Início desktop — medidas e visual do design', () => {
  test('grade de 756px + 20 + 320px; saldo, resumos (230px), três números e coluna da direita', async ({ page }) => {
    await open(page)
    expect(await box(page, '.ndh-main')).toMatchObject({ x: 312, w: 756 })
    expect(await box(page, '.ndh-side')).toMatchObject({ x: 1088, w: 320 })
    expect((await box(page, '.ndh-hero')).h).toBe(173)
    expect(await box(page, '.ndh-story')).toMatchObject({ w: 756, h: 230 })
    const stats = await page.evaluate(() => [...document.querySelectorAll('.ndh-stat')].map(e => Math.round(e.getBoundingClientRect().width * 10) / 10))
    expect(stats).toEqual([241.3, 241.3, 241.3]) // (756 − 2×16) / 3
    expect(await box(page, '.ndh-ring')).toMatchObject({ w: 150, h: 150 })
    expect(await box(page, '.ndh-row')).toMatchObject({ w: 710 }) // 756 − 2×22 (padding) − 2×1 (borda)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  })

  test('cores e fontes do design: saldo 48px/800 branco no azul, números em Geist Mono, cartão da Nancy IA #071330', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndh-hero')).toHaveCSS('background-color', 'rgb(21, 70, 255)')
    await expect(page.getByTestId('balance')).toHaveCSS('font-size', '48px')
    await expect(page.getByTestId('balance')).toHaveCSS('font-weight', '800')
    await expect(page.getByTestId('balance')).toHaveText('R$ 23.500,00')
    await expect(page.locator('.ndh-stat-val').first()).toHaveCSS('font-family', /Geist Mono/)
    await expect(page.locator('.ndh-stat-val').first()).toHaveCSS('font-size', '24px')
    await expect(page.locator('.ndh-nancy')).toHaveCSS('background-color', 'rgb(7, 19, 48)')
    await expect(page.locator('.ndh-story')).toHaveCSS('background-image', /linear-gradient/)
    await expect(page.locator('.ndh-card').first()).toHaveCSS('border-top-left-radius', '20px')
  })

  test('atalhos do saldo: só Nova transação e Nancy IA (Planilha IA e Analisador entram quando as telas existirem)', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndh-quick-btn')).toHaveText(['Nova transação', 'Nancy IA'])
    expect(await box(page, '.ndh-quick-ico')).toMatchObject({ w: 52, h: 52 })
  })
})

test.describe('Início desktop — o que mostra e o que faz', () => {
  test('números, últimas transações com sinal e cor, próximas contas e frase da Nancy IA', async ({ page }) => {
    await open(page, { ...DASH, summary: { ...DASH.summary, unpaidBudgetIds: ['b1', 'b2'] } })
    await expect(page.locator('.ndh-stat').nth(0)).toContainText('R$ 16.800,00')
    await expect(page.locator('.ndh-stat').nth(1)).toContainText('R$ 7.300,00')
    await expect(page.locator('.ndh-stat').nth(2)).toContainText('R$ 5.127,00')
    await expect(page.locator('.ndh-row')).toHaveCount(5)
    await expect(page.locator('.ndh-row-amt').first()).toHaveText('− R$ 200,00')
    await expect(page.locator('.ndh-row-amt.inc')).toHaveText('+ R$ 1.800,00')
    await expect(page.locator('.ndh-row-amt.inc')).toHaveCSS('color', 'rgb(8, 122, 82)')
    await expect(page.locator('.ndh-row-date').first()).toHaveText('20/10')
    await expect(page.locator('.ndh-bill')).toHaveCount(2)
    await expect(page.locator('.ndh-bill').first()).toContainText('AcademiaVence dia 20R$ 200,00')
    await expect(page.locator('.ndh-ring-num')).toHaveText(/^\d+$/)
    await expect(page.locator('.ndh-nancy-text')).toContainText('No ritmo atual, você termina outubro com')
  })

  test('o olho da barra de cima oculta saldo, números, transações e contas', async ({ page }) => {
    await open(page, { ...DASH, summary: { ...DASH.summary, unpaidBudgetIds: ['b1'] } })
    await page.locator('.nds-topbar').getByRole('button', { name: 'Ocultar valores' }).click()
    await expect(page.getByTestId('balance')).toHaveText('R$ ••••••')
    await expect(page.locator('.ndh-page')).not.toContainText(/R\$ \d/)
    await page.locator('.nds-topbar').getByRole('button', { name: 'Mostrar valores' }).click()
    await expect(page.getByTestId('balance')).toHaveText('R$ 23.500,00')
  })

  test('carrossel: começa na abertura do resumo, o mouse pausa, o clique avança e "Ver todos os resumos" abre a tela dos stories', async ({ page }) => {
    await open(page)
    const card = page.locator('.ndh-story')
    await expect(card).toContainText('RESUMO DE OUTUBRO')
    await expect(card).toContainText('Seu mês em 6 histórias.')
    await expect(card).toContainText('1 / 6')
    await card.hover() // pausa
    await page.waitForTimeout(4600)
    await expect(card).toContainText('1 / 6')
    await card.getByRole('button', { name: 'Próximo resumo' }).click()
    await expect(card).toContainText('2 / 6')
    await expect(card).toContainText('VOCÊ GUARDOU')
    await expect(card).toContainText('R$ 9.500')
    await card.getByRole('button', { name: 'Ver todos os resumos' }).click()
    await expect(page).toHaveURL(/\/resumo-stories$/)
  })

  test('o carrossel avança sozinho depois de 4 segundos (sem o mouse em cima)', async ({ page }) => {
    await open(page)
    await page.mouse.move(5, 5)
    await expect(page.locator('.ndh-story')).toContainText('2 / 6', { timeout: 8000 })
  })

  test('atalhos e links: Nova transação abre a folha, Ver extrato leva ao Extrato', async ({ page }) => {
    await open(page)
    await page.locator('.ndh-quick-btn', { hasText: 'Nova transação' }).click()
    await expect(page.getByRole('dialog', { name: 'Nova transação' })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Ver extrato →' }).click()
    await expect(page).toHaveURL(/\/transactions$/)
  })

  test('sem resumo do mês não há carrossel e o resto continua; falha ao carregar mostra o aviso e tenta de novo', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
    await injectSession(page, U)
    let falhar = true
    await page.route('**/api/**', r => r.fulfill(json([])))
    await page.route('**/api/auth/me**', r => r.fulfill(json(U)))
    await page.route('**/api/transactions/stories-bundle**', r => r.fulfill(json({ userId: U.id, resumo: [{ hasData: false, month: 10 }, { hasData: false, month: 9 }], metas: [] })))
    await page.route('**/api/transactions/dashboard**', r => falhar ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' }) : r.fulfill(json(DASH)))
    await page.goto('/dashboard')
    await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
    await expect(page.getByRole('alert')).toContainText('Não foi possível carregar suas finanças.')
    falhar = false
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.getByTestId('balance')).toHaveText('R$ 23.500,00')
    await expect(page.locator('.ndh-story')).toHaveCount(0)
  })
})

test.describe('Início desktop — no celular não aparece', () => {
  test.use({ viewport: { width: 393, height: 852 } })
  test('continua o Início do celular', async ({ page }) => {
    await open(page)
    await expect(page.locator('.home-hero')).toBeVisible()
    await expect(page.locator('.ndh-page')).toHaveCount(0)
  })
})
