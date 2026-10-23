// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Termos de Uso (Nancy 2, tela 34) — /termos, celular. Página pública: o cadastro a abre numa aba nova.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })

async function setup(page, { loggedIn = true } = {}) {
  if (loggedIn) await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(loggedIn ? json(TEST_USER) : json({ error: 'Não autenticado.' }, 401)))
  await page.goto('/termos')
}

test.describe('Termos de Uso', () => {
  test('layout do design: cabeçalho azul, cartão branco com as seções e rodapé de dúvidas; Perfil aceso', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Atualizado em mai/2026')
    await expect(page.locator('.lg-h')).toHaveCount(12)
    await expect(page.locator('.lg-foot-line').first()).toContainText('Dúvidas: contato@nancy.com.br')
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
    const m = await page.evaluate(() => {
      const b = document.querySelector('.lg-card').getBoundingClientRect()
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return { left: Math.round(b.left), width: Math.round(b.width), h: cs('.lg-h').fontSize, hColor: cs('.lg-h').color, hero: cs('.fin-hero').backgroundColor, theme: document.documentElement.getAttribute('data-theme') }
    })
    expect(m.left).toBe(18); expect(m.width).toBe(357) // 393 − 2 × 18 de margem
    expect(m.h).toBe('15px'); expect(m.hColor).toBe('rgb(18, 26, 51)')
    expect(m.hero).toBe('rgb(28, 72, 255)'); expect(m.theme).toBe('light')
  })

  test('visitante (sem login): lê os termos sem a barra de baixo e o voltar leva à página inicial', async ({ page }) => {
    await setup(page, { loggedIn: false })
    await expect(page.getByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeVisible()
    await expect(page.locator('.dsb-mobile-nav')).toHaveCount(0)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).not.toHaveURL(/\/termos$/)
  })

  test('o link do Perfil abre os Termos, o de Privacidade do rodapé segue e voltar retorna', async ({ page }) => {
    await setup(page)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Termos de uso', exact: true }).click()
    await expect(page).toHaveURL(/\/termos$/)
    await page.locator('.lg-foot').getByRole('link', { name: 'Política de Privacidade' }).click()
    await expect(page).toHaveURL(/\/privacidade$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/termos$/)
  })
})
