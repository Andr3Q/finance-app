// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Erro 404 (Nancy 2, tela 36) — qualquer endereço que não existe, celular.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })

async function setup(page, { loggedIn = true } = {}) {
  if (loggedIn) await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(loggedIn ? json(TEST_USER) : json({ error: 'Não autenticado.' }, 401)))
  await page.goto('/essa-pagina-nao-existe')
}

test.describe('Erro 404', () => {
  test('layout do design: cabeçalho "Ops!", 404 azul grande, mensagem e botão azul; barra de baixo', async ({ page }) => {
    await setup(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Ops!' })).toBeVisible()
    await expect(page.locator('.fin-hero-sub')).toHaveText('Erro 404')
    await expect(page.locator('.nf-code')).toHaveText('404')
    await expect(page.locator('.nf-title')).toHaveText('Essa página saiu do orçamento.')
    await expect(page.locator('.nf-sub')).toHaveText('O link pode estar quebrado ou a página foi removida.')
    await expect(page.locator('.dsb-mobile-nav')).toBeVisible()
    const m = await page.evaluate(() => {
      const top = document.querySelector('.fin-body').getBoundingClientRect().top
      const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.top - top), Math.round(b.width), Math.round(b.height)] }
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return { code: cs('.nf-code').color, btnBg: cs('.nf-home').backgroundColor, btn: r('.nf-home'), title: r('.nf-title'), theme: document.documentElement.getAttribute('data-theme') }
    })
    expect(m.code).toBe('rgb(28, 72, 255)'); expect(m.btnBg).toBe('rgb(28, 72, 255)')
    expect(m.btn[0]).toBe(262); expect(m.btn[2]).toBe(54) // medidas no print (botão a 262 do topo do corpo, 54 de altura)
    expect(m.title[0]).toBe(179)
    expect(m.theme).toBe('light')
  })

  test('logado: "Voltar ao início" abre o Dashboard', async ({ page }) => {
    await setup(page)
    await page.getByRole('button', { name: 'Voltar ao início' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('visitante: sem a barra de baixo e "Voltar ao início" sai da página de erro', async ({ page }) => {
    await setup(page, { loggedIn: false })
    await expect(page.locator('.nf-code')).toHaveText('404')
    await expect(page.locator('.dsb-mobile-nav')).toHaveCount(0)
    await page.getByRole('button', { name: 'Voltar ao início' }).click()
    await expect(page).not.toHaveURL(/essa-pagina-nao-existe/)
  })
})
