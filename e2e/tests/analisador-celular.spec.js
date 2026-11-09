// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Analisador de compras no CELULAR (Nancy 2, tela 37): a mesma conta do desktop, em outra tela. Dois caminhos até ela: o botão "+" (bolha "Analisar compra")
// e o chip "Analisador" no fim da faixa de atalhos do Extrato. A conta e as ações estão testadas no Vitest; aqui é o que só o navegador mostra:
// a navegação, o visual em vários celulares (320 a 430 px) e a barra de baixo.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
// o cenário do design: renda 15.000, fixas 5.127, parcelas 1.000/mês, variável 2.220, saldo 23.500, saúde 79
const BASE = { income: 15000, fixedTotal: 5127, installmentsMonthly: 1000, variableAvg: 2220, monthlyCost: 7347, leftover: 6653, balance: 23500, score: 79, hasHistory: true }

async function open(page, path = '/analisador') {
  await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(TEST_USER)))
  await page.route('**/api/analyzer/base**', r => r.fulfill(json(BASE)))
  await page.route('**/api/transactions**', r => r.fulfill(json({ data: [], total: 0 })))
  await page.goto(path)
}
const analyze = (page) => page.getByRole('button', { name: /Analisar com a Nancy/ }).click()
const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

test.describe('Analisador no celular — como chegar', () => {
  test('pelo Extrato: o chip "Analisador" é o ÚLTIMO da faixa de atalhos e os outros continuam', async ({ page }) => {
    await open(page, '/transactions')
    const chips = page.locator('.ex-chip')
    await expect(chips).toHaveText(['Contas do mês', 'Parcelados', 'Calendário', 'Análise do mês', 'Analisador'])
    await page.locator('.ex-chip', { hasText: 'Analisador' }).click()
    await expect(page).toHaveURL(/\/analisador$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Analisador de compras' })).toBeVisible()
  })

  test('o botão voltar leva à tela de onde a pessoa veio', async ({ page }) => {
    await open(page, '/transactions')
    await page.locator('.ex-chip', { hasText: 'Analisador' }).click()
    await expect(page).toHaveURL(/\/analisador$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/transactions$/)
  })

  test('na tela, a barra de baixo mostra "Início" acesa (como no desenho) e o "+" continua no meio', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Analisador de compras' })).toBeVisible()
    await expect(page.locator('.dsb-mn-item.active')).toHaveText('Início')
    await expect(page.locator('.dsb-mn-fab')).toBeVisible()
  })
})

test.describe('Analisador no celular — o fluxo na tela', () => {
  test('formulário → resultado → Editar → Analisar outra compra', async ({ page }) => {
    await open(page)
    await expect(page.getByLabel('A Nancy está usando')).toContainText('R$ 15.000,00')
    await page.getByLabel('Produto', { exact: true }).fill('Celular novo')
    await page.getByLabel('Valor', { exact: true }).fill('7000')
    await analyze(page)
    await expect(page.getByLabel('Veredito da Nancy')).toContainText('Pague à vista no Pix')
    await expect(page.getByLabel('Valor', { exact: true })).toHaveCount(0)                              // o formulário sai
    await expect(page.locator('.anm-opt')).toHaveCount(7)
    await page.getByRole('button', { name: 'Editar' }).click()
    await expect(page.getByLabel('Valor', { exact: true })).toHaveValue('7000')
    await page.getByLabel('Valor', { exact: true }).fill('85000')
    await analyze(page)
    await expect(page.getByLabel('Veredito da Nancy')).toContainText('Não compre agora')
    await page.getByRole('button', { name: 'Analisar outra compra' }).click()
    await expect(page.getByLabel('Produto', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Valor', { exact: true })).toHaveValue('')
  })

  test('analisar leva a tela para o topo (o veredito aparece sem a pessoa precisar subir)', async ({ page }) => {
    await open(page)
    await page.getByLabel('Valor', { exact: true }).fill('7000')
    await page.getByRole('button', { name: /Analisar com a Nancy/ }).scrollIntoViewIfNeeded()
    await analyze(page)
    const verdict = page.getByLabel('Veredito da Nancy')
    await expect(verdict).toBeVisible()
    // o app rola com animação suave (scroll-behavior: smooth): espera a rolagem CHEGAR ao topo em vez de medir no meio dela
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY)), { timeout: 4000 }).toBe(0)
    const y = await verdict.evaluate(e => Math.round(e.getBoundingClientRect().top))
    expect(y).toBeGreaterThanOrEqual(0)
    expect(y).toBeLessThan(500) // acima da dobra: o veredito aparece sem a pessoa precisar subir
  })
})

// "Responsivo em todos os celulares": do iPhone SE (320) ao Max (430). Sem rolagem lateral, nada cortado na borda do cartão.
for (const [w, h] of [[320, 568], [360, 740], [393, 852], [430, 932]]) {
  test.describe(`Analisador no celular — janela de ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } })

    test('formulário: sem rolagem lateral, os 3 modos, as 5 vezes e os atalhos cabem; o botão Analisar é alcançável', async ({ page }) => {
      await open(page)
      await expect(page.getByLabel('A Nancy está usando')).toContainText('R$ 15.000,00')
      expect(await overflowX(page)).toBeLessThanOrEqual(0)
      const dentro = await page.evaluate(() => {
        const card = document.querySelector('.anm-form').getBoundingClientRect()
        const ok = (sel) => [...document.querySelectorAll(sel)].every(e => { const r = e.getBoundingClientRect(); return r.left >= card.left - 0.5 && r.right <= card.right + 0.5 })
        return { modos: ok('.anm-mode'), vezes: ok('.anm-n'), campos: ok('.anm-input, .anm-price'), go: ok('.anm-go'), nModos: document.querySelectorAll('.anm-mode').length, nVezes: document.querySelectorAll('.anm-n').length }
      })
      expect(dentro).toEqual({ modos: true, vezes: true, campos: true, go: true, nModos: 3, nVezes: 5 })
      await page.getByRole('button', { name: /Analisar com a Nancy/ }).scrollIntoViewIfNeeded()
      await expect(page.getByRole('button', { name: /Analisar com a Nancy/ })).toBeInViewport()
    })

    test('resultado: sem rolagem lateral e nada passa da borda dos cartões (nem o comparativo das 7 formas)', async ({ page }) => {
      await open(page)
      await page.getByLabel('Produto', { exact: true }).fill('Viagem a Lisboa')
      await page.getByLabel('Valor', { exact: true }).fill('12000')
      await analyze(page)
      await expect(page.getByLabel('Veredito da Nancy')).toBeVisible()
      expect(await overflowX(page)).toBeLessThanOrEqual(0)
      const fora = await page.evaluate(() => {
        const bad = []
        for (const card of document.querySelectorAll('.anm-card, .anm-verdict, .anm-summary')) {
          const c = card.getBoundingClientRect()
          for (const e of card.querySelectorAll('*')) {
            const r = e.getBoundingClientRect()
            if (r.width > 0 && (r.right > c.right + 0.5 || r.left < c.left - 0.5)) bad.push(`${card.className} > ${e.className || e.tagName}`)
          }
        }
        return bad
      })
      expect(fora).toEqual([])
    })
  })
}
