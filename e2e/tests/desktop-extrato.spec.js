// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Extrato no desktop (design "Nancy Desktop", tela 10, 1440×1256): abas, cartão com pílulas e busca, tabela de 5 colunas (linhas de 65px).
// Relógio fixo em 20/out/2026 22h.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 1256 } })

const json = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }
const tx = (id, description, amount, type, category, day) => ({ id, description, amount, type, category, date: `2026-10-${day}T12:00:00.000Z`, month: 10, year: 2026, archived: false })
const TXS = [
  tx('t1', 'Academia', 200, 'expense', 'fixed', '20'), tx('t2', 'Mercado', 240, 'expense', 'food', '20'), tx('t3', 'Combustível', 430, 'expense', 'transport', '19'),
  tx('t4', 'Roupa', 350, 'expense', 'shopping', '19'), tx('t5', 'Farmácia', 130, 'expense', 'health', '18'), tx('t6', 'Restaurante', 285, 'expense', 'food', '17'),
  tx('t7', 'Internet', 150, 'expense', 'fixed', '15'), tx('t8', 'Freelance design', 1800, 'income', 'income', '14'), tx('t9', 'Uber', 145, 'expense', 'transport', '13'),
  tx('t10', 'Conta de luz', 380, 'expense', 'fixed', '12'), tx('t11', 'Supermercado', 640, 'expense', 'food', '10'), tx('t12', 'Plano de saúde', 850, 'expense', 'fixed', '08'),
  tx('t13', 'Aluguel', 3500, 'expense', 'fixed', '05'), tx('t14', 'Dividendos', 15000, 'income', 'income', '05'),
]
const RECAP = { hasData: true, month: 10, year: 2026, saved: 9500, salary: 15000, totalIncome: 1800, totalExpenses: 7300, unpaidFixedCosts: 0 }

