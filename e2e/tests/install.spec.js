// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Instalar app (Nancy 2, tela 33) — /settings/instalar, celular.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })

async function setup(page, { withPrompt = false, outcome = 'accepted' } = {}) {
  await injectSession(page, TEST_USER)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(TEST_USER)))
  await page.goto('/settings/instalar')
  if (withPrompt) {
    // o navegador dispara beforeinstallprompt depois do carregamento (o pwa-init.js guarda o evento); simula igual
    await expect(page.getByRole('button', { name: 'Instalar agora' })).toBeVisible()
    await page.evaluate((o) => {
      window.__asked = 0
      const e = new Event('beforeinstallprompt', { cancelable: true })
      e.prompt = () => { window.__asked++ }
      e.userChoice = Promise.resolve({ outcome: o })
      window.dispatchEvent(e)
    }, outcome)
  }
}

test.describe('Instalar app', () => {
  test('layout do design: cartão azul com o ícone, 3 passos e o botão "Instalar agora"; Perfil aceso', async ({ page }) => {
    await setup(page)
    await expect(page.locator('.fin-hero-sub')).toHaveText('Acesso pela tela inicial')
    await expect(page.locator('.ia-title')).toHaveText('Nancy na sua tela inicial')
    await expect(page.locator('.ia-sub')).toHaveText('Abre como app, sem loja, e ocupa menos de 1 MB.')
    await expect(page.locator('.ia-step-text')).toHaveText(['Toque em Compartilhar ou no menu ⋮ do navegador', 'Escolha "Adicionar à tela inicial"', 'Pronto: a Nancy abre como um app'])
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
    await expect(page.locator('.ia-mark svg')).toBeVisible()
    const m = await page.evaluate(() => {
      const top = document.querySelector('.fin-body').getBoundingClientRect().top
      const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top - top), Math.round(b.width), Math.round(b.height)] }
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return { hero: r('.ia-hero'), steps: r('.ia-steps'), btn: r('.ia-install'), heroBg: cs('.ia-hero').backgroundColor, btnBg: cs('.ia-install').backgroundColor, n: cs('.ia-step-n').backgroundColor, theme: document.documentElement.getAttribute('data-theme') }
    })
    // 393 − 2 × 18 de margem; alturas medidas no print (hero 143 · passos 223 · botão 54)
    expect(m.hero[0]).toBe(18); expect(m.hero[2]).toBe(357); expect(m.hero[3]).toBeGreaterThanOrEqual(141); expect(m.hero[3]).toBeLessThanOrEqual(146)
    expect(m.steps[3]).toBeGreaterThanOrEqual(221); expect(m.steps[3]).toBeLessThanOrEqual(226)
    expect(m.btn[2]).toBe(357); expect(m.btn[3]).toBe(54)
    expect(m.heroBg).toBe('rgb(28, 72, 255)'); expect(m.btnBg).toBe('rgb(28, 72, 255)')
    expect(m.theme).toBe('light')
  })

  test('"Instalar agora" abre a instalação do navegador e, aceita, a tela passa a dizer que já está instalada', async ({ page }) => {
    await setup(page, { withPrompt: true })
    await page.getByRole('button', { name: 'Instalar agora' }).click()
    await expect(page.getByText('A Nancy já está instalada')).toBeVisible()
    expect(await page.evaluate(() => window.__asked)).toBe(1)
    await expect(page.getByRole('button', { name: 'Instalar agora' })).toHaveCount(0)
  })

  test('se a pessoa recusar a instalação do navegador, a tela não diz que instalou e mostra os passos', async ({ page }) => {
    await setup(page, { withPrompt: true, outcome: 'dismissed' })
    await page.getByRole('button', { name: 'Instalar agora' }).click()
    await expect(page.getByRole('status')).toContainText('A instalação automática não abriu')
    expect(await page.evaluate(() => window.__asked)).toBe(1)
    await expect(page.getByText('A Nancy já está instalada')).toHaveCount(0)
  })

  test('sem instalação automática no navegador, o toque mostra a dica dos passos', async ({ page }) => {
    await setup(page)
    await page.getByRole('button', { name: 'Instalar agora' }).click()
    await expect(page.getByRole('status')).toContainText('A instalação automática não abriu')
    await expect(page.locator('.ia-step')).toHaveCount(3)
  })

  test('o link do Perfil abre a tela e voltar retorna ao Perfil', async ({ page }) => {
    await setup(page)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Instalar app', exact: true }).click()
    await expect(page).toHaveURL(/\/settings\/instalar$/)
    await page.getByRole('button', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/settings$/)
  })
})
