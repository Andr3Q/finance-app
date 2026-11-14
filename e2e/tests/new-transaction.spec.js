// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { TX_EXPENSE, TX_INCOME } = require('../helpers/mockApi')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Menu do "+" e folha "Nova transação" (Nancy 2, tela 11) — celular
// O "+" da barra de baixo abre bolhas (Receita, Compra Parcelada, Falar com IA, Despesa,
// Analisar compra, Metas) por cima da tela desfocada; Receita/Despesa abrem a folha por cima do Extrato.
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
  test('abre as 6 bolhas por cima da tela desfocada e o "+" vira "×"', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.dsb-qm-bubble')).toHaveCount(0)
    await fab(page).click()
    await expect(page.locator('.dsb-qm-lbl')).toHaveText(['Receita', 'Compra Parcelada', 'Falar com IA', 'Despesa', 'Analisar compra', 'Metas']) // o Analisador entrou; nenhuma saiu
    await expect(fab(page)).toHaveClass(/active/)
    // véu azul-marinho desfocado (design): a tela de trás continua lá, só escurecida
    const veil = await page.evaluate(() => {
      const el = document.querySelector('.dsb-qm-backdrop'); const cs = getComputedStyle(el)
      return { bg: cs.backgroundColor, blur: cs.backdropFilter || cs.webkitBackdropFilter }
    })
    expect(veil.bg).toBe('rgba(18, 26, 51, 0.43)')
    expect(veil.blur).toContain('blur')
  })

  // Design da tela 37: 3 linhas de 2 bolhas (antes eram 2 + 2 + 1 centralizada). As 4 primeiras ficam onde estavam; "Analisar compra" e "Metas" fecham a última linha.
  test('as 6 bolhas formam 3 linhas de 2, todas dentro da tela e sem se sobrepor', async ({ page }) => {
    await setup(page)
    await fab(page).click()
    await expect(page.locator('.dsb-qm-bubble')).toHaveCount(6)
    await page.waitForTimeout(700) // a animação de entrada
    const b = await page.evaluate(() => [...document.querySelectorAll('.dsb-qm-bubble')].map(e => { const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) } }))
    expect(new Set(b.map(x => x.l)).size).toBe(2)                         // duas colunas
    expect(new Set(b.map(x => x.t)).size).toBe(3)                         // três linhas
    expect([b[0].l, b[2].l, b[4].l].every(x => x === b[0].l)).toBe(true)  // Receita, Falar com IA e Analisar compra na esquerda
    expect([b[1].l, b[3].l, b[5].l].every(x => x === b[1].l)).toBe(true)  // Compra Parcelada, Despesa e Metas na direita
    for (const x of b) { expect(x.l).toBeGreaterThanOrEqual(0); expect(x.r).toBeLessThanOrEqual(393); expect(x.t).toBeGreaterThanOrEqual(0) }
    for (let i = 0; i < 4; i += 2) expect(b[i].b).toBeLessThanOrEqual(b[i + 2].t) // uma linha não invade a de baixo
  })

  test('"Analisar compra" abre o Analisador de compras', async ({ page }) => {
    await setup(page)
    await fab(page).click()
    await page.locator('.dsb-qm-bubble', { hasText: 'Analisar compra' }).click()
    await expect(page).toHaveURL(/\/analisador$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Analisador de compras' })).toBeVisible()
    await expect(page.locator('.dsb-qm-bubble')).toHaveCount(0)            // e o menu fechou
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

// ─────────────────────────────────────────────────────────────────
// Teclado aberto (celular). No iPhone e no Chrome do Android o teclado NÃO encolhe a tela do app: ele cobre a parte de
// baixo e o navegador rola a página. A folha tem que acompanhar só a parte visível (window.visualViewport), caber nela e
// manter o Salvar à vista — antes o título subia para baixo do relógio e o Salvar ficava atrás do teclado (2026-11-13).
// O navegador de teste não tem teclado de verdade: o visualViewport é simulado (altura, deslocamento e zoom).
// ─────────────────────────────────────────────────────────────────
test.describe('Folha "Nova transação" com o teclado aberto', () => {
  async function setupComTeclado(page) {
    await page.addInitScript(() => {
      const vv = new EventTarget()
      const st = { h: null, top: 0, scale: 1 }
      Object.defineProperties(vv, {
        height:    { get: () => st.h ?? window.innerHeight },
        offsetTop: { get: () => st.top },
        scale:     { get: () => st.scale },
      })
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
      window.__teclado = {
        abre: (h, top = 0) => { st.h = h; st.top = top; vv.dispatchEvent(new Event('resize')) },
        fecha: () => { st.h = null; st.top = 0; vv.dispatchEvent(new Event('resize')) },
        zoom: (h, scale) => { st.h = h; st.scale = scale; vv.dispatchEvent(new Event('resize')) },
      }
    })
    await setup(page)
    await fab(page).click()
    await page.locator('.dsb-qm-bubble', { hasText: 'Despesa' }).click()
    await expect(sheet(page)).toBeVisible()
    const altura = page.viewportSize().height
    await expect.poll(async () => { const b = await page.locator('.ntx-sheet').boundingBox(); return Math.round(b.y + b.height) }).toBe(altura) // subida terminou
  }
  const abre = (page, h, top = 0) => page.evaluate(([a, b]) => window.__teclado.abre(a, b), [h, top])
  const caixas = (page) => page.evaluate(() => {
    const r = (sel) => { const b = document.querySelector(sel)?.getBoundingClientRect(); return b && { t: Math.round(b.top), b: Math.round(b.bottom) } }
    const sh = document.querySelector('.ntx-sheet')
    return {
      sheet: r('.ntx-sheet'), title: r('.ntx-title'), amount: r('.ntx-amount'), save: r('.ntx-save'),
      chips: [...document.querySelectorAll('.ntx-chip')].map(c => { const b = c.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom) } }),
      sobra: sh.scrollHeight - sh.clientHeight,                      // quanto o conteúdo passa da altura da folha (≤ 1 = cabe)
      rola: sh.scrollHeight > sh.clientHeight + 1,
      kb: document.querySelector('.ntx-overlay').hasAttribute('data-kb'),
    }
  })
  const shot = async (page, nome) => { if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/${nome}.png` }) }

  test('sem teclado a folha é a do design (nada de compacto)', async ({ page }) => {
    await setupComTeclado(page)
    const c = await caixas(page)
    expect(c.kb).toBe(false)
    expect(c.sheet.b).toBe(852)
    await shot(page, 'sem-teclado')
  })

  // iPhone 14 (390x844) do André, medido no print dele: teclado + barra "OK" deixam 464px visíveis; o relógio ocupa os 47 de cima → 417 de folha.
  test('teclado aberto: o formulário INTEIRO cabe acima do teclado, sem rolar, e o Salvar fica à vista', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setupComTeclado(page)
    await abre(page, 417)
    await expect(page.locator('.ntx-overlay')).toHaveAttribute('data-kb', '')
    await expect.poll(async () => (await caixas(page)).sheet.b).toBe(417)   // ancorada logo acima do teclado
    const c = await caixas(page)
    expect(c.sheet.t).toBeGreaterThanOrEqual(0)
    expect(c.sobra).toBeLessThanOrEqual(1)                                   // cabe sem rolar
    expect(c.title.t).toBeGreaterThanOrEqual(c.sheet.t)                       // o título não sumiu por cima
    expect(c.save.b).toBeLessThanOrEqual(417)                                // Salvar acima do teclado
    expect(c.chips).toHaveLength(9)
    for (const ch of c.chips) { expect(ch.t).toBeGreaterThanOrEqual(c.sheet.t); expect(ch.b).toBeLessThanOrEqual(c.save.t) }
    // alvos de toque continuam confortáveis
    expect(c.chips[0].b - c.chips[0].t).toBeGreaterThanOrEqual(32)
    expect(c.save.b - c.save.t).toBeGreaterThanOrEqual(44)   // 44px é o mínimo confortável para o toque
    await shot(page, 'teclado-iphone')
  })

  test('a tela do iPhone rolada pelo teclado (deslocamento de 300px): a folha segue a parte visível, não a tela inteira', async ({ page }) => {
    await setupComTeclado(page)
    await abre(page, 470, 300)
    await expect.poll(async () => (await caixas(page)).sheet.b).toBe(770)   // 300 (topo visível) + 470
    const c = await caixas(page)
    expect(c.sheet.t).toBeGreaterThanOrEqual(300)
    expect(c.save.b).toBeLessThanOrEqual(770)
  })

  test('celular pequeno (375x667, ~330px visíveis): rola por dentro, mas valor e Salvar continuam à vista', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await setupComTeclado(page)
    await abre(page, 330)
    await expect.poll(async () => (await caixas(page)).sheet.b).toBe(330)
    let c = await caixas(page)
    expect(c.rola).toBe(true)                                                // não cabe: rola por dentro
    expect(c.save.b).toBeLessThanOrEqual(330)                                // mas o Salvar não some atrás do teclado
    expect(c.save.t).toBeGreaterThanOrEqual(c.sheet.t)
    await page.evaluate(() => { document.querySelector('.ntx-sheet').scrollTop = 0 })
    c = await caixas(page)
    expect(c.title.t).toBeGreaterThanOrEqual(0)                              // no topo: título e valor visíveis
    expect(c.amount.b).toBeLessThanOrEqual(330)
    expect(c.save.b).toBeLessThanOrEqual(330)                                // com a folha no topo, o Salvar fica grudado embaixo
    await shot(page, 'teclado-pequeno-topo')
    await page.evaluate(() => { const s = document.querySelector('.ntx-sheet'); s.scrollTop = s.scrollHeight })
    c = await caixas(page)
    expect(c.save.b).toBeLessThanOrEqual(330)
    await shot(page, 'teclado-pequeno-fim')
  })

  test('fechar o teclado devolve a folha do design; zoom da página não conta como teclado', async ({ page }) => {
    await setupComTeclado(page)
    await abre(page, 417)
    await expect(page.locator('.ntx-overlay')).toHaveAttribute('data-kb', '')
    await page.evaluate(() => window.__teclado.fecha())
    await expect(page.locator('.ntx-overlay')).not.toHaveAttribute('data-kb', '')
    await expect.poll(async () => (await caixas(page)).sheet.b).toBe(852)
    await page.evaluate(() => window.__teclado.zoom(400, 2))                  // zoom 2x: parte visível menor, mas não é teclado
    await expect(page.locator('.ntx-overlay')).not.toHaveAttribute('data-kb', '')
  })

  test('com o teclado aberto dá para escolher a categoria e salvar', async ({ page }) => {
    await setupComTeclado(page)
    await abre(page, 417)
    await page.getByPlaceholder('0,00').fill('42')
    await page.getByPlaceholder('Descrição (ex.: Mercado)').fill('Padaria')
    await inSheet(page, 'Lazer').click()
    const [req] = await Promise.all([
      page.waitForRequest(r => r.method() === 'POST' && /\/api\/transactions$/.test(r.url())),
      page.getByRole('button', { name: /^salvar$/i }).click(),
    ])
    expect(req.postDataJSON()).toEqual({ description: 'Padaria', amount: 42, type: 'expense', category: 'leisure' })
  })
})
