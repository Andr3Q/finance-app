// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Finanças no desktop (design "Nancy Desktop", tela 15, 1440×898): cartão do salário (360px) e das contas fixas (720px) lado a lado,
// linhas de 69px e o formulário de adicionar em uma linha. Relógio fixo em 20/out/2026 22h.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 898 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const U = { ...TEST_USER, name: 'André Pereira', plan: 'elite', salary: 15000 }
const B = (id, name, amount, dueDay, over = {}) => ({ id, name, amount, dueDay, paidThisMonth: false, paidAmount: null, paidDate: null, endDate: null, ...over })
const BILLS = () => [B('1', 'Aluguel', 3500, 5), B('2', 'Plano de saúde', 850, 8), B('3', 'Conta de luz', 380, 12), B('4', 'Internet', 150, 15), B('5', 'Academia', 200, 20), B('6', 'Celular', 47, 25)]

async function open(page, bills = BILLS) {
  await page.addInitScript(() => { window.__nancySplashGone = false })
  await page.clock.setFixedTime(new Date('2026-10-20T22:00:00Z'))
  await injectSession(page, U)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(U)))
  await page.route('**/api/budget', r => (r.request().method() === 'GET' ? r.fulfill(json(bills())) : r.fallback()))
  await page.goto('/financas')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
  await expect(page.locator('.ndf-item').first()).toBeVisible()
}
const box = (page, sel, i = 0) => page.evaluate(([s, n]) => { const b = document.querySelectorAll(s)[n].getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, [sel, i])

test.describe('Finanças desktop — medidas e visual do design', () => {
  test('cartão do salário de 360px e das contas de 720px (vão de 16) a 103px do alto; sem cabeçalho azul', async ({ page }) => {
    await open(page)
    expect(await box(page, '.ndf-salary')).toMatchObject({ x: 312, y: 103, w: 360 })
    expect(await box(page, '.ndf-fixed')).toMatchObject({ x: 688, y: 103, w: 720 })
    expect(await box(page, '.ndf-salary-input')).toMatchObject({ x: 335, w: 314, h: 46 })
    expect(await box(page, '.ndf-salary-form .ndf-btn')).toMatchObject({ w: 314, h: 46 })
    await expect(page.locator('.fin-hero')).toHaveCount(0)
    await expect(page.locator('.nds-topbar')).toContainText('Salário e contas fixas')
  })

  test('linhas de 69px: ícone de 40px, vencimento de 120px, valor de 110px e × de 30px alinhados à direita', async ({ page }) => {
    await open(page)
    expect(await box(page, '.ndf-item')).toMatchObject({ x: 711, y: 155, w: 674, h: 69 })
    expect(await box(page, '.ndf-item', 1)).toMatchObject({ y: 224, h: 69 })
    expect(await box(page, '.ndf-row-ico')).toMatchObject({ w: 40, h: 40 })
    expect(await box(page, '.ndf-row-due')).toMatchObject({ w: 120 })
    const val = await box(page, '.ndf-row-val'), del = await box(page, '.ndf-del')
    expect(val.w).toBe(110)
    expect(Math.round(del.x + del.w)).toBe(1385) // × na borda interna do cartão
    expect(del).toMatchObject({ w: 30, h: 30 })
  })

  test('formulário em uma linha: nome (1,6fr), valor (1fr), dia (90px) e Adicionar', async ({ page }) => {
    await open(page)
    const f = await page.evaluate(() => [...document.querySelectorAll('.ndf-form-row > *')].map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.width), Math.round(b.height)] }))
    expect(f).toHaveLength(4)
    expect(f.map(c => c[2])).toEqual([46, 46, 46, 46])
    expect(f[2][1]).toBe(90)
    expect(f[3][0] + f[3][1]).toBe(1385)
  })

  test('total em azul mono no alto e texto do design', async ({ page }) => {
    await open(page)
    await expect(page.getByLabel('Total mensal')).toHaveText('R$ 5.127,00')
    expect(await page.getByLabel('Total mensal').evaluate(e => { const c = getComputedStyle(e); return [c.color, c.fontWeight, c.fontSize] })).toEqual(['rgb(21, 70, 255)', '600', '14px'])
    await expect(page.getByText('Base do saldo disponível')).toBeVisible()
    await expect(page.getByLabel('Salário mensal')).toHaveValue('15.000,00')
  })
})

