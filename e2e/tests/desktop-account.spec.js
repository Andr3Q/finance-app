// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Telas da conta no desktop (design "Nancy Desktop", 25 a 37, 1440×898): menu da conta de 240px com as 12 telas ao lado do conteúdo.
// Aqui: Pagamentos, a navegação do menu (Planos, Meus dados), Termos e o 404 dentro da casca. Relógio fixo em 21/out/2026.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 898 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite', planExpiresAt: '2026-11-20T15:00:00Z' }
const PAYMENTS = [
  { paymentId: 'pay_4', plan: 'elite', period: 'monthly', processedAt: '2026-10-20T15:00:00Z', amount: 34.9, method: 'card', cardLast4: '4021' },
  { paymentId: 'pay_3', plan: 'elite', period: 'monthly', processedAt: '2026-09-20T15:00:00Z', amount: 34.9, method: 'card', cardLast4: '4021' },
  { paymentId: 'pay_2', plan: 'elite', period: 'monthly', processedAt: '2026-08-20T15:00:00Z', amount: 34.9, method: 'pix', cardLast4: null },
  { paymentId: 'pay_1', plan: 'pro',   period: 'monthly', processedAt: '2026-07-20T15:00:00Z', amount: 9.9,  method: null, cardLast4: null },
]

async function open(page, path, user = U) {
  await page.addInitScript(() => { window.__nancySplashGone = false })
  await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'))
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/payments/history**', r => r.fulfill(json(PAYMENTS)))
  await page.goto(path)
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
}
const box = (page, sel, i = 0) => page.evaluate(([s, n]) => { const b = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, [sel, i])
const account = (page) => page.getByRole('navigation', { name: 'Conta' })

test.describe('Conta desktop — Pagamentos', () => {
  test('menu da conta aceso, plano com o último valor, tabela do histórico e "Cancelar assinatura"', async ({ page }) => {
    await open(page, '/settings/pagamentos')
    await expect(account(page).getByRole('button', { name: 'Pagamentos' })).toHaveAttribute('aria-current', 'page')
    await expect(account(page).getByRole('button')).toHaveCount(12)
    expect(await box(page, '.nst-nav')).toMatchObject({ x: 312, w: 240 })
    await expect(page.locator('.pgd-plan-title')).toHaveText('Plano Elite · R$ 34,90/mês')
    await expect(page.locator('.pgd-plan-sub')).toHaveText('Válido até 20 nov 2026 · cartão •••• 4021')
    await expect(page.locator('.pgd-row')).toHaveCount(4)
    await expect(page.locator('.pgd-row').first().locator('span')).toHaveText(['20 out 2026', 'Elite · cartão', 'R$ 34,90', 'Pago'])
    expect((await box(page, '.pgd-cancel')).h).toBe(49)
  })

  test('cancelar abre o aviso com senha e "Voltar" fecha sem cancelar', async ({ page }) => {
    await open(page, '/settings/pagamentos')
    await page.getByRole('button', { name: 'Cancelar assinatura' }).click()
    await expect(page.getByText(/não renovar o plano/i)).toBeVisible()
    await page.locator('.gls-modal').getByRole('button', { name: 'Voltar', exact: true }).click()
    await expect(page.getByText(/não renovar o plano/i)).not.toBeVisible()
  })
})

test.describe('Conta desktop — navegação pelo menu', () => {
  test('Pagamentos → Planos (3 cartões) → Meus dados (2 cartões lado a lado)', async ({ page }) => {
    await open(page, '/settings/pagamentos')
    await account(page).getByRole('button', { name: 'Planos' }).click()
    await expect(page).toHaveURL(/\/planos$/)
    await expect(account(page).getByRole('button', { name: 'Planos' })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.ndpl-card')).toHaveCount(3)
    await account(page).getByRole('button', { name: 'Meus dados' }).click()
    await expect(page).toHaveURL(/\/settings\/dados$/)
    await expect(page.locator('.ndd-card')).toHaveCount(2)
    // os dois no mesmo instante: a tela entra com uma animação que desloca tudo ~1px por alguns instantes
    const [a, b] = await page.evaluate(() => [...document.querySelectorAll('.ndd-card')].map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width } }))
    expect(Math.abs(a.y - b.y)).toBeLessThan(0.5)
    expect(Math.abs(a.w - b.w)).toBeLessThan(0.5)
    expect(Math.round(b.x - (a.x + a.w))).toBe(16)
  })
})

