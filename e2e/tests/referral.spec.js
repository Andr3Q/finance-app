// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Indique e ganhe (Nancy 2, tela 31) — /settings/indique, celular.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const USER = { ...TEST_USER, referralCode: 'A1B2C3D4' }
const STATS = { referralCode: 'A1B2C3D4', referredCount: 2, rewardedCount: 2, maxReferrals: 5, limitReached: false, bonusDays: 10 }

async function setup(page, stats = STATS) {
  await page.addInitScript(() => {
    window.__copied = []; window.__shared = []
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve() } }, configurable: true })
    Object.defineProperty(navigator, 'share', { value: (d) => { window.__shared.push(d); return Promise.resolve() }, configurable: true })
  })
  await injectSession(page, USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(USER)))
  await page.route('**/api/auth/referral-stats**', r => r.fulfill(json(stats)))
  await page.goto('/settings/indique')
}

test.describe('Indique e ganhe', () => {
  test('layout do design: cartão em degradê com o código e Copiar, cartão "Seus convites" com a barra e o botão Compartilhar; Perfil aceso', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.fin-hero-sub')).toHaveText('Convide amigos')
    await expect(page.locator('.rf-title')).toHaveText('Ganhe 10 dias de Pro por amigo.')
    await expect(page.locator('.rf-code-text')).toHaveText('A1B2C3D4')
    await expect(page.locator('.rf-prog-count')).toHaveText('2 de 5')
    await expect(page.locator('.rf-note')).toHaveText('Mais 3 amigos e você completa o limite de bônus.')
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
    await expect(page.locator('.rf-bar-fill')).toBeAttached()
    const m = await page.evaluate(() => {
      const top = document.querySelector('.fin-body').getBoundingClientRect().top
      const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top - top), Math.round(b.width), Math.round(b.height)] }
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return { hero: r('.rf-hero'), prog: r('.rf-prog'), share: r('.rf-share'), code: r('.rf-code'), copyBg: cs('.rf-copy').backgroundColor, fill: cs('.rf-bar-fill').backgroundColor, fillW: document.querySelector('.rf-bar-fill').style.width,
        shareBg: cs('.rf-share').backgroundColor, theme: document.documentElement.getAttribute('data-theme') }
    })
    // 393 − 2 × 18 de margem; alturas medidas no print (hero 223,5 · convites 105 · botão 54)
    expect(m.hero[0]).toBe(18); expect(m.hero[2]).toBe(357); expect(m.hero[3]).toBeGreaterThanOrEqual(222); expect(m.hero[3]).toBeLessThanOrEqual(226)
    expect(m.prog[3]).toBeGreaterThanOrEqual(103); expect(m.prog[3]).toBeLessThanOrEqual(107)
    expect(m.share[2]).toBe(357); expect(m.share[3]).toBe(54)
    expect(m.code[3]).toBe(54)
    expect(m.copyBg).toBe('rgb(28, 72, 255)')
    expect(m.shareBg).toBe('rgb(28, 72, 255)')
    expect(m.fill).toBe('rgb(25, 200, 132)')
    expect(m.fillW).toBe('40%')
    expect(m.theme).toBe('light')
  })

  test('Copiar guarda o link de cadastro com o código e Compartilhar manda o mesmo link', async ({ page }) => {
    await setup(page)
    await page.getByRole('button', { name: /Copiar/ }).click()
    await expect(page.getByRole('button', { name: /Copiado!/ })).toBeVisible()
    await page.getByRole('button', { name: 'Compartilhar convite' }).click()
    const { copied, shared } = await page.evaluate(() => ({ copied: window.__copied, shared: window.__shared }))
    const link = new URL('/register?ref=A1B2C3D4', page.url()).toString()
    expect(copied).toEqual([link])
    expect(shared).toHaveLength(1)
    expect(shared[0].url).toBe(link)
  })

  test('limite de convites alcançado: só os parabéns, sem código nem botão de compartilhar', async ({ page }) => {
    await setup(page, { ...STATS, rewardedCount: 5, referredCount: 5, limitReached: true })
    await expect(page.locator('.rf-title')).toHaveText('Você garantiu todos os bônus!')
    await expect(page.locator('.rf-prog-count')).toHaveText('5 de 5')
    await expect(page.locator('.rf-code')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Compartilhar convite' })).toHaveCount(0)
  })

  test('o link do Perfil abre a tela e voltar retorna ao Perfil', async ({ page }) => {
    await setup(page)
    await page.goto('/settings')
    await page.getByText('Indique e ganhe').first().click()
    await expect(page).toHaveURL(/\/settings\/indique$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/settings$/)
  })
})
