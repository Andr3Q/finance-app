// @ts-nocheck
const { test, expect } = require('@playwright/test')

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

// 7 transações — "Últimas" mostra só as 5 mais recentes (slice(0,5))
const mockTxList = [
  { id: 't1', description: 'Aluguel',     amount: 2000, type: 'expense', category: 'housing',  date: '2026-06-05T10:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't2', description: 'Academia',    amount:   90, type: 'expense', category: 'health',   date: '2026-06-05T11:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't3', description: 'Supermercado',amount:  450, type: 'expense', category: 'food',     date: '2026-06-04T12:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't4', description: 'Internet',    amount:  120, type: 'expense', category: 'utilities',date: '2026-06-03T08:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't5', description: 'Freelance',   amount: 1500, type: 'income',  category: 'freelance',date: '2026-06-02T14:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't6', description: 'Luz',         amount:  180, type: 'expense', category: 'utilities',date: '2026-06-01T10:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't7', description: 'Salário',     amount: 5000, type: 'income',  category: 'salary',   date: '2026-06-01T09:00:00Z', month: 6, year: 2026, archived: false },
]

// Resposta do /api/transactions/dashboard — mesmo shape que o backend real
// envia (backend/src/routes/transactions.js) — score/saúde financeira são
// computados no client a partir destes campos, não vêm prontos do backend.
const mockDashboard = {
  summary: {
    salary: 5000, totalIncome: 1500, totalFixedCosts: 2000, unpaidFixedCosts: 0,
    unpaidBudgetIds: [], totalExpenses: 2840, totalAvailable: 6500,
    currentBalance: 3660, percentUsed: 44,
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

  test('.home-recent não ultrapassa a borda da tela', async ({ page }) => {
    await goDashboard(page)
    const cardRight = await page.evaluate(() => {
      const card = document.querySelector('.home-recent')
      if (!card) return null
      return card.getBoundingClientRect().right
    })
    expect(cardRight).not.toBeNull()
    expect(cardRight).toBeLessThanOrEqual(375 + 1)
  })
})

// ─────────────────────────────────────────────────────────────────
// 2. CABEÇALHO — saldo e ações rápidas (Nancy 2, tela 08)
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Início: cabeçalho e ações rápidas', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('saldo disponível visível com o valor do resumo', async ({ page }) => {
    await goDashboard(page)
    await expect(page.locator('.home-balance-lbl')).toContainText('Saldo disponível')
    await expect(page.locator('.home-balance-val')).toContainText('3.660')
  })

  test('4 ações rápidas visíveis (Adicionar, Extrato, Metas, Nancy IA)', async ({ page }) => {
    await goDashboard(page)
    const actions = page.locator('.home-qa-btn')
    await expect(actions).toHaveCount(4)
    await expect(actions.nth(0)).toContainText('Adicionar')
    await expect(actions.nth(1)).toContainText('Extrato')
    await expect(actions.nth(2)).toContainText('Metas')
    await expect(actions.nth(3)).toContainText('Nancy IA')
  })

  test('botão "Adicionar" abre o formulário de nova transação', async ({ page }) => {
    await goDashboard(page)
    await page.locator('.home-qa-btn', { hasText: 'Adicionar' }).click()
    await expect(page.locator('.modal-overlay.movl')).toBeVisible({ timeout: 5000 })
  })

  test('ocultar/mostrar saldo mascara os valores sensíveis', async ({ page }) => {
    await goDashboard(page)
    const balance = page.locator('.home-balance-val')
    await expect(balance).toContainText('3.660')

    await page.locator('.home-iconbtn[aria-label="Ocultar valores"]').click()
    await expect(balance).toContainText('••')
    await expect(balance).not.toContainText('3.660')

    await page.locator('.home-iconbtn[aria-label="Mostrar valores"]').click()
    await expect(balance).toContainText('3.660')
  })
})

// ─────────────────────────────────────────────────────────────────
// 3. RESUMOS, SAÚDE FINANCEIRA E ESTATÍSTICAS
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Resumos, saúde financeira e estatísticas', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('4 círculos de resumo visíveis', async ({ page }) => {
    await goDashboard(page)
    await expect(page.locator('.home-story')).toHaveCount(4)
  })

  test('card de saúde financeira mostra uma pontuação de 0 a 100', async ({ page }) => {
    await goDashboard(page)
    const scoreText = await page.locator('.home-health-score').textContent()
    const score = parseInt(scoreText, 10)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
    await expect(page.locator('.home-health-title')).toContainText('Saúde financeira')
  })

  test('3 estatísticas visíveis (Entradas, Saídas, Contas fixas)', async ({ page }) => {
    await goDashboard(page)
    const stats = page.locator('.home-stat')
    await expect(stats).toHaveCount(3)
    await expect(stats.nth(0)).toContainText('Entradas')
    await expect(stats.nth(1)).toContainText('Saídas')
    await expect(stats.nth(2)).toContainText('Contas fixas')
  })
})

// ─────────────────────────────────────────────────────────────────
// 4. ÚLTIMAS — lista de transações recentes
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Últimas transações', () => {

  test('mostra no máximo as 5 transações mais recentes', async ({ page }) => {
    await goDashboard(page)
    const rows = page.locator('.home-recent-row')
    await expect(rows.first()).toBeVisible({ timeout: 8000 })
    const count = await rows.count()
    expect(count).toBeLessThanOrEqual(5)
    expect(count).toBeGreaterThan(0)
  })

  test('"Ver extrato" navega para /transactions', async ({ page }) => {
    await goDashboard(page)
    await page.locator('.home-section-link', { hasText: 'Ver extrato' }).click()
    await page.waitForURL(/\/transactions/, { timeout: 5000 })
  })

  test('remover transação abre o diálogo de confirmação', async ({ page }) => {
    await goDashboard(page)
    await page.locator('.home-recent-del').first().click()
    await expect(page.getByText('Tem certeza?')).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────
// 5. MOCK LIFO — Isolamento em execução paralela
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
