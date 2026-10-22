// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Primeiros passos (Nancy 2, tela 07) e o tema claro. O onboarding abre por cima do Início (tema
// claro imposto) e as telas de auth também aparecem pra quem salvou o tema claro: as regras antigas
// `[data-theme="light"] .auth-*` deixavam o título escuro em cima do azul.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })

test('onboarding no celular: tela cheia, título branco, voltar translúcido sem borda e "Pular por agora"', async ({ page }) => {
  const user = { ...TEST_USER, onboardingComplete: false }
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.goto('/dashboard')

  await expect(page.getByRole('heading', { name: 'Vamos começar' })).toBeVisible()
  await expect(page.getByText('Quanto você ganha por mês?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pular por agora' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible()

  const m = await page.evaluate(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s))
    const shell = document.querySelector('.ob-shell').getBoundingClientRect()
    return {
      theme: document.documentElement.getAttribute('data-theme'),
      title: cs('.ob-hero .auth-title').color, titleSize: cs('.ob-hero .auth-title').fontSize,
      backBorder: cs('.ob-hero .auth-back').borderTopWidth, backSize: [cs('.ob-hero .auth-back').width, cs('.ob-hero .auth-back').height],
      shell: [Math.round(shell.x), Math.round(shell.width), Math.round(shell.height)],
      sheetRadius: cs('.ob-sheet').borderTopLeftRadius,
    }
  })
  expect(m.theme).toBe('light') // aberto por cima do Início, que impõe o tema claro
  expect(m.title).toBe('rgb(255, 255, 255)')
  expect(m.titleSize).toBe('32px')
  expect(m.backBorder).toBe('0px')
  expect(m.backSize).toEqual(['42px', '42px'])
  expect(m.shell.slice(0, 2)).toEqual([0, 393])        // largura total
  expect(m.shell[2]).toBeGreaterThanOrEqual(852)        // altura total da tela
  expect(m.sheetRadius).toBe('26px')
})

test('quem salvou o tema claro vê o título das telas de auth em branco sobre o azul', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'light'))
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible()
  const color = await page.evaluate(() => getComputedStyle(document.querySelector('.auth-hero .auth-title')).color)
  expect(color).toBe('rgb(255, 255, 255)')
})
