// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Análise do mês (Nancy 2, tela 17) — celular
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const tx = (id, category, amount) => ({ id, type: 'expense', category, amount, description: category, date: '2026-10-10T15:00:00Z', month: 10, year: 2026 })
const DASH = {
  summary: { salary: 5000, totalIncome: 1500, totalExpenses: 7300, unpaidBudgetIds: [] },
  transactions: [tx(1, 'fixed', 5080), tx(2, 'food', 1165), tx(3, 'transport', 575), tx(4, 'shopping', 350), tx(5, 'health', 130)],
  limits: [], budgets: [],
}

async function setup(page, { user = TEST_USER, goto = '/analise', chat } = {}) {
  const calls = { chat: [] }
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(DASH)))
  await page.route('**/api/agent/chat**', r => { calls.chat.push(JSON.parse(r.request().postData() || '{}')); r.fulfill(json({ reply: 'Comece cortando delivery.' })) })
  await page.goto(goto)
  return calls
}

test.describe('Análise do mês', () => {
  test('cartão azul do maior gasto variável, categorias com % da renda e Extrato aceso', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { name: 'Análise do mês' })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Para onde foi seu dinheiro')
    await expect(page.locator('.an-top-name')).toHaveText('Alimentação')
    await expect(page.locator('.an-top-val')).toHaveText('R$ 1.165,00')
    await expect(page.locator('.an-top-pill')).toHaveText('52% do total')
    await expect(page.locator('.an-item-name')).toHaveText(['Contas fixas', 'Alimentação', 'Transporte', 'Shopping', 'Saúde'])
    await expect(page.locator('.an-item-pct')).toHaveText(['78%', '18%', '9%', '5%', '2%'])
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Extrato')
    const m = await page.evaluate(() => {
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return { hero: cs('.fin-hero').backgroundColor, top: cs('.an-top').backgroundColor, pill: cs('.an-top-pill').backgroundColor, theme: document.documentElement.getAttribute('data-theme') }
    })
    expect(m).toEqual({ hero: 'rgb(28, 72, 255)', top: 'rgb(28, 72, 255)', pill: 'rgb(61, 226, 159)', theme: 'light' })
  })

  test('o convite pra Nancy abre o chat e envia a pergunta de corte (Elite)', async ({ page }) => {
    const calls = await setup(page, { user: { ...TEST_USER, plan: 'elite' } })
    await page.getByRole('button', { name: /quer que a nancy sugira onde cortar/i }).click()
    await expect(page.getByRole('dialog', { name: 'Nancy IA' })).toBeVisible()
    await expect(page.getByText('Comece cortando delivery.')).toBeVisible()
    expect(calls.chat).toHaveLength(1)
    expect(calls.chat[0].message).toBe('Onde posso cortar R$ 350 dos meus gastos este mês?')
  })

  test('sem o plano Elite o chat abre com o convite e nada é enviado', async ({ page }) => {
    const calls = await setup(page, { user: { ...TEST_USER, plan: 'pro' } })
    await page.getByRole('button', { name: /quer que a nancy sugira onde cortar/i }).click()
    await expect(page.getByText(/disponível no plano Elite/)).toBeVisible()
    expect(calls.chat).toHaveLength(0)
  })

  test('o atalho "Análise do mês" do Extrato abre a tela e voltar retorna ao Extrato', async ({ page }) => {
    await setup(page, { goto: '/transactions' })
    await page.getByRole('button', { name: /Análise do mês/ }).click()
    await expect(page).toHaveURL(/\/analise$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/transactions$/)
  })
})
