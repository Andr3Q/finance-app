// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Planilha IA no desktop (design "Nancy Desktop", tela 12, 1440×1216): barra com selo, previsão e exportar; tabela de 5 colunas com
// linhas de 50px ao lado de dois cartões de 320px. Relógio fixo em 20/out/2026 22h.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 1216 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }
const mo = (label, kind, month) => ({ label, key: `2026-${month}`, kind, month, year: 2026 })
const row = (id, label, values, edit) => ({ id, label, values, ...(edit ? { edit } : {}) })
const tot = (rows) => [0, 1, 2, 3, 4].map(c => rows.reduce((s, r) => s + (r.values[c] || 0), 0))
const income = [row('salary', 'Salário', [15000, 15000, 15000, 15000, 15000], { kind: 'salary' }), row('income:freelance', 'Freelance', [1200, 0, 1800, 1000, 1000])]
const fixed = [['Aluguel', [3500, 3500, 3500, 3500, 3500]], ['Plano de saúde', [850, 850, 850, 850, 850]], ['Conta de luz', [342, 365, 380, 380, 380]], ['Internet', [150, 150, 150, 150, 150]], ['Academia', [null, null, 200, 200, 200]], ['Celular', [47, 47, 47, 47, 47]]].map(([l, v], i) => row(`budget:${i}`, l, v, { kind: 'budget', id: `b${i}` }))
const inst = [row('i1', 'Notebook (3/10)', [null, 600, 600, 600, 600]), row('i2', 'Geladeira (6/8)', [400, 400, 400, 400, 400])]
const vari = [row('c1', 'Alimentação', [1320, 1410, 1165, 1259, 1259]), row('c2', 'Transporte', [610, 540, 575, 558, 558]), row('c3', 'Shopping', [280, 420, 350, 340, 340]), row('c4', 'Saúde', [90, 160, 130, 123, 123])]
const SHEET = () => {
  const sections = [{ id: 'income', label: 'Receitas', rows: income, total: tot(income) }, { id: 'fixed', label: 'Contas fixas', rows: fixed, total: tot(fixed) }, { id: 'installments', label: 'Parcelas', rows: inst, total: tot(inst) }, { id: 'variable', label: 'Variáveis', rows: vari, total: tot(vari) }]
  return {
    months: [mo('AGO', 'past', 8), mo('SET', 'past', 9), mo('OUT', 'current', 10), mo('NOV', 'forecast', 11), mo('DEZ', 'forecast', 12)],
    sections, net: [0, 1, 2, 3, 4].map(c => sections[0].total[c] - sections[1].total[c] - sections[2].total[c] - sections[3].total[c]),
    feed: [{ kind: 'income', text: 'Freelance de R$ 1.800 → coluna de outubro atualizada', at: '2026-10-20T21:59:00Z' }, { kind: 'installment', text: 'Parcela 6/8 da Geladeira registrada', at: '2026-10-20T21:00:00Z' }],
    generatedAt: '2026-10-20T21:59:30Z',
  }
}

