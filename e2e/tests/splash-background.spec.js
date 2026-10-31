// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Achado do André (iPhone, produção): ao abrir o app aparecia uma faixa AZUL embaixo da abertura preta (47px, a altura da
// área da barra de status) e depois sumia. O que a abertura não cobre mostra o fundo da página — no celular/tema claro ele
// é azul (correção do "puxar a tela", html #1C48FF). Agora o fundo é preto enquanto a abertura está na tela e volta ao azul
// quando ela sai. O iOS em si só se confere no aparelho; aqui trava a cor nos dois momentos.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 390, height: 844 } })

const json = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) })
const dash = {
  summary: { salary: 5000, totalIncome: 1500, totalFixedCosts: 2000, unpaidFixedCosts: 0, unpaidBudgetIds: [], totalExpenses: 2840, totalAvailable: 6500, currentBalance: 3660, percentUsed: 44 },
  transactions: [], limits: [], budgets: [],
}
async function setup(page) {
  await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(TEST_USER)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(dash)))
}
const estado = (page) => page.evaluate(() => ({
  marca: document.documentElement.classList.contains('is-splashing'),
  fundo: getComputedStyle(document.documentElement).backgroundColor,
  abertura: !!document.getElementById('app-splash'),
}))

test('no momento do bug (app já montado em tema claro, abertura ainda na tela) o fundo é preto; depois volta ao azul', async ({ page }) => {
  await setup(page)
  await page.goto('/dashboard')
  // o Início impõe o tema claro assim que monta — é aí que o html ficava azul por baixo da abertura
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(await estado(page)).toEqual({ marca: true, fundo: 'rgb(0, 0, 0)', abertura: true })

  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
  await expect.poll(() => estado(page)).toEqual({ marca: false, fundo: 'rgb(28, 72, 255)', abertura: false })
})

test('com o tema escuro salvo o fundo também é preto durante a abertura e a marca sai no fim', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'))
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.goto('/')
  expect(await estado(page)).toMatchObject({ marca: true, fundo: 'rgb(0, 0, 0)', abertura: true })
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('is-splashing'))).toBe(false)
})
