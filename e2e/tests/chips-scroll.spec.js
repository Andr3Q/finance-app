// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Atalhos com setas (Metas e Extrato), celular. No iOS Safari, pedir uma rolagem além do fim (ou do começo) deixava o
// carrossel parado fora do limite, com um vazio ao lado do último atalho ("Limites"). O Chromium sempre limita sozinho,
// então o teste confere o que o app PEDE (destino dentro de [0, máximo], nunca scrollBy solto) e que não sobra vazio.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 390, height: 844 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const USER = { ...TEST_USER, plan: 'elite' }

async function setup(page, path) {
  await page.addInitScript(() => {
    window.__chipCalls = []
    const isChips = (el) => el && el.classList && el.classList.contains('ex-chips')
    for (const name of ['scrollTo', 'scrollBy']) {
      const orig = Element.prototype[name]
      Element.prototype[name] = function (...args) {
        if (isChips(this)) window.__chipCalls.push({ name, left: args[0] && typeof args[0] === 'object' ? args[0].left : args[0], from: this.scrollLeft })
        return orig.apply(this, args)
      }
    }
  })
  await injectSession(page, USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(USER)))
  await page.goto(path)
  await expect(page.locator('.ex-chips')).toBeVisible({ timeout: 15000 })
}

const measure = (page) => page.evaluate(() => {
  const c = document.querySelector('.ex-chips'); const cr = c.getBoundingClientRect()
  const chips = [...c.querySelectorAll('.ex-chip')].map(e => e.getBoundingClientRect())
  const r = (n) => Math.round(n) + 0 // + 0: Math.round(-0,3) dá -0 e o toBe(0) do Playwright distingue -0 de 0
  return { max: c.scrollWidth - c.clientWidth, scrollLeft: r(c.scrollLeft), firstLeft: r(chips[0].left - cr.left), lastRight: r(cr.right - chips[chips.length - 1].right) }
})

for (const [path, label] of [['/goals', 'Metas'], ['/transactions', 'Extrato']]) {
  test(`${label}: as setas pedem destinos dentro do alcance e não sobra vazio ao lado do último atalho`, async ({ page }) => {
    await setup(page, path)
    const start = await measure(page)
    expect(start.max).toBeGreaterThan(0) // os atalhos não cabem de uma vez: é isso que as setas resolvem
    expect(start.firstLeft).toBe(0)

    // direita até passar do fim: cada clique pede no máximo o fim, e no fim o último atalho encosta na borda
    for (let i = 0; i < 4; i++) { await page.getByRole('button', { name: 'Próximos atalhos' }).click(); await page.waitForTimeout(700) }
    const end = await measure(page)
    expect(end.scrollLeft).toBe(end.max)
    expect(end.lastRight).toBe(0) // sem vazio depois do último atalho

    // esquerda até passar do começo
    for (let i = 0; i < 4; i++) { await page.getByRole('button', { name: 'Atalhos anteriores' }).click(); await page.waitForTimeout(700) }
    const back = await measure(page)
    expect(back.scrollLeft).toBe(0)
    expect(back.firstLeft).toBe(0) // sem vazio antes do primeiro atalho

    const calls = await page.evaluate(() => window.__chipCalls)
    expect(calls.length).toBe(8)
    expect(calls.every(c => c.name === 'scrollTo')).toBe(true) // nada de scrollBy solto, que podia passar do limite
    for (const c of calls) { expect(c.left).toBeGreaterThanOrEqual(0); expect(c.left).toBeLessThanOrEqual(start.max) }
  })
}
