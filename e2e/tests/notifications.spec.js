// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Notificações (Nancy 2, tela 13) — celular
// Os avisos são calculados dos mesmos dados do Início (contas fixas que vencem, dia de
// salário, limite por categoria perto do teto, resumo do mês). O relógio é fixado em datas
// em que cada aviso existe de verdade: 7/out/2026 é o 5º dia útil (dia de salário) e
// 28/out/2026 já tem o resumo do mês pronto.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const SALARY_DAY = '2026-10-07T15:00:00Z' // 12:00 em Brasília
const MONTH_END  = '2026-10-28T15:00:00Z'
const MID_MONTH  = '2026-10-14T15:00:00Z'

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })

const payload = (dueDay, over = {}) => ({
  summary: { salary: 5000, totalIncome: 500, totalExpenses: 3000, currentBalance: 2500, totalAvailable: 5500, percentUsed: 54, unpaidBudgetIds: ['b1'] },
  transactions: [{ id: 't1', description: 'Mercado', type: 'expense', category: 'food', amount: 1230, date: '2026-10-05T12:00:00Z', month: 10, year: 2026, archived: false }],
  limits: [{ category: 'food', amount: 1500 }],
  budgets: [{ id: 'b1', name: 'Academia', amount: 200, dueDay }],
  ...over,
})

const RECAP = {
  hasData: true, month: 10, year: 2026, prevMonth: 9, saved: 100, totalIncome: 5000, totalExpenses: 120,
  topExpenses: [{ category: 'food', label: 'Alimentação', amount: 100 }], fixedTotal: 1, fixedPaid: 1,
  score: 72, scorePrev: 70, suggestedGoal: 1000, savedDeltaPct: 10, expensesDeltaPct: -5, fixedSharePct: 20,
  isBestOfYear: false, nextStep: null, belowAverage: null,
}

// a dica da semana (aviso que aparece até a pessoa abri-la) vem como "já aberta" nos testes que não falam dela
const SEEN_TIPS = JSON.stringify(Object.fromEntries(['W41', 'W42', 'W43', 'W44'].map(w => [`dicas:2026-${w}`, 1])))

async function setup(page, { at, data, goto = '/notificacoes', tipSeen = true, tipAvailable = true, user = TEST_USER }) {
  await page.clock.setFixedTime(new Date(at))
  if (tipSeen) await page.addInitScript((seen) => localStorage.setItem('nancy:stories-seen', seen), SEEN_TIPS)
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(data)))
  await page.route('**/api/transactions/monthly-recap**', r => r.fulfill(json(RECAP)))
  // só há "Dica da Nancy IA" quando existe base de comparação (a consulta leve, sem gastar o limite do chat)
  await page.route('**/api/transactions/weekly-tip-available**', r => r.fulfill(json({ available: tipAvailable })))
  await page.goto(goto)
}

const rows = (page) => page.locator('.ntf-row')
const row = (page, name) => page.getByRole('button', { name })

