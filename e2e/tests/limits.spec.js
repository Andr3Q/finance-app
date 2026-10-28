// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Limites (Nancy 2) — celular. Relógio fixado em 21/out/2026.
// Os tetos e o gasto vêm do mesmo resumo do Início; o servidor é simulado com estado
// (salvar/remover mudam o que o resumo devolve na recarga).
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const expense = (category, amount) => ({ id: category, type: 'expense', category, amount, date: '2026-10-05T12:00:00Z', month: 10, year: 2026, archived: false })
const TX = [expense('food', 1165), expense('transport', 575), expense('shopping', 350)]

async function setup(page, { user = { ...TEST_USER, plan: 'pro' }, goto = '/limites', limits } = {}) {
  const state = { limits: limits || [{ category: 'food', amount: 1500 }, { category: 'transport', amount: 600 }, { category: 'shopping', amount: 500 }], calls: [] }
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'))
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json({
    summary: { totalExpenses: 2090, totalIncome: 0, unpaidBudgetIds: [] }, transactions: TX, budgets: [], limits: state.limits,
  })))
  await page.route('**/api/budget/category-limits**', async r => {
    const req = r.request()
    if (req.method() === 'POST') {
      const { category, amount } = req.postDataJSON()
      state.calls.push(['POST', category, amount])
      state.limits = [...state.limits.filter(l => l.category !== category), { category, amount }]
      return r.fulfill(json({ category, amount }))
    }
    if (req.method() === 'DELETE') {
      const category = req.url().split('/').pop()
      state.calls.push(['DELETE', category])
      state.limits = state.limits.filter(l => l.category !== category)
      return r.fulfill(json({ message: 'Limite removido.' }))
    }
    return r.fulfill(json(state.limits))
  })
  await page.goto(goto)
  return state
}