test.describe('Conta desktop — Planos (idêntico ao design)', () => {
  test('título e seletor na mesma linha; três cartões de 268px com vão de 16, o último a 1140 e a borda direita a 1408', async ({ page }) => {
    await open(page, '/planos')
    await expect(page.locator('.ndpl-card')).toHaveCount(3)
    const m = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }
      return { title: r(document.querySelector('.ndpl-title')), toggle: r(document.querySelector('.ndpl-toggle')), cards: [...document.querySelectorAll('.ndpl-card')].map(r) }
    })
    expect(Math.abs((m.title.y + m.title.h / 2) - (m.toggle.y + m.toggle.h / 2))).toBeLessThan(1.5) // mesma linha, centralizados
    expect(m.title.h).toBeLessThan(45) // o título não quebra em duas linhas
    expect(m.cards.map(c => Math.round(c.x))).toEqual([572, 856, 1140])
    expect(m.cards.map(c => Math.round(c.w))).toEqual([268, 268, 268])
    expect(new Set(m.cards.map(c => Math.round(c.h))).size).toBe(1) // mesma altura
    expect(Math.round(m.cards[2].x + m.cards[2].w)).toBe(1408)
    expect(Math.round(m.cards[0].y - (m.toggle.y + m.toggle.h))).toBeGreaterThanOrEqual(15) // vão de 16 do título aos cartões
  })

  test('cores e fontes: título 30px, preço 40px, cartão Elite azul, selo mint, botões de 48px', async ({ page }) => {
    await open(page, '/planos')
    const s = await page.evaluate(() => {
      const cs = (sel, i = 0) => getComputedStyle(document.querySelectorAll(sel)[i])
      return {
        title: cs('.ndpl-title').fontSize, price: cs('.ndpl-price-n').fontSize, radius: cs('.ndpl-card').borderTopLeftRadius, border: cs('.ndpl-card').borderTopWidth,
        free: cs('.ndpl-card', 0).borderTopColor, eliteBg: cs('.ndpl-card', 2).backgroundColor, tag: cs('.ndpl-tag').backgroundColor,
        cta: [...document.querySelectorAll('.ndpl-cta')].map(b => Math.round(b.getBoundingClientRect().height)), eliteCta: cs('.ndpl-cta', 2).backgroundColor,
      }
    })
    expect(s).toMatchObject({ title: '30px', price: '40px', radius: '22px', border: '2px', free: 'rgb(225, 232, 245)', eliteBg: 'rgb(21, 70, 255)', tag: 'rgb(59, 227, 160)', eliteCta: 'rgb(59, 227, 160)' })
    expect(s.cta).toEqual([48, 48, 48])
    await expect(page.locator('.ndpl-card').nth(2).locator('.ndpl-tag')).toHaveText('Atual')
    await expect(page.locator('.ndpl-card').nth(1).locator('.ndpl-tag')).toHaveText('Recomendado')
  })

  test('só o que o design mostra: sem comparativo, garantia, perguntas nem notas; Pro não promete transações ilimitadas', async ({ page }) => {
    await open(page, '/planos')
    await expect(page.getByText('Comparativo completo')).toHaveCount(0)
    await expect(page.getByText('Perguntas frequentes')).toHaveCount(0)
    await expect(page.getByText(/Cancele quando quiser/)).toHaveCount(0)
    await expect(page.locator('.ndpl-card').nth(1)).toContainText('35 transações por mês')
    await expect(page.locator('.ndpl-card').nth(1)).not.toContainText('ilimitadas')
  })
})

test.describe('Conta desktop — Termos e 404', () => {
  test('Termos num cartão ao lado do menu, com o texto completo', async ({ page }) => {
    await open(page, '/termos')
    await expect(account(page).getByRole('button', { name: 'Termos de Uso' })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.ndl-card h2')).toHaveCount(12)
    await expect(page.locator('.ndl-foot')).toContainText('Dúvidas')
  })

  test('404 dentro da casca (menu e barra de cima), e "Voltar ao início" leva ao Início', async ({ page }) => {
    await open(page, '/essa-rota-nao-existe')
    await expect(page.locator('.ndnf-code')).toHaveText('404')
    await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible()
    expect((await box(page, '.ndnf-code')).h).toBe(160)
    await page.getByRole('button', { name: 'Voltar ao início' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})