async function open(page, { sheet = () => json(SHEET()), plan = 'elite' } = {}) {
  await page.addInitScript(() => { window.__nancySplashGone = false })
  await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
  await injectSession(page, { ...U, plan })
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json({ ...U, plan })))
  await page.route('**/api/sheet', r => r.fulfill(sheet()))
  await page.goto('/planilha')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
}
const box = (page, sel, i = 0) => page.evaluate(([s, n]) => { const b = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, [sel, i])

test.describe('Planilha IA desktop — medidas e visual do design', () => {
  test('barra de 46px, tabela de 760px com linhas de 50px, cartões de 320px e saldo de 46px', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndp-table')).toBeVisible()
    expect(await box(page, '.ndp-bar')).toMatchObject({ x: 312, y: 101, w: 1096, h: 46 })
    expect(await box(page, '.ndp-export')).toMatchObject({ x: 1256, w: 152, h: 46 })
    expect(await box(page, '.ndp-table')).toMatchObject({ x: 312, w: 760 })
    expect(await box(page, '.ndp-head')).toMatchObject({ h: 40 })
    expect(await box(page, '.ndp-sec')).toMatchObject({ h: 50 })
    expect(await box(page, '.ndp-item')).toMatchObject({ h: 50 })
    expect(await box(page, '.ndp-net')).toMatchObject({ h: 46 })
    expect(await box(page, '.ndp-how')).toMatchObject({ x: 1088, w: 320 })
    expect(await box(page, '.ndp-add')).toMatchObject({ x: 1088, w: 320 })
    const gap = (await box(page, '.ndp-add')).y - ((await box(page, '.ndp-how')).y + (await box(page, '.ndp-how')).h)
    expect(Math.round(gap)).toBe(16)
  })

  test('cores do design: cabeçalho escuro, mês atual azul, previsão em verde e saldo azul', async ({ page }) => {
    await open(page)
    const bg = (sel, i = 0) => page.locator(sel).nth(i).evaluate(e => getComputedStyle(e).backgroundColor)
    expect(await bg('.ndp-head')).toBe('rgb(7, 19, 48)')
    expect(await bg('.ndp-th.current')).toBe('rgb(21, 70, 255)')
    expect(await bg('.ndp-th.forecast')).toBe('rgba(18, 201, 133, 0.25)')
    expect(await page.locator('.ndp-th.forecast').first().evaluate(e => getComputedStyle(e).color)).toBe('rgb(147, 240, 203)')
    expect(await bg('.ndp-net')).toBe('rgb(21, 70, 255)')
    expect(await page.locator('.ndp-sec').nth(0).evaluate(e => getComputedStyle(e).color)).toBe('rgb(8, 122, 82)')
    expect(await page.locator('.ndp-sec').nth(1).evaluate(e => getComputedStyle(e).color)).toBe('rgb(21, 70, 255)')
    expect(await page.locator('.ndp-sec').nth(2).evaluate(e => getComputedStyle(e).color)).toBe('rgb(106, 75, 255)')
  })

  test('conteúdo igual ao design: totais, previsão, "–" e saldo do mês', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndp-sec').first()).toContainText('16.200')
    const linha = (n) => page.locator('.ndp-item', { hasText: n })
    await expect(linha('Academia')).toContainText('–')
    await expect(linha('Salário').locator('input')).toHaveValue('15000')
    await expect(linha('Freelance')).toContainText('1.000')
    await expect(page.locator('.ndp-net')).toContainText('Saldo do mês')
    await expect(page.locator('.ndp-net')).toContainText('8.611')
    await expect(page.getByText('Sincronizada com suas contas · atualizada agora')).toBeVisible()
  })

  test('interruptor Previsão da IA tira e devolve as colunas NOV/DEZ', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndp-th')).toHaveCount(5)
    await page.getByRole('switch', { name: 'Previsão da IA' }).click()
    await expect(page.locator('.ndp-th')).toHaveCount(3)
    expect((await box(page, '.ndp-th', 2)).w).toBeGreaterThan(150) // as colunas dividem a largura sobrante
    await page.getByRole('switch', { name: 'Previsão da IA' }).click()
    await expect(page.locator('.ndp-th')).toHaveCount(5)
  })
})

