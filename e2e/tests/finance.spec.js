// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Finanças (Nancy 2, tela 14) — celular: salário + contas fixas.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const BUDGETS = [
  { id: 'b1', name: 'Aluguel',        amount: 3500, dueDay: 5, endDate: null, paidThisMonth: false },
  { id: 'b2', name: 'Plano de saúde', amount: 850,  dueDay: 6, endDate: null, paidThisMonth: true, paidDate: '2026-10-06T12:00:00Z' },
]

async function setup(page, { goto = '/financas' } = {}) {
  const calls = { pay: [], remove: [], salary: [] }
  await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(TEST_USER)))
  await page.route('**/api/budget**', r => {
    const req = r.request(), url = req.url()
    if (req.method() === 'PUT' && url.includes('/budget/salary')) { calls.salary.push(JSON.parse(req.postData() || '{}')); return r.fulfill(json({ salary: 6000 })) }
    if (req.method() === 'POST' && url.includes('/pay')) { calls.pay.push(url); return r.fulfill(json({})) }
    if (req.method() === 'DELETE') { calls.remove.push(url); return r.fulfill(json({})) }
    if (req.method() === 'GET' && /\/budget(\?.*)?$/.test(url)) return r.fulfill(json(BUDGETS))
    r.fulfill(json([]))
  })
  await page.goto(goto)
  return calls
}

test.describe('Finanças', () => {
  test('cabeçalho azul, cartões de salário e contas fixas, total no topo e Extrato aceso na barra', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { name: 'Finanças' })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Salário e contas fixas')
    await expect(page.getByRole('heading', { name: 'Salário mensal' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Contas fixas' })).toBeVisible()
    await expect(page.locator('.fin-total')).toHaveText('R$ 4.350,00')
    await expect(page.locator('.fin-row-name')).toHaveText(['Aluguel', 'Plano de saúde'])
    await expect(page.locator('.fin-row-due')).toHaveText(['Vence dia 5', 'Vence dia 6 · paga'])
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Extrato')
    const m = await page.evaluate(() => {
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return { hero: cs('.fin-hero').backgroundColor, body: cs('.fin-body').backgroundColor, theme: document.documentElement.getAttribute('data-theme'),
        btn: cs('.fin-btn').backgroundColor, rowIco: cs('.fin-row-ico').backgroundColor }
    })
    expect(m).toEqual({ hero: 'rgb(28, 72, 255)', body: 'rgb(242, 246, 255)', theme: 'light', btn: 'rgb(28, 72, 255)', rowIco: 'rgb(28, 72, 255)' })
  })

  test('tocar numa conta pendente mostra "Marcar como paga" e marca; a paga mostra a data e não oferece pagar', async ({ page }) => {
    const calls = await setup(page)
    await page.getByRole('button', { name: /Plano de saúde/ }).click()
    await expect(page.getByText('Paga em 06/10/2026')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Marcar como paga' })).toHaveCount(0)

    await page.getByRole('button', { name: /Aluguel/ }).click()
    await page.getByRole('button', { name: 'Marcar como paga' }).click()
    await expect.poll(() => calls.pay.length).toBe(1)
    expect(calls.pay[0]).toContain('/budget/b1/pay')
  })

  test('remover pede confirmação antes de apagar', async ({ page }) => {
    const calls = await setup(page)
    await page.getByRole('button', { name: 'Remover' }).first().click()
    await expect(page.getByText('Tem certeza?')).toBeVisible()
    expect(calls.remove).toHaveLength(0)
    await page.getByRole('button', { name: /Sim, excluir/ }).click()
    await expect.poll(() => calls.remove.length).toBe(1)
    expect(calls.remove[0]).toContain('/budget/b1')
  })

  test('salvar salário envia o valor digitado', async ({ page }) => {
    const calls = await setup(page)
    const input = page.getByPlaceholder('0,00').first()
    await input.fill('6000')
    await page.locator('.fin-btn').click()
    await expect(page.getByText(/atualizado com sucesso/i)).toBeVisible()
    expect(calls.salary).toEqual([{ salary: 6000 }])
  })

  test('voltar retorna à tela de onde se chegou (Perfil → Finanças)', async ({ page }) => {
    await setup(page, { goto: '/settings' })
    await page.getByRole('button', { name: 'Finanças', exact: true }).click()
    await expect(page).toHaveURL(/\/financas$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/settings$/)
  })
})
