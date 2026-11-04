// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// Primeiros passos no desktop (design "Nancy Desktop", tela 07, 1440×900): tela cheia por cima do menu lateral, painel azul do Entrar,
// pontinhos de etapa (32px na etapa atual, 10px nas outras), campo do salário de 64px (26px/800) e botão de 52px.
test.use({ viewport: { width: 1440, height: 900 } })

const json = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) })
const USER = { ...TEST_USER, salary: 0, onboardingComplete: false }

async function open(page) {
  await injectSession(page, USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(USER)))
  await page.goto('/dashboard')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 }) // a abertura (≈4s) cobre a tela
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible()
}
const box = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, sel)

test('medidas do design: tela cheia por cima do menu, painel azul 46% + 112px, formulário de 420px, pontinhos 32/10px, salário 64px, botão 52px', async ({ page }) => {
  await open(page)
  expect(await box(page, '.ad-hero')).toMatchObject({ x: 0, w: 774.4, h: 900 })
  expect(await box(page, '.ad-panel-inner')).toMatchObject({ x: 897.2, w: 420 })
  const dots = await page.evaluate(() => [...document.querySelectorAll('.ad-dot')].map(d => ({ w: d.getBoundingClientRect().width, h: d.getBoundingClientRect().height, bg: getComputedStyle(d).backgroundColor })))
  expect(dots).toEqual([{ w: 32, h: 8, bg: 'rgb(21, 70, 255)' }, { w: 10, h: 8, bg: 'rgb(225, 232, 245)' }, { w: 10, h: 8, bg: 'rgb(225, 232, 245)' }])
  expect(await box(page, '.ad-money')).toMatchObject({ w: 420, h: 64 })
  await expect(page.locator('.ad-money')).toHaveCSS('font-size', '26px')
  await expect(page.locator('.ad-money')).toHaveCSS('font-weight', '800')
  expect((await box(page, '.ad-btn-primary')).h).toBe(52)
  await expect(page.getByRole('heading', { level: 2, name: 'Vamos começar' })).toHaveCSS('font-size', '36px')
  await expect(page.getByText('Quanto você ganha por mês?')).toBeVisible()
  // cobre o menu lateral e a barra de cima do app que está por trás
  expect(await page.evaluate(() => { const e = document.elementFromPoint(100, 300); return !!e.closest('.ad-ob') })).toBe(true)
  expect(await page.evaluate(() => { const e = document.elementFromPoint(1100, 30); return !!e.closest('.ad-ob') })).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
})

test('fluxo completo: salário → conta fixa (atalho + valor) → meta → "Começar a usar a Nancy" fecha e avisa o servidor', async ({ page }) => {
  const chamadas = []
  await open(page)
  await page.route('**/api/budget/salary', r => { chamadas.push(['salary', r.request().postDataJSON()]); r.fulfill(json({})) })
  await page.route('**/api/budget', r => { if (r.request().method() === 'POST') { chamadas.push(['budget', r.request().postDataJSON()]); return r.fulfill(json({ id: 'b1' })) } r.fulfill(json([])) })
  await page.route('**/api/goals', r => { if (r.request().method() === 'POST') { chamadas.push(['goal', r.request().postDataJSON()]); return r.fulfill(json({ id: 'g1' })) } r.fulfill(json([])) })
  await page.route('**/api/auth/complete-onboarding', r => { chamadas.push(['done']); r.fulfill(json({})) })

  await page.getByLabel('Salário mensal').fill('5000')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByText('Qual sua principal conta fixa?')).toBeVisible()
  await page.getByRole('button', { name: 'Aluguel' }).click()
  await page.getByLabel('Valor da conta fixa').fill('1200')
  await page.getByRole('button', { name: '+ Adicionar conta' }).click()
  await expect(page.getByText('1 conta adicionada')).toBeVisible()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByText('Qual seu primeiro objetivo?')).toBeVisible()
  await page.getByRole('button', { name: 'Reserva de emergência' }).click()
  await page.getByLabel('Valor-alvo da meta').fill('10000')
  await page.getByRole('button', { name: 'Começar a usar a Nancy' }).click()
  await expect(page.locator('.ad-ob')).toHaveCount(0)
  expect(chamadas).toEqual([['salary', { salary: 5000 }], ['budget', { name: 'Aluguel', amount: 1200 }], ['goal', { title: 'Reserva de emergência', targetAmount: 10000 }], ['done']])
})

test('"Pular por agora" com salário digitado pergunta no próprio app; validação do salário fica no campo', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('alert')).toHaveText('Informe seu salário ou toque em "Pular por agora".')
  await page.getByLabel('Salário mensal').fill('3000')
  await page.getByRole('button', { name: 'Pular por agora' }).click()
  const dialog = page.getByRole('dialog', { name: 'Pular sem salvar o salário?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Continuar editando' }).click()
  await page.getByRole('button', { name: 'Pular por agora' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Pular mesmo assim' }).click()
  await expect(page.getByText('Qual sua principal conta fixa?')).toBeVisible()
})

test('no celular continua o Primeiros passos do celular', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await injectSession(page, USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(USER)))
  await page.goto('/dashboard')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
  await expect(page.locator('.ob-shell')).toBeVisible()
  await expect(page.locator('.ad-ob')).toHaveCount(0)
})
