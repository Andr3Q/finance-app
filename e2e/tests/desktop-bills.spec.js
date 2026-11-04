// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Contas do mês no desktop (design "Nancy Desktop", tela 16, 1440×898): abas do Extrato, três cartões de 107px e a lista com linhas
// de 61px. Relógio fixo em 20/out/2026 22h.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 898 } })

const json = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }
const B = (id, name, amount, dueDay, paid) => ({ id, name, amount, dueDay, paidThisMonth: paid, paidAmount: paid ? amount : null, paidDate: paid ? '2026-10-10T12:00:00Z' : null, endDate: null })
const BILLS = () => [B('1', 'Aluguel', 3500, 5, true), B('2', 'Plano de saúde', 850, 8, true), B('3', 'Conta de luz', 380, 12, true), B('4', 'Internet', 150, 15, true), B('5', 'Academia', 200, 20, false), B('6', 'Celular', 47, 25, false)]

async function open(page, bills = BILLS, espera = '.ndb-item') {
  await page.addInitScript(() => { window.__nancySplashGone = false })
  await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
  await injectSession(page, U)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(U)))
  await page.route('**/api/budget', r => (r.request().method() === 'GET' ? r.fulfill(json(bills())) : r.fallback()))
  await page.goto('/contas-do-mes')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
  await expect(page.locator(espera).first()).toBeVisible()
}
const box = (page, sel, i = 0) => page.evaluate(([s, n]) => { const b = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, [sel, i])

test.describe('Contas do mês desktop — medidas e visual do design', () => {
  test('abas a 101px; três cartões iguais de 107px a 167px; lista a 294px', async ({ page }) => {
    await open(page)
    expect(await box(page, '.nds-tabs')).toMatchObject({ x: 312, y: 101, h: 46 })
    for (let i = 0; i < 3; i++) expect(await box(page, '.ndb-stat', i)).toMatchObject({ y: 167, h: 107 })
    expect((await box(page, '.ndb-stat', 1)).x).toBeCloseTo(682.7, 0)
    expect(await box(page, '.ndb-card')).toMatchObject({ x: 312, y: 294, w: 1096 })
  })

  test('linhas de 61px: círculo de 32px, vencimento de 140px, valor de 120px e etiqueta de 90px na borda do cartão', async ({ page }) => {
    await open(page)
    expect(await box(page, '.ndb-item')).toMatchObject({ x: 335, y: 317, w: 1050, h: 61 })
    expect(await box(page, '.ndb-item', 1)).toMatchObject({ y: 378, h: 61 })
    expect(await box(page, '.ndb-check')).toMatchObject({ w: 32, h: 32 })
    expect(await box(page, '.ndb-due')).toMatchObject({ w: 140 })
    expect(await box(page, '.ndb-amt')).toMatchObject({ w: 120 })
    const pill = await box(page, '.ndb-pill')
    expect(pill.w).toBe(90)
    expect(Math.round(pill.x + pill.w)).toBe(1385)
  })

  test('cores do design: cartão azul, círculo verde das pagas, etiquetas verde e azul, status em verde', async ({ page }) => {
    await open(page)
    const bg = (sel, i = 0) => page.locator(sel).nth(i).evaluate(e => getComputedStyle(e).backgroundColor)
    expect(await bg('.ndb-stat')).toBe('rgb(21, 70, 255)')
    expect(await bg('.ndb-check')).toBe('rgb(18, 201, 133)') // paga
    expect(await bg('.ndb-pill', 0)).toBe('rgb(233, 251, 242)')
    expect(await bg('.ndb-pill', 4)).toBe('rgb(238, 243, 255)')
    expect(await page.locator('.ndb-status').evaluate(e => getComputedStyle(e).color)).toBe('rgb(8, 122, 82)')
  })

  test('conteúdo: 4/6, total, "2 pendentes" e o subtítulo da barra de cima', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndb-big')).toHaveText('4/6')
    await expect(page.locator('.ndb-mono')).toHaveText('R$ 5.127,00')
    await expect(page.locator('.ndb-status')).toHaveText('2 pendentes')
    await expect(page.locator('.nds-topbar')).toContainText('Compromissos de outubro')
  })
})

test.describe('Contas do mês desktop — funções', () => {
  test('tocar numa pendente confirma e paga; as abas levam às outras telas do Extrato', async ({ page }) => {
    await open(page)
    let pago = null
    await page.route('**/api/budget/5/pay', async r => { pago = r.request().method(); await r.fulfill(json({})) })
    await page.locator('.ndb-row', { hasText: 'Academia' }).click()
    await expect(page.getByRole('dialog', { name: 'Marcar como paga' })).toBeVisible()
    expect(pago).toBeNull()
    await page.getByRole('button', { name: 'Marcar como paga' }).click()
    await expect.poll(() => pago).toBe('POST')
    await page.getByRole('button', { name: 'Análise' }).click()
    await expect(page).toHaveURL(/\/analise$/)
  })

  test('sem contas fixas convida a cadastrar', async ({ page }) => {
    await open(page, () => [], '.ndb-empty')
    await expect(page.getByRole('heading', { name: 'Nenhuma conta fixa cadastrada' })).toBeVisible()
  })
})
