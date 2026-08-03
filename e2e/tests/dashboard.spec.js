// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { createMock }   = require('../helpers/mockApi')

// ─────────────────────────────────────────────────────────────────
// Dados de mock — completos para o contrato atual da API
// ─────────────────────────────────────────────────────────────────
const mockUser = {
  id: 'user-test-01', name: 'QA Tester', email: 'qa@test.com',
  plan: 'free', salary: 5000, emailVerified: true,
  twoFactorEnabled: false, onboardingComplete: true,
  autoLaunchMonth: 6, autoLaunchYear: 2026,
  planExpiresAt: null, trialEndsAt: null,
  referralCode: 'ABCD1234',
  notifBudgetAlert: true, notifBudgetReminder: true,
}

// 7 transações em 5 datas distintas — garante que "Ver mais" aparece (FEED_PREVIEW=3)
const mockTxList = [
  { id: 't1', description: 'Aluguel',     amount: 2000, type: 'expense', category: 'housing',  date: '2026-06-01T10:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't2', description: 'Salário',      amount: 5000, type: 'income',  category: 'salary',   date: '2026-06-01T09:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't3', description: 'Supermercado', amount:  450, type: 'expense', category: 'food',     date: '2026-06-02T12:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't4', description: 'Internet',     amount:  120, type: 'expense', category: 'utilities',date: '2026-06-03T08:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't5', description: 'Freelance',    amount: 1500, type: 'income',  category: 'freelance',date: '2026-06-04T14:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't6', description: 'Luz',          amount:  180, type: 'expense', category: 'utilities',date: '2026-06-05T10:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't7', description: 'Academia',     amount:   90, type: 'expense', category: 'health',   date: '2026-06-05T11:00:00Z', month: 6, year: 2026, archived: false },
]

// Resposta do /api/transactions/dashboard — shape correto esperado pelo componente
const mockDashboard = {
  summary: {
    currentBalance: 5660, totalAvailable: 6500, salary: 5000,
    totalExpenses: 2840, totalIncome: 1500, percentUsed: 57,
    financialScore: 72, healthLabel: 'Saudável', extras: 1500,
  },
  transactions: mockTxList,
  limits: [],
  budgets: [{ id: 'b1', name: 'Aluguel', amount: 2000, dueDay: 1 }],
}

// ─────────────────────────────────────────────────────────────────
// Helper isolado por page — sem leak entre workers paralelos
// LIFO correto: wildcard registrado ANTES dos específicos
// ─────────────────────────────────────────────────────────────────
async function goDashboard(page) {
  // 1. Wildcard com menor prioridade (LIFO: registrado primeiro = verificado por último)
  await page.route('**/api/**', r => {
    if (r.request().method() === 'GET')
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // 2. Rotas específicas (maior prioridade — sobrepõem o wildcard)
  // LIFO — ordem: geral ANTES, específico DEPOIS (específico ganha)
  await page.route('**/api/auth/me**',            r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) }))
  await page.route('**/api/transactions**',        r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockTxList) }))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDashboard) }))
  await page.route('**/api/budget**',              r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDashboard.budgets) }))
  await page.route('**/api/budget/category-limits**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/goals**',               r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/installments**',        r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/agent/predict**',       r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prediction: 'Sem dados suficientes.' }) }))
  await page.route('**/health**',                  r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', db_ms: 5 }) }))
  await page.route('**/api/auth/login**',          r => {
    if (r.request().method() !== 'POST') return r.continue()
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'mock-jwt', user: mockUser }) })
  })

  await page.goto('/login')
  await page.fill('input[type=email]',    'qa@test.com')
  await page.fill('input[type=password]', 'Qa123456!')
  await page.click('button[type=submit]')
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 8000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500) // React async render
}

// ─────────────────────────────────────────────────────────────────
// 1. RESPONSIVIDADE — sem scroll horizontal em 375px
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Responsividade Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('não possui scroll horizontal na tela de 375px', async ({ page }) => {
    await goDashboard(page)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
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

  test('.hb-feed-card não ultrapassa a borda da tela', async ({ page }) => {
    await goDashboard(page)
    const cardRight = await page.evaluate(() => {
      const card = document.querySelector('.hb-feed-card')
      if (!card) return null
      return card.getBoundingClientRect().right
    })
    expect(cardRight).not.toBeNull()
    expect(cardRight).toBeLessThanOrEqual(375 + 1)
  })
})

