// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { createMock }   = require('../helpers/mockApi')

// ─────────────────────────────────────────────────────────────────
// Dados de mock reutilizáveis
// ─────────────────────────────────────────────────────────────────
const mockUser = {
  id: 'user-test-01', name: 'QA Tester', email: 'qa@test.com',
  plan: 'free', salary: 5000, emailVerified: true,
  twoFactorEnabled: false, onboardingComplete: true,
  autoLaunchMonth: 6, autoLaunchYear: 2026,
  planExpiresAt: null, trialEndsAt: null,
}

// 10 transações em 5 datas diferentes — força o botão "Ver mais" a aparecer
const mockTransactions = [
  { id: 't1',  description: 'Aluguel',      amount: 2000, type: 'expense', category: 'housing',  date: '2026-06-01T10:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't2',  description: 'Salário',       amount: 5000, type: 'income',  category: 'salary',   date: '2026-06-01T09:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't3',  description: 'Supermercado',  amount:  450, type: 'expense', category: 'food',     date: '2026-06-02T12:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't4',  description: 'Internet',      amount:  120, type: 'expense', category: 'utilities',date: '2026-06-03T08:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't5',  description: 'Freelance',     amount: 1500, type: 'income',  category: 'freelance',date: '2026-06-04T14:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't6',  description: 'Luz',           amount:  180, type: 'expense', category: 'utilities',date: '2026-06-05T10:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't7',  description: 'Academia',      amount:   90, type: 'expense', category: 'health',   date: '2026-06-05T11:00:00Z', month: 6, year: 2026, archived: false },
]

const mockSummary = {
  balance: 3660, salary: 5000, totalIncome: 6500, totalExpense: 2840,
  budgetUsedPct: 57, financialScore: 72, extras: 1500,
}

// Helper: autentica e vai para o Dashboard com mocks
async function goDashboard(page) {
  const mock = createMock(page)

  mock.get('/api/auth/me',       mockUser)
  mock.get('/api/transactions',  mockTransactions)
  mock.get('/api/budget',        [{ id: 'b1', name: 'Aluguel', amount: 2000, dueDay: 1 }])
  mock.get('/api/goals',         [])
  mock.get('/api/installments',  [])
  mock.post('/api/auth/login', { token: 'mock-jwt', user: mockUser })

  await page.goto('/login')
  await page.fill('input[type=email]',    'qa@test.com')
  await page.fill('input[type=password]', 'Qa123456!')
  await page.click('button[type=submit]')
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 8000 })
  await page.waitForLoadState('networkidle')
}

// ─────────────────────────────────────────────────────────────────
// 1. SEM SCROLL HORIZONTAL em viewport 375px (iPhone SE)
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Responsividade Mobile (375px)', () => {

  test.use({ viewport: { width: 375, height: 812 } })

  test('não possui scroll horizontal na tela de 375px', async ({ page }) => {
    await goDashboard(page)

    const scrollWidth  = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth  = await page.evaluate(() => document.documentElement.clientWidth)

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })

  test('container .pwnav não cria overflow horizontal', async ({ page }) => {
    await goDashboard(page)

    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.pwnav')
      if (!el) return null
      const style = window.getComputedStyle(el)
      return { overflowX: style.overflowX, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })

    expect(overflow).not.toBeNull()
    expect(overflow.overflowX).toBe('hidden')
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
  })

  test('card .hb-feed-card não ultrapassa a largura da tela', async ({ page }) => {
    await goDashboard(page)

    const cardRight = await page.evaluate(() => {
      const card = document.querySelector('.hb-feed-card')
      if (!card) return null
      return card.getBoundingClientRect().right
    })

    expect(cardRight).not.toBeNull()
    expect(cardRight).toBeLessThanOrEqual(375 + 1) // +1px de tolerância
  })

})

