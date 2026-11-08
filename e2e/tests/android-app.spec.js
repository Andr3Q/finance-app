// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER, FREE_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// App Android da Play Store (Trusted Web Activity): o Chrome abre o site com o referrer "android-app://<pacote>". Ali não pode haver compra,
// preço, upgrade nem caminho para pagar (política de pagamentos do Google): só "Seu plano". No site comum nada muda.
// Aqui o referrer é simulado no documento; a abertura real pelo app só dá para conferir num aparelho.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const inApp = (page) => page.addInitScript(() => {
  Object.defineProperty(document, 'referrer', { get: () => 'android-app://br.com.myfinancepro.app', configurable: true })
})

async function open(page, user, path, { app = true } = {}) {
  if (app) await inApp(page)
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.goto(path)
}

test.describe('App Android — sem compra', () => {
  test('/planos mostra só "Seu plano": sem preços, sem comparativo e sem botões de compra', async ({ page }) => {
    await open(page, { ...TEST_USER, plan: 'pro', planExpiresAt: '2026-12-20T15:00:00Z' }, '/planos')
    await expect(page.getByRole('heading', { name: 'Seu plano' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Plano Pro' })).toBeVisible()
    const body = await page.locator('body').innerText()
    expect(body).not.toMatch(/R\$|Assinar|Upgrade|Comparativo|Mensal|Anual|Mercado Pago|PIX/)
    await expect(page.getByRole('button', { name: /assinar|upgrade|planos/i })).toHaveCount(0)
  })

  test('a detecção vale na sessão: depois de navegar, voltar a /planos continua sem compra', async ({ page }) => {
    await open(page, { ...TEST_USER, plan: 'pro', planExpiresAt: '2026-12-20T15:00:00Z' }, '/settings')
    await expect(page.locator('.pf-page')).toBeVisible()
    await page.evaluate(() => { Object.defineProperty(document, 'referrer', { get: () => '', configurable: true }) }) // como depois de navegar: o referrer some
    await page.goto('/planos')
    await expect(page.getByRole('heading', { name: 'Seu plano' })).toBeVisible()
  })

  test('Grátis no app: "Sem cobrança" e nenhum convite para assinar nas telas com recurso de outro plano', async ({ page }) => {
    await open(page, FREE_USER, '/planos')
    await expect(page.getByRole('heading', { name: 'Plano Grátis' })).toBeVisible()
    await expect(page.getByText('Sem cobrança')).toBeVisible()
    await page.goto('/settings/pagamentos')
    await expect(page.getByRole('heading', { name: 'Plano Grátis' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ver planos' })).toHaveCount(0)
  })

  test('plano vencido no app: o aviso só informa, sem "Renovar" e sem pedir para renovar', async ({ page }) => {
    await open(page, { ...TEST_USER, plan: 'pro', planExpiresAt: '2020-01-01T12:00:00Z' }, '/dashboard')
    const banner = page.getByTestId('plan-expiry-banner')
    await expect(banner).toBeVisible()
    await expect(page.getByTestId('plan-expiry-banner-msg')).toHaveText('Seu plano Pro expirou. Os recursos dele ficam indisponíveis.')
    expect(await banner.innerText()).not.toMatch(/renov|assin|upgrade|planos/i)
    await expect(banner.getByRole('button', { name: 'Renovar' })).toHaveCount(0)
  })
})

test.describe('Site comum — nada muda', () => {
  test('plano vencido no site continua pedindo para renovar', async ({ page }) => {
    await open(page, { ...TEST_USER, plan: 'pro', planExpiresAt: '2020-01-01T12:00:00Z' }, '/dashboard', { app: false })
    await expect(page.getByTestId('plan-expiry-banner-msg')).toHaveText('Seu plano Pro expirou. Renove para manter o acesso aos recursos premium.')
    await expect(page.getByTestId('plan-expiry-banner').getByRole('button', { name: 'Renovar' })).toBeVisible()
  })

  test('/planos continua com preços, comparativo e botões de plano', async ({ page }) => {
    await open(page, FREE_USER, '/planos', { app: false })
    await expect(page.locator('.pl-card.pl-free, .pl-card.pl-pro, .pl-card.pl-elite')).toHaveCount(3)
    await expect(page.getByText('Comparativo completo')).toBeVisible()
  })

  test('Pagamentos do Grátis no site mantém "Ver planos"', async ({ page }) => {
    await open(page, FREE_USER, '/settings/pagamentos', { app: false })
    await expect(page.getByRole('button', { name: 'Ver planos' })).toBeVisible()
  })
})
