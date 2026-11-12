// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Excluir conta e dados — /excluir-conta. Página PÚBLICA (a Play Console pede um endereço que explique a exclusão da conta e dos dados, sem login).
// Mesma casca dos Termos e da Política. O texto e a deriva em relação ao app e à política estão testados no Vitest; aqui é o que só o navegador mostra.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })

async function setup(page, { loggedIn = false } = {}) {
  if (loggedIn) await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(loggedIn ? json(TEST_USER) : json({ error: 'Não autenticado.' }, 401)))
  await page.goto('/excluir-conta')
  await expect(page.getByRole('heading', { level: 1, name: 'Excluir conta e dados' })).toBeVisible()
}
const overflowX = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

test.describe('Excluir conta e dados — visitante, celular', () => {
  test('abre sem login, com as 4 seções e os 5 passos, e sem a barra de baixo do app', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.fin-hero-sub')).toHaveText('Como apagar sua conta do Nancy')
    await expect(page.locator('.lg-h')).toHaveText(['1. Pelo aplicativo', '2. Por e-mail, se você não consegue entrar', 'O que é apagado', 'O que pode permanecer por um tempo'])
    await expect(page.locator('.lg-ul').first().locator('li')).toHaveCount(5)
    await expect(page.locator('.dsb-mobile-nav')).toHaveCount(0)
    await expect(page).toHaveURL(/\/excluir-conta$/) // não foi mandado para o login
    expect(await overflowX(page)).toBeLessThanOrEqual(0)
  })

  test('o pedido por e-mail abre o contato de privacidade com o assunto pronto', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.lg-card a[href^="mailto:"]')).toHaveAttribute('href', 'mailto:privacidade@myfinancepro.com.br?subject=Excluir%20minha%20conta%20do%20Nancy')
  })

  test('o rodapé leva à Política de Privacidade e aos Termos', async ({ page }) => {
    await setup(page)
    await page.locator('.lg-foot').getByRole('link', { name: 'Política de Privacidade' }).click()
    await expect(page).toHaveURL(/\/privacidade$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Política de Privacidade' })).toBeVisible()
  })
})

for (const [w, h] of [[320, 568], [360, 740], [393, 852], [430, 932]]) {
  test.describe(`Excluir conta e dados — celular ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h } })
    test('sem rolagem lateral e nada passa da borda do cartão', async ({ page }) => {
      await setup(page)
      expect(await overflowX(page)).toBeLessThanOrEqual(0)
      const fora = await page.evaluate(() => {
        const c = document.querySelector('.lg-card').getBoundingClientRect()
        return [...document.querySelectorAll('.lg-card *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > c.right + 0.5 || r.left < c.left - 0.5) }).length
      })
      expect(fora).toBe(0)
    })
  })
}

test.describe('Excluir conta e dados — logado', () => {
  test('celular: a barra de baixo aparece e o Perfil fica aceso', async ({ page }) => {
    await setup(page, { loggedIn: true })
    await expect(page.locator('.dsb-mobile-nav')).toBeVisible()
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
  })

  test.describe('desktop', () => {
    test.use({ viewport: { width: 1299, height: 616 } })
    test('abre dentro da casca da conta: título na barra de cima, cartão do usuário aceso e sem rolagem lateral', async ({ page }) => {
      await setup(page, { loggedIn: true })
      await expect(page.locator('.nds-topbar-title')).toHaveText('Excluir conta e dados')
      await expect(page.locator('.nds-user.active')).toHaveCount(1)
      await expect(page.locator('.ndl-card')).toContainText('Passo 1')
      expect(await overflowX(page)).toBeLessThanOrEqual(0)
    })
  })
})

test.describe('Excluir conta e dados — visitante, desktop', () => {
  test.use({ viewport: { width: 1299, height: 616 } })
  test('abre sem login, com o mesmo texto, e sem rolagem lateral', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.lg-h')).toHaveCount(4)
    await expect(page.locator('.lg-ul').first().locator('li')).toHaveCount(5)
    expect(await overflowX(page)).toBeLessThanOrEqual(0)
  })
})
