// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Dados de mock — completos para o contrato atual da API
// ─────────────────────────────────────────────────────────────────
const mockUser = {
  id: 'user-test-01', name: 'QA Tester', email: 'qa@test.com',
  plan: 'free', salary: 5000, emailVerified: true,
  twoFactorEnabled: false, onboardingComplete: true,
  autoLaunchMonth: 6, autoLaunchYear: 2026,
  planExpiresAt: null, trialEndsAt: null,
  referralCode: 'ABCD1234',
  notifBudgetAlert: true, notifBudgetReminder: true,
}

// 7 transações — "Últimas" mostra só as 5 mais recentes (slice(0,5))
const mockTxList = [
  { id: 't1', description: 'Aluguel',     amount: 2000, type: 'expense', category: 'housing',  date: '2026-06-05T10:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't2', description: 'Academia',    amount:   90, type: 'expense', category: 'health',   date: '2026-06-05T11:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't3', description: 'Supermercado',amount:  450, type: 'expense', category: 'food',     date: '2026-06-04T12:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't4', description: 'Internet',    amount:  120, type: 'expense', category: 'utilities',date: '2026-06-03T08:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't5', description: 'Freelance',   amount: 1500, type: 'income',  category: 'freelance',date: '2026-06-02T14:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't6', description: 'Luz',         amount:  180, type: 'expense', category: 'utilities',date: '2026-06-01T10:00:00Z', month: 6, year: 2026, archived: false },
  { id: 't7', description: 'Salário',     amount: 5000, type: 'income',  category: 'salary',   date: '2026-06-01T09:00:00Z', month: 6, year: 2026, archived: false },
]

// Resposta do /api/transactions/dashboard — mesmo shape que o backend real
// envia (backend/src/routes/transactions.js) — score/saúde financeira são
// computados no client a partir destes campos, não vêm prontos do backend.
const mockDashboard = {
  summary: {
    salary: 5000, totalIncome: 1500, totalFixedCosts: 2000, unpaidFixedCosts: 0,
    unpaidBudgetIds: [], totalExpenses: 2840, totalAvailable: 6500,
    currentBalance: 3660, percentUsed: 44,
  },
  transactions: mockTxList,
  limits: [],
  budgets: [{ id: 'b1', name: 'Aluguel', amount: 2000, dueDay: 1 }],
}

// ─────────────────────────────────────────────────────────────────
// Helper isolado por page — sem leak entre workers paralelos
// LIFO correto: wildcard registrado ANTES dos específicos
// ─────────────────────────────────────────────────────────────────
async function goDashboard(page) {
  // 1. Wildcard com menor prioridade (LIFO: registrado primeiro = verificado por último)
  await page.route('**/api/**', r => {
    if (r.request().method() === 'GET')
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  // 2. Rotas específicas (maior prioridade — sobrepõem o wildcard)
  await page.route('**/api/auth/me**',            r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) }))
  await page.route('**/api/transactions**',        r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockTxList) }))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDashboard) }))
  await page.route('**/api/budget**',              r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDashboard.budgets) }))
  await page.route('**/api/budget/category-limits**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/goals**',               r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/transactions/weekly-tip-available**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true }) })) // há base pra dica: o anel do story aparece
  await page.route('**/api/installments**',        r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/agent/predict**',       r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ prediction: 'Sem dados suficientes.' }) }))
  await page.route('**/health**',                  r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok', db_ms: 5 }) }))
  await page.route('**/api/auth/login**',          r => {
    if (r.request().method() !== 'POST') return r.continue()
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'mock-jwt', user: mockUser }) })
  })

  await page.goto('/login')
  await page.fill('input[type=email]',    'qa@test.com')
  await page.fill('input[type=password]', 'Qa123456!')
  await page.click('button[type=submit]')
  await page.waitForURL(/\/(dashboard)?$/, { timeout: 8000 })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(500) // React async render
}

