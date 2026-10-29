// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Stories prontos antes do toque. Os círculos do Início abrem resumo do mês, resumo do mês anterior, dicas e metas. O banco atende
// uma consulta por vez (~0,6 s cada) e as rotas antigas somavam ~12: a pessoa tocava e ficava olhando "Montando seu resumo…".
// Agora o app pede UM pacote (resumo do mês + mês anterior + metas, 1 ida ao banco) logo na abertura, durante a splash, e o story
// abre pronto. O servidor é simulado com RESPOSTA LENTA (1,5 s) pra o teste enxergar a diferença.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const SLOW_MS = 1500

const DASH = {
  summary: { salary: 5000, totalIncome: 500, totalExpenses: 3000, currentBalance: 2500, totalAvailable: 5500, percentUsed: 54, unpaidBudgetIds: [] },
  transactions: [{ id: 't1', description: 'Mercado', type: 'expense', category: 'food', amount: 1230, date: '2026-10-05T12:00:00Z', month: 10, year: 2026, archived: false }],
  limits: [], budgets: [],
}
const RECAP = (over = {}) => ({
  hasData: true, month: 10, year: 2026, prevMonth: 9, saved: 100, totalIncome: 5000, totalExpenses: 120,
  topExpenses: [{ category: 'food', label: 'Alimentação', amount: 100 }], fixedTotal: 1, fixedPaid: 1,
  score: 72, scorePrev: 70, suggestedGoal: 1000, savedDeltaPct: 10, expensesDeltaPct: -5, fixedSharePct: 20,
  isBestOfYear: false, nextStep: null, belowAverage: null, ...over,
})
const GOALS = [{ id: 'g1', title: 'Viagem', targetAmount: 1000, currentAmount: 100, createdAt: '2026-10-01T12:00:00Z', deadline: null, color: '#3DE29F', userId: TEST_USER.id }]
const bundle = (over = {}) => ({ userId: TEST_USER.id, resumo: [RECAP(over), RECAP({ month: 9, ...over })], metas: GOALS })

// Conta as chamadas de cada fonte dos stories (e a ordem em que o app as faz) e quantas já responderam.
async function setup(page, { slowMs = SLOW_MS, bundleReply = () => bundle(), bundleStatus = 200 } = {}) {
  const calls = { bundle: 0, bundleDone: 0, recap: 0, goals: 0, tip: 0, order: [] }
  await page.clock.setFixedTime(new Date('2026-10-14T15:00:00Z'))
  await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => { calls.order.push('me'); return r.fulfill(json(TEST_USER)) })
  await page.route('**/api/transactions/dashboard**', r => { calls.order.push('dashboard'); return r.fulfill(json(DASH)) })
  await page.route('**/api/transactions/weekly-tip-available**', r => r.fulfill(json({ available: true })))
  await page.route('**/api/transactions/stories-bundle**', async r => {
    calls.bundle++; calls.order.push('bundle')
    await new Promise(res => setTimeout(res, slowMs))
    calls.bundleDone++
    await r.fulfill(bundleStatus === 200 ? json(bundleReply(calls.bundle)) : json({ error: 'x' }, bundleStatus))
  })
  // rotas antigas: só a reserva (se o pacote falhar). Com o pacote funcionando NENHUMA delas pode ser chamada.
  await page.route('**/api/transactions/monthly-recap**', async r => {
    calls.recap++
    await new Promise(res => setTimeout(res, slowMs))
    await r.fulfill(json(RECAP()))
  })
  await page.route('**/api/goals**', async r => { if (r.request().method() === 'GET') calls.goals++; await r.fulfill(json(GOALS)) })
  await page.route('**/api/agent/weekly-tip**', async r => { calls.tip++; await r.fulfill(json({ tip: 'Reduza o mercado. Você gastou mais que o normal.', label: 'Alimentação', pct: 18 })) })
  return calls
}