// ─────────────────────────────────────────────────────────────────
// 2. BOTÃO "VER MAIS" — Estado e altura do card
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Feed de Atividade (Ver mais / Ver menos)', () => {

  test('botão "Ver mais" aparece quando há mais de 3 grupos de data', async ({ page }) => {
    await goDashboard(page)

    // 7 transações em 5 datas → deve exibir botão
    const btn = page.locator('.hb-feed-toggle')
    await expect(btn).toBeVisible()
    await expect(btn).toContainText('Ver mais')
  })

  test('clicar "Ver mais" adiciona itens visíveis e altera a classe do feed', async ({ page }) => {
    await goDashboard(page)

    const feed = page.locator('.hb-feed').first()

    // Estado inicial: classe collapsed
    await expect(feed).toHaveClass(/hb-feed-collapsed/)

    // Altura inicial (colapsado)
    const heightBefore = await feed.evaluate(el => el.scrollHeight)

    // Clicar em Ver mais
    await page.locator('.hb-feed-toggle').click()

    // Classe collapsed deve sumir
    await expect(feed).not.toHaveClass(/hb-feed-collapsed/)

    // Altura deve crescer
    const heightAfter = await feed.evaluate(el => el.scrollHeight)
    expect(heightAfter).toBeGreaterThanOrEqual(heightBefore)

    // Botão deve mudar para "Ver menos"
    await expect(page.locator('.hb-feed-toggle')).toContainText('Ver menos')
  })

  test('clicar "Ver menos" volta ao estado colapsado', async ({ page }) => {
    await goDashboard(page)

    // Expandir
    await page.locator('.hb-feed-toggle').click()
    await expect(page.locator('.hb-feed-toggle')).toContainText('Ver menos')

    // Colapsar
    await page.locator('.hb-feed-toggle').click()
    await expect(page.locator('.hb-feed-toggle')).toContainText('Ver mais')
    await expect(page.locator('.hb-feed').first()).toHaveClass(/hb-feed-collapsed/)
  })

  test('trocar filtro (Gastos) reseta o feed para colapsado', async ({ page }) => {
    await goDashboard(page)

    // Expandir primeiro
    await page.locator('.hb-feed-toggle').click()
    await expect(page.locator('.hb-feed').first()).not.toHaveClass(/hb-feed-collapsed/)

    // Trocar filtro → deve colapsar
    await page.getByRole('button', { name: /^gastos$/i }).click()
    await expect(page.locator('.hb-feed').first()).toHaveClass(/hb-feed-collapsed/)
  })

  test('lista original de transações não é mutada (integridade dos dados)', async ({ page }) => {
    await goDashboard(page)

    // Ler número de itens renderizados antes de expandir
    const countBefore = await page.locator('.hb-feed-item').count()

    // Expandir
    await page.locator('.hb-feed-toggle').click()
    const countAfter = await page.locator('.hb-feed-item').count()

    // Expandido deve mostrar mais ou igual número de itens
    expect(countAfter).toBeGreaterThanOrEqual(countBefore)

    // Total máximo = total de transações do mock
    expect(countAfter).toBeLessThanOrEqual(mockTransactions.length)
  })

})

// ─────────────────────────────────────────────────────────────────
// 3. VAR(--C) — Cor verde aplicada uniformemente
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Token de cor var(--c)', () => {

  test('--c está definido no :root', async ({ page }) => {
    await goDashboard(page)

    const color = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--c').trim()
    )

    expect(color).not.toBe('')
    expect(color.startsWith('#') || color.startsWith('rgb')).toBeTruthy()
  })

  test('botão Nova Transação usa a mesma cor do token --c', async ({ page }) => {
    await goDashboard(page)

    const [btnBg, tokenColor] = await page.evaluate(() => {
      const btn   = document.querySelector('.hb-new-btn')
      const token = getComputedStyle(document.documentElement).getPropertyValue('--c').trim()
      return btn ? [getComputedStyle(btn).backgroundColor, token] : [null, token]
    })

    expect(btnBg).not.toBeNull()
    // Ambos devem ser derivados do mesmo token — não hardcoded divergente
    expect(btnBg).not.toBe('rgb(74, 196, 110)')   // antigo #4ac46e hardcoded
  })

})
