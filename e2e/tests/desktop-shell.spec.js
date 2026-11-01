// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Casca do desktop (design "Nancy Desktop", 1440×900): menu lateral azul de 280px e barra de cima de 77px.
// As medidas são as FINAIS do app (o protótipo é content-box): menu 248 + 2×16 de padding, barra 76 + 1 de borda,
// busca 330×46, botões do olho/sino 46×46. No celular nada disso aparece (quem manda é a barra de baixo).
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 900 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const ELITE = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }

// Datas RELATIVAS a hoje: o Extrato mostra o mês corrente e os avisos dependem do dia (em 1º/nov a CI falhou com dados fixos de outubro).
// A conta fixa vence HOJE e está em aberto: gera um aviso novo em qualquer dia do ano.
const HOJE = new Date()
const tx = (id, description, amount, type, category) =>
  ({ id, description, amount, type, category, date: HOJE.toISOString(), month: HOJE.getMonth() + 1, year: HOJE.getFullYear(), archived: false })
const dash = {
  summary: { salary: 15000, totalIncome: 1800, totalFixedCosts: 5127, unpaidFixedCosts: 200, unpaidBudgetIds: ['b1'], totalExpenses: 7300, totalAvailable: 23500, currentBalance: 23500, percentUsed: 44 },
  transactions: [tx('t1', 'Academia', 200, 'expense', 'health'), tx('t2', 'Mercado', 240, 'expense', 'food'), tx('t3', 'Conta de luz', 380, 'expense', 'utilities')],
  limits: [], budgets: [{ id: 'b1', name: 'Academia', amount: 200, dueDay: HOJE.getDate() }],
}

async function setup(page, user = ELITE, path = '/dashboard', ready = '.nds-sidebar') {
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(dash)))
  await page.route('**/api/transactions?**', r => r.fulfill(json({ data: dash.transactions, total: dash.transactions.length })))
  await page.route('**/api/transactions/monthly-recap**', r => r.fulfill(json({ hasData: true, saved: 100, totalIncome: 5000, totalExpenses: 120 })))
  await page.goto(path)
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 }) // a abertura (≈4s) cobre a tela
  await expect(page.locator(ready)).toBeVisible()
}

const box = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, sel)
const menu = (page) => page.getByRole('navigation', { name: 'Menu principal' })
const topSub = (page) => page.locator('.nds-topbar-sub')
// o Início ainda mostra o cabeçalho de celular (com o seu próprio olho e sino) até a tela desktop dele: os botões da barra de cima têm escopo
const top = (page) => page.locator('.nds-topbar')

test.describe('Casca desktop — medidas e visual do design', () => {
  test('menu lateral 280×900, barra de cima 77px, busca 330×46, botões 46×46, conteúdo começa depois dos dois', async ({ page }) => {
    await setup(page)
    expect(await box(page, '.nds-sidebar')).toEqual({ x: 0, y: 0, w: 280, h: 900 })
    expect(await box(page, '.nds-topbar')).toEqual({ x: 280, y: 0, w: 1160, h: 77 })
    expect(await box(page, '.nds-search')).toMatchObject({ w: 330, h: 46 })
    expect(await box(page, '.nds-iconbtn')).toMatchObject({ w: 46, h: 46 })
    expect(await box(page, '.nds-newtx')).toMatchObject({ h: 46 })
    expect(await box(page, '.nds-item')).toMatchObject({ x: 16, w: 248, h: 44 })
    // o conteúdo da tela não fica por baixo do menu nem da barra
    await expect.poll(() => page.evaluate(() => { const s = getComputedStyle(document.querySelector('.pwnav')); return [s.marginLeft, s.paddingTop] })).toEqual(['280px', '77px'])
  })

  test('cores e fonte do design: menu #1546FF, item aceso branco com texto azul, Plus Jakarta Sans', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.nds-sidebar')).toHaveCSS('background-color', 'rgb(21, 70, 255)')
    const home = menu(page).getByRole('button', { name: 'Início' })
    await expect(home).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(home).toHaveCSS('color', 'rgb(21, 70, 255)')
    await expect(menu(page).getByRole('button', { name: 'Extrato' })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(page.locator('.nds-topbar')).toHaveCSS('background-color', 'rgb(242, 246, 255)')
    await expect(page.locator('.nds-newtx')).toHaveCSS('background-color', 'rgb(21, 70, 255)')
    await expect(page.locator('.nds-topbar-title')).toHaveCSS('font-weight', '800')
    expect(await page.evaluate(async () => { await document.fonts.load('600 14px "Plus Jakarta Sans"'); return [document.fonts.check('600 14px "Plus Jakarta Sans"'), getComputedStyle(document.querySelector('.nds-item')).fontFamily] }))
      .toEqual([true, '"Plus Jakarta Sans", sans-serif'])
  })

  test('itens do menu na ordem do design; Planilha IA e Analisador ficam escondidos até as telas existirem; o botão flutuante do chat não existe no desktop', async ({ page }) => {
    await setup(page)
    await expect(menu(page).getByRole('button')).toHaveText(['Início', 'Extrato', 'Nancy IA', 'Metas', 'Finanças', 'Calendário', 'Planos'])
    await expect(page.locator('.nds-badge')).toHaveCount(0)
    await expect(page.locator('.agent-fab')).toBeHidden()
  })

  test('cartão do plano e do usuário no pé do menu', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.nds-plan')).toContainText('Plano Elite')
    await expect(page.locator('.nds-plan')).toContainText('IA ilimitada e Planilha IA ativas')
    await expect(page.locator('.nds-user')).toContainText('André Pereira')
    await expect(page.locator('.nds-user')).toContainText('Configurações')
    await expect(page.locator('.nds-av')).toHaveText('AP')
    await expect(page.locator('.nds-user')).not.toHaveClass(/active/)
  })
})

