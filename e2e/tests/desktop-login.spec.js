// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { createMock } = require('../helpers/mockApi')

// ─────────────────────────────────────────────────────────────────
// Entrar no desktop (design "Nancy Desktop", tela 03, 1440×900): painel azul (46% + 2×56px, título de 60px) e o formulário
// de 420px centralizado no painel branco. O protótipo é content-box: o botão do Google mede 52 + 2×1,5 de borda = 55.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 900 } })

const USER = { id: 'u1', name: 'Ana E2E', email: 'ana@test.com', plan: 'pro', salary: 5000, onboardingComplete: true, emailVerified: true, isOnTrial: false }

async function open(page) {
  await page.goto('/login')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 }) // a abertura (≈4s) cobre a tela
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible()
}
const box = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, sel)

test.describe('Entrar desktop — medidas e visual do design', () => {
  test('painel azul 46% + 112px com título de 60px e sem os cartões; formulário de 420px centralizado no painel branco', async ({ page }) => {
    await open(page)
    expect(await box(page, '.ad-hero')).toMatchObject({ x: 0, w: 774.4, h: 900 })
    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '60px')
    await expect(page.locator('.ad-cards')).toHaveCount(0)
    await expect(page.locator('.ad-pills li')).toHaveText(['Resumo em stories', 'Nancy IA com voz', 'Planilha IA', 'LGPD'])
    const inner = await box(page, '.ad-panel-inner')
    expect(inner.w).toBe(420)
    expect(inner.x).toBe(897.2) // (665,6 − 420) / 2 depois do painel azul
  })

  test('textos, campos de 50px, Entrar de 52px, Google de 55px (desabilitado, ainda não existe) e as cores do design', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('heading', { level: 2, name: 'Bem-vindo de volta' })).toHaveCSS('font-size', '36px')
    await expect(page.getByText('Entre para ver como estão suas finanças.')).toBeVisible()
    expect((await box(page, '#f-email')).h).toBe(50)
    expect((await box(page, '#f-pass')).h).toBe(50)
    await expect(page.locator('#f-email')).toHaveCSS('background-color', 'rgb(244, 247, 252)')
    await expect(page.locator('#f-email')).toHaveCSS('border-top-color', 'rgb(225, 232, 245)')
    expect((await box(page, '.ad-btn-primary')).h).toBe(52)
    await expect(page.locator('.ad-btn-primary')).toHaveCSS('background-color', 'rgb(21, 70, 255)')
    expect((await box(page, '.ad-btn-secondary')).h).toBe(55)
    await expect(page.getByRole('button', { name: 'Continuar com Google' })).toBeDisabled()
    await expect(page.getByText('ou', { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Criar conta' })).toHaveCSS('font-weight', '700')
  })

  test('nada sai da janela e a página não rola para o lado (1440 e 1024)', async ({ page }) => {
    await open(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
    await page.setViewportSize({ width: 1024, height: 768 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024)
    const inner = await box(page, '.ad-panel-inner')
    expect(inner.x + inner.w).toBeLessThanOrEqual(1024)
    expect(inner.w).toBeGreaterThan(300)
  })
})

test.describe('Entrar desktop — o formulário funciona', () => {
  test('campos vazios pedem para preencher e não chamam o servidor', async ({ page }) => {
    let chamou = false
    await page.route('**/api/auth/login', r => { chamou = true; r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) })
    await open(page)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page.getByText('Informe seu e-mail')).toBeVisible()
    await expect(page.getByText('Informe sua senha')).toBeVisible()
    await expect(page.locator('#f-email')).toHaveCSS('border-top-color', 'rgb(214, 51, 74)')
    expect(chamou).toBe(false)
  })

  test('login certo leva ao Início', async ({ page }) => {
    const mock = createMock(page)
    mock.post('/api/auth/login', { token: 'jwt-test', user: USER })
    mock.get('/api/transactions/dashboard', { salary: 5000, totalExpenses: 0, currentBalance: 5000 })
    mock.get('/api/transactions', { data: [], total: 0 })
    mock.get('/api/budget', [])
    mock.get('/api/installments', [])
    mock.get('/api/goals', [])
    await open(page)
    await page.getByPlaceholder('voce@email.com').fill('ana@test.com')
    await page.getByPlaceholder('••••••••').fill('Senha@123')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('senha errada mostra a mensagem do servidor', async ({ page }) => {
    const mock = createMock(page)
    mock.fail('/api/auth/login', 'E-mail ou senha incorretos.', 400)
    await open(page)
    await page.getByPlaceholder('voce@email.com').fill('errado@test.com')
    await page.getByPlaceholder('••••••••').fill('SenhaErrada1')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
  })

  test('conta com duas etapas cai na tela do código', async ({ page }) => {
    const mock = createMock(page)
    mock.post('/api/auth/login', { requires2FA: true, tempToken: 'tmp' })
    await open(page)
    await page.getByPlaceholder('voce@email.com').fill('ana@test.com')
    await page.getByPlaceholder('••••••••').fill('Senha@123')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await expect(page.locator('.lauth-2fa-screen')).toBeVisible()
  })

  test('Voltar leva à Boas-vindas, Esqueci a senha à recuperação e Criar conta ao cadastro', async ({ page }) => {
    await open(page)
    await page.getByRole('link', { name: 'Esqueci a senha' }).click()
    await expect(page).toHaveURL(/\/forgot-password$/)
    await page.goBack()
    await page.getByRole('link', { name: 'Criar conta' }).click()
    await expect(page).toHaveURL(/\/register$/)
    await page.goBack()
    await page.getByRole('link', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Comece grátis.' })).toBeVisible() // a Boas-vindas do desktop
  })
})

test.describe('Entrar desktop — outros tamanhos', () => {
  test('no celular continua o Entrar do celular', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/login')
    await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
    await expect(page.locator('.lw-page')).toBeVisible()
    await expect(page.locator('.ad-split')).toHaveCount(0)
  })
})
