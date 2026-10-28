// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Stories prontos antes do toque. Os círculos do Início abrem resumo do mês, resumo do mês anterior, dicas e metas;
// o resumo faz o servidor calcular na hora (segundos) e a dica chama a IA. Antes a pessoa tocava e ficava olhando
// "Montando seu resumo…". Agora o Início, depois de carregar, busca tudo em segundo plano e o story abre pronto.
// O servidor é simulado com RESPOSTA LENTA (1,5 s) pra o teste enxergar a diferença.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const SLOW_MS = 1500

const DASH = {
  summary: { salary: 5000, totalIncome: 500, totalExpenses: 3000, currentBalance: 2500, totalAvailable: 5500, percentUsed: 54, unpaidBudgetIds: [] },
  transactions: [{ id: 't1', description: 'Mercado', type: 'expense', category: 'food', amount: 1230, date: '2026-10-05T12:00:00Z', month: 10, year: 2026, archived: false }],
  limits: [], budgets: [],
}
const RECAP = {
  hasData: true, month: 10, year: 2026, prevMonth: 9, saved: 100, totalIncome: 5000, totalExpenses: 120,
  topExpenses: [{ category: 'food', label: 'Alimentação', amount: 100 }], fixedTotal: 1, fixedPaid: 1,
  score: 72, scorePrev: 70, suggestedGoal: 1000, savedDeltaPct: 10, expensesDeltaPct: -5, fixedSharePct: 20,
  isBestOfYear: false, nextStep: null, belowAverage: null,
}
const GOALS = [{ id: 'g1', title: 'Viagem', targetAmount: 1000, currentAmount: 100, createdAt: '2026-10-01T12:00:00Z', deadline: null, color: '#3DE29F' }]

// Conta quantas vezes cada fonte dos stories foi chamada e quantas já responderam.
async function setup(page, { slowMs = SLOW_MS } = {}) {
  const calls = { recap: 0, recapDone: 0, goals: 0, tip: 0 }
  await page.clock.setFixedTime(new Date('2026-10-14T15:00:00Z'))
  await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(TEST_USER)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(DASH)))
  await page.route('**/api/transactions/weekly-tip-available**', r => r.fulfill(json({ available: true })))
  await page.route('**/api/transactions/monthly-recap**', async r => {
    calls.recap++
    await new Promise(res => setTimeout(res, slowMs))
    calls.recapDone++
    await r.fulfill(json(RECAP))
  })
  await page.route('**/api/goals**', async r => { if (r.request().method() === 'GET') calls.goals++; await r.fulfill(json(GOALS)) })
  await page.route('**/api/agent/weekly-tip**', async r => { calls.tip++; await r.fulfill(json({ tip: 'Reduza o mercado. Você gastou mais que o normal.', label: 'Alimentação', pct: 18 })) })
  return calls
}

test.describe('Stories prontos antes do toque', () => {
  test('com o Início carregado, o story do mês abre PRONTO: sem "Montando seu resumo…", primeiro slide na hora e sem nova chamada', async ({ page }) => {
    const calls = await setup(page)
    await page.goto('/dashboard')
    // o pré-carregamento acontece sozinho, em segundo plano: mês atual e mês anterior
    await expect.poll(() => calls.recapDone, { timeout: 25000 }).toBe(2)
    expect(calls.goals).toBeGreaterThanOrEqual(1)

    await page.locator('button.home-story-blue').click()
    await expect(page).toHaveURL(/\/resumo-stories$/)
    await expect(page.getByText('Resumo do mês')).toBeVisible({ timeout: 1000 }) // bem menos que os 1,5 s do servidor
    await expect(page.getByText('Montando seu resumo…')).toHaveCount(0)
    expect(calls.recap).toBe(2) // abrir não buscou de novo
  })

  test('o story do mês anterior também abre pronto', async ({ page }) => {
    const calls = await setup(page)
    await page.goto('/dashboard')
    await expect.poll(() => calls.recapDone, { timeout: 25000 }).toBe(2)
    await page.locator('button.home-story-navy').click()
    await expect(page.getByText('Você guardou')).toBeVisible({ timeout: 1000 })
    await expect(page.getByText('Montando seu resumo…')).toHaveCount(0)
    expect(calls.recap).toBe(2)
  })

  test('tocar ANTES de o pré-carregamento acabar mostra "Montando…" e termina com a MESMA chamada (uma por mês, não duas)', async ({ page }) => {
    // resposta bem lenta (7 s): o toque (que espera a splash de ~4 s sumir) cai no MEIO da busca do pré-carregamento
    const calls = await setup(page, { slowMs: 7000 })
    await page.goto('/dashboard')
    await page.locator('button.home-story-blue').click({ timeout: 30000 })
    await expect(page.getByText('Montando seu resumo…')).toBeVisible() // a busca ainda está no ar
    expect(calls.recapDone).toBe(0)
    await expect(page.getByText('Resumo do mês')).toBeVisible({ timeout: 20000 })
    await expect.poll(() => calls.recapDone, { timeout: 40000 }).toBe(2) // a leva do mês anterior termina depois
    expect(calls.recap).toBe(2) // mês atual: 1 (a do pré-carregamento e a do toque são a mesma) + mês anterior: 1
  })

  test('registrar uma transação descarta o guardado: o story seguinte abre com o número novo', async ({ page }) => {
    const calls = await setup(page)
    await page.goto('/dashboard')
    await expect.poll(() => calls.recapDone, { timeout: 25000 }).toBe(2)
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('budget-updated'))) // o aviso que todo ponto que muda dado dá
    // refaz sozinho em segundo plano (depois de ~2 s) — duas buscas novas
    await expect.poll(() => calls.recapDone, { timeout: 25000 }).toBe(4)
    await page.locator('button.home-story-blue').click()
    await expect(page.getByText('Resumo do mês')).toBeVisible({ timeout: 1000 })
    expect(calls.recap).toBe(4)
  })
})
