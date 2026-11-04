// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Nancy IA no desktop (design "Nancy Desktop", tela 13, 1440×898): lista de conversas de 260px e o chat de 820px, lado a lado, na
// altura da tela. Relógio fixo em 20/out/2026 22h.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 898 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite' }

async function open(page, { plan = 'elite', path = '/nancy-ia' } = {}) {
  await page.addInitScript(() => { window.__nancySplashGone = false })
  await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
  await injectSession(page, { ...U, plan })
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json({ ...U, plan })))
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json({ summary: { salary: 15000, totalIncome: 0, totalFixedCosts: 0, unpaidFixedCosts: 0, unpaidBudgetIds: [], totalExpenses: 0, totalAvailable: 15000, currentBalance: 15000, percentUsed: 0 }, transactions: [], limits: [], budgets: [] })))
  let n = 0
  await page.route('**/api/agent/chat', r => { n++; return r.fulfill(json({ reply: `Resposta ${n}` })) })
  await page.goto(path)
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
}
const box = (page, sel, i = 0) => page.evaluate(([s, n]) => { const b = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, [sel, i])
const campo = (page) => page.getByPlaceholder('Pergunte à Nancy ou registre um gasto…')

test.describe('Nancy IA desktop — medidas e visual do design', () => {
  test('lista de 260px e chat de 820px a 103px do alto, com cabeçalho, entrada de 50px e botões de 50px', async ({ page }) => {
    await open(page)
    await expect(page.locator('.nia-page')).toBeVisible()
    expect(await box(page, '.nia-side')).toMatchObject({ x: 312, y: 103, w: 260, h: 755 })
    expect(await box(page, '.nia-main')).toMatchObject({ x: 588, y: 103, w: 820, h: 755 })
    expect(await box(page, '.nia-new')).toMatchObject({ x: 335, y: 126, w: 214, h: 46 })
    expect((await box(page, '.nia-main-head')).h).toBeCloseTo(73, 0)
    expect(await box(page, '.nia-input')).toMatchObject({ x: 611, w: 654, h: 50 })
    expect(await box(page, '.nia-mic')).toMatchObject({ w: 50, h: 50 })
    expect(await box(page, '.nia-send')).toMatchObject({ x: 1335, w: 50, h: 50 })
    expect(Math.round((await box(page, '.nia-bubble')).w)).toBe(592) // 560 do design + 2×16 de respiro
  })

  test('cores do design: botão azul, enviar verde, balão do bot azul-claro e do usuário azul', async ({ page }) => {
    await open(page)
    const bg = (sel) => page.locator(sel).first().evaluate(e => getComputedStyle(e).backgroundColor)
    expect(await bg('.nia-new')).toBe('rgb(21, 70, 255)')
    expect(await bg('.nia-send')).toBe('rgb(18, 201, 133)')
    expect(await bg('.nia-bubble')).toBe('rgb(238, 243, 255)')
    await page.getByRole('button', { name: 'Quanto gastei esse mês?' }).click()
    await expect(page.getByText('Resposta 1')).toBeVisible()
    expect(await bg('.nia-msg.user .nia-bubble')).toBe('rgb(21, 70, 255)')
  })

  test('textos do design: boas-vindas, status online, sugestões e entrada', async ({ page }) => {
    await open(page)
    await expect(page.getByText('Oi, André! Sou a Nancy. Pergunte sobre seus gastos, peça uma análise ou mande um áudio que eu registro pra você.')).toBeVisible()
    await expect(page.locator('.nia-status')).toHaveText('online · entende texto e áudio')
    await expect(page.locator('.nia-suggestion')).toHaveCount(4)
    await expect(campo(page)).toBeVisible()
    await expect(page.locator('.nds-topbar')).toContainText('Sua assistente financeira · texto e áudio')
  })
})

test.describe('Nancy IA desktop — conversas', () => {
  test('perguntar abre a conversa em Recentes; Nova conversa guarda a anterior e clicar nela a traz de volta', async ({ page }) => {
    await open(page)
    await campo(page).fill('Primeira pergunta')
    await campo(page).press('Enter')
    await expect(page.getByText('Resposta 1')).toBeVisible()
    await expect(page.locator('.nia-conv')).toHaveText(['Primeira pergunta'])
    await expect(page.locator('.nia-conv.on')).toHaveText('Primeira pergunta')
    await page.getByRole('button', { name: 'Nova conversa' }).click()
    await expect(page.getByText('Resposta 1')).toHaveCount(0)
    await expect(page.locator('.nia-suggestion')).toHaveCount(4)
    await campo(page).fill('Segunda pergunta')
    await campo(page).press('Enter')
    await expect(page.getByText('Resposta 2')).toBeVisible()
    await expect(page.locator('.nia-conv')).toHaveText(['Segunda pergunta', 'Primeira pergunta'])
    await page.getByRole('button', { name: 'Primeira pergunta' }).click()
    await expect(page.getByText('Resposta 1')).toBeVisible()
    await expect(page.getByText('Resposta 2')).toHaveCount(0)
  })

  test('a conversa sobrevive a sair da tela e voltar; recarregar a página começa do zero (nada fica gravado no aparelho)', async ({ page }) => {
    await open(page)
    await campo(page).fill('Pergunta que fica')
    await campo(page).press('Enter')
    await expect(page.getByText('Resposta 1')).toBeVisible()
    await page.locator('.nds-sidebar .nds-item', { hasText: 'Extrato' }).click()
    await expect(page).toHaveURL(/\/transactions$/)
    await page.locator('.nds-sidebar .nds-item', { hasText: 'Nancy IA' }).click()
    await expect(page.getByText('Resposta 1')).toBeVisible()
    await expect(page.locator('.nia-conv')).toHaveText(['Pergunta que fica'])
    const gravado = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
    expect(gravado).not.toContain('Pergunta que fica')
    await page.reload()
    await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
    await expect(page.locator('.nia-conv')).toHaveCount(0)
  })
})

test.describe('Nancy IA desktop — navegação', () => {
  test('o item do menu e o atalho do Início levam à tela; o menu fica aceso', async ({ page }) => {
    await open(page, { path: '/dashboard' })
    await page.locator('.ndh-quick-btn', { hasText: 'Nancy IA' }).click()
    await expect(page).toHaveURL(/\/nancy-ia$/)
    await expect(page.locator('.nds-item.active')).toContainText('Nancy IA')
    await expect(page.locator('.nia-panel')).toHaveCount(0)
  })

  test('"Conversar" do cartão do Início leva à tela e já pergunta', async ({ page }) => {
    await open(page, { path: '/dashboard' })
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('nancy:open-agent-chat', { detail: { message: 'Como posso sobrar ainda mais este mês?' } })))
    await expect(page).toHaveURL(/\/nancy-ia$/)
    await expect(page.getByText('Resposta 1')).toBeVisible()
    await expect(page.locator('.nia-msg.user .nia-bubble')).toHaveText('Como posso sobrar ainda mais este mês?')
  })

  test('fora do plano Elite mostra o convite e leva aos planos', async ({ page }) => {
    await open(page, { plan: 'pro' })
    await expect(page.getByText(/A Nancy IA analisa seus gastos/)).toBeVisible()
    await expect(page.locator('.nia-status')).toHaveText('disponível no Elite')
    await page.getByRole('button', { name: /Ver planos/ }).click()
    await expect(page).toHaveURL(/\/planos$/)
  })
})