async function open(page, { list = TXS } = {}) {
  await page.addInitScript(() => { window.__nancySplashGone = false })
  await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
  await injectSession(page, U)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(U)))
  await page.route('**/api/transactions?**', r => r.fulfill(json({ data: list })))
  await page.route('**/api/transactions/monthly-recap**', r => r.fulfill(json(RECAP)))
  await page.goto('/transactions')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
  await expect(page.locator('.ndx-card')).toBeVisible()
}
const box = (page, sel, i = 0) => page.evaluate(([s, n]) => { const b = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, [sel, i])

test.describe('Extrato desktop — medidas e visual do design', () => {
  test('abas 46px a 101px do alto, cartão a 167px, pílula, busca de 260×46 e tabela com linhas de 65px', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndx-row')).toHaveCount(14)
    expect(await box(page, '.nds-tabs')).toMatchObject({ x: 312, y: 101, h: 46 })
    expect(await box(page, '.ndx-card')).toMatchObject({ x: 312, y: 167, w: 1096 })
    expect(await box(page, '.ndx-pill')).toMatchObject({ x: 335, y: 196, w: 70, h: 34 }) // 22 de respiro + 1 de borda
    expect(await box(page, '.ndx-search')).toMatchObject({ x: 1125, y: 190, w: 260, h: 46 })
    expect(await box(page, '.ndx-thead')).toMatchObject({ x: 335, w: 1050 })
    expect(await box(page, '.ndx-row', 0)).toMatchObject({ x: 335, y: 285, w: 1050, h: 65 })
    expect(await box(page, '.ndx-row', 13)).toMatchObject({ y: 285 + 13 * 65, h: 65 })
    const card = await box(page, '.ndx-card')
    expect(Math.round(card.h)).toBe(1051) // 14 linhas + cabeçalho + filtros (design: 1051)
  })

  test('colunas: descrição, categoria a 1fr, data de 90px e valor de 130px alinhado à direita', async ({ page }) => {
    await open(page)
    const cols = await page.evaluate(() => {
      const r = document.querySelector('.ndx-row-main')
      return [...r.children].map(c => { const b = c.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.width)] })
    })
    // 44 + 14 + 1,6fr + 14 + 1fr + 14 + 90 + 14 + 130 em 1050px
    expect(cols[0]).toEqual([335, 40]) // o ícone tem 40px dentro da coluna de 44
    expect(cols[3][1]).toBe(90)
    expect(cols[4][1]).toBe(130)
    expect(cols[4][0] + cols[4][1]).toBe(1385) // valor termina na borda interna do cartão
    const ico = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('.ndh-row-ico')); return [c.width, c.height, c.borderRadius, c.backgroundColor] })
    expect(ico).toEqual(['40px', '40px', '12px', 'rgb(238, 243, 255)'])
  })

  test('conteúdo igual ao design: linhas, sinais, cores e frase de busca vazia', async ({ page }) => {
    await open(page)
    const linha = (nome) => page.locator('.ndx-row', { hasText: nome })
    await expect(linha('Academia').locator('.ndh-row-cat')).toHaveText('Contas fixas')
    await expect(linha('Academia').locator('.ndh-row-date')).toHaveText('20/10')
    await expect(linha('Academia').locator('.ndh-row-amt')).toHaveText('− R$ 200,00')
    await expect(linha('Aluguel').locator('.ndh-row-amt')).toHaveText('− R$ 3.500,00')
    await expect(linha('Dividendos').locator('.ndh-row-amt')).toHaveText('+ R$ 15.000,00')
    expect(await linha('Dividendos').locator('.ndh-row-amt').evaluate(e => getComputedStyle(e).color)).toBe('rgb(8, 122, 82)')
    expect(await linha('Academia').locator('.ndh-row-amt').evaluate(e => getComputedStyle(e).color)).toBe('rgb(10, 19, 48)')
    await page.getByPlaceholder('Filtrar por descrição').fill('xyz')
    await expect(page.locator('.ndx-row')).toHaveCount(0)
    await expect(page.getByText('Nada encontrado com esse filtro.')).toBeVisible()
  })

  test('abas levam às telas do assunto e a aba da tela aberta fica azul', async ({ page }) => {
    await open(page)
    await expect(page.locator('.nds-tab.on')).toHaveText('Extrato')
    expect(await page.locator('.nds-tab.on').evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(21, 70, 255)')
    await page.getByRole('button', { name: 'Parceladas' }).click()
    await expect(page).toHaveURL(/\/parcelados$/)
  })

  test('pílulas, busca, edição e exclusão funcionam na tabela', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Entradas' }).click()
    await expect(page.locator('.ndx-row')).toHaveCount(2)
    await page.getByRole('button', { name: 'Todos' }).click()
    await page.getByPlaceholder('Filtrar por descrição').fill('rou')
    await expect(page.locator('.ndx-row')).toHaveCount(1)
    await page.locator('.ndx-row-main').click()
    await expect(page.getByRole('dialog', { name: 'Editar transação' })).toBeVisible()
    await page.keyboard.press('Escape')
    // remover aparece ao passar o mouse na linha, na margem do cartão (a tabela não muda)
    const linha = page.locator('.ndx-row').first()
    const del = linha.getByRole('button', { name: 'Remover transação' })
    await expect(del).toHaveCSS('opacity', '0')
    await linha.hover()
    await expect(del).toHaveCSS('opacity', '1') // aparece com uma transição curta
    const cardRight = (await box(page, '.ndx-card')).x + (await box(page, '.ndx-card')).w
    const d = await del.boundingBox()
    expect(d.x).toBeGreaterThanOrEqual(cardRight - 22) // dentro do respiro do cartão, depois da coluna de valor (1385)
    expect(d.x).toBeGreaterThan(1385)
    let apagou = null
    await page.route('**/api/transactions/t4', async r => { apagou = r.request().method(); await r.fulfill(json({})) })
    await del.click()
    await expect(page.getByRole('dialog', { name: /Remover transação/ })).toBeVisible()
    await page.getByRole('button', { name: /Sim, excluir/ }).click()
    await expect.poll(() => apagou).toBe('DELETE')
  })

  test('mês e resultado ficam ao lado das abas; voltar um mês busca o anterior e o botão do mês atual não avança', async ({ page }) => {
    await open(page)
    await expect(page.locator('.ndx-month-lbl')).toHaveText('Outubro')
    await expect(page.getByRole('button', { name: 'Próximo mês' })).toBeDisabled()
    await expect(page.locator('.ndx-sum-res')).toHaveText('+R$ 9.500,00')
    const meta = await box(page, '.ndx-meta'), tabs = await box(page, '.nds-tabs')
    expect(meta.x).toBeGreaterThan(tabs.x + tabs.w) // não invade as abas
    expect(Math.round(meta.x + meta.w)).toBe(1408) // alinhado à borda direita da página
    const pedido = page.waitForRequest(r => /\/api\/transactions\?/.test(r.url()) && /month=9/.test(r.url()))
    await page.getByRole('button', { name: 'Mês anterior' }).click()
    await pedido
    await expect(page.locator('.ndx-month-lbl')).toHaveText('Setembro')
  })

  test('Importar e Exportar CSV ficam abaixo do cartão, à direita', async ({ page }) => {
    await open(page)
    const card = await box(page, '.ndx-card'), acts = await box(page, '.ndx-actions')
    expect(acts.y).toBeGreaterThan(card.y + card.h)
    expect(Math.round(acts.x + acts.w)).toBe(1408)
    await expect(page.getByRole('button', { name: /Importar CSV/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Exportar CSV/ })).toBeEnabled()
  })

  test('busca da barra de cima leva ao Extrato já filtrado', async ({ page }) => {
    await open(page)
    await page.getByPlaceholder(/Buscar transações/).fill('merc')
    await page.keyboard.press('Enter')
    await expect(page.getByPlaceholder('Filtrar por descrição')).toHaveValue('merc')
    await expect(page.locator('.ndx-row')).toHaveCount(2) // Mercado e Supermercado
  })
})
