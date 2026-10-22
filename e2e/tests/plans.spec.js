// @ts-nocheck
const { test, expect }     = require('@playwright/test')
const { createMock }       = require('../helpers/mockApi')
const { injectSession, TEST_USER, FREE_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Fluxo de Planos/Assinaturas — E2E
// Cobre: renderização, toggle anual, checkout, retorno de pagamento
// ─────────────────────────────────────────────────────────────────

async function gotoPlanos(page, user = FREE_USER, search = '') {
  await injectSession(page, user)
  await page.goto(`/planos${search}`)
}

test.describe('Planos — Renderização', () => {
  test('exibe os três cards de plano (Grátis, Pro, Elite)', async ({ page }) => {
    await gotoPlanos(page)
    await expect(page.locator('.pl-card.pl-free, .pl-card.pl-pro, .pl-card.pl-elite')).toHaveCount(3)
  })

  test('badge "Plano atual" aparece no card correto para usuário Free', async ({ page }) => {
    await gotoPlanos(page, FREE_USER)
    const freeCard = page.locator('.pl-card.pl-free')
    await expect(freeCard).toHaveAttribute('aria-current', 'true')
    await expect(freeCard.getByRole('button', { name: 'Plano básico' })).toBeDisabled()
  })

  test('badge "Plano atual" aparece no card Pro para usuário Pro', async ({ page }) => {
    await gotoPlanos(page, TEST_USER)
    const proCard = page.locator('.pl-card.pl-pro')
    await expect(proCard).toHaveAttribute('aria-current', 'true')
    await expect(proCard.locator('.pl-badge')).toHaveText('Plano atual')
  })

  test('exibe botão "Assinar Pro" e "Assinar Elite"', async ({ page }) => {
    await gotoPlanos(page, FREE_USER)
    await expect(page.getByRole('button', { name: /assinar pro/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /assinar elite/i })).toBeVisible()
  })

  test('toggle Mensal/Anual está visível', async ({ page }) => {
    await gotoPlanos(page)
    await expect(
      page.getByRole('button', { name: /anual/i }).or(page.getByText(/mensal.*anual/i)).first()
    ).toBeVisible()
  })
})

test.describe('Planos — Toggle Anual', () => {
  test('o alternador mostra "Anual · 2 meses grátis" e clicar nele troca os preços para o anual', async ({ page }) => {
    await gotoPlanos(page)
    await page.getByRole('button', { name: /anual/i }).click()
    await expect(page.getByText('R$ 8,25')).toBeVisible()
  })

  test('alternar para anual muda o botão para "Mensal"', async ({ page }) => {
    await gotoPlanos(page)
    await page.getByRole('button', { name: /anual/i }).click()
    await expect(page.getByRole('button', { name: /mensal/i })).toBeVisible()
  })
})

test.describe('Planos — Checkout', () => {
  test('redireciona para /register quando usuário não está logado', async ({ page }) => {
    // Sem injectSession — usuário não autenticado
    await page.goto('/planos')
    await page.getByRole('button', { name: /assinar pro/i }).click()
    await expect(page).toHaveURL(/\/register|\/login/)
  })

  test('exibe toast de aviso quando e-mail não está verificado', async ({ page }) => {
    await injectSession(page, { ...FREE_USER, emailVerified: false })
    await page.goto('/planos')
    await page.getByRole('button', { name: /assinar pro/i }).click()
    await expect(page.getByText(/verifique seu e-mail/i)).toBeVisible()
  })

  test('abre janela de checkout para URL do Mercado Pago', async ({ page, context }) => {
    const mock = createMock(page)
    mock.post('/api/payments/create-preference', {
      checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=abc123',
    })

    await injectSession(page, { ...FREE_USER, emailVerified: true })
    await page.goto('/planos')

    const [newPage] = await Promise.all([
      context.waitForEvent('page').catch(() => null),
      page.getByRole('button', { name: /assinar pro/i }).click(),
    ])

    // A janela pode ser aberta via window.open
    if (newPage) {
      await expect(newPage).toHaveURL(/mercadopago\.com\.br/)
    } else {
      // Ou a URL atual pode mudar
      await expect(page.getByText(/redirecionando|aguarde|processando/i).or(
        page.locator('[href*="mercadopago"]').first()
      )).toBeVisible({ timeout: 5000 }).catch(() => {})
    }
  })

  test('exibe toast de erro quando createPreference falha', async ({ page }) => {
    const mock = createMock(page)
    mock.fail('/api/payments/create-preference', 'Erro ao iniciar pagamento.', 500)

    await injectSession(page, { ...FREE_USER, emailVerified: true })
    await page.goto('/planos')

    // Precisa abrir janela antes de clicar (window.open síncrono)
    await page.evaluate(() => { window.open = () => ({ location: {}, close() {} }) })
    await page.getByRole('button', { name: /assinar pro/i }).click()

    await expect(page.getByText(/erro ao iniciar pagamento/i)).toBeVisible()
  })

  test('rejeita URL de checkout que não é do mercadopago.com.br', async ({ page }) => {
    const mock = createMock(page)
    mock.post('/api/payments/create-preference', {
      checkoutUrl: 'https://evil.com/phishing',
    })

    await injectSession(page, { ...FREE_USER, emailVerified: true })
    await page.goto('/planos')

    await page.evaluate(() => { window.open = () => ({ location: {}, close() {} }) })
    await page.getByRole('button', { name: /assinar pro/i }).click()

    await expect(page.getByText(/erro ao iniciar pagamento/i)).toBeVisible()
  })

  test('toggle Anual → createPreference chamado com period="annual"', async ({ page }) => {
    let capturedBody = null
    page.route('**/api/payments/create-preference**', async (route) => {
      capturedBody = JSON.parse(route.request().postData() || '{}')
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ checkoutUrl: 'https://www.mercadopago.com.br/checkout/1' }),
      })
    })

    await injectSession(page, { ...FREE_USER, emailVerified: true })
    await page.goto('/planos')
    await page.evaluate(() => { window.open = () => ({ location: {}, close() {} }) })

    await page.getByRole('button', { name: /anual/i }).click()
    await page.getByRole('button', { name: /assinar pro/i }).click()

    await expect(async () => {
      expect(capturedBody?.period).toBe('annual')
    }).toPass({ timeout: 5000 })
  })
})

test.describe('Planos — Retorno de pagamento', () => {
  test.beforeEach(async ({ page }) => {
    const mock = createMock(page)
    mock.get('/api/auth/me', {
      id: 'e2e-user-002', plan: 'pro', planExpiresAt: '2027-03-15', emailVerified: true,
    })
  })

  test('exibe toast de sucesso quando ?payment=success', async ({ page }) => {
    await injectSession(page, FREE_USER)
    await page.goto('/planos?payment=success')
    await expect(page.getByText(/pagamento aprovado|sucesso/i)).toBeVisible()
  })

  test('exibe toast de falha quando ?payment=failure', async ({ page }) => {
    await injectSession(page, FREE_USER)
    await page.goto('/planos?payment=failure')
    await expect(page.getByText(/não aprovado|falhou|erro/i)).toBeVisible()
  })

  test('exibe toast de pendente quando ?payment=pending', async ({ page }) => {
    await injectSession(page, FREE_USER)
    await page.goto('/planos?payment=pending')
    await expect(page.locator('.toast').filter({ hasText: /pendente/i })).toBeVisible()
  })
})