test.describe('Finanças desktop — funções', () => {
  test('salvar salário chama a rota do salário', async ({ page }) => {
    await open(page)
    let body = null
    await page.route('**/api/budget/salary', async r => { body = r.request().postDataJSON(); await r.fulfill(json({ salary: 16000 })) })
    await page.getByLabel('Salário mensal').fill('16000')
    await page.getByRole('button', { name: 'Salvar salário' }).click()
    await expect.poll(() => body).toEqual({ salary: 16000 })
  })

  test('adicionar conta (nome, valor e dia) manda a conta e recarrega a lista', async ({ page }) => {
    let criada = false, body = null
    await open(page, () => (criada ? [...BILLS(), B('7', 'Streaming', 45, 10)] : BILLS()))
    await page.route('**/api/budget', async r => { if (r.request().method() === 'POST') { body = r.request().postDataJSON(); criada = true; await r.fulfill(json(B('7', 'Streaming', 45, 10), 201)) } else await r.fallback() })
    await page.getByLabel('Nome da conta', { exact: true }).fill('Streaming')
    await page.locator('.ndf-form-row').getByPlaceholder('Valor').fill('45')
    await page.getByLabel('Dia do vencimento').fill('10')
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
    await expect.poll(() => body).toMatchObject({ name: 'Streaming', amount: 45, dueDay: 10 })
    await expect(page.locator('.ndf-item')).toHaveCount(7)
  })

  test('data de encerramento: o link abre os campos e a data vai ISO ao servidor', async ({ page }) => {
    let body = null
    await open(page)
    await page.route('**/api/budget', async r => { if (r.request().method() === 'POST') { body = r.request().postDataJSON(); await r.fulfill(json(B('8', 'TV', 100, null), 201)) } else await r.fallback() })
    await page.getByLabel('Nome da conta', { exact: true }).fill('TV')
    await page.locator('.ndf-form-row').getByPlaceholder('Valor').fill('100')
    await page.locator('.ndf-end .fa-date-toggle').click()
    await page.getByPlaceholder('DD').fill('31')
    await page.getByPlaceholder('MM').fill('12')
    await page.getByPlaceholder('AAAA').fill('2027')
    await page.getByRole('button', { name: 'Adicionar', exact: true }).click()
    await expect.poll(() => body).toMatchObject({ name: 'TV', endDate: '2027-12-31' })
  })

  test('tocar na linha abre o detalhe e "Marcar como paga" paga a conta; × pede confirmação antes de apagar', async ({ page }) => {
    await open(page)
    let pago = null, apagado = null
    await page.route('**/api/budget/1/pay', async r => { pago = r.request().method(); await r.fulfill(json({})) })
    await page.route('**/api/budget/2', async r => { apagado = r.request().method(); await r.fulfill(json({})) })
    await page.locator('.ndf-row-main', { hasText: 'Aluguel' }).click()
    await page.getByRole('button', { name: 'Marcar como paga' }).click()
    await expect.poll(() => pago).toBe('POST')
    await page.locator('.ndf-item', { hasText: 'Plano de saúde' }).getByRole('button', { name: 'Remover' }).click()
    await expect(page.getByRole('dialog', { name: /Excluir conta fixa/ })).toBeVisible()
    expect(apagado).toBeNull()
    await page.getByRole('button', { name: /Sim, excluir/ }).click()
    await expect.poll(() => apagado).toBe('DELETE')
  })

  test('"Lançar todas como pagas" fica no cabeçalho do cartão', async ({ page }) => {
    await open(page)
    const btn = page.getByRole('button', { name: 'Lançar todas como pagas' })
    await expect(btn).toBeVisible()
    const b = await btn.boundingBox(), card = await box(page, '.ndf-fixed')
    expect(b.y).toBeLessThan(card.y + 60) // na linha do título, não abaixo da lista
  })
})
