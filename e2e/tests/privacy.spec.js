// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Política de Privacidade (Nancy 2, tela 35) — /privacidade, celular. Página pública, mesma casca dos Termos.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })

async function setup(page, { loggedIn = true } = {}) {
  if (loggedIn) await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(loggedIn ? json(TEST_USER) : json({ error: 'Não autenticado.' }, 401)))
  await page.goto('/privacidade')
}

test.describe('Política de Privacidade', () => {
  test('layout do design: cabeçalho azul, cartão branco com as seções e o contato do Encarregado, rodapé de dúvidas; Perfil aceso', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Política de Privacidade' })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Conforme a LGPD')
    await expect(page.locator('.lg-h')).toHaveCount(11)
    await expect(page.locator('.lg-foot-line').first()).toContainText('Dúvidas: privacidade@nancy.com.br')
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
    const m = await page.evaluate(() => {
      const b = document.querySelector('.lg-card').getBoundingClientRect()
      return { left: Math.round(b.left), width: Math.round(b.width), hero: getComputedStyle(document.querySelector('.fin-hero')).backgroundColor, theme: document.documentElement.getAttribute('data-theme') }
    })
    expect(m.left).toBe(18); expect(m.width).toBe(357) // 393 − 2 × 18 de margem
    expect(m.hero).toBe('rgb(28, 72, 255)'); expect(m.theme).toBe('light')
  })

  test('visitante: lê sem a barra de baixo e o rodapé leva aos Termos', async ({ page }) => {
    await setup(page, { loggedIn: false })
    await expect(page.getByRole('heading', { level: 1, name: 'Política de Privacidade' })).toBeVisible()
    await expect(page.locator('.dsb-mobile-nav')).toHaveCount(0)
    await page.locator('.lg-foot').getByRole('link', { name: 'Termos de Uso' }).click()
    await expect(page).toHaveURL(/\/termos$/)
  })
})
