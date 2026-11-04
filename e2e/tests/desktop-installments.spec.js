// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Compras parceladas no desktop (design "Nancy Desktop", tela 17, 1440×898): abas do Extrato e cartões de 540px em duas colunas (vão de 16).
// Relógio fixo em 20/out/2026 22h.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 898 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }
const PLANS = () => [
  { id: 'i1', name: 'Notebook', amount: 600, totalInstallments: 10, paidInstallments: 3, startMonth: 8, startYear: 2026 },
  { id: 'i2', name: 'Geladeira', amount: 400, totalInstallments: 8, paidInstallments: 6, startMonth: 5, startYear: 2026 },
]

async function open(page, plans = PLANS) {
  await page.addInitScript(() => { window.__nancySplashGone = false })
  await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
  await injectSession(page, U)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(U)))
  await page.route('**/api/installments', r => (r.request().method() === 'GET' ? r.fulfill(json(plans())) : r.fallback()))
  await page.goto('/parcelados')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
  await expect(page.locator('.ndi-card').first()).toBeVisible()
}
const box = (page, sel, i = 0) => page.evaluate(([s, n]) => { const b = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, [sel, i])

test.describe('Compras parceladas desktop — medidas e visual do design', () => {
  test('dois cartões de 540px (vão de 16) a 167px do alto; ícone de 40px; barra de 10px; valor na borda do cartão', async ({ page }) => {
    await open(page)
    expect(await box(page, '.nds-tabs')).toMatchObject({ x: 312, y: 101, h: 46 })
    expect(await box(page, '.ndi-card', 0)).toMatchObject({ x: 312, y: 167, w: 540 })
    expect(await box(page, '.ndi-card', 1)).toMatchObject({ x: 868, y: 167, w: 540 })
    expect(await box(page, '.ndi-ico')).toMatchObject({ x: 335, w: 40, h: 40 })
    expect(await box(page, '.ndi-track')).toMatchObject({ x: 335, w: 494, h: 10 })
    const val = await box(page, '.ndi-val')
    expect(Math.round(val.x + val.w)).toBe(829) // valor termina na borda interna do cartão
  })

  test('cores e conteúdo do design: barra azul proporcional, "Pagar parcela" verde, valor em azul mono', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndi-name').first()).toHaveText('Notebook')
    await expect(page.locator('.ndi-prog').first()).toHaveText('3 de 10 parcelas')
    await expect(page.locator('.ndi-val').first()).toHaveText('R$ 600,00/mês')
    await expect(page.locator('.ndi-rest').first()).toHaveText('Restante: R$ 4.200,00 · termina em mai 2027')
    const fill = await page.locator('.ndi-fill').first().evaluate(e => [getComputedStyle(e).backgroundColor, Math.round(e.getBoundingClientRect().width)])
    expect(fill).toEqual(['rgb(21, 70, 255)', 148]) // 30% de 494
    expect(await page.locator('.ndi-pay').first().evaluate(e => { const c = getComputedStyle(e); return [c.backgroundColor, c.color] })).toEqual(['rgb(233, 251, 242)', 'rgb(8, 122, 82)'])
    expect(await page.locator('.ndi-val').first().evaluate(e => getComputedStyle(e).color)).toBe('rgb(21, 70, 255)')
    await expect(page.locator('.nds-topbar')).toContainText('Parcelas em andamento')
  })
})

test.describe('Compras parceladas desktop — funções', () => {
  test('pagar parcela chama a API; o cabeçalho abre Desfazer/Remover; remover confirma antes', async ({ page }) => {
    await open(page)
    let pago = null, apagado = null
    await page.route('**/api/installments/i1/pay', async r => { pago = r.request().method(); await r.fulfill(json({})) })
    await page.route('**/api/installments/i2', async r => { apagado = r.request().method(); await r.fulfill(json({})) })
    await page.locator('.ndi-card').first().getByRole('button', { name: /Pagar parcela/ }).click()
    await expect.poll(() => pago).toBe('PATCH')
    await page.locator('.ndi-card').nth(1).locator('.ndi-head').click()
    await page.locator('.ndi-card').nth(1).getByRole('button', { name: 'Remover parcelamento' }).click()
    await expect(page.getByRole('dialog', { name: /Remover parcelamento/ })).toBeVisible()
    expect(apagado).toBeNull()
    await page.getByRole('button', { name: 'Sim, excluir' }).click()
    await expect.poll(() => apagado).toBe('DELETE')
  })

  test('nova compra: mostra "N parcelas de R$ X" e manda o valor de cada parcela', async ({ page }) => {
    await open(page)
    let body = null
    await page.route('**/api/installments', async r => { if (r.request().method() === 'POST') { body = r.request().postDataJSON(); await r.fulfill(json({ id: 'i9' }, 201)) } else await r.fallback() })
    const form = page.getByRole('form', { name: 'Nova compra parcelada' })
    await form.getByPlaceholder('O que você comprou?').fill('TV')
    await form.getByPlaceholder('Valor total').fill('1200')
    await form.getByPlaceholder('Parcelas').fill('4')
    await expect(form.getByText('4 parcelas de R$ 300,00')).toBeVisible()
    await form.getByRole('button', { name: /Adicionar parcela/ }).click()
    await expect.poll(() => body).toEqual({ name: 'TV', amount: 300, totalInstallments: 4 })
  })

  test('as abas levam às outras telas do Extrato', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Contas do mês' }).click()
    await expect(page).toHaveURL(/\/contas-do-mes$/)
  })
})