test.describe('Limites', () => {
  test('uma linha por categoria com gasto/teto, barra verde-amarela e Metas aceso na barra', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { name: 'Limites', exact: true })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Teto de gasto por categoria')
    await expect(page.locator('.lm-name')).toHaveText(['Alimentação', 'Transporte', 'Shopping'])
    await expect(page.locator('.lm-amt')).toHaveText(['R$ 1.165,00 / R$ 1.500,00', 'R$ 575,00 / R$ 600,00', 'R$ 350,00 / R$ 500,00'])
    await expect(page.locator('.lm-note')).toHaveText(['R$ 335,00 disponível', 'Atenção: 96% usado', 'R$ 150,00 disponível'])
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Metas')
    await expect(page.locator('.dsb-mn-item.active')).toHaveCount(1)
    const m = await page.evaluate(() => {
      const rd = (n) => Math.round(n * 10) / 10
      const cs = (s, i = 0) => getComputedStyle(document.querySelectorAll(s)[i])
      const box = (s, i = 0) => { const r = document.querySelectorAll(s)[i].getBoundingClientRect(); return { top: rd(r.top), bottom: rd(r.bottom), w: rd(r.width), h: rd(r.height) } }
      return {
        hero: cs('.fin-hero').backgroundColor, body: cs('.fin-body').backgroundColor, card: cs('.lm-card').backgroundColor,
        fills: [0, 1, 2].map(i => cs('.lm-fill', i).backgroundColor), track: cs('.lm-bar').backgroundColor, warnNote: cs('.lm-note', 1).color,
        chipOn: cs('.lm-chip.on').backgroundColor, chipOff: cs('.lm-chip:not(.on):not(.more)').backgroundColor, save: cs('.lm-save').backgroundColor,
        bar: box('.lm-bar'), card1: box('.lm-card'), card2: box('.lm-new'), inp: box('.lm-inp'), saveBox: box('.lm-save'), theme: document.documentElement.getAttribute('data-theme'),
        widths: [0, 1, 2].map(i => rd(parseFloat(cs('.lm-fill', i).width) / document.querySelectorAll('.lm-bar')[i].getBoundingClientRect().width * 100)),
      }
    })
    expect(m.theme).toBe('light')
    expect(m.hero).toBe('rgb(28, 72, 255)')
    expect(m.body).toBe('rgb(242, 246, 255)')
    expect(m.card).toBe('rgb(255, 255, 255)')
    expect(m.fills).toEqual(['rgb(25, 200, 132)', 'rgb(231, 180, 61)', 'rgb(25, 200, 132)'])
    expect(m.track).toBe('rgb(237, 243, 255)')
    expect(m.warnNote).toBe('rgb(182, 120, 36)')
    expect(m.chipOn).toBe('rgb(28, 72, 255)')
    expect(m.chipOff).toBe('rgb(244, 247, 252)')
    expect(m.save).toBe('rgb(28, 72, 255)')
    expect(m.bar.h).toBe(8)
    expect(m.inp.h).toBe(53)
    expect(m.saveBox.h).toBe(53)
    expect(m.card2.top - m.card1.bottom).toBe(14)
    expect(m.widths[0]).toBeGreaterThan(77.5); expect(m.widths[0]).toBeLessThan(77.9)   // 1165 / 1500
    expect(m.widths[1]).toBeGreaterThan(95.7); expect(m.widths[1]).toBeLessThan(96)     // 575 / 600
  })

  test('"Novo limite": escolhe a categoria, salva, e a linha nova aparece com o gasto zerado', async ({ page }) => {
    const state = await setup(page)
    await expect(page.getByRole('radio', { name: 'Saúde' })).toHaveAttribute('aria-checked', 'true')   // 1ª sem teto
    await page.getByPlaceholder('Teto (R$)').fill('300')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.getByText('Limite salvo!')).toBeVisible()
    await expect(page.locator('.lm-name')).toHaveText(['Alimentação', 'Transporte', 'Shopping', 'Saúde'])
    await expect(page.locator('.lm-amt').last()).toHaveText('R$ 0,00 / R$ 300,00')
    await expect(page.locator('.lm-note').last()).toHaveText('R$ 300,00 disponível')
    expect(state.calls).toEqual([['POST', 'health', 300]])
    await expect(page.getByPlaceholder('Teto (R$)')).toHaveValue('')
  })

  test('as 4 categorias extras ficam atrás de "Mais"; escolher uma que já tem teto abre o valor pra editar', async ({ page }) => {
    const state = await setup(page)
    await expect(page.getByRole('radio')).toHaveCount(4)
    await page.getByRole('button', { name: 'Mais' }).click()
    await expect(page.getByRole('radio')).toHaveCount(8)
    await page.getByRole('radio', { name: 'Lazer' }).click()
    await page.getByPlaceholder('Teto (R$)').fill('250')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.locator('.lm-name')).toHaveText(['Alimentação', 'Transporte', 'Shopping', 'Lazer'])
    // com um teto em categoria extra, as 8 ficam abertas sozinhas; escolher Transporte traz o valor do teto
    await expect(page.getByRole('radio')).toHaveCount(8)
    await page.getByRole('radio', { name: 'Transporte' }).click()
    await expect(page.getByPlaceholder('Teto (R$)')).toHaveValue('600,00')
    await page.getByPlaceholder('Teto (R$)').fill('800')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await expect(page.locator('.lm-amt').nth(1)).toHaveText('R$ 575,00 / R$ 800,00')
    await expect(page.locator('.lm-note').nth(1)).toHaveText('R$ 225,00 disponível')   // 96% (amarelo) virou 72% (verde)
    expect(state.calls).toEqual([['POST', 'leisure', 250], ['POST', 'transport', 800]])
  })

  test('o X remove o teto, e a categoria some da lista', async ({ page }) => {
    const state = await setup(page)
    await page.getByRole('button', { name: 'Remover limite de Shopping' }).click()
    await page.getByRole('dialog', { name: 'Remover limite' }).getByRole('button', { name: 'Sim, remover' }).click()
    await expect(page.locator('.lm-name')).toHaveText(['Alimentação', 'Transporte'])
    expect(state.calls).toEqual([['DELETE', 'shopping']])
    await page.reload()
    await expect(page.locator('.lm-name')).toHaveText(['Alimentação', 'Transporte'])
  })

  test('estourou: barra cheia e vermelha com quanto passou', async ({ page }) => {
    await setup(page, { limits: [{ category: 'transport', amount: 500 }] })
    await expect(page.locator('.lm-note')).toHaveText('Passou R$ 75,00 do limite')
    const m = await page.evaluate(() => ({ fill: getComputedStyle(document.querySelector('.lm-fill')).backgroundColor, note: getComputedStyle(document.querySelector('.lm-note')).color, w: document.querySelector('.lm-fill').getBoundingClientRect().width / document.querySelector('.lm-bar').getBoundingClientRect().width }))
    expect(m.fill).toBe('rgb(229, 72, 77)')
    expect(m.note).toBe('rgb(214, 69, 69)')
    expect(m.w).toBeCloseTo(1, 2)
  })

  test('os mesmos números viram avisos nas Notificações', async ({ page }) => {
    await setup(page, { goto: '/notificacoes' })
    await expect(page.getByRole('button', { name: /Transporte em 96% do limite/ })).toBeVisible()
    // Alimentação está em 78%: abaixo dos 80% em que o aviso começa
    await expect(page.getByRole('button', { name: /Alimentação/ })).toHaveCount(0)
  })

  test('em Metas, o atalho "Limites" abre a tela e voltar retorna às Metas', async ({ page }) => {
    await setup(page, { goto: '/goals' })
    await page.getByRole('button', { name: /Limites/ }).click()
    await expect(page).toHaveURL(/\/limites$/)
    await expect(page.locator('.lm-name').first()).toBeVisible()
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/goals$/)
  })

  test('plano grátis vê o convite e vai aos planos', async ({ page }) => {
    await setup(page, { user: { ...TEST_USER, plan: 'free' } })
    await expect(page.getByText('Recurso Pro')).toBeVisible()
    await page.getByRole('button', { name: 'Ver planos' }).click()
    await expect(page).toHaveURL(/\/planos$/)
  })
})
