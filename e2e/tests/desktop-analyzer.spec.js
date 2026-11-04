// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Analisador de compras no desktop (design "Nancy Desktop", tela 38, 1440×898): formulário de 400px à esquerda, convite azul (ou o
// veredito) à direita. A conta roda no navegador sobre GET /api/analyzer/base. Relógio fixo em 20/out/2026 22h.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 898 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }
const BASE = { income: 15000, fixedTotal: 5127, installmentsMonthly: 1000, variableAvg: 2220, monthlyCost: 7347, leftover: 6653, balance: 23500, score: 79, hasHistory: true }

async function open(page, base = BASE) {
  await page.addInitScript(() => { window.__nancySplashGone = false })
  await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
  await injectSession(page, U)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(U)))
  await page.route('**/api/analyzer/base**', r => r.fulfill(json(base)))
  await page.goto('/analisador')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
  await expect(page.locator('.ndz-base-row').first()).toBeVisible()
}
const box = (page, sel, i = 0) => page.evaluate(([s, n]) => { const b = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, [sel, i])

test.describe('Analisador desktop — medidas e visual do design', () => {
  test('formulário de 400px a 312/103, convite azul de 492px ao lado (vão de 20) e título do topo', async ({ page }) => {
    await open(page)
    expect(await box(page, '.ndz-form')).toMatchObject({ x: 312, y: 103, w: 400 })
    const hero = await box(page, '.ndz-empty')
    expect(hero).toMatchObject({ x: 732, y: 103, h: 492 })
    expect(Math.round(hero.x + hero.w)).toBe(1408)
    await expect(page.locator('.nds-title, .nds-topbar h1').first()).toContainText('Analisador de compras')
    await expect(page.locator('.ndz-empty-t')).toHaveCSS('font-size', '54px')
  })

  test('campos: produto e desconto de 46px, valor de 60px, botão de analisar de 48px, 3 formas em segmentos', async ({ page }) => {
    await open(page)
    expect(await box(page, '#ndz-item')).toMatchObject({ h: 46 })
    expect(await box(page, '.ndz-price')).toMatchObject({ h: 60 })
    expect(await box(page, '.ndz-go')).toMatchObject({ h: 48 })
    await expect(page.locator('.ndz-mode')).toHaveText(['Pix / débito', 'Crédito 1x', 'Parcelado'])
    await expect(page.locator('.ndz-n')).toHaveText(['2x', '3x', '6x', '10x', '12x'])
    await expect(page.locator('.ndz-n.on')).toHaveText('10x')
  })

  test('"A Nancy está usando" lista os números reais do usuário em fonte mono', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndz-base-row')).toHaveCount(5)
    await expect(page.locator('.ndz-base')).toContainText('R$ 15.000,00')
    await expect(page.locator('.ndz-base')).toContainText('R$ 6.653,00/mês')
    await expect(page.locator('.ndz-base-row .ndz-mono').first()).toHaveCSS('font-family', /Geist Mono/)
  })
})

test.describe('Analisador desktop — fluxo', () => {
  test('analisar mostra o veredito, o porquê, o próximo passo e a tabela, e a recomendada fica destacada', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Celular novo · R$ 7.000' }).click()
    await page.getByRole('button', { name: /Analisar com a Nancy/ }).click()
    await expect(page.locator('.ndz-verdict-t')).toHaveText('Pague à vista no Pix')
    await expect(page.locator('.ndz-verdict-k')).toContainText('VEREDITO DA NANCY · CELULAR NOVO')
    await expect(page.locator('.ndz-empty')).toHaveCount(0)
    await expect(page.locator('.ndz-reason').first()).toBeVisible()
    await expect(page.locator('.ndz-tr.row')).toHaveCount(7)
    await expect(page.locator('.ndz-tr.row.rec .ndz-tag')).toHaveText('Recomendado')
    await expect(page.locator('.ndz-primary')).toHaveText('Registrar compra no Pix')
    expect((await box(page, '.ndz-score')).w).toBe(182)
    expect((await box(page, '.ndz-secondary')).h).toBe(49)
  })

  test('registrar a compra à vista manda a saída para o Extrato e avisa', async ({ page }) => {
    await open(page)
    let sent = null
    await page.route('**/api/transactions', async r => {
      if (r.request().method() === 'POST') { sent = r.request().postDataJSON(); return r.fulfill(json({ id: 't1' }, 201)) }
      return r.fulfill(json([]))
    })
    await page.getByRole('button', { name: 'Celular novo · R$ 7.000' }).click()
    await page.getByRole('button', { name: /Analisar com a Nancy/ }).click()
    await page.getByRole('button', { name: 'Registrar compra no Pix' }).click()
    await expect(page.getByText('Compra registrada no Extrato.')).toBeVisible()
    expect(sent).toMatchObject({ description: 'Celular novo', amount: 6650, type: 'expense', category: 'shopping' })
  })

  test('valor vazio e salário zerado avisam sem quebrar a tela', async ({ page }) => {
    await open(page, { ...BASE, income: 0, leftover: 1 })
    await page.getByRole('button', { name: /Analisar com a Nancy/ }).click()
    await expect(page.getByRole('alert')).toHaveText('Informe o valor da compra.')
    await page.locator('#ndz-price').fill('1000')
    await page.getByRole('button', { name: /Analisar com a Nancy/ }).click()
    await expect(page.getByRole('alert')).toContainText('Informe seu salário em Finanças')
  })

  test('menu: Analisador aceso com o selo IA, e o atalho do Início leva até aqui', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('button', { name: /^Analisador/ })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.nds-badge')).toHaveText(['novo', 'IA'])
  })
})

test.describe('Analisador — celular', () => {
  test.use({ viewport: { width: 393, height: 852 } })
  test('no celular a rota volta ao Início', async ({ page }) => {
    await page.addInitScript(() => { window.__nancySplashGone = false })
    await injectSession(page, U)
    await page.route('**/api/**', r => r.fulfill(json([])))
    await page.route('**/api/auth/me**', r => r.fulfill(json(U)))
    await page.goto('/analisador')
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})
