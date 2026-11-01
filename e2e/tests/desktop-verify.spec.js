// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// Confirme seu e-mail no desktop (design "Nancy Desktop", tela 06, 1440×900): campo do código de 72px em Geist Mono 32px, botão de 52px.
test.use({ viewport: { width: 1440, height: 900 } })

const USER = { ...TEST_USER, emailVerified: false }
async function open(page, path = '/verify-email') {
  await injectSession(page, USER)
  await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/auth/me**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }))
  await page.goto(path)
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 }) // a abertura (≈4s) cobre a tela
}
const box = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, sel)

test('medidas do design: painel azul 46% + 112px, formulário de 420px, campo do código de 72px em Geist Mono 32px, botão de 52px', async ({ page }) => {
  await open(page)
  await expect(page.getByRole('button', { name: 'Confirmar e-mail' })).toBeVisible()
  expect(await box(page, '.ad-hero')).toMatchObject({ x: 0, w: 774.4, h: 900 })
  expect(await box(page, '.ad-panel-inner')).toMatchObject({ x: 897.2, w: 420 })
  expect(await box(page, '#f-code')).toMatchObject({ w: 420, h: 72 })
  await expect(page.locator('#f-code')).toHaveCSS('font-size', '32px')
  await expect(page.locator('#f-code')).toHaveCSS('font-weight', '700')
  await expect(page.locator('#f-code')).toHaveCSS('text-align', 'center')
  expect(await page.evaluate(async () => { await document.fonts.load('700 32px "Geist Mono"'); return [document.fonts.check('700 32px "Geist Mono"'), getComputedStyle(document.querySelector('#f-code')).fontFamily] })).toEqual([true, '"Geist Mono", monospace'])
  expect((await box(page, '.ad-btn-primary')).h).toBe(52)
  await expect(page.getByText('Digite o código de 6 dígitos enviado para ana.e2e@test.com.')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
})

test('código certo confirma e o botão leva ao app; código errado mostra o erro', async ({ page }) => {
  let n = 0
  await open(page)
  await page.route('**/api/auth/verify-email-code', r => { n++; r.request().postDataJSON().code === '123456'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: '{"message":"ok"}' })
    : r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Código inválido."}' }) })
  await page.getByLabel('Código de 6 dígitos').fill('000000')
  await page.getByRole('button', { name: 'Confirmar e-mail' }).click()
  await expect(page.getByRole('alert')).toHaveText('Código inválido.')
  await page.getByLabel('Código de 6 dígitos').fill('123456')
  await page.getByRole('button', { name: 'Confirmar e-mail' }).click()
  await expect(page.getByRole('status')).toContainText('E-mail confirmado!')
  expect(n).toBe(2)
  await page.getByRole('button', { name: 'Ir para o Dashboard' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('"Reenviar código" avisa; no celular continua a tela do celular', async ({ page }) => {
  await open(page)
  await page.route('**/api/auth/resend-verification', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"message":"ok"}' }))
  await page.getByRole('button', { name: 'Reenviar código' }).click()
  await expect(page.getByText('Novo código enviado.')).toBeVisible()
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto('/verify-email')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
  await expect(page.locator('.lw-page')).toBeVisible()
  await expect(page.locator('.ad-split')).toHaveCount(0)
})