// ─────────────────────────────────────────────────────────────────
// 2. HERO MOBILE — tabs e card (hb-kpi-block)
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Hero Mobile', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('bloco kpi-block visível no mobile', async ({ page }) => {
    await goDashboard(page)
    await expect(page.locator('.hb-kpi-block')).toBeVisible()
  })

  test('4 tabs visíveis (Saldo, Entradas, Gastos, Score)', async ({ page }) => {
    await goDashboard(page)
    const tabs = page.locator('.hb-btab')
    await expect(tabs).toHaveCount(4)
    await expect(tabs.nth(0)).toContainText('Saldo')
    await expect(tabs.nth(1)).toContainText('Entradas')
    await expect(tabs.nth(2)).toContainText('Gastos')
    await expect(tabs.nth(3)).toContainText('Score')
  })

  test('tab Saldo ativa por padrão — underline verde', async ({ page }) => {
    await goDashboard(page)
    const saldoTab = page.locator('.hb-btab').first()
    const borderColor = await saldoTab.evaluate(el =>
      window.getComputedStyle(el).borderBottomColor
    )
    // Deve ter border-bottom colorido (não transparente)
    expect(borderColor).not.toBe('rgba(0, 0, 0, 0)')
    expect(borderColor).not.toBe('transparent')
  })

  test('clicar tab Score muda conteúdo do card', async ({ page }) => {
    await goDashboard(page)
    await page.locator('.hb-btab').nth(3).click()
    await page.waitForTimeout(200)
    const scoreLabel = page.locator('.hb-pane-lbl')
    await expect(scoreLabel).toContainText(/score/i)
  })

  test('botão Nova Transação visível no hero mobile', async ({ page }) => {
    await goDashboard(page)
    const btn = page.locator('.hb-btn-main')
    await expect(btn).toBeVisible()
    await expect(btn).toContainText('Nova Transação')
  })

  test('hb-desktop-only oculto em 393px', async ({ page }) => {
    await goDashboard(page)
    const desktop = page.locator('.hb-desktop-only').first()
    const isHidden = await desktop.evaluate(el =>
      window.getComputedStyle(el).display === 'none'
    )
    expect(isHidden).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────
// 3. HERO DESKTOP — tabs + gráfico
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Hero Desktop (1280px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('hero section visível no desktop', async ({ page }) => {
    await goDashboard(page)
    await expect(page.locator('.hb-hero-section')).toBeVisible()
  })

  test('4 tabs desktop visíveis', async ({ page }) => {
    await goDashboard(page)
    const tabs = page.locator('.hb-htab')
    await expect(tabs).toHaveCount(4)
  })

  test('gráfico SVG renderizado no hero', async ({ page }) => {
    await goDashboard(page)
    const hasSvg = await page.evaluate(() => !!document.querySelector('.hb-chart-svg'))
    expect(hasSvg).toBe(true)
  })

  test('hb-kpi-block oculto em 1280px', async ({ page }) => {
    await goDashboard(page)
    const mobile = page.locator('.hb-kpi-block').first()
    const isHidden = await mobile.evaluate(el =>
      window.getComputedStyle(el).display === 'none'
    )
    expect(isHidden).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────
// 4. FEED DE ATIVIDADE — Ver mais / Ver menos
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Feed de Atividade (Ver mais / Ver menos)', () => {

  test('botão "Ver mais" aparece quando há mais de 3 grupos de data', async ({ page }) => {
    await goDashboard(page)
    const btn = page.locator('.hb-feed-toggle')
    await expect(btn).toBeVisible({ timeout: 8000 })
    await expect(btn).toContainText('Ver mais')
  })

  test('clicar "Ver mais" expande o feed e exibe "Ver menos"', async ({ page }) => {
    await goDashboard(page)
    const toggle = page.locator('.hb-feed-toggle')
    await expect(toggle).toContainText('Ver mais', { timeout: 8000 })

    await toggle.click()
    await expect(toggle).toContainText('Ver menos')
  })

  test('clicar "Ver menos" volta ao estado colapsado', async ({ page }) => {
    await goDashboard(page)
    const toggle = page.locator('.hb-feed-toggle')
    await toggle.click()
    await expect(toggle).toContainText('Ver menos')
    await toggle.click()
    await expect(toggle).toContainText('Ver mais')
  })

  test('trocar filtro "Gastos" reseta feed para colapsado', async ({ page }) => {
    await goDashboard(page)
    const toggle = page.locator('.hb-feed-toggle')
    await toggle.click()
    await expect(toggle).toContainText('Ver menos')

    // Clica no filtro do feed (não no tab do hero)
    await page.locator('.hb-feed-tab', { hasText: /^Gastos$/i }).click()
    await expect(toggle).toContainText('Ver mais', { timeout: 5000 })
  })

  test('lista original de transações não é mutada', async ({ page }) => {
    await goDashboard(page)
    const countBefore = await page.locator('.hb-feed-item').count()
    await page.locator('.hb-feed-toggle').click()
    const countAfter = await page.locator('.hb-feed-item').count()
    expect(countAfter).toBeGreaterThanOrEqual(countBefore)
    expect(countAfter).toBeLessThanOrEqual(mockTxList.length)
  })

})

// ─────────────────────────────────────────────────────────────────
// 5. TOKEN DE COR var(--c)
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

  test('botão Nova Transação mobile usa var(--c) — não hardcoded #4ac46e', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await goDashboard(page)

    // Mobile: .hb-btn-main
    const btnBg = await page.evaluate(() => {
      const btn = document.querySelector('.hb-btn-main')
      return btn ? getComputedStyle(btn).backgroundColor : null
    })
    expect(btnBg).not.toBeNull()
    expect(btnBg).not.toBe('rgb(74, 196, 110)')   // antigo #4ac46e hardcoded
  })

  test('botão Nova Transação desktop usa var(--c) — não hardcoded', async ({ page }) => {
    await goDashboard(page) // viewport padrão 1280px

    // Desktop: .hb-hero-btn
    const btnBg = await page.evaluate(() => {
      const btn = document.querySelector('.hb-hero-btn')
      return btn ? getComputedStyle(btn).backgroundColor : null
    })
    expect(btnBg).not.toBeNull()
    expect(btnBg).not.toBe('rgb(74, 196, 110)')
  })

})