// ─────────────────────────────────────────────────────────────────
// 1. RESPONSIVIDADE — sem scroll horizontal em 375px
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Responsividade Mobile (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('não possui scroll horizontal na tela de 375px', async ({ page }) => {
    await goDashboard(page)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  })

  test('container .pwnav não cria overflow horizontal', async ({ page }) => {
    await goDashboard(page)
    const overflow = await page.evaluate(() => {
      const el = document.querySelector('.pwnav')
      if (!el) return null
      const style = window.getComputedStyle(el)
      return { overflowX: style.overflowX, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })
    expect(overflow).not.toBeNull()
    expect(overflow.overflowX).toBe('hidden')
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
  })

  test('.home-recent não ultrapassa a borda da tela', async ({ page }) => {
    await goDashboard(page)
    const cardRight = await page.evaluate(() => {
      const card = document.querySelector('.home-recent')
      if (!card) return null
      return card.getBoundingClientRect().right
    })
    expect(cardRight).not.toBeNull()
    expect(cardRight).toBeLessThanOrEqual(375 + 1)
  })
})

// ─────────────────────────────────────────────────────────────────
// 2. CABEÇALHO — saldo e ações rápidas (Nancy 2, tela 08)
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Início: cabeçalho e ações rápidas', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('saldo disponível visível com o valor do resumo', async ({ page }) => {
    await goDashboard(page)
    await expect(page.locator('.home-balance-lbl')).toContainText('Saldo disponível')
    await expect(page.locator('.home-balance-val')).toContainText('3.660')
  })

  test('4 ações rápidas visíveis (Adicionar, Extrato, Metas, Nancy IA)', async ({ page }) => {
    await goDashboard(page)
    const actions = page.locator('.home-qa-btn')
    await expect(actions).toHaveCount(4)
    await expect(actions.nth(0)).toContainText('Adicionar')
    await expect(actions.nth(1)).toContainText('Extrato')
    await expect(actions.nth(2)).toContainText('Metas')
    await expect(actions.nth(3)).toContainText('Nancy IA')
  })

  test('botão "Adicionar" abre o formulário de nova transação', async ({ page }) => {
    await goDashboard(page)
    await page.locator('.home-qa-btn', { hasText: 'Adicionar' }).click()
    await expect(page.locator('.modal-overlay.movl')).toBeVisible({ timeout: 5000 })
  })

  test('ocultar/mostrar saldo mascara os valores sensíveis', async ({ page }) => {
    await goDashboard(page)
    const balance = page.locator('.home-balance-val')
    await expect(balance).toContainText('3.660')

    await page.locator('.home-iconbtn[aria-label="Ocultar valores"]').click()
    await expect(balance).toContainText('••')
    await expect(balance).not.toContainText('3.660')

    await page.locator('.home-iconbtn[aria-label="Mostrar valores"]').click()
    await expect(balance).toContainText('3.660')
  })
})

// ─────────────────────────────────────────────────────────────────
// 3. RESUMOS, SAÚDE FINANCEIRA E ESTATÍSTICAS
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Resumos, saúde financeira e estatísticas', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('4 círculos de resumo visíveis', async ({ page }) => {
    await goDashboard(page)
    await expect(page.locator('.home-story')).toHaveCount(4)
  })

  test('card de saúde financeira mostra uma pontuação de 0 a 100', async ({ page }) => {
    await goDashboard(page)
    const scoreText = await page.locator('.home-health-score').textContent()
    const score = parseInt(scoreText, 10)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
    await expect(page.locator('.home-health-title')).toContainText('Saúde financeira')
  })

  test('3 estatísticas visíveis (Entradas, Saídas, Contas fixas)', async ({ page }) => {
    await goDashboard(page)
    const stats = page.locator('.home-stat')
    await expect(stats).toHaveCount(3)
    await expect(stats.nth(0)).toContainText('Entradas')
    await expect(stats.nth(1)).toContainText('Saídas')
    await expect(stats.nth(2)).toContainText('Contas fixas')
  })
})

