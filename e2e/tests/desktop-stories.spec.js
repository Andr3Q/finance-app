// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Resumo em stories no desktop (design "Nancy Desktop", tela 09, 1440×900): quatro conjuntos em cartões (4 colunas, vão de 14px) e o
// visualizador de 560px com barras, cabeçalho, pausa e o texto grande. Relógio fixo em 20/out/2026 22h.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 900 } })

const json = (o) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }
const RECAP = (o = {}) => ({ hasData: true, month: 10, year: 2026, prevMonth: 9, saved: 9500, totalIncome: 10800, totalExpenses: 7300, topExpenses: [{ category: 'fixed', label: 'Aluguel', amount: 3500 }, { category: 'food', label: 'Alimentação', amount: 1165 }], fixedTotal: 6, fixedPaid: 6, score: 79, scorePrev: 75, suggestedGoal: 2000, savedDeltaPct: 32, expensesDeltaPct: -3, fixedSharePct: 70, isBestOfYear: true, nextStep: null, belowAverage: null, ...o })
const GOALS = [{ id: 'g1', title: 'Reserva', targetAmount: 30000, currentAmount: 18400, createdAt: '2026-01-01T12:00:00Z' }]

async function open(page, state = '/resumo-stories') {
  // os testes tratam a abertura como terminada (helpers/test.js); aqui o carrossel precisa ver a abertura de verdade para só começar depois dela
  await page.addInitScript(() => { window.__nancySplashGone = false })
  await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
  await injectSession(page, U)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(U)))
  await page.route('**/api/transactions/stories-bundle**', r => r.fulfill(json({ userId: U.id, resumo: [RECAP(), RECAP({ month: 9, prevMonth: 8, saved: 7160 })], metas: GOALS })))
  await page.route('**/api/transactions/weekly-tip-available**', r => r.fulfill(json({ available: false })))
  await page.goto(state)
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
  await expect(page.locator('.ndsv-viewer')).toBeVisible()
}
// o texto entra com uma subida de 8px (nzIn): medir só depois dela (a barra de tempo fica de fora, pode estar pausada)
const assentar = (page) => page.evaluate(() => Promise.all(document.getAnimations().filter(a => !a.effect?.target?.classList?.contains('ndsv-fill')).map(a => a.finished)))
const box = (page, sel, i = 0) => page.evaluate(([s, n]) => { const b = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, [sel, i])
// volta ao primeiro slide e põe o mouse sobre o cartão: a barra fica parada e nada avança sozinho durante a medida
const parar = async (page) => {
  await page.locator('.ndsv-bar').first().click()
  await page.locator('.ndsv-viewer').hover({ position: { x: 500, y: 300 } })
}

test.describe('Resumo em stories desktop — medidas e visual do design', () => {
  test('cartões em 4 colunas (263,5 × 96, vão de 14) e visualizador de 560px a 312px do menu', async ({ page }) => {
    await open(page)
    expect(await box(page, '.ndsv-sets')).toMatchObject({ x: 312, w: 1096, h: 96 })
    const xs = []
    for (let i = 0; i < 4; i++) xs.push((await box(page, '.ndsv-set', i)).x)
    expect(xs).toEqual([312, 589.5, 867, 1144.5]) // 263,5 + 14 de vão
    expect(await box(page, '.ndsv-set-ico')).toMatchObject({ x: 336, w: 48, h: 48 }) // 22 de respiro + 2 de borda
    expect(await box(page, '.ndsv-viewer')).toMatchObject({ x: 312, w: 1096, h: 560 })
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ndsv-viewer')).borderTopLeftRadius)).toBe('28px')
    expect(await box(page, '.ndsv-bar')).toMatchObject({ x: 348, h: 5 })
    expect(await box(page, '.ndsv-pause')).toMatchObject({ x: 1328, w: 44, h: 44 })
  })

  test('cartão do resumo selecionado com borda azul, contagens reais e abertura "Seu mês em 6 histórias."', async ({ page }) => {
    await open(page)
    const sets = page.locator('.ndsv-set')
    await expect(sets.nth(0)).toHaveAttribute('aria-pressed', 'true')
    await expect(sets.nth(0)).toContainText('Resumo de outubro')
    await expect(sets.nth(0)).toContainText('6 histórias')
    await expect(sets.nth(1)).toContainText('Dicas IA')
    await expect(sets.nth(2)).toContainText('1 história')
    await expect(sets.nth(2)).toContainText('61%') // média das metas: 18.400 de 30.000
    await expect(sets.nth(3)).toContainText('Setembro')
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ndsv-set.sel')).borderTopColor)).toBe('rgb(21, 70, 255)')
    await parar(page)
    await expect(page.locator('.ndsv-kicker')).toHaveText('RESUMO DE OUTUBRO')
    await expect(page.locator('.ndsv-title')).toHaveText('Seu mês em 6 histórias.')
    await expect(page.locator('.ndsv-sub')).toHaveText('Passe o mouse para pausar · clique para avançar')
    expect(await page.evaluate(() => { const e = document.querySelector('.ndsv-title'); const c = getComputedStyle(e); return [c.fontSize, c.fontWeight, c.letterSpacing] })).toEqual(['72px', '800', '-3.6px'])
  })

  test('clique no cartão avança; valor redondo sem centavos; o texto fica 60px da borda e 60px do fundo', async ({ page }) => {
    await open(page)
    await parar(page)
    await page.locator('.ndsv-hit').click({ position: { x: 500, y: 300 } })
    await expect(page.locator('.ndsv-kicker')).toHaveText('VOCÊ GUARDOU')
    await expect(page.locator('.ndsv-title')).toHaveText('Seu melhor mês do ano.')
    await expect(page.locator('.ndsv-value')).toHaveText('R$ 9.500')
    await expect(page.locator('.ndsv-sub')).toHaveText('32% a mais que setembro. Continue assim!')
    await assentar(page)
    const v = await box(page, '.ndsv-viewer'), t = await box(page, '.ndsv-title'), s = await box(page, '.ndsv-sub')
    expect(Math.round(t.x - v.x)).toBe(60)
    expect(Math.round(v.y + v.h - (s.y + s.h))).toBe(60) // o texto termina a 60px do fundo
    expect(await page.locator('.ndsv-fill.done').count()).toBe(1)
  })

  test('mouse pausa a barra e o ícone vira "tocar"; ao sair a barra segue; seta direita avança', async ({ page }) => {
    await open(page)
    await page.locator('.ndsv-viewer').hover({ position: { x: 500, y: 300 } })
    const estado = () => page.evaluate(() => getComputedStyle(document.querySelector('.ndsv-fill.cur')).animationPlayState)
    expect(await estado()).toBe('paused')
    await expect(page.locator('.ndsv-pause svg rect')).toHaveCount(0)
    await page.mouse.move(5, 5)
    expect(await estado()).toBe('running')
    await expect(page.locator('.ndsv-pause svg rect')).toHaveCount(2)
    await page.locator('.ndsv-viewer').hover({ position: { x: 500, y: 300 } }) // parado de novo: nada avança sozinho
    await page.locator('.ndsv-bar').first().click()
    await expect(page.locator('.ndsv-title')).toHaveText('Seu mês em 6 histórias.')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('.ndsv-title')).toHaveText('Seu melhor mês do ano.')
    await page.keyboard.press('ArrowLeft')
    await expect(page.locator('.ndsv-title')).toHaveText('Seu mês em 6 histórias.')
  })

  test('trocar de conjunto: Setembro e Metas mostram o conteúdo deles, com o nome no cabeçalho', async ({ page }) => {
    await open(page)
    await page.locator('.ndsv-set').nth(3).click()
    await expect(page.locator('.ndsv-set.sel')).toContainText('Setembro')
    await expect(page.locator('.ndsv-head-name')).toHaveText('Setembro') // o cabeçalho leva o nome do cartão, como no design
    await page.locator('.ndsv-viewer').hover({ position: { x: 500, y: 300 } })
    await page.locator('.ndsv-bar').first().click()
    await expect(page.locator('.ndsv-title')).toHaveText('Setembro fechou no azul.')
    await page.locator('.ndsv-set').nth(2).click()
    await expect(page.locator('.ndsv-set.sel')).toContainText('Metas')
    await expect(page.locator('.ndsv-head-name')).toHaveText('Metas')
    await expect(page.locator('.ndsv-bar')).toHaveCount(1)
  })

  test('no último slide, Criar meta e Compartilhar ficam clicáveis por cima do cartão', async ({ page }) => {
    await open(page)
    await page.locator('.ndsv-viewer').hover({ position: { x: 500, y: 100 } })
    await page.locator('.ndsv-bar').nth(5).click()
    await expect(page.locator('.ndsv-kicker')).toHaveText('META DE NOVEMBRO')
    const criar = page.getByRole('button', { name: 'Criar meta de novembro' })
    await expect(criar).toBeVisible()
    await expect(page.getByRole('button', { name: 'Compartilhar resumo' })).toBeVisible()
    let corpo = null
    await page.route('**/api/goals', async r => { if (r.request().method() === 'POST') { corpo = r.request().postDataJSON(); await r.fulfill(json({ id: 'g9', ...corpo })) } else await r.fulfill(json(GOALS)) })
    await criar.click()
    await expect(page).toHaveURL(/\/goals$/)
    expect(corpo).toMatchObject({ title: 'Meta de novembro', targetAmount: 2000 })
  })
})
