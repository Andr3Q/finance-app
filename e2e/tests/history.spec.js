// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Histórico (Nancy 2, tela 20) — celular. Relógio fixado em 21/out/2026.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const H = [[5, 5200], [6, 6100], [7, 4800], [8, 6900], [9, 7200], [10, 9500]].map(([month, saved]) => ({ month, year: 2026, income: saved, expenses: 0, saved, active: true }))

async function setup(page, { user = { ...TEST_USER, plan: 'pro' }, goto = '/historico' } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'))
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/transactions/monthly-history**', r => r.fulfill(json(H)))
  await page.route('**/api/goals**', r => r.fulfill(json([])))
  await page.goto(goto)
}

test.describe('Histórico', () => {
  test('barras com o resultado de cada mês, mês atual verde, frase de destaque e Metas aceso', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Últimos 6 meses')
    await expect(page.locator('.hs-val')).toHaveText(['5.2k', '6.1k', '4.8k', '6.9k', '7.2k', '9.5k'])
    await expect(page.locator('.hs-mon')).toHaveText(['Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out'])
    await expect(page.getByText('Seu melhor mês do ano')).toBeVisible()
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Metas')
    const m = await page.evaluate(() => {
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return { hero: cs('.fin-hero').backgroundColor, bar: cs('.hs-bar').backgroundColor, cur: cs('.hs-bar.cur').backgroundColor, ico: cs('.hs-insight-ico').backgroundColor, theme: document.documentElement.getAttribute('data-theme') }
    })
    expect(m).toEqual({ hero: 'rgb(28, 72, 255)', bar: 'rgb(204, 217, 251)', cur: 'rgb(25, 200, 132)', ico: 'rgb(25, 200, 132)', theme: 'light' })
  })

  test('plano gratuito vê o convite do Pro', async ({ page }) => {
    await setup(page, { user: { ...TEST_USER, plan: 'free' } })
    await expect(page.getByText('Recurso Pro')).toBeVisible()
    await expect(page.locator('.hs-col')).toHaveCount(0)
  })

  test('o atalho "Histórico" das Metas abre a tela e voltar retorna às Metas', async ({ page }) => {
    await setup(page, { goto: '/goals' })
    await page.getByRole('button', { name: /Histórico/ }).click()
    await expect(page).toHaveURL(/\/historico$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/goals$/)
  })
})