// ─────────────────────────────────────────────────────────────────
// Stories — os 4 círculos de "Resumos" abrem a tela 09 (cada um um fluxo)
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Stories (círculos de resumo)', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  const mockRecap = {
    month: 10, year: 2026, hasData: true, saved: 9500, savedDeltaPct: 32, prevMonth: 9, isBestOfYear: true,
    belowAverage: { category: 'transport', label: 'Transporte', pct: 12 },
    topExpenses: [{ category: 'fixed', label: 'Contas fixas', amount: 5080 }, { category: 'food', label: 'Alimentação', amount: 1165 }],
    totalExpenses: 6245, fixedSharePct: 81, fixedPaid: 9, fixedTotal: 9, expensesDeltaPct: null,
    score: 82, scorePrev: 76, scoreNext: null, nextStep: null, suggestedGoal: 10000,
  }

  async function mockStories(page) {
    await page.route('**/api/transactions/monthly-recap**', r => r.fulfill(json(mockRecap)))
    await page.route('**/api/agent/weekly-tip**', r => r.fulfill(json({
      category: 'food', label: 'Alimentação', pct: 18, excess: 90, source: 'rule',
      tip: 'Voltar à sua média em alimentação poupa cerca de R$ 90 por mês.',
    })))
    await page.route('**/api/transactions/subscriptions**', r => r.fulfill(json([
      { description: 'Netflix', amount: 55.9 }, { description: 'Spotify', amount: 21.9 }, { description: 'Academia', amount: 41.2 },
    ])))
    await page.route('**/api/goals**', r => r.fulfill(json([
      { id: 'g1', title: 'Reserva de emergência', targetAmount: 29500, currentAmount: 17900, createdAt: '2026-01-01T12:00:00Z', deadline: null },
    ])))
    // O Início já pré-carregou os stories com as respostas genéricas do goDashboard (estes mocks ainda não existiam). Avisa que os dados
    // mudaram — o mesmo 'budget-updated' que todo ponto do app dispara — pra o guardado ser descartado e os stories usarem estes mocks.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('budget-updated')))
  }

  test('círculo do mês atual abre o resumo completo (6 histórias)', async ({ page }) => {
    await goDashboard(page)
    await mockStories(page)
    await page.locator('button.home-story-blue').click()
    await expect(page).toHaveURL(/\/resumo-stories$/)
    await expect(page.getByText('Resumo de outubro')).toBeVisible()
    await expect(page.locator('.stories-progress-track')).toHaveCount(6)
  })

  // Achado do André (iPhone): tocar nos stories deixava uma "sombra" cinza do sistema sobre 40% da tela (as zonas de avançar/voltar).
  test('as zonas de toque dos stories não deixam o destaque cinza do iOS', async ({ page }) => {
    await goDashboard(page)
    await mockStories(page)
    await page.locator('button.home-story-blue').click()
    await expect(page.getByText('Resumo de outubro')).toBeVisible()
    for (const sel of ['.stories-tap-left', '.stories-tap-right', '.stories-iconbtn']) {
      const cor = await page.locator(sel).first().evaluate(el => getComputedStyle(el).webkitTapHighlightColor)
      expect(cor, sel).toBe('rgba(0, 0, 0, 0)')
    }
  })

  test('círculo do mês anterior abre a versão curta (2 histórias)', async ({ page }) => {
    await goDashboard(page)
    await mockStories(page)
    await page.locator('button.home-story-navy').click()
    await expect(page.getByText('Você guardou')).toBeVisible()
    await expect(page.locator('.stories-progress-track')).toHaveCount(2)
  })

  test('Dicas IA abre a dica da semana e as assinaturas', async ({ page }) => {
    await goDashboard(page)
    await mockStories(page)
    await page.locator('button.home-story-light').click()
    await expect(page.getByText('Alimentação está 18% acima da média.')).toBeVisible()
    await expect(page.getByText('Dicas da Nancy')).toBeVisible()
    await page.getByRole('button', { name: 'Avançar' }).click()
    await expect(page.getByText('3 assinaturas somam R$ 119/mês.')).toBeVisible()
  })

  test('"Revisar com a Nancy" volta pro Início e abre o chat (que fica sob as stories)', async ({ page }) => {
    await goDashboard(page)
    await mockStories(page)
    await page.locator('button.home-story-light').click()
    await page.getByRole('button', { name: 'Avançar' }).click()
    await page.evaluate(() => window.addEventListener('nancy:open-agent-chat', e => { window.__asked = e.detail?.message }))
    await page.getByRole('button', { name: 'Revisar com a Nancy' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.locator('.agent-panel')).toBeVisible()
    // achado N2-2: o botão prometia uma revisão e o chat abria vazio — agora leva a pergunta pronta
    await expect.poll(() => page.evaluate(() => window.__asked)).toBe('Quais das minhas assinaturas vale a pena revisar ou cancelar?')
  })

  // Achado da revisão independente: "Tentar de novo" ficava dentro de .stories-content (pointer-events: none): o toque caía na zona de
  // "avançar", que fecha o story sem histórias. O teste unitário não vê isso (jsdom não carrega o CSS): só um clique de verdade.
  test('story com erro: "Tentar de novo" recebe o toque (não fecha o story) e refaz a busca', async ({ page }) => {
    await goDashboard(page)
    let falhar = true
    const foraDoAr = { status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'fora do ar' }) } // (o json() daqui é sempre 200)
    await page.route('**/api/transactions/stories-bundle**', r => r.fulfill(foraDoAr))
    await page.route('**/api/transactions/monthly-recap**', r => (falhar ? r.fulfill(foraDoAr) : r.fulfill(json(mockRecap))))
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('budget-updated'))) // descarta o que o Início já tinha pré-carregado
    await page.locator('button.home-story-blue').click()
    await expect(page.getByText('Não foi possível carregar o resumo.')).toBeVisible()
    falhar = false
    await page.getByRole('button', { name: 'Tentar de novo' }).click({ timeout: 5000 }) // o clique falha se outra camada cobrir o botão
    await expect(page).toHaveURL(/\/resumo-stories$/)            // não fechou o story
    await expect(page.getByText('Resumo de outubro')).toBeVisible()
    await expect(page.locator('.stories-progress-track')).toHaveCount(6)
  })

  test('Metas abre a meta mais relevante com quanto falta', async ({ page }) => {
    await goDashboard(page)
    await mockStories(page)
    await page.locator('button.home-story-ring').click()
    await expect(page.getByText('Suas metas')).toBeVisible()
    await expect(page.getByText('Faltam 39%.')).toBeVisible()
    await expect(page.getByText('R$ 11.600')).toBeVisible()
    await expect(page.locator('.stories-progress-track')).toHaveCount(1)
  })

  test('story aberta apaga o anel do círculo (e só o dela)', async ({ page }) => {
    await goDashboard(page)
    await mockStories(page)
    // nenhuma aberta ainda: os 4 círculos com anel
    await expect(page.locator('.home-story.is-seen')).toHaveCount(0)
    await page.locator('button.home-story-blue').click()
    await expect(page.locator('.stories-progress-track')).toHaveCount(6)
    await page.getByRole('button', { name: 'Fechar' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.locator('button.home-story-blue')).toHaveClass(/is-seen/)
    await expect(page.locator('.home-story.is-seen')).toHaveCount(1)
  })

  test('sem base pra dica da semana, o círculo "Dicas IA" fica sem anel (não anuncia algo que não existe)', async ({ page }) => {
    await goDashboard(page)
    await page.route('**/api/transactions/weekly-tip-available**', r => r.fulfill(json({ available: false })))
    await page.reload()
    await expect(page.locator('.home-story')).toHaveCount(4, { timeout: 20000 })
    await expect(page.locator('button.home-story-light')).toHaveClass(/is-seen/)
    await expect(page.locator('button.home-story-blue')).not.toHaveClass(/is-seen/) // os outros continuam com anel
  })

  test('story vazia ou com erro não conta como vista', async ({ page }) => {
    await goDashboard(page)
    await mockStories(page)
    await page.route('**/api/goals**', r => r.fulfill(json([])))   // sem metas → story vazia
    await page.locator('button.home-story-ring').click()
    await expect(page.getByText('Nenhuma meta em andamento.')).toBeVisible()
    await page.getByRole('button', { name: 'Fechar' }).click()
    await expect(page.locator('.home-story.is-seen')).toHaveCount(0)
  })

  test('fechar volta pro Início', async ({ page }) => {
    await goDashboard(page)
    await mockStories(page)
    await page.locator('button.home-story-ring').click()
    await page.getByRole('button', { name: 'Fechar' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})

// ─────────────────────────────────────────────────────────────────
// 4. ÚLTIMAS — lista de transações recentes
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Últimas transações', () => {

  test('mostra no máximo as 5 transações mais recentes', async ({ page }) => {
    await goDashboard(page)
    const rows = page.locator('.home-recent-row')
    await expect(rows.first()).toBeVisible({ timeout: 8000 })
    const count = await rows.count()
    expect(count).toBeLessThanOrEqual(5)
    expect(count).toBeGreaterThan(0)
  })

  test('"Ver extrato" navega para /transactions', async ({ page }) => {
    await goDashboard(page)
    await page.locator('.home-recent-link', { hasText: 'Ver extrato' }).click()
    await page.waitForURL(/\/transactions/, { timeout: 5000 })
  })

  test('as linhas mostram "categoria · data" e valor com sinal, sem botão de remover (a exclusão vive no Extrato)', async ({ page }) => {
    await goDashboard(page)
    const first = page.locator('.home-recent-row').first()
    await expect(first.locator('.home-recent-meta')).toContainText(/ · \d{2} [a-zç]{3}$/)
    await expect(first.locator('.home-recent-amt')).toContainText(/^[+−]R\$ /)
    await expect(page.locator('.home-recent-del')).toHaveCount(0)
  })
})

// ─────────────────────────────────────────────────────────────────
// Nancy 2 é desenhado só no claro: as telas ignoram o tema escuro salvo, sem
// apagar a preferência (ela só volta a valer se alguma tela deixar de forçar o claro).
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — tema claro imposto e barra de baixo', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('com o tema escuro salvo, as telas saem claras e a preferência escura continua guardada', async ({ page }) => {
    await goDashboard(page)
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('.home-body')).backgroundColor)
    expect(bg).toBe('rgb(242, 246, 255)') // #F2F6FF do design

    // todas as telas logadas já são Nancy 2: Perfil → Meus dados continua claro, sem apagar a preferência salva
    await page.locator('.dsb-mobile-nav').getByRole('button', { name: 'Perfil' }).click()
    await page.waitForURL(/\/settings$/)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.getByRole('button', { name: 'Meus dados', exact: true }).click()
    await page.waitForURL(/\/settings\/dados/)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark')

    await page.locator('.dsb-mobile-nav').getByRole('button', { name: 'Início' }).click()
    await page.waitForURL(/\/dashboard/)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark')
  })

  test('barra de baixo: Início · Extrato · + · Metas · Perfil, com o item atual em destaque', async ({ page }) => {
    await goDashboard(page)
    const nav = page.locator('.dsb-mobile-nav')
    await expect(nav.locator('.dsb-mn-lbl')).toHaveText(['Início', 'Extrato', 'Metas', 'Perfil'])
    await expect(nav.locator('.dsb-mn-fab')).toBeVisible()
    await expect(nav.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Início')
  })

  test('cabeçalho: só olho e sino (sem tema/busca) e selo do mês com o crescimento do saldo', async ({ page }) => {
    await goDashboard(page)
    await expect(page.locator('.home-hero-actions .home-iconbtn')).toHaveCount(2)
    await expect(page.locator('.home-iconbtn[aria-label="Alternar tema"]')).toHaveCount(0)
    // mock: salário 5000 − contas fixas 2000 = 3000 no início; saldo 3660 → +22,0%
    await expect(page.locator('.home-badge')).toHaveText('+22,0% no mês')
  })

  test('banner "No ritmo atual" aparece a partir do 3º dia do mês, com o mês e a ação de perguntar à Nancy', async ({ page }) => {
    await goDashboard(page)
    const banner = page.locator('.home-insight')
    if (new Date().getDate() < 3) { await expect(banner).toHaveCount(0); return }
    await expect(banner).toContainText('No ritmo atual, você termina')
    await expect(banner).toContainText('Perguntar à Nancy')
  })

  // Achado N2-7: tocar no cartão abria o chat vazio — o botão promete perguntar, então já leva uma pergunta ligada ao que o cartão diz.
  test('tocar no banner "No ritmo atual" leva uma pergunta pronta ao chat', async ({ page }) => {
    await goDashboard(page)
    if (new Date().getDate() < 3) return
    await page.evaluate(() => window.addEventListener('nancy:open-agent-chat', e => { window.__asked = e.detail?.message }))
    await page.locator('.home-insight').click()
    const asked = await page.evaluate(() => window.__asked)
    expect(['Como posso sobrar ainda mais este mês?', 'Como posso fechar este mês no azul?']).toContain(asked)
  })

  // Achado N2-2: as linhas de "Últimas" não faziam nada ao toque.
  test('tocar numa linha de "Últimas" abre o Extrato', async ({ page }) => {
    await goDashboard(page)
    const rows = page.locator('.home-recent-row')
    await expect(rows).toHaveCount(5)
    await expect(rows.first()).toHaveJSProperty('tagName', 'BUTTON') // é um botão de verdade (teclado e leitor de tela)
    await rows.first().click()
    await expect(page).toHaveURL(/\/transactions$/)
  })

  test('estatísticas em número inteiro, sem R$ nem "k" (Entradas = salário + entradas)', async ({ page }) => {
    await goDashboard(page)
    const vals = page.locator('.home-stat-val')
    await expect(vals.nth(0)).toHaveText('6.500')   // 5000 de salário + 1500 de entradas
    await expect(vals.nth(1)).toHaveText('2.840')
    await expect(vals.nth(2)).toHaveText('2.000')
  })
})

