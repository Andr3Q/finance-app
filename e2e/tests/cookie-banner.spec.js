// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Aviso de cookies (Nancy 2). O aviso antigo usava variáveis de cor que não existem e ficava TRANSPARENTE: o texto se
// misturava com os botões da landing e do cadastro. O helper injectSession já aceita os cookies pra não atrapalhar os outros
// testes; aqui a visita começa SEM decisão guardada.
// ─────────────────────────────────────────────────────────────────

test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const USER = { ...TEST_USER, plan: 'elite' }

async function safeArea(page, context) {
  const cdp = await context.newCDPSession(page)
  try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } }) } catch { /* sem emulação: o resto do teste vale igual */ }
}
// espera a animação de entrada do cartão (desliza 12px) terminar antes de medir, senão a posição vem 12px fora
// A splash (vídeo de ~4s) cobre a tela a cada carregamento e as telas entram com animação: só mede depois que a splash saiu e as
// animações finitas terminaram (no CI, mais lento, medir antes dava posições fora do lugar).
async function ready(page) {
  await expect(page.locator('#app-splash')).toBeHidden({ timeout: 20000 })
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect && a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))))
}
const box = (page, sel) => page.evaluate(async (s) => {
  const el = document.querySelector(s)
  await Promise.all(el.getAnimations().map(a => a.finished))
  const r = el.getBoundingClientRect()
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), width: Math.round(r.width), h: Math.round(r.height) }
}, sel)

test.describe('Aviso de cookies', () => {
  test('visitante no celular: cartão branco OPACO, sem esconder os botões da landing, e a página rola até tudo ficar acima dele', async ({ page, context }) => {
    await page.route('**/api/**', r => r.fulfill(json([])))
    await safeArea(page, context)
    await page.goto('/')
    const banner = page.getByRole('region', { name: 'Aviso de cookies' })
    await expect(banner).toBeVisible({ timeout: 15000 })
    await ready(page)
    const style = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.ck-banner')); return { bg: cs.backgroundColor, radius: cs.borderTopLeftRadius, pad: getComputedStyle(document.documentElement).getPropertyValue('--ck-pad') } })
    expect(style.bg).toBe('rgb(255, 255, 255)') // antes: transparente (var(--s1) não existe)
    expect(style.radius).toBe('22px')
    expect(style.pad).toContain('calc(')
    await expect(page.getByRole('button', { name: 'Aceitar' })).toHaveCSS('background-color', 'rgb(28, 72, 255)')

    // sem rolar: o botão "Já tenho conta" não fica por baixo do cartão
    const b = await box(page, '.ck-banner')
    const jaTenho = page.getByRole('button', { name: 'Já tenho conta' }).or(page.getByRole('link', { name: 'Já tenho conta' }))
    const j = await jaTenho.first().evaluate(e => Math.round(e.getBoundingClientRect().bottom))
    expect(j).toBeLessThanOrEqual(b.top + 1)

    // rolando até o fim (sem a rolagem suave do CSS), o último texto da página fica acima do cartão: o respiro de baixo existe
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
    await expect.poll(() => page.evaluate(() => {
      const els = [...document.querySelectorAll('.lw-page *')].filter(e => e.children.length === 0 && e.textContent.trim())
      return Math.round(Math.max(...els.map(e => e.getBoundingClientRect().bottom))) - Math.round(document.querySelector('.ck-banner').getBoundingClientRect().top)
    })).toBeLessThanOrEqual(0)
  })

  test('Aceitar guarda a decisão, tira o aviso e o respiro, e ele não volta ao recarregar; o aviso de instalar o app espera a decisão', async ({ page }) => {
    await page.route('**/api/**', r => r.fulfill(json([])))
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.ib-wrap')).toBeHidden() // enquanto os cookies estão pendentes, só um aviso por vez
    await page.getByRole('button', { name: 'Aceitar' }).click()
    await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('analytics-consent'))).toBe('accepted')
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-ck-open'))).toBe(false)
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ck-pad').trim())).toBe('')
    await expect(page.locator('.ib-wrap')).toBeVisible() // o de instalar o app aparece depois da decisão
    await page.reload()
    await expect(page.locator('.lw-page')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toHaveCount(0)
  })

  test('Recusar guarda "declined" e some de vez', async ({ page }) => {
    await page.route('**/api/**', r => r.fulfill(json([])))
    await page.goto('/')
    await page.getByRole('button', { name: 'Recusar' }).click({ timeout: 15000 })
    await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toHaveCount(0)
    expect(await page.evaluate(() => localStorage.getItem('analytics-consent'))).toBe('declined')
    await page.reload()
    await expect(page.locator('.lw-page')).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toHaveCount(0)
  })

  test('logado no celular: o cartão fica ACIMA da barra de baixo (antes cobria a barra) e as telas ganham respiro embaixo', async ({ page, context }) => {
    await injectSession(page, USER)
    await page.addInitScript(() => localStorage.removeItem('analytics-consent')) // depois do injectSession, que aceita os cookies
    await page.route('**/api/**', r => r.fulfill(json([])))
    await page.route('**/api/auth/me**', r => r.fulfill(json(USER)))
    await safeArea(page, context)
    await page.goto('/dashboard')
    await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.dsb-mobile-nav')).toBeVisible()
    await ready(page)
    const b = await box(page, '.ck-banner'); const n = await box(page, '.dsb-mobile-nav')
    expect(b.bottom).toBeLessThanOrEqual(n.top)
    // o respiro: com o aviso aberto, o padding de baixo da tela é maior que o normal (80px + área segura)
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.pwnav')).paddingBottom))
    expect(pad).toBeGreaterThan(80 + 34 + b.h)
    await page.getByRole('button', { name: 'Aceitar' }).click()
    await expect.poll(() => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.pwnav')).paddingBottom))).toBeLessThan(130)
  })

  test.describe('desktop', () => {
    test.use({ viewport: { width: 1280, height: 800 } })
    test('cartão centralizado embaixo (560px no máximo), sem cobrir a barra lateral', async ({ page }) => {
      await injectSession(page, USER)
      await page.addInitScript(() => localStorage.removeItem('analytics-consent'))
      await page.route('**/api/**', r => r.fulfill(json([])))
      await page.route('**/api/auth/me**', r => r.fulfill(json(USER)))
      await page.goto('/dashboard')
      await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toBeVisible({ timeout: 15000 })
      await ready(page)
      const b = await box(page, '.ck-banner')
      expect(b.width).toBeLessThanOrEqual(560)
      expect(Math.abs((b.left + b.width / 2) - 640)).toBeLessThanOrEqual(1) // centralizado
      expect(b.left).toBeGreaterThan(260) // fora da barra lateral
      expect(800 - b.bottom).toBe(12)
    })
  })
})
