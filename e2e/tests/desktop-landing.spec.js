// @ts-nocheck
const { test, expect } = require('../helpers/test')

// ─────────────────────────────────────────────────────────────────
// Boas-vindas no desktop (design "Nancy Desktop", tela 02, 1440×900): painel azul à esquerda, "Comece grátis." à direita.
// Medidas FINAIS do app (o protótipo é content-box): painel azul = 62% + 2×56px; cartões 300+2×22 e 260+2×18; botão
// secundário 54 + 2×1,5 de borda. No protótipo o painel branco passa 65px da janela e os botões saem cortados — aqui cabem.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 900 } })

async function open(page) {
  await page.goto('/')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 }) // a abertura (≈4s) cobre a tela
  await expect(page.locator('.ad-split')).toBeVisible()
}
const box = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10, ow: e.offsetWidth } }, sel)

test.describe('Boas-vindas desktop — painel azul', () => {
  test('largura 62% + 112px, título de 84px numa linha com "saudável." em menta, texto e rótulos do design', async ({ page }) => {
    await open(page)
    expect(await box(page, '.ad-hero')).toMatchObject({ x: 0, y: 0, w: 1004.8, h: 900 })
    const title = page.getByRole('heading', { level: 1 })
    await expect(title).toHaveText('Seu dinheiro, saudável.')
    await expect(title).toHaveCSS('font-size', '84px')
    await expect(title).toHaveCSS('font-weight', '800')
    await expect(title.locator('span')).toHaveCSS('color', 'rgb(59, 227, 160)')
    expect((await box(page, '.ad-headline')).h).toBeLessThan(90) // uma linha só (84px × .96)
    await expect(page.locator('.ad-hero')).toHaveCSS('background-color', 'rgb(21, 70, 255)')
    await expect(page.locator('.ad-lead')).toHaveText('Organize contas, crie metas, veja sua planilha se montar sozinha e converse com uma IA que entende suas finanças.')
    await expect(page.locator('.ad-pills li')).toHaveText(['Resumo em stories', 'Nancy IA com voz', 'Planilha IA', 'LGPD'])
  })

  test('cartões inclinados com o tamanho do design (344 e 296px) e o texto do exemplo', async ({ page }) => {
    await open(page)
    expect((await box(page, '.ad-card-balance')).ow).toBe(344)
    expect((await box(page, '.ad-card-ai')).ow).toBe(296)
    await expect(page.locator('.ad-card-balance')).toContainText('Saldo disponível')
    await expect(page.locator('.ad-card-balance')).toContainText('R$ 23.500')
    await expect(page.locator('.ad-card-balance')).toContainText('Saúde 79')
    await expect(page.locator('.ad-card-ai')).toContainText('Você pode guardar R$ 400 a mais cortando delivery.')
    await expect(page.locator('.ad-card-balance')).toHaveCSS('transform', /matrix\(0\.99/)
  })
})

test.describe('Boas-vindas desktop — painel branco', () => {
  test('o conteúdo cabe inteiro na janela (botões e aviso não saem cortados) e a página não rola para o lado', async ({ page }) => {
    await open(page)
    const inner = await box(page, '.ad-panel-inner')
    expect(inner.x).toBe(1044.8)
    expect(inner.x + inner.w).toBeLessThanOrEqual(1440 - 40 + 0.5)
    for (const sel of ['.ad-btn-primary', '.ad-btn-secondary']) {
      const b = await box(page, sel)
      expect(b.x + b.w, sel).toBeLessThanOrEqual(1440)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
  })

  test('"Comece grátis." 40px, botões de 54px e 57px, cores do design', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('heading', { level: 2, name: 'Comece grátis.' })).toHaveCSS('font-size', '40px')
    await expect(page.getByText('Leva menos de 1 minuto. Sem cartão.')).toBeVisible()
    const primary = page.getByRole('link', { name: 'Criar conta grátis' })
    const secondary = page.getByRole('link', { name: 'Já tenho conta' })
    expect((await box(page, '.ad-btn-primary')).h).toBe(54)
    expect((await box(page, '.ad-btn-secondary')).h).toBe(57)
    await expect(primary).toHaveCSS('background-color', 'rgb(21, 70, 255)')
    await expect(primary).toHaveCSS('color', 'rgb(255, 255, 255)')
    await expect(secondary).toHaveCSS('border-top-color', 'rgb(201, 217, 255)')
    await expect(secondary).toHaveCSS('color', 'rgb(21, 70, 255)')
  })

  test('os botões levam ao cadastro e ao login; o aviso leva aos Termos e à Privacidade', async ({ page }) => {
    await open(page)
    await page.getByRole('link', { name: 'Criar conta grátis' }).click()
    await expect(page).toHaveURL(/\/register$/)
    await page.goBack()
    await page.getByRole('link', { name: 'Já tenho conta' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goBack()
    await page.getByRole('link', { name: 'Termos', exact: true }).click()
    await expect(page).toHaveURL(/\/termos$/)
    await page.goBack()
    await page.getByRole('link', { name: 'Política de Privacidade' }).click()
    await expect(page).toHaveURL(/\/privacidade$/)
  })
})

test.describe('Boas-vindas desktop — outros tamanhos', () => {
  for (const [w, h] of [[1024, 768], [1920, 1080]]) {
    test(`${w}×${h}: sem rolagem para o lado, título e botões visíveis`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await open(page)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(w)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const b = await box(page, '.ad-btn-primary')
      expect(b.x + b.w).toBeLessThanOrEqual(w)
      expect(b.w).toBeGreaterThan(300) // painel branco nunca abaixo de 420px
      expect(await box(page, '.ad-hero')).toMatchObject({ w: Math.round(Math.min(w * 0.62 + 112, w - 420) * 10) / 10 })
    })
  }

  test('o corte é em 901px: com 900px aparece o celular, com 901px o desktop (sem recarregar)', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 })
    await page.goto('/')
    await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
    await expect(page.locator('.lw-page')).toBeVisible()
    await expect(page.locator('.ad-split')).toHaveCount(0)
    await page.setViewportSize({ width: 901, height: 800 })
    await expect(page.locator('.ad-split')).toBeVisible()
    await expect(page.locator('.lw-page')).toHaveCount(0)
  })

  test('no celular continua a Boas-vindas do celular', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/')
    await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
    await expect(page.locator('.lw-page')).toBeVisible()
    await expect(page.locator('.ad-split')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Criar conta grátis' })).toBeVisible()
  })
})
