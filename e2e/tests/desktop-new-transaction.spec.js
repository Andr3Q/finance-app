// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Nova transação no desktop (design "Nancy Desktop", tela 11, 1440×1136): cartão de 576px centralizado sobre a tela com véu desfocado
// que cobre também o menu. Aberta pelo botão da barra de cima.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 1136 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }
const DASH = { summary: { salary: 15000, totalIncome: 1800, totalFixedCosts: 5127, unpaidFixedCosts: 247, unpaidBudgetIds: [], totalExpenses: 7300, totalAvailable: 23500, currentBalance: 23500, percentUsed: 31 }, transactions: [], limits: [], budgets: [] }

async function open(page) {
  await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
  await injectSession(page, U)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(U)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(DASH)))
  await page.goto('/dashboard')
  await page.locator('.nds-topbar').getByRole('button', { name: /nova transação/i }).click()
  await expect(page.getByRole('dialog', { name: 'Nova transação' })).toBeVisible()
  await page.waitForTimeout(400) // a subida do cartão (nzIn, .25s)
}
const box = (page, sel, i = 0) => page.evaluate(([s, n]) => { const b = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, [sel, i])

test.describe('Nova transação desktop — medidas e visual do design', () => {
  test('cartão de 576×440 centralizado; caixa do valor de 64px; campos de 46px; botão de 52px', async ({ page }) => {
    await open(page)
    expect(await box(page, '.ntx-sheet')).toMatchObject({ x: 432, y: 348, w: 576, h: 440 })
    expect(await box(page, '.ntx-seg')).toMatchObject({ x: 460, w: 520, h: 52 })
    expect(await box(page, '.ntx-seg-btn')).toMatchObject({ x: 465, w: 252, h: 42 })
    expect(await box(page, '.ntx-amount-row')).toMatchObject({ x: 460, w: 520, h: 64 })
    expect(await box(page, '.ntx-field')).toMatchObject({ x: 460, w: 520, h: 46 })
    expect(await box(page, '.ntx-chip')).toMatchObject({ x: 460, h: 32 })
    expect(await box(page, '.ntx-save')).toMatchObject({ x: 460, w: 520, h: 52 })
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ntx-sheet')).borderTopLeftRadius)).toBe('26px')
  })

  test('véu azul-marinho desfocado cobre a tela inteira, inclusive o menu lateral', async ({ page }) => {
    await open(page)
    const veil = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.ntx-overlay')); return [c.backgroundColor, c.backdropFilter || c.webkitBackdropFilter] })
    expect(veil[0]).toBe('rgba(7, 19, 48, 0.45)')
    expect(veil[1]).toContain('blur(6px)')
    expect(await box(page, '.ntx-overlay')).toMatchObject({ x: 0, y: 0, w: 1440, h: 1136 })
    // o menu fica por baixo do véu: clicar nele não navega
    await page.mouse.click(100, 400)
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('rótulos do design: Despesa / Receita, descrição "Descrição", Receita verde e sem categorias', async ({ page }) => {
    await open(page)
    const sheet = page.getByRole('dialog', { name: 'Nova transação' })
    await expect(sheet.getByRole('button', { name: 'Despesa', exact: true })).toHaveAttribute('aria-pressed', 'true')
    expect(await sheet.getByRole('button', { name: 'Despesa', exact: true }).evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(21, 70, 255)')
    await sheet.getByRole('button', { name: 'Receita', exact: true }).click()
    expect(await sheet.getByRole('button', { name: 'Receita', exact: true }).evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(18, 201, 133)')
    await expect(page.locator('.ntx-chip')).toHaveCount(0)
    await expect(page.getByPlaceholder('Descrição', { exact: true })).toBeVisible()
  })

  test('salvar manda a transação certa e fecha o cartão; o dado novo recarrega a tela', async ({ page }) => {
    await page.route('**/api/transactions', r => (r.request().method() === 'POST' ? r.fulfill(json({ id: 'novo' }, 201)) : r.fallback()))
    await open(page)
    await page.getByPlaceholder('0,00').fill('85')
    await page.getByPlaceholder('Descrição', { exact: true }).fill('Corrida')
    await page.getByRole('button', { name: 'Transporte', exact: true }).click()
    const [req] = await Promise.all([
      page.waitForRequest(r => r.method() === 'POST' && /\/api\/transactions$/.test(r.url())),
      page.getByRole('button', { name: /^salvar$/i }).click(),
    ])
    expect(req.postDataJSON()).toEqual({ description: 'Corrida', amount: 85, type: 'expense', category: 'transport' })
    await expect(page.getByRole('dialog', { name: 'Nova transação' })).toHaveCount(0)
  })

  test('sem valor avisa em vermelho do design; o X e o clique no véu fecham', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: /^salvar$/i }).click()
    const erro = page.getByText('Insira um valor válido.')
    await expect(erro).toBeVisible()
    expect(await erro.evaluate(e => getComputedStyle(e).color)).toBe('rgb(214, 51, 74)')
    await page.getByRole('dialog', { name: 'Nova transação' }).getByRole('button', { name: 'Fechar' }).click()
    await expect(page.getByRole('dialog', { name: 'Nova transação' })).toHaveCount(0)
    await page.locator('.nds-topbar').getByRole('button', { name: /nova transação/i }).click()
    await expect(page.getByRole('dialog', { name: 'Nova transação' })).toBeVisible()
    await page.mouse.click(60, 60) // no véu
    await expect(page.getByRole('dialog', { name: 'Nova transação' })).toHaveCount(0)
  })
})