test.describe('Planilha IA desktop — funções', () => {
  test('editar o aluguel do mês atual manda o valor novo e recarrega; salário vai para a rota do salário', async ({ page }) => {
    let put = null, salary = null
    await open(page)
    // rotas específicas depois do open: a última registrada vale primeiro
    await page.route('**/api/budget/b0', async r => { put = r.request().postDataJSON(); await r.fulfill(json({ id: 'b0' })) })
    await page.route('**/api/budget/salary', async r => { salary = r.request().postDataJSON(); await r.fulfill(json({ salary: 16000 })) })
    const aluguel = page.locator('.ndp-item', { hasText: 'Aluguel' }).locator('input')
    await aluguel.fill('3650')
    await aluguel.press('Enter')
    await expect.poll(() => put).toEqual({ amount: 3650 })
    const sal = page.locator('.ndp-item', { hasText: 'Salário' }).locator('input')
    await sal.fill('16000')
    await sal.press('Enter')
    await expect.poll(() => salary).toEqual({ salary: 16000 })
  })

  test('linhas que vêm dos lançamentos não são editáveis', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndp-item', { hasText: 'Alimentação' }).locator('input')).toHaveAttribute('readonly', '')
    await expect(page.locator('.ndp-item', { hasText: 'Notebook' }).locator('input')).toHaveAttribute('readonly', '')
  })

  test('adicionar conta fixa cria e mostra a linha NOVA na planilha', async ({ page }) => {
    let body = null
    let nova = false
    await open(page, { sheet: () => { const s = SHEET(); if (nova) s.sections[1].rows.push(row('budget:bnew', 'Streaming', [null, null, 45, 45, 45], { kind: 'budget', id: 'bnew' })); return json(s) } })
    await page.route('**/api/budget', async r => { body = r.request().postDataJSON(); nova = true; await r.fulfill(json({ id: 'bnew', name: 'Streaming', amount: 45 }, 201)) })
    await page.getByLabel('Nome da conta fixa').fill('Streaming')
    await page.getByLabel('Valor mensal').fill('45')
    await page.getByRole('button', { name: /Adicionar e ver na planilha/ }).click()
    await expect.poll(() => body).toEqual({ name: 'Streaming', amount: 45 })
    await expect(page.locator('.ndp-item', { hasText: 'Streaming' })).toContainText('NOVA')
    await expect(page.locator('.ndp-feed li').first()).toContainText('Streaming adicionada como conta fixa')
  })

  test('Exportar .xlsx baixa o arquivo da API', async ({ page }) => {
    await page.route('**/api/sheet/export**', r => r.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', headers: { 'content-disposition': 'attachment; filename="planilha.xlsx"' }, body: 'PKfake' }))
    await open(page)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Exportar \.xlsx/ }).click()])
    expect(dl.suggestedFilename()).toBe('planilha-nancy-2026-10.xlsx')
  })

  test('fora do plano Elite aparece o convite e o botão leva aos planos', async ({ page }) => {
    await open(page, { plan: 'pro', sheet: () => json({ error: 'A Planilha IA faz parte do plano Elite.', code: 'plan_required', limitReached: true }, 403) })
    await expect(page.getByRole('heading', { name: 'A Planilha IA faz parte do plano Elite' })).toBeVisible()
    await expect(page.locator('.ndp-table')).toHaveCount(0)
    await page.getByRole('button', { name: 'Ver planos' }).click()
    await expect(page).toHaveURL(/\/planos$/)
  })
})

test.describe('Planilha IA desktop — navegação', () => {
  test('o item do menu leva à planilha, fica aceso, e a barra de cima mostra o título do design', async ({ page }) => {
    await open(page)
    await page.goto('/dashboard')
    await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
    await page.locator('.nds-sidebar .nds-item', { hasText: 'Planilha IA' }).click()
    await expect(page).toHaveURL(/\/planilha$/)
    await expect(page.locator('.nds-sidebar .nds-item.active')).toContainText('Planilha IA')
    await expect(page.locator('.nds-topbar')).toContainText('Montada automaticamente a partir das suas contas')
  })

  test('o Início ganha o atalho e o cartão da Planilha IA', async ({ page }) => {
    await open(page)
    await page.route('**/api/transactions/dashboard**', r => r.fulfill(json({ summary: { salary: 15000, totalIncome: 0, totalFixedCosts: 0, unpaidFixedCosts: 0, unpaidBudgetIds: [], totalExpenses: 0, totalAvailable: 15000, currentBalance: 15000, percentUsed: 0 }, transactions: [], limits: [], budgets: [] })))
    await page.goto('/dashboard')
    await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
    await expect(page.locator('.ndh-quick-btn', { hasText: 'Planilha IA' })).toBeVisible()
    await page.locator('.ndh-sheet').click()
    await expect(page).toHaveURL(/\/planilha$/)
  })
})
