// @ts-nocheck
const { test, expect } = require('../helpers/test')

// Esqueci a senha no desktop (design "Nancy Desktop", tela 05, 1440×900): mesmo painel azul do Entrar; campo de 50px, botão de 52px
// e, depois de enviar, o aviso verde de 18px de padding com o botão "Voltar para entrar".
test.use({ viewport: { width: 1440, height: 900 } })

async function open(page) {
  await page.goto('/forgot-password')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 }) // a abertura (≈4s) cobre a tela
  await expect(page.getByRole('button', { name: 'Enviar link' })).toBeVisible()
}
const box = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, sel)

test('medidas do design: painel azul 46% + 112px, formulário de 420px, campo de 50px, botão de 52px, título de 36px', async ({ page }) => {
  await open(page)
  expect(await box(page, '.ad-hero')).toMatchObject({ x: 0, w: 774.4, h: 900 })
  expect(await box(page, '.ad-panel-inner')).toMatchObject({ x: 897.2, w: 420 })
  expect((await box(page, '#f-email')).h).toBe(50)
  expect((await box(page, '.ad-btn-primary')).h).toBe(52)
  await expect(page.getByRole('heading', { level: 2, name: 'Esqueceu a senha?' })).toHaveCSS('font-size', '36px')
  await expect(page.getByText('E-mail da conta')).toBeVisible()
  await expect(page.locator('.ad-btn-primary')).toHaveCSS('background-color', 'rgb(21, 70, 255)')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
})

test('campo vazio e e-mail inválido pedem correção sem chamar o servidor', async ({ page }) => {
  let chamou = false
  await page.route('**/api/auth/forgot-password', r => { chamou = true; r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) })
  await open(page)
  await page.getByRole('button', { name: 'Enviar link' }).click()
  await expect(page.getByRole('alert')).toHaveText('Informe o e-mail da sua conta.')
  await page.getByPlaceholder('voce@email.com').fill('abc')
  await page.getByRole('button', { name: 'Enviar link' }).click()
  await expect(page.getByRole('alert')).toHaveText('E-mail inválido.')
  expect(chamou).toBe(false)
})

test('envio certo mostra o aviso verde (18px de padding, 16px de canto) e "Voltar para entrar" leva ao login', async ({ page }) => {
  let corpo = null
  await page.route('**/api/auth/forgot-password', r => { corpo = r.request().postDataJSON(); r.fulfill({ status: 200, contentType: 'application/json', body: '{"message":"ok"}' }) })
  await open(page)
  await page.getByPlaceholder('voce@email.com').fill('ana@test.com')
  await page.getByRole('button', { name: 'Enviar link' }).click()
  const aviso = page.getByRole('status')
  await expect(aviso).toHaveText('E-mail enviado! Confira a caixa de entrada e o spam. O link vale por 1 hora.')
  await expect(aviso).toHaveCSS('background-color', 'rgb(233, 251, 242)')
  await expect(aviso).toHaveCSS('color', 'rgb(8, 122, 82)')
  await expect(aviso).toHaveCSS('padding-top', '18px')
  await expect(aviso).toHaveCSS('border-top-left-radius', '16px')
  expect(corpo).toMatchObject({ email: 'ana@test.com' })
  await page.getByRole('link', { name: 'Voltar para entrar' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('erro do servidor aparece e Voltar leva ao login; no celular continua a tela do celular', async ({ page }) => {
  await page.route('**/api/auth/forgot-password', r => r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Muitas tentativas."}' }))
  await open(page)
  await page.getByPlaceholder('voce@email.com').fill('ana@test.com')
  await page.getByRole('button', { name: 'Enviar link' }).click()
  await expect(page.getByRole('alert')).toHaveText('Muitas tentativas.')
  await page.getByRole('link', { name: 'Voltar' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('/forgot-password')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
  await expect(page.locator('.lw-page')).toBeVisible()
  await expect(page.locator('.ad-split')).toHaveCount(0)
})