// ─────────────────────────────────────────────────────────────────
// 5. MOCK LIFO — Isolamento em execução paralela
// ─────────────────────────────────────────────────────────────────
test.describe('Dashboard — Isolamento de mocks (LIFO / paralelo)', () => {

  test('rotas específicas têm prioridade sobre wildcard na mesma page', async ({ page }) => {
    // Navega primeiro para ter contexto de página
    await page.goto('http://localhost:5173/', { waitUntil: 'commit' }).catch(() => {})

    // Registra wildcard PRIMEIRO (menor prioridade LIFO)
    await page.route('**/api/**', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: '"wildcard"' })
    )
    // Registra específica DEPOIS (maior prioridade LIFO) — DEVE ganhar
    await page.route('**/api/auth/me**', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'x', plan: 'free' }) })
    )

    const resp = await page.evaluate(async () => {
      const r = await fetch('/api/auth/me')
      return r.json()
    })
    // Específica vence o wildcard (LIFO correto)
    expect(resp.id).toBe('x')
    expect(resp).not.toBe('wildcard')
  })

  test('routes não vazam entre tests em workers paralelos (isolation por page)', async ({ page, context }) => {
    // Cada page tem seu próprio isolamento de rotas
    await page.route('**/api/auth/me**', r =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'test-isolated', plan: 'pro' }) })
    )

    // Nova page no mesmo context NÃO herda rotas da page anterior
    const page2 = await context.newPage()
    const resp2 = await page2.evaluate(async () => {
      try {
        const r = await fetch('http://localhost:5173/api/auth/me')
        return r.status
      } catch { return 0 }
    }).catch(() => 'no-leak')

    // Page2 não deve retornar o mock da page1
    expect(resp2).not.toBe('test-isolated')
    await page2.close()
  })

})

