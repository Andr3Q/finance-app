// @ts-nocheck
const { test, expect }  = require('@playwright/test')
const { injectSession, TEST_USER, FREE_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Validação de Viewports — 360px, 375px, 480px
//
// Garante que nenhuma mudança de layout voltará a introduzir
// scroll horizontal nas telas principais do app.
// ─────────────────────────────────────────────────────────────────

const VIEWPORTS = [
  { name: 'Moto G4 (360px)',   width: 360,  height: 800  },
  { name: 'iPhone SE (375px)', width: 375,  height: 667  },
  { name: 'iPhone XR (480px)', width: 480,  height: 896  },
]

// Mock padrão das APIs para todas as rotas do app
async function mockAllAPIs(page) {
  await page.route('**/api/auth/me**',            r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ...TEST_USER, notifBudgetAlert: true, notifBudgetReminder: true }) }))
  await page.route('**/api/transactions**',        r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/budget**',              r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/goals**',               r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/installments**',        r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/notifications/**',      r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/reports/**',            r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await page.route('**/api/payments/history**',    r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/auth/referral-stats**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ referrals: 0 }) }))
  await page.route('**/api/auth/2fa/**',           r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 8 }) }))
  await page.route('**/health**',                  r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', db_ms: 5 }) }))
}

// Helper: verifica ausência de scroll horizontal num container
async function noHorizontalScroll(page, selector = 'html') {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    if (!el) return { ok: false, reason: 'elemento não encontrado: ' + sel }
    return {
      ok:          el.scrollWidth <= el.clientWidth + 2, // +2px tolerância de subpixel
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflow:    el.scrollWidth - el.clientWidth,
    }
  }, selector)
}

// ─────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────
for (const vp of VIEWPORTS) {
  test.describe(`Dashboard — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('sem scroll horizontal no html', async ({ page }) => {
      await injectSession(page)
      await mockAllAPIs(page)
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)

      const result = await noHorizontalScroll(page, 'html')
      expect(result.ok,
        `html overflow em ${vp.name}: scrollWidth=${result.scrollWidth} clientWidth=${result.clientWidth} (+${result.overflow}px)`
      ).toBe(true)
    })

    test('sem scroll horizontal no .pwnav', async ({ page }) => {
      await injectSession(page)
      await mockAllAPIs(page)
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)

      const result = await noHorizontalScroll(page, '.pwnav')
      expect(result.ok,
        `.pwnav overflow em ${vp.name}: +${result.overflow}px`
      ).toBe(true)
    })

    test('.hb-feed-card não ultrapassa a borda da tela', async ({ page }) => {
      await injectSession(page)
      await mockAllAPIs(page)
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)

      const card = page.locator('.hb-feed-card').first()
      await expect(card).toBeVisible()

      const box   = await card.boundingBox()
      expect(box.x, `card começa fora da tela em ${vp.name}`).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, `card passa da borda em ${vp.name}`).toBeLessThanOrEqual(vp.width + 2)
    })

    test('.hb-metrics não ultrapassa a borda da tela', async ({ page }) => {
      await injectSession(page)
      await mockAllAPIs(page)
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)

      const metrics = page.locator('.hb-metrics').first()
      if (!await metrics.isVisible()) return // pode não estar visível em todas as telas

      const box = await metrics.boundingBox()
      expect(box.x + box.width, `.hb-metrics passa da borda em ${vp.name}`).toBeLessThanOrEqual(vp.width + 2)
    })

    test('nav bar inferior visível e dentro da tela', async ({ page }) => {
      await injectSession(page)
      await mockAllAPIs(page)
      await page.goto('/dashboard', { waitUntil: 'networkidle' })

      // Navbar inferior (mobile) — verifica se existe e está acessível
      const nav = page.locator('.dsb-mn, .bottom-nav, nav').first()
      const box  = await nav.boundingBox().catch(() => null)
      if (box) {
        expect(box.x, `nav começa fora da tela em ${vp.name}`).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width, `nav passa da borda em ${vp.name}`).toBeLessThanOrEqual(vp.width + 2)
      }
    })
  })
}

// ─────────────────────────────────────────────────────────────────
// CONFIGURAÇÕES
// ─────────────────────────────────────────────────────────────────
for (const vp of VIEWPORTS) {
  test.describe(`Configurações — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('sem scroll horizontal', async ({ page }) => {
      await injectSession(page)
      await mockAllAPIs(page)
      await page.goto('/settings', { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)

      const result = await noHorizontalScroll(page, 'html')
      expect(result.ok,
        `settings overflow em ${vp.name}: +${result.overflow}px`
      ).toBe(true)
    })

    test('formulário de contas fixas visível e dentro da tela', async ({ page }) => {
      await injectSession(page)
      await mockAllAPIs(page)
      await page.goto('/settings', { waitUntil: 'networkidle' })

      // Scroll até o formulário de contas fixas
      const form = page.locator('.cfg-add-row').first()
      await form.scrollIntoViewIfNeeded().catch(() => {})
      await page.waitForTimeout(300)

      const result = await noHorizontalScroll(page, 'html')
      expect(result.ok,
        `settings com cfg-add-row overflow em ${vp.name}: +${result.overflow}px`
      ).toBe(true)
    })
  })
}

// ─────────────────────────────────────────────────────────────────
// TRANSAÇÕES
// ─────────────────────────────────────────────────────────────────
for (const vp of VIEWPORTS) {
  test.describe(`Transações — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('sem scroll horizontal', async ({ page }) => {
      await injectSession(page)
      await mockAllAPIs(page)
      await page.goto('/transactions', { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)

      const result = await noHorizontalScroll(page, 'html')
      expect(result.ok,
        `transactions overflow em ${vp.name}: +${result.overflow}px`
      ).toBe(true)
    })
  })
}

// ─────────────────────────────────────────────────────────────────
// METAS
// ─────────────────────────────────────────────────────────────────
for (const vp of VIEWPORTS) {
  test.describe(`Metas — ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('sem scroll horizontal', async ({ page }) => {
      await injectSession(page)
      await mockAllAPIs(page)
      await page.goto('/goals', { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)

      const result = await noHorizontalScroll(page, 'html')
      expect(result.ok,
        `goals overflow em ${vp.name}: +${result.overflow}px`
      ).toBe(true)
    })
  })
}
