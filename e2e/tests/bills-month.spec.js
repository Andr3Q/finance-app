// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Contas do mês (Nancy 2, tela 15) — celular
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const rows = [['Aluguel', 3500, 5, true], ['Plano de saúde', 850, 8, true], ['Academia', 200, 20, false], ['Celular', 47, 25, false]]
let state

async function setup(page, { goto = '/contas-do-mes' } = {}) {
  state = rows.map(([name, amount, dueDay, paid], i) => ({ id: 'b' + i, name, amount, dueDay, endDate: null, paidThisMonth: paid, paidDate: paid ? '2026-10-05T12:00:00Z' : null }))
  const calls = { pay: [] }
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'))
  await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(TEST_USER)))
  await page.route('**/api/budget**', r => {
    const req = r.request(), url = req.url()
    if (req.method() === 'POST' && url.includes('/pay')) {
      calls.pay.push(url)
      const id = url.match(/budget\/([^/]+)\/pay/)[1]
      state = state.map(b => (b.id === id ? { ...b, paidThisMonth: true, paidDate: '2026-10-21T12:00:00Z' } : b))
      return r.fulfill(json({}))
    }
    if (req.method() === 'GET' && /\/budget(\?.*)?$/.test(url)) return r.fulfill(json(state))
    r.fulfill(json([]))
  })
  await page.goto(goto)
  return calls
}

test.describe('Contas do mês', () => {
  test('cabeçalho, resumo azul e lista com Paga/Pendente; Extrato aceso na barra', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { name: 'Contas do mês' })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Compromissos de outubro')
    await expect(page.locator('.cm-val')).toHaveText(['2/4', 'R$ 4.597,00', '2 pendentes'])
    await expect(page.locator('.cm-pill')).toHaveText(['Paga', 'Paga', 'Pendente', 'Pendente'])
    await expect(page.getByText('Toque numa conta para marcar como paga.')).toBeVisible()
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Extrato')
    const m = await page.evaluate(() => {
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return { hero: cs('.fin-hero').backgroundColor, summary: cs('.cm-summary').backgroundColor, on: cs('.cm-check.on').backgroundColor, theme: document.documentElement.getAttribute('data-theme') }
    })
    expect(m).toEqual({ hero: 'rgb(28, 72, 255)', summary: 'rgb(28, 72, 255)', on: 'rgb(25, 200, 132)', theme: 'light' })
  })

  test('tocar numa pendente confirma, paga e atualiza o resumo', async ({ page }) => {
    const calls = await setup(page)
    await page.getByRole('button', { name: /Academia, pendente/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Marcar como paga' })
    await expect(dialog).toBeVisible()
    expect(calls.pay).toHaveLength(0)
    await dialog.getByRole('button', { name: 'Marcar como paga' }).click()

    await expect.poll(() => calls.pay.length).toBe(1)
    expect(calls.pay[0]).toContain('/budget/b2/pay')
    await expect(page.locator('.cm-val').first()).toHaveText('3/4')
    await expect(page.locator('.cm-val').last()).toHaveText('1 pendente')
  })

  test('cancelar a confirmação não paga', async ({ page }) => {
    const calls = await setup(page)
    await page.getByRole('button', { name: /Celular, pendente/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(calls.pay).toHaveLength(0)
  })

  test('o atalho "Contas do mês" do Extrato abre a tela e voltar retorna ao Extrato', async ({ page }) => {
    await setup(page, { goto: '/transactions' })
    await page.getByRole('button', { name: /Contas do mês/ }).click()
    await expect(page).toHaveURL(/\/contas-do-mes$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/transactions$/)
  })
})