// ─────────────────────────────────────────────────────────────────
// Falha ao carregar o Início: antes, sem rede (e sem nada guardado), a tela mostrava saldo R$ 0,00, "Saúde financeira —" e
// "Nenhuma transação" como se fossem reais depois que o aviso sumia — o cliente achava que estava sem dinheiro.
// ─────────────────────────────────────────────────────────────────
test.describe('Início — falha ao carregar', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  const setupInicio = async (page, atrasoMs = 0) => {
    await injectSession(page, { ...TEST_USER, plan: 'elite' })
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    await page.route('**/api/auth/me**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_USER) }))
    await page.route('**/api/transactions/dashboard**', async r => {
      if (atrasoMs) await new Promise(res => setTimeout(res, atrasoMs))
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDashboard) })
    })
  }

  // Achado do André (iPhone): a tela de espera era cinza, com um spinner e texto — parecia uma tela em branco e é do visual antigo.
  test('enquanto carrega, a espera é a tela azul do app com o ícone do Nancy e o anel (não a tela cinza)', async ({ page }) => {
    await setupInicio(page, 3500)
    await page.goto('/dashboard')
    // a espera do app (PageLoader) e a do Início são duas instâncias em sequência: espera pela do Início (a que tem o texto) e mede tudo de uma vez
    await expect(page.getByText('Carregando suas finanças…')).toBeAttached({ timeout: 20000 }) // texto só para leitor de tela
    await expect.poll(() => page.evaluate(() => {
      const el = document.querySelector('.app-loader')
      if (!el) return null
      return { bg: getComputedStyle(el).backgroundColor, marca: el.querySelectorAll('svg.nancy-mark').length, anel: el.querySelectorAll('.app-loader-ring').length }
    })).toEqual({ bg: 'rgb(28, 72, 255)', marca: 1, anel: 1 })
    await expect(page.locator('.home-balance-val')).toHaveText('R$ 3.660,00', { timeout: 20000 })
    await expect(page.locator('.app-loader')).toHaveCount(0)
  })

  // Achado do André (iPhone): puxar a tela para baixo mostrava uma faixa branca/cinza acima do cabeçalho azul. No celular quem rola é a
  // PÁGINA e o "elástico" revela a cor do html: azul no celular; o body (cinza claro, opaco) cobre o documento, então nada muda no uso
  // normal. O iOS em si só se confere no aparelho.
  test('celular: o espaço que o elástico do iPhone abre é azul (cor do html); body continua cinza claro e opaco; no desktop não muda', async ({ page }) => {
    await setupInicio(page)
    await page.goto('/dashboard')
    await expect(page.locator('.home-balance-val')).toHaveText('R$ 3.660,00', { timeout: 20000 })
    const cores = () => page.evaluate(() => {
      const cor = (el) => getComputedStyle(el).backgroundColor
      return { html: cor(document.documentElement), body: cor(document.body), docVaiAteOFim: document.body.getBoundingClientRect().height >= innerHeight - 1 }
    })
    expect(await cores()).toEqual({ html: 'rgb(28, 72, 255)', body: 'rgb(240, 242, 245)', docVaiAteOFim: true })
    await page.setViewportSize({ width: 1280, height: 800 })
    expect((await cores()).html).toBe('rgb(240, 242, 245)')
  })

  test('sem conexão e sem nada guardado: avisa, não mostra R$ 0,00, e "Tentar de novo" carrega os dados', async ({ page }) => {
    await injectSession(page, { ...TEST_USER, plan: 'elite' })
    let fail = true
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    await page.route('**/api/auth/me**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_USER) }))
    await page.route('**/api/transactions/dashboard**', r => fail
      ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"fora do ar"}' })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDashboard) }))
    await page.goto('/dashboard')
    const err = page.locator('.home-error')
    await expect(err).toContainText('Não foi possível carregar suas finanças.', { timeout: 20000 })
    await expect(page.locator('.home-balance-val')).toHaveText('—')
    await expect(page.getByText('R$ 0,00')).toHaveCount(0)
    await expect(page.locator('.home-stat')).toHaveCount(0) // sem cartões de Entradas/Saídas zerados
    fail = false
    await page.getByRole('button', { name: 'Tentar de novo' }).click()
    await expect(page.locator('.home-balance-val')).toHaveText('R$ 3.660,00', { timeout: 20000 })
    await expect(page.locator('.home-error')).toHaveCount(0)
  })
})
