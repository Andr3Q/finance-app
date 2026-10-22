// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { TX_EXPENSE, TX_INCOME } = require('../helpers/mockApi')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Menu do "+" e folha "Nova transação" (Nancy 2, tela 11) — celular
// O "+" da barra de baixo abre bolhas (Receita, Compra Parcelada, Falar com IA, Despesa,
// Metas) por cima da tela desfocada; Receita/Despesa abrem a folha por cima do Extrato.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })

async function setup(page) {
  await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(TEST_USER)))
  await page.route('**/api/transactions**', r => {
    if (r.request().method() === 'POST') return r.fulfill(json({ id: 'tx-new' }, 201))
    if (r.request().url().includes('monthly-recap')) return r.fulfill(json({ hasData: true, saved: 100, totalIncome: 5000, totalExpenses: 120 }))
    r.fulfill(json({ data: [TX_EXPENSE, TX_INCOME], total: 2 }))
  })
  await page.goto('/transactions')
  await page.getByText('Almoço').waitFor()
}

const fab = (page) => page.locator('.dsb-mn-fab')
const sheet = (page) => page.getByRole('dialog', { name: 'Nova transação' })
// Botões DENTRO da folha (a tela de trás também tem botões "Entrada", "Alimentação"...)
const inSheet = (page, name) => sheet(page).getByRole('button', { name, exact: true })

test.describe('Menu do "+"', () => {
  test('abre as 5 bolhas por cima da tela desfocada e o "+" vira "×"', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.dsb-qm-bubble')).toHaveCount(0)
    await fab(page).click()
    await expect(page.locator('.dsb-qm-lbl')).toHaveText(['Receita', 'Compra Parcelada', 'Falar com IA', 'Despesa', 'Metas'])
    await expect(fab(page)).toHaveClass(/active/)
    // véu azul-marinho desfocado (design): a tela de trás continua lá, só escurecida
    const veil = await page.evaluate(() => {
      const el = document.querySelector('.dsb-qm-backdrop'); const cs = getComputedStyle(el)
      return { bg: cs.backgroundColor, blur: cs.backdropFilter || cs.webkitBackdropFilter }
    })
    expect(veil.bg).toBe('rgba(18, 26, 51, 0.43)')
    expect(veil.blur).toContain('blur')
  })

  test('tocar no fundo fecha o menu', async ({ page }) => {
    await setup(page)
    await fab(page).click()
    await page.locator('.dsb-qm-backdrop').click({ position: { x: 20, y: 120 } })
    await expect(page.locator('.dsb-qm-bubble')).toHaveCount(0)
    await expect(fab(page)).not.toHaveClass(/active/)
  })

  test('"Despesa" abre a folha "Nova transação" por cima do Extrato, em Saída', async ({ page }) => {
    await setup(page)
    await fab(page).click()
    await page.locator('.dsb-qm-bubble', { hasText: 'Despesa' }).click()
    await expect(sheet(page)).toBeVisible()
    await expect(inSheet(page, 'Saída')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: 'Extrato' })).toBeAttached() // a tela de trás continua lá
    await expect(page.locator('.dsb-qm-bubble')).toHaveCount(0)               // e o menu fechou
  })

  test('"Receita" abre a folha já em Entrada, sem categorias', async ({ page }) => {
    await setup(page)
    await fab(page).click()
    await page.locator('.dsb-qm-bubble', { hasText: 'Receita' }).click()
    await expect(inSheet(page, 'Entrada')).toHaveAttribute('aria-pressed', 'true')
    await expect(sheet(page).getByRole('group', { name: 'Categoria' })).toHaveCount(0)
  })

  test('"Metas" leva para /goals', async ({ page }) => {
    await setup(page)
    await fab(page).click()
    await page.locator('.dsb-qm-bubble', { hasText: 'Metas' }).click()
    await page.waitForURL(/\/goals/)
  })

  test('"Falar com IA" abre o chat da Nancy', async ({ page }) => {
    await setup(page)
    await fab(page).click()
    await page.locator('.dsb-qm-bubble', { hasText: 'Falar com IA' }).click()
    await expect(page.locator('.agent-panel')).toBeVisible()
  })

  test('"Compra Parcelada" abre a tela de compras parceladas com o cursor no formulário', async ({ page }) => {
    await setup(page)
    await fab(page).click()
    await page.locator('.dsb-qm-bubble', { hasText: 'Compra Parcelada' }).click()
    await expect(page).toHaveURL(/\/parcelados$/)
    await expect(page.getByRole('heading', { name: 'Compras parceladas' })).toBeVisible()
    await expect(page.getByPlaceholder('O que você comprou?')).toBeFocused()
  })
})

test.describe('Folha "Nova transação"', () => {
  async function openExpense(page) {
    await fab(page).click()
    await page.locator('.dsb-qm-bubble', { hasText: 'Despesa' }).click()
    await expect(sheet(page)).toBeVisible()
  }

  test('layout do design: título, Saída/Entrada, valor com R$, descrição, categorias e Salvar', async ({ page }) => {
    await setup(page)
    await openExpense(page)
    await expect(page.getByRole('heading', { name: 'Nova transação' })).toBeVisible()
    await expect(page.locator('.ntx-currency')).toHaveText('R$')
    await expect(page.getByPlaceholder('0,00')).toBeVisible()
    await expect(page.getByPlaceholder('Descrição (ex.: Mercado)')).toBeVisible()
    await expect(page.locator('.ntx-chip')).toHaveCount(9)
    await expect(inSheet(page, 'Alimentação')).toHaveAttribute('aria-pressed', 'true')
    // a folha sobe do rodapé: ancorada embaixo, com os cantos de cima arredondados
    await expect.poll(async () => {       // espera a animação de subida (0,28s) terminar
      const box = await page.locator('.ntx-sheet').boundingBox()
      return Math.round(box.y + box.height)
    }).toBe(852)
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ntx-sheet')).borderTopLeftRadius)).toBe('28px')
  })

  test('salvar manda a transação certa (tipo, valor, descrição e categoria escolhida) e fecha a folha', async ({ page }) => {
    await setup(page)
    await openExpense(page)
    await page.getByPlaceholder('0,00').fill('85')
    await page.getByPlaceholder('Descrição (ex.: Mercado)').fill('Corrida')
    await inSheet(page, 'Transporte').click()

    const [req] = await Promise.all([
      page.waitForRequest(r => r.method() === 'POST' && /\/api\/transactions$/.test(r.url())),
      page.getByRole('button', { name: /^salvar$/i }).click(),
    ])
    expect(req.postDataJSON()).toEqual({ description: 'Corrida', amount: 85, type: 'expense', category: 'transport' })
    await expect(sheet(page)).toHaveCount(0)
  })

  test('sem valor não salva e avisa; o X fecha sem confirmar quando nada foi digitado', async ({ page }) => {
    await setup(page)
    await openExpense(page)
    await page.getByRole('button', { name: /^salvar$/i }).click()
    await expect(page.getByText('Insira um valor válido.')).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Fechar' }).click()
    await expect(sheet(page)).toHaveCount(0)
  })
})
