// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Calendário (Nancy 2, tela 18) — celular. Relógio fixado em 20/out/2026 (terça).
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const tx = (id, d, type, category, description, amount) => ({ id, type, category, description, amount, date: `2026-10-${String(d).padStart(2, '0')}T15:00:00Z`, month: 10, year: 2026 })
const TXS = [tx('1', 5, 'income', 'income', 'Salário', 5000), tx('2', 20, 'expense', 'shopping', 'Roupa', 350), tx('3', 20, 'expense', 'fixed', 'Academia', 200)]

async function setup(page, { goto = '/calendar' } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-20T15:00:00Z'))
  await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(TEST_USER)))
  await page.route('**/api/transactions**', r => r.fulfill(json({ data: TXS, total: TXS.length })))
  await page.goto(goto)
}

test.describe('Calendário', () => {
  test('cabeçalho azul, mês, grade com hoje marcado e a lista de hoje; Extrato aceso', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { name: 'Calendário' })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Vencimentos e lançamentos')
    await expect(page.getByRole('heading', { name: 'Outubro 2026' })).toBeVisible()
    await expect(page.locator('.cl-legend')).toContainText('Entrada')
    await expect(page.locator('.cl-legend')).toContainText('Saída')
    await expect(page.getByText('20 de outubro · hoje')).toBeVisible()
    await expect(page.locator('.cl-ev-name')).toHaveText(['Roupa', 'Academia'])
    await expect(page.locator('.cl-ev-amt')).toHaveText(['−R$ 350,00', '−R$ 200,00'])
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Extrato')
    const m = await page.evaluate(() => {
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return { hero: cs('.fin-hero').backgroundColor, sel: cs('.cl-cell.sel').backgroundColor, selNum: cs('.cl-cell.sel .cl-num').color, theme: document.documentElement.getAttribute('data-theme'), cells: document.querySelectorAll('.cl-cells > *').length }
    })
    expect(m).toEqual({ hero: 'rgb(28, 72, 255)', sel: 'rgb(28, 72, 255)', selNum: 'rgb(255, 255, 255)', theme: 'light', cells: 35 })
  })

  test('tocar noutro dia troca a lista; o mês seguinte busca o mês certo', async ({ page }) => {
    await setup(page)
    await page.getByRole('button', { name: /^5 de outubro/ }).click()
    await expect(page.getByText('5 de outubro', { exact: true })).toBeVisible()
    await expect(page.locator('.cl-ev-name')).toHaveText(['Salário'])
    await expect(page.locator('.cl-ev-amt')).toHaveText(['+R$ 5.000,00'])

    const req = page.waitForRequest(r => r.url().includes('/api/transactions') && /month=11/.test(r.url()))
    await page.getByRole('button', { name: 'Próximo mês' }).click()
    await req
    await expect(page.getByRole('heading', { name: 'Novembro 2026' })).toBeVisible()
    await page.getByRole('button', { name: 'Hoje' }).click()
    await expect(page.getByRole('heading', { name: 'Outubro 2026' })).toBeVisible()
  })

  test('o atalho "Calendário" do Extrato abre a tela e voltar retorna ao Extrato', async ({ page }) => {
    await setup(page, { goto: '/transactions' })
    await page.getByRole('button', { name: /Calendário/ }).click()
    await expect(page).toHaveURL(/\/calendar$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/transactions$/)
  })
})
