// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Lembretes (Nancy 2, tela 22) — celular. Relógio fixado em 21/out/2026.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const BUDGETS = [
  { id: 'b1', name: 'Aluguel', amount: 1800, dueDay: 22 },
  { id: 'b2', name: 'Plano de saúde', amount: 400, dueDay: 25 },
  { id: 'b3', name: 'Cartão de crédito', amount: 900, dueDay: 10 },
]
const dash = (budgets = BUDGETS) => ({
  summary: { totalExpenses: 0, totalIncome: 0, unpaidBudgetIds: budgets.map(b => b.id) }, transactions: [], limits: [], budgets,
})

async function setup(page, { user = { ...TEST_USER, plan: 'elite' }, goto = '/lembretes' } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'))
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/budget', r => r.fulfill(json(BUDGETS)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(dash())))
  await page.goto(goto)
}

test.describe('Lembretes', () => {
  test('cartão branco com uma linha por vencimento, interruptores verdes e Metas aceso na barra', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { name: 'Lembretes', exact: true })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Avisos de vencimento')
    await expect(page.locator('.rm-title')).toHaveText('Lembretes de vencimento')
    await expect(page.locator('.rm-name')).toHaveText(['Cartão de crédito', 'Aluguel', 'Plano de saúde'])
    await expect(page.locator('.rm-sub')).toHaveText(['Dia 10 · 2 dias antes', 'Dia 22 · 2 dias antes', 'Dia 25 · 2 dias antes'])
    await expect(page.getByRole('switch', { checked: true })).toHaveCount(3)
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Metas')
    await expect(page.locator('.dsb-mn-item.active')).toHaveCount(1)
    await expect(page.locator('.fin-body .sb-switch.on').first()).toBeVisible()
    const m = await page.evaluate(() => {
      const rd = (n) => Math.round(n * 10) / 10
      const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: rd(r.x), w: rd(r.width), h: rd(r.height) } }
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return {
        hero: cs('.fin-hero').backgroundColor, body: cs('.fin-body').backgroundColor, card: cs('.rm-card').backgroundColor, cardBox: box('.rm-card'),
        ico: box('.rm-ico'), icoBg: cs('.rm-ico').backgroundColor, on: cs('.sb-switch.on').backgroundColor, theme: document.documentElement.getAttribute('data-theme'),
      }
    })
    expect(m.theme).toBe('light')
    expect(m.hero).toBe('rgb(28, 72, 255)')
    expect(m.body).toBe('rgb(242, 246, 255)')
    expect(m.card).toBe('rgb(255, 255, 255)')
    expect([m.cardBox.x, m.cardBox.w]).toEqual([18, 357])   // 18px de margem de cada lado (medido no print)
    expect([m.ico.w, m.ico.h]).toEqual([42, 42])
    expect(m.icoBg).toBe('rgb(238, 242, 255)')
    expect(m.on).toBe('rgb(25, 200, 132)')
  })

  test('desligar uma conta tira o aviso das Notificações; mudar a antecedência traz o aviso mais cedo', async ({ page }) => {
    // Plano de saúde vence dia 25 (4 dias): com 2 dias antes ainda não avisa; com 5 dias antes já avisa
    await setup(page)
    await page.goto('/notificacoes')
    await expect(page.locator('.ntf-name')).toHaveText(['Aluguel vence amanhã'])

    await page.goto('/lembretes')
    await page.getByRole('button', { name: /Antecedência do lembrete de Plano de saúde/ }).click()
    await page.getByRole('radio', { name: '5 dias antes' }).click()
    await page.getByRole('button', { name: 'Pronto' }).click()
    await expect(page.getByText('Dia 25 · 5 dias antes')).toBeVisible()
    await page.getByRole('switch', { name: /Aluguel/ }).click()
    await expect(page.getByRole('switch', { name: /Aluguel/ })).toHaveAttribute('aria-checked', 'false')

    await page.goto('/notificacoes')
    await expect(page.locator('.ntf-name')).toHaveText(['Plano de saúde vence em 4 dias'])
  })

  test('lembrete avulso: cria, aparece na lista e avisa nas Notificações no dia certo; some ao remover', async ({ page }) => {
    await setup(page)
    await page.getByRole('button', { name: '+ Novo lembrete' }).click()
    const dlg = page.getByRole('dialog', { name: 'Novo lembrete' })
    await dlg.getByRole('button', { name: 'Criar lembrete' }).click()
    await expect(dlg.getByRole('alert')).toHaveText('Dê um nome ao lembrete.')
    await dlg.getByLabel('Nome').fill('IPVA 2027')
    await dlg.getByLabel('Dia do vencimento').fill('23')
    await dlg.getByLabel('Repete').selectOption('10')
    await dlg.getByLabel('Avisar').selectOption('2')
    await dlg.getByRole('button', { name: 'Criar lembrete' }).click()
    await expect(page.getByText('Outubro · 2 dias antes')).toBeVisible()

    await page.goto('/notificacoes')
    await expect(page.getByRole('button', { name: /IPVA 2027/ })).toContainText('em 2 dias')
    await page.getByRole('button', { name: /IPVA 2027/ }).click()
    await expect(page).toHaveURL(/\/lembretes$/)

    await page.getByRole('button', { name: /Antecedência do lembrete de IPVA 2027/ }).click()
    await page.getByRole('button', { name: 'Remover lembrete' }).click()
    await expect(page.getByText('IPVA 2027')).toHaveCount(0)
    await page.reload()
    await expect(page.getByText('IPVA 2027')).toHaveCount(0)
  })

  test('as escolhas ficam guardadas ao recarregar', async ({ page }) => {
    await setup(page)
    await page.getByRole('switch', { name: /Cartão de crédito/ }).click()
    await page.reload()
    await expect(page.getByRole('switch', { name: /Cartão de crédito/ })).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByRole('switch', { name: /Aluguel/ })).toHaveAttribute('aria-checked', 'true')
  })

  test('em Metas, o atalho "Lembretes" abre a tela e voltar retorna às Metas', async ({ page }) => {
    await setup(page, { goto: '/goals' })
    await page.getByRole('button', { name: /Lembretes/ }).click()
    await expect(page).toHaveURL(/\/lembretes$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/goals$/)
  })

  test('quem não é Elite vê o convite e vai aos planos', async ({ page }) => {
    await setup(page, { user: { ...TEST_USER, plan: 'pro' } })
    await expect(page.getByText('Recurso Elite')).toBeVisible()
    await page.getByRole('button', { name: 'Ver planos' }).click()
    await expect(page).toHaveURL(/\/planos$/)
  })
})