test.describe('Notificações', () => {
  test('lista os avisos de hoje, do mais importante ao menos, com "N novas" e Extrato aceso na barra', async ({ page }) => {
    await setup(page, { at: SALARY_DAY, data: payload(7) })
    await expect(page.getByRole('heading', { name: 'Notificações' })).toBeVisible()
    await expect(rows(page)).toHaveCount(3)
    await expect(page.locator('.ntf-name')).toHaveText(['Academia vence hoje', 'Lembrete de salário', 'Alimentação em 82% do limite'])
    await expect(page.locator('.ntf-text')).toHaveText([
      'R$ 200,00 · conta fixa', 'Seu salário deve cair hoje. Confira o valor em Finanças.', 'Faltam R$ 270 até o teto do mês.',
    ])
    await expect(page.locator('.ntf-when')).toHaveText(['hoje', 'hoje', 'este mês'])
    await expect(page.locator('.ntf-sub')).toHaveText('3 novas')
    // design: a barra de baixo aparece com "Extrato" aceso
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Extrato')
  })

  test('no fim do mês o resumo vira aviso, com a quantidade real de histórias', async ({ page }) => {
    await setup(page, { at: MONTH_END, data: payload(28) })
    const recap = row(page, /Resumo de outubro pronto/)
    await expect(recap).toBeVisible()
    await expect(recap).toContainText(/Veja seu mês em \d+ histórias/)
    await recap.click()
    await expect(page).toHaveURL(/\/resumo-stories$/)
  })

  test('o sino do Início tem pontinho enquanto há aviso novo, abre a tela, e o pontinho some depois de ver', async ({ page }) => {
    await setup(page, { at: SALARY_DAY, data: payload(7), goto: '/dashboard' })
    const bell = page.getByRole('button', { name: 'Notificações' })
    await expect(bell.locator('.dsb-bell-dot')).toBeVisible()
    await bell.click()
    await expect(page).toHaveURL(/\/notificacoes$/)
    await expect(page.locator('.ntf-sub')).toHaveText('3 novas')

    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('button', { name: 'Notificações' })).toBeVisible()
    await expect(page.locator('.home-iconbtn .dsb-bell-dot')).toHaveCount(0)
  })

  test('na segunda visita nada é novo, mas os avisos continuam listados', async ({ page }) => {
    await setup(page, { at: SALARY_DAY, data: payload(7) })
    await expect(page.locator('.ntf-sub')).toHaveText('3 novas')
    await page.reload()
    await expect(rows(page)).toHaveCount(3)
    await expect(page.locator('.ntf-sub')).toHaveText('Nenhuma nova')
  })

  test('conta que vence leva às Contas do mês e limite leva aos Limites (não às Metas)', async ({ page }) => {
    await setup(page, { at: SALARY_DAY, data: payload(7) })
    await row(page, /Academia vence hoje/).click()
    await expect(page).toHaveURL(/\/contas-do-mes$/)
    await page.goBack()
    await row(page, /Alimentação em 82% do limite/).click()
    await expect(page).toHaveURL(/\/limites$/)
  })

  // O salário cadastrado já entra nas Entradas: registrar como Entrada contava em dobro — o lembrete leva a Finanças (campo Salário mensal).
  test('lembrete de salário leva à tela Finanças, sem abrir "Nova transação"', async ({ page }) => {
    await setup(page, { at: SALARY_DAY, data: payload(7) })
    await row(page, /Lembrete de salário/).click()
    await expect(page).toHaveURL(/\/financas$/)
    await expect(page.getByRole('dialog', { name: 'Nova transação' })).toHaveCount(0)
  })

  test('"Preferências de notificação" leva às configurações e voltar retorna', async ({ page }) => {
    await setup(page, { at: SALARY_DAY, data: payload(7), goto: '/dashboard' })
    await page.getByRole('button', { name: 'Notificações' }).click()
    await page.getByRole('button', { name: 'Preferências de notificação' }).click()
    await expect(page).toHaveURL(/\/settings\/notificacoes$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/notificacoes$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('sem nada pra avisar: "Tudo em dia" e "Nenhuma nova"', async ({ page }) => {
    await setup(page, { at: MID_MONTH, data: payload(1, { summary: { totalIncome: 0, totalExpenses: 0, unpaidBudgetIds: [] }, limits: [], transactions: [] }) })
    await expect(page.getByText('Tudo em dia')).toBeVisible()
    await expect(page.locator('.ntf-sub')).toHaveText('Nenhuma nova')
    await expect(rows(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Preferências de notificação' })).toBeVisible()
  })

  test('ocultar valores (preferência do Início) também vale aqui', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('hide-balance', '1'))
    await setup(page, { at: SALARY_DAY, data: payload(7) })
    await expect(page.locator('.ntf-text').first()).toHaveText('R$ •••• · conta fixa')
    await expect(page.locator('.ntf-text').nth(2)).toHaveText('Faltam R$ •••• até o teto do mês.')
  })

  test('visual do design: cabeçalho azul, corpo claro arredondado, cartão branco, ícones azuis, botão de preferências', async ({ page }) => {
    await setup(page, { at: SALARY_DAY, data: payload(7) })
    await expect(rows(page)).toHaveCount(3)
    const m = await page.evaluate(() => {
      // arredonda a 0,1px: durante o fade-in da tela o retângulo vem com ruído de ponto flutuante (41,999996)
      const rd = (n) => Math.round(n * 10) / 10
      const box = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: rd(r.x), y: rd(r.y), w: rd(r.width), h: rd(r.height) } }
      const cs  = (s) => getComputedStyle(document.querySelector(s))
      return {
        heroBg: cs('.ntf-hero').backgroundColor, bodyBg: cs('.ntf-body').backgroundColor, bodyRadius: cs('.ntf-body').borderTopLeftRadius,
        cardBg: cs('.ntf-card').backgroundColor, cardRadius: cs('.ntf-card').borderTopLeftRadius,
        icoBg: cs('.ntf-ico').backgroundColor, ico: box('.ntf-ico'), back: box('.ntf-back'), backBg: cs('.ntf-back').backgroundColor,
        card: box('.ntf-card'), prefs: box('.ntf-prefs'), prefsColor: cs('.ntf-prefs').color,
        theme: document.documentElement.getAttribute('data-theme'),
      }
    })
    expect(m.theme).toBe('light')
    expect(m.heroBg).toBe('rgb(28, 72, 255)')          // #1C48FF chapado
    expect(m.bodyBg).toBe('rgb(242, 246, 255)')        // #F2F6FF
    expect(m.bodyRadius).toBe('26px')
    expect(m.cardBg).toBe('rgb(255, 255, 255)')
    expect(m.cardRadius).toBe('24px')
    expect(m.icoBg).toBe('rgb(28, 72, 255)')
    expect([m.ico.w, m.ico.h]).toEqual([42, 42])
    expect([m.back.w, m.back.h]).toEqual([42, 42])
    expect(m.backBg).toBe('rgba(255, 255, 255, 0.14)')
    expect([m.card.x, m.card.w]).toEqual([20, 353])    // 20px de margem de cada lado
    expect(m.prefs.h).toBe(52)
    expect(m.prefsColor).toBe('rgb(28, 72, 255)')
    expect(m.prefs.y).toBeGreaterThan(m.card.y + m.card.h) // o botão vem depois do cartão
  })

  test('a dica da semana aparece até ser aberta e leva ao story de dicas', async ({ page }) => {
    await setup(page, { at: SALARY_DAY, data: payload(7), tipSeen: false })
    await expect(page.locator('.ntf-name')).toHaveText(['Academia vence hoje', 'Lembrete de salário', 'Alimentação em 82% do limite', 'Dica da Nancy IA'])
    await row(page, /Dica da Nancy IA/).click()
    await expect(page).toHaveURL(/\/resumo-stories$/)
  })

  test('sem base de comparação não há dica da semana na lista, mesmo sem ter aberto', async ({ page }) => {
    await setup(page, { at: SALARY_DAY, data: payload(7), tipSeen: false, tipAvailable: false })
    await expect(page.locator('.ntf-name')).toHaveText(['Academia vence hoje', 'Lembrete de salário', 'Alimentação em 82% do limite'])
  })

  test('as preferências desligadas tiram os avisos da lista e do pontinho do sino', async ({ page }) => {
    await setup(page, {
      at: SALARY_DAY, data: payload(7), goto: '/dashboard',
      user: { ...TEST_USER, notifSalary: false, notifBudgetReminder: false, notifBudgetAlert: false, notifStories: false, notifTips: false },
    })
    await expect(page.getByRole('button', { name: 'Notificações' })).toBeVisible()
    await expect(page.locator('.home-iconbtn .dsb-bell-dot')).toHaveCount(0)   // nada novo a avisar
    await page.getByRole('button', { name: 'Notificações' }).click()
    await expect(page.getByText('Tudo em dia')).toBeVisible()
    await expect(rows(page)).toHaveCount(0)
  })

})