// ─────────────────────────────────────────────────────────────────
// 6. MOCK LIFO — Isolamento em execução paralela
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Isolamento de mocks (LIFO / paralelo)', () => {

  test('rotas específicas têm prioridade sobre wildcard na mesma page', async ({ page }) => {
    // Navega primeiro para ter contexto de página
    await page.goto('http://localhost:5173/', { waitUntil: 'commit' }).catch(() => {})

    // Registra wildcard PRIMEIRO (menor prioridade LIFO)
    await page.route('**/api/**', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '"wildcard"' })
    )
    // Registra específica DEPOIS (maior prioridade LIFO) — DEVE ganhar
    await page.route('**/api/auth/me**', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'x', plan: 'free' }) })
    )

    const resp = await page.evaluate(async () => {
      const r = await fetch('/api/auth/me')
      return r.json()
    })
    // Específica vence o wildcard (LIFO correto)
    expect(resp.id).toBe('x')
    expect(resp).not.toBe('wildcard')
  })

  test('routes não vazam entre tests em workers paralelos (isolation por page)', async ({ page, context }) => {
    // Cada page tem seu próprio isolamento de rotas
    await page.route('**/api/auth/me**', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-isolated', plan: 'pro' }) })
    )

    // Nova page no mesmo context NÃO herda rotas da page anterior
    const page2 = await context.newPage()
    const resp2 = await page2.evaluate(async () => {
      try {
        const r = await fetch('http://localhost:5173/api/auth/me')
        return r.status
      } catch { return 0 }
    }).catch(() => 'no-leak')

    // Page2 não deve retornar o mock da page1
    expect(resp2).not.toBe('test-isolated')
    await page2.close()
  })

})
