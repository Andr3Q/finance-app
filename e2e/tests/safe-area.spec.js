// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// iPhone com o app instalado: a barra de status fica POR CIMA da página (status-bar-style black-translucent), então o azul
// do cabeçalho precisa começar na borda de cima da tela. Antes sobrava uma faixa clara (fundo da página) com a altura da
// área segura (~47px) acima do azul. A área segura do iPhone é emulada pelo Chromium (CDP).
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const USER = { ...TEST_USER, plan: 'elite' }
const ROUTES = [
  ['/dashboard', 'Início'], ['/transactions', 'Extrato'], ['/goals', 'Metas'], ['/settings', 'Perfil'], ['/notificacoes', 'Notificações'],
  ['/limites', 'tela de Metas (casca fin-*)'], ['/settings/dados', 'tela do Perfil (casca fin-*)'], ['/termos', 'página legal'], ['/rota-que-nao-existe', '404'],
]

test('o azul do cabeçalho cobre o topo (sob a barra de status) em todas as telas', async ({ page, context }) => {
  test.setTimeout(150000)
  await injectSession(page, USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(USER)))
  const cdp = await context.newCDPSession(page)
  try {
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34, left: 0, right: 0 } })
  } catch {
    test.skip(true, 'este Chromium não emula a área segura')
  }

  for (const [path, label] of ROUTES) {
    await page.goto(path)
    // a splash cobre ~4s a cada carregamento; o azul de cima é o do cabeçalho, medido no ponto (20, 5)
    await expect.poll(() => page.evaluate(() => {
      let e = document.elementFromPoint(20, 5)
      while (e) {
        const c = getComputedStyle(e).backgroundColor
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c
        e = e.parentElement
      }
      return null
    }), { message: `${path} (${label}): cor no topo da tela`, timeout: 15000 }).toBe('rgb(28, 72, 255)')
  }
})

test('Início: o aviso de lançar contas fixas fica abaixo do cabeçalho azul, não acima dele', async ({ page, context }) => {
  await injectSession(page, USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(USER)))
  await page.goto('/dashboard')
  const prompt = page.locator('.alc')
  await expect(prompt).toBeVisible({ timeout: 15000 })
  // a tela entra com fade/deslocamento: espera assentar antes de medir
  await expect.poll(() => page.evaluate(() => Math.round(document.querySelector('.home-hero').getBoundingClientRect().top))).toBe(0)
  const pos = await page.evaluate(() => ({
    heroBottom: document.querySelector('.home-hero').getBoundingClientRect().bottom,
    prompt: document.querySelector('.alc').getBoundingClientRect().top,
  }))
  expect(pos.prompt).toBeGreaterThanOrEqual(Math.floor(pos.heroBottom))
})