test.describe('Stories prontos antes do toque', () => {
  test('o pedido dos stories sai NA ABERTURA do app, antes de o Início existir (durante a splash)', async ({ page }) => {
    const calls = await setup(page)
    await page.goto('/dashboard')
    await expect.poll(() => calls.order.length, { timeout: 25000 }).toBeGreaterThanOrEqual(3)
    expect(calls.order[0]).toBe('bundle') // antes até da validação do login e do painel do Início
  })

  test('com o Início carregado, o story do mês abre PRONTO: sem "Montando seu resumo…", primeiro slide na hora e UMA chamada para tudo', async ({ page }) => {
    const calls = await setup(page)
    await page.goto('/dashboard')
    await expect.poll(() => calls.bundleDone, { timeout: 25000 }).toBe(1)

    await page.locator('button.home-story-blue').click()
    await expect(page).toHaveURL(/\/resumo-stories$/)
    await expect(page.getByText('Resumo do mês')).toBeVisible({ timeout: 1000 }) // bem menos que os 1,5 s do servidor
    await expect(page.getByText('Montando seu resumo…')).toHaveCount(0)
    // um pacote só serviu os 2 resumos e as metas: as rotas antigas nem foram chamadas
    expect(calls.bundle).toBe(1)
    expect(calls.recap).toBe(0)
    expect(calls.goals).toBe(0)
  })

  test('o story do mês anterior e o das metas também abrem prontos, sem nova chamada', async ({ page }) => {
    const calls = await setup(page)
    await page.goto('/dashboard')
    await expect.poll(() => calls.bundleDone, { timeout: 25000 }).toBe(1)

    await page.locator('button.home-story-navy').click()
    await expect(page.getByText('Você guardou')).toBeVisible({ timeout: 1000 })
    await expect(page.getByText('Montando seu resumo…')).toHaveCount(0)
    await page.getByRole('button', { name: 'Fechar' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.locator('button.home-story-ring').click()
    await expect(page.getByText('Suas metas').first()).toBeVisible({ timeout: 1000 })
    await expect(page.getByText('Montando seu resumo…')).toHaveCount(0)
    expect(calls.bundle).toBe(1)
  })

  test('tocar ANTES de o pacote chegar mostra "Montando…" e termina com a MESMA chamada (uma só)', async ({ page }) => {
    // resposta bem lenta (7 s): o toque (que espera a splash de ~4 s sumir) cai no MEIO da busca
    const calls = await setup(page, { slowMs: 7000 })
    await page.goto('/dashboard')
    await page.locator('button.home-story-blue').click({ timeout: 30000 })
    await expect(page.getByText('Montando seu resumo…')).toBeVisible() // a busca ainda está no ar
    expect(calls.bundleDone).toBe(0)
    await expect(page.getByText('Resumo do mês')).toBeVisible({ timeout: 20000 })
    expect(calls.bundle).toBe(1) // o Início, o círculo e o toque usaram a mesma chamada
    expect(calls.recap).toBe(0)
  })

  test('registrar uma transação descarta o guardado: refaz o pacote e o story seguinte abre com o número novo', async ({ page }) => {
    const calls = await setup(page, { bundleReply: (n) => bundle(n === 1 ? { saved: 100 } : { saved: 777 }) })
    await page.goto('/dashboard')
    await expect.poll(() => calls.bundleDone, { timeout: 25000 }).toBe(1)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('budget-updated'))) // o aviso que todo ponto que muda dado dá
    await expect.poll(() => calls.bundleDone, { timeout: 25000 }).toBe(2) // refaz sozinho em segundo plano (~2 s depois)

    await page.locator('button.home-story-blue').click()
    await expect(page.getByText('Resumo do mês')).toBeVisible({ timeout: 1000 })
    await page.getByRole('button', { name: 'Avançar' }).click()
    await expect(page.getByText(/777/)).toBeVisible()  // o número NOVO, não o velho
    expect(calls.bundle).toBe(2)
    expect(calls.recap).toBe(0)
  })

  test('se o pacote falhar (500), os stories ainda abrem pelas rotas antigas', async ({ page }) => {
    const calls = await setup(page, { bundleStatus: 500, slowMs: 300 })
    await page.goto('/dashboard')
    await expect.poll(() => calls.recap, { timeout: 25000 }).toBeGreaterThanOrEqual(1)
    await page.locator('button.home-story-blue').click()
    await expect(page.getByText('Resumo do mês')).toBeVisible({ timeout: 20000 })
    expect(calls.goals).toBeGreaterThanOrEqual(1)
  })
})

test.describe('Stories leves: a barra anda por CSS, sem trabalho por quadro', () => {
  test('a barra de progresso é uma animação de transform (sem largura calculada em JS) e o slide avança sozinho em ~5 s', async ({ page }) => {
    const calls = await setup(page, { slowMs: 200 })
    await page.goto('/dashboard')
    await expect.poll(() => calls.bundleDone, { timeout: 25000 }).toBe(1)
    await page.locator('button.home-story-blue').click()
    await expect(page.getByText('Resumo do mês')).toBeVisible({ timeout: 2000 })

    const info = await page.evaluate(() => {
      const fill = document.querySelector('.stories-progress-fill.is-active')
      const cs = getComputedStyle(fill)
      return { inlineStyle: fill.getAttribute('style'), animation: cs.animationName, duration: cs.animationDuration, running: fill.getAnimations().length === 1 }
    })
    expect(info.inlineStyle).toBeNull()
    expect(info.animation).toBe('storiesFill')
    expect(info.duration).toBe('5s')
    expect(info.running).toBe(true)
    // sem nenhum slide "se mexendo" por JS: depois de ~5 s o segundo slide fica ativo (o 1º vira "feito")
    await expect(page.locator('.stories-progress-fill').nth(1)).toHaveClass(/is-active/, { timeout: 9000 })
    await expect(page.locator('.stories-progress-fill').first()).toHaveClass(/is-done/)
  })

  test('pausar para a animação (play-state: paused) e retomar a continua', async ({ page }) => {
    const calls = await setup(page, { slowMs: 200 })
    await page.goto('/dashboard')
    await expect.poll(() => calls.bundleDone, { timeout: 25000 }).toBe(1)
    await page.locator('button.home-story-blue').click()
    await expect(page.getByText('Resumo do mês')).toBeVisible({ timeout: 2000 })
    const state = () => page.evaluate(() => getComputedStyle(document.querySelector('.stories-progress-fill.is-active')).animationPlayState)
    await page.getByRole('button', { name: 'Pausar' }).click()
    expect(await state()).toBe('paused')
    await page.getByRole('button', { name: 'Retomar' }).click()
    expect(await state()).toBe('running')
  })
})