test.describe('Casca desktop — navegação', () => {
  test('cada item leva à sua tela, acende e a barra de cima troca o título', async ({ page }) => {
    await setup(page)
    for (const [label, url, title] of [['Extrato', /\/transactions$/, 'Extrato'], ['Metas', /\/goals$/, 'Metas'], ['Finanças', /\/financas$/, 'Finanças'], ['Calendário', /\/calendar$/, 'Calendário'], ['Planos', /\/planos$/, 'Planos'], ['Início', /\/dashboard$/, 'Início']]) {
      await menu(page).getByRole('button', { name: label }).click()
      await expect(page).toHaveURL(url)
      await expect(menu(page).getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('.nds-topbar-title')).toHaveText(title)
    }
  })

  test('sub-telas acendem o item pai (Limites → Metas, Parcelados → Extrato)', async ({ page }) => {
    await setup(page, ELITE, '/limites')
    await expect(menu(page).getByRole('button', { name: 'Metas' })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.nds-topbar-title')).toHaveText('Limites')
    await expect(topSub(page)).toHaveText('Teto de gasto por categoria')
    await page.goto('/parcelados')
    await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
    await expect(menu(page).getByRole('button', { name: 'Extrato' })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.nds-topbar-title')).toHaveText('Compras parceladas')
  })

  test('o grupo Configurações acende o cartão do usuário e nenhum item do menu', async ({ page }) => {
    await setup(page)
    await page.locator('.nds-user').click()
    await expect(page).toHaveURL(/\/settings$/)
    await expect(page.locator('.nds-user')).toHaveClass(/active/)
    await expect(menu(page).locator('[aria-current="page"]')).toHaveCount(0)
    await expect(page.locator('.nds-topbar-title')).toHaveText('Configurações')
    await expect(topSub(page)).toHaveText('Sua conta Nancy')
  })

  test('o logo volta ao Início', async ({ page }) => {
    await setup(page)
    await menu(page).getByRole('button', { name: 'Metas' }).click()
    await page.getByRole('button', { name: /Nancy, ir para o Início/ }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('Nancy IA abre o painel do chat sem sair da tela', async ({ page }) => {
    await setup(page)
    await menu(page).getByRole('button', { name: 'Nancy IA' }).click()
    await expect(page.locator('.nia-panel')).toBeVisible()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('"Sair da conta" continua alcançável: o Perfil mostra a opção também no desktop', async ({ page }) => {
    await setup(page)
    await page.locator('.nds-user').click()
    await expect(page.getByRole('button', { name: 'Sair da conta' })).toBeVisible()
  })
})

test.describe('Casca desktop — barra de cima', () => {
  test('Início: título, saudação com o nome e a data', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.nds-topbar-title')).toHaveText('Início')
    await expect(topSub(page)).toHaveText(/^(Bom dia|Boa tarde|Boa noite), André · (domingo|segunda|terça|quarta|quinta|sexta|sábado), \d{1,2} de [a-zç]+$/)
  })

  test('o olho oculta os valores do Início e mostra de novo (a mesma preferência do celular)', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.home-balance-val')).toHaveText('R$ 23.500,00')
    await top(page).getByRole('button', { name: 'Ocultar valores' }).click()
    await expect(page.locator('.home-balance-val')).toHaveText('R$ ••••••')
    await expect(top(page).getByRole('button', { name: 'Mostrar valores' })).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => localStorage.getItem('hide-balance'))).toBe('1')
    await top(page).getByRole('button', { name: 'Mostrar valores' }).click()
    await expect(page.locator('.home-balance-val')).toHaveText('R$ 23.500,00')
  })

  test('o olho vale em qualquer tela: no Extrato os valores também somem', async ({ page }) => {
    await setup(page)
    await menu(page).getByRole('button', { name: 'Extrato' }).click()
    await expect(page.getByText('Academia').first()).toBeVisible()
    await top(page).getByRole('button', { name: 'Ocultar valores' }).click()
    await expect(page.getByText(/R\$ \d/)).toHaveCount(0)
    await top(page).getByRole('button', { name: 'Mostrar valores' }).click()
    await expect(page.getByText(/R\$ \d/).first()).toBeVisible()
  })

  test('sino: bolinha verde quando há novidade; abrir Notificações apaga a bolinha e a barra diz "N novas"', async ({ page }) => {
    await setup(page)
    await expect(page.getByTestId('topbar-bell-dot')).toBeVisible()
    await top(page).getByRole('button', { name: 'Notificações' }).click()
    await expect(page).toHaveURL(/\/notificacoes$/)
    await expect(page.locator('.nds-topbar-title')).toHaveText('Notificações')
    await expect(topSub(page)).toHaveText(/^\d+ novas?$/)
    await expect(page.getByTestId('topbar-bell-dot')).toHaveCount(0)
    await menu(page).getByRole('button', { name: 'Metas' }).click()
    await expect(topSub(page)).toHaveText('Seus objetivos') // saiu da tela: volta ao subtítulo da rota
  })

  test('busca: leva ao Extrato já filtrado', async ({ page }) => {
    await setup(page)
    await top(page).getByRole('searchbox', { name: /Buscar transações, contas, metas/ }).fill('luz')
    await top(page).getByRole('searchbox', { name: /Buscar transações, contas, metas/ }).press('Enter')
    await expect(page).toHaveURL(/\/transactions$/)
    await expect(page.getByPlaceholder('Buscar no extrato')).toHaveValue('luz')
    await expect(page.getByText('Conta de luz').first()).toBeVisible()
    await expect(page.getByText('Mercado')).toHaveCount(0)
  })

  test('"Nova transação" abre a folha de nova saída', async ({ page }) => {
    await setup(page)
    await top(page).getByRole('button', { name: 'Nova transação' }).click()
    await expect(page.getByRole('dialog', { name: 'Nova transação' })).toBeVisible()
  })
})

test.describe('Casca desktop — plano no cartão do menu', () => {
  test('plano Grátis: o cartão leva a Planos', async ({ page }) => {
    await setup(page, { ...TEST_USER, name: 'Ana Souza', plan: 'free' })
    await expect(page.locator('.nds-plan')).toContainText('Plano Grátis')
    await page.locator('.nds-plan').click()
    await expect(page).toHaveURL(/\/planos$/)
    await expect(menu(page).getByRole('button', { name: 'Planos' })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.nds-user')).toHaveClass(/active/) // Planos também é do grupo Configurações
  })
})

test.describe('Casca desktop — no celular não aparece', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('menu lateral e barra de cima somem; a barra de baixo continua', async ({ page }) => {
    await setup(page, ELITE, '/dashboard', '.dsb-mobile-nav')
    await expect(page.locator('.nds-sidebar')).toBeHidden()
    await expect(page.locator('.nds-topbar')).toBeHidden()
    await expect(page.locator('.dsb-mobile-nav')).toBeVisible()
  })
})
