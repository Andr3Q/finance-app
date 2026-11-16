// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER, FREE_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// App Android da Play Store COM a cobrança do Google pronta: o app mostra os planos e vende pela Google Play (Digital Goods API + Payment
// Request API do Chrome, simuladas aqui: o navegador de teste não tem Google Play). O servidor também é simulado. Sem o recurso ligado
// (ou fora do app) nada disto aparece. A compra de verdade só dá para conferir num aparelho com o app instalado pela Play.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })
const shot = async (page, nome) => {
  if (!process.env.SHOTS_DIR) return
  await page.waitForSelector('#app-splash', { state: 'detached', timeout: 15000 }).catch(() => {}) // a abertura animada cobre a tela por ~4s
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${process.env.SHOTS_DIR}/${nome}.png` })
}
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString()

async function abre(page, user, { app = true, recurso = true, comprados = [] } = {}) {
  await page.addInitScript(([naApp, jaComprou]) => {
    if (naApp) Object.defineProperty(document, 'referrer', { get: () => 'android-app://br.com.myfinancepro.app', configurable: true })
    const precos = { nancy_pro_mensal: '9.90', nancy_pro_anual: '99.00', nancy_elite_mensal: '34.90', nancy_elite_anual: '334.80' }
    window.__compras = []
    window.getDigitalGoodsService = async () => ({
      getDetails: async (ids) => ids.map((id) => ({ itemId: id, title: id, price: { currency: 'BRL', value: precos[id] } })),
      listPurchases: async () => jaComprou,
    })
    window.PaymentRequest = class {
      constructor(metodos) { this.sku = metodos[0].data.sku }
      async show() {
        window.__compras.push(this.sku)
        return { details: { purchaseToken: 'token-e2e-0123456789abcdef' }, complete: async (r) => { window.__concluiu = r } }
      }
    }
  }, [app, comprados])

  const estado = { usuario: user, verify: [] }
  await injectSession(page, user)
  await page.route('**/api/**', (r) => r.fulfill(json([])))
  await page.route('**/api/auth/me**', (r) => r.fulfill(json(estado.usuario)))
  await page.route('**/api/billing/config', (r) => r.fulfill(json({ googlePlay: { enabled: recurso, packageName: 'br.com.myfinancepro.app', products: [] } })))
  await page.route('**/api/billing/google/verify', (r) => {
    const corpo = r.request().postDataJSON()
    estado.verify.push(corpo)
    const plano = String(corpo.productId).includes('elite') ? 'elite' : 'pro'
    estado.usuario = { ...user, plan: plano, planSource: 'google_play', planPeriod: String(corpo.productId).includes('anual') ? 'annual' : 'monthly', planExpiresAt: inDays(30) }
    r.fulfill(json({ applied: true, plan: plano, planExpiresAt: estado.usuario.planExpiresAt, state: 'active' }))
  })
  return estado
}

test.describe('App Android — com a cobrança do Google pronta', () => {
  test('/planos vira a tela de planos do app, com os PREÇOS DO GOOGLE, e sem nada do Mercado Pago', async ({ page }) => {
    await abre(page, FREE_USER)
    await page.goto('/planos')
    await expect(page.getByRole('heading', { name: 'Planos' })).toBeVisible()
    await expect(page.getByRole('button', { name: /Assinar Pro/ })).toBeVisible()
    const pro = page.getByLabel('Plano Pro'), elite = page.getByLabel('Plano Elite')
    await expect(pro).toContainText(/R\$\s*9,90/)
    await expect(elite).toContainText(/R\$\s*34,90/)
    const corpo = await page.locator('body').innerText()
    expect(corpo).not.toMatch(/Mercado Pago|PIX|pelo site/i)
    await shot(page, 'planos-app-mensal')

    await page.getByRole('button', { name: 'Anual' }).click()
    await expect(pro).toContainText(/R\$\s*99,00/)
    await expect(pro).toContainText('por ano')
    await shot(page, 'planos-app-anual')
  })

  test('assinar o Pro: abre a compra do Google com o produto certo, o servidor confirma e o plano muda', async ({ page }) => {
    const estado = await abre(page, FREE_USER)
    await page.goto('/planos')
    await page.getByRole('button', { name: /Assinar Pro/ }).click()

    await expect(page.getByText(/Assinatura ativada! Seu plano Pro já está valendo\./)).toBeVisible()
    expect(await page.evaluate(() => window.__compras)).toEqual(['nancy_pro_mensal'])
    expect(await page.evaluate(() => window.__concluiu)).toBe('success')
    expect(estado.verify).toEqual([{ purchaseToken: 'token-e2e-0123456789abcdef', productId: 'nancy_pro_mensal' }])
    // com o plano da Play ativo a tela deixa de oferecer compra e passa a mostrar como gerenciar
    await expect(page.getByRole('link', { name: /Gerenciar na Play Store/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Assinar/ })).toHaveCount(0)
    await shot(page, 'planos-app-depois-da-compra')
  })

  test('Elite anual compra o produto anual do Elite', async ({ page }) => {
    await abre(page, FREE_USER)
    await page.goto('/planos')
    await page.getByRole('button', { name: 'Anual' }).click()
    await page.getByRole('button', { name: /Assinar Elite/ }).click()
    await expect(page.getByText(/Seu plano Elite já está valendo/)).toBeVisible()
    expect(await page.evaluate(() => window.__compras)).toEqual(['nancy_elite_anual'])
  })

  test('os convites voltam: telas de recurso de outro plano mostram "Ver planos" e levam à tela de planos do app', async ({ page }) => {
    await abre(page, FREE_USER)
    await page.goto('/historico')
    const ver = page.getByRole('button', { name: 'Ver planos' })
    await expect(ver).toBeVisible()
    await ver.click()
    await expect(page).toHaveURL(/\/planos$/)
    await expect(page.getByRole('button', { name: /Assinar Pro/ })).toBeVisible()
  })

  test('quem assina pela Play vê "Gerenciar na Play Store" em Pagamentos, em vez de "Não renovar" com senha', async ({ page }) => {
    await abre(page, { ...TEST_USER, plan: 'pro', planSource: 'google_play', planPeriod: 'monthly', planExpiresAt: inDays(20) })
    await page.goto('/settings/pagamentos')
    const link = page.getByRole('link', { name: /Play Store/ })
    await expect(link).toBeVisible()
    await expect(link).toHaveAttribute('href', /play\.google\.com\/store\/account\/subscriptions.*sku=nancy_pro_mensal/)
    await expect(page.getByRole('button', { name: /não renovar/i })).toHaveCount(0)
  })

  test('plano ativo contratado fora do app: sem comprar (evita cobrança dupla) e sem dizer onde pagar', async ({ page }) => {
    await abre(page, { ...TEST_USER, plan: 'pro', planSource: 'mercadopago', planExpiresAt: inDays(20) })
    await page.goto('/planos')
    await expect(page.getByText(/Quando ele vencer, você poderá assinar por aqui/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Assinar/ })).toHaveCount(0)
    expect(await page.locator('body').innerText()).not.toMatch(/Mercado Pago|no site|pelo site/i)
  })

  test('compra feita e não confirmada (rede caiu): ao abrir o app o plano é restaurado sozinho', async ({ page }) => {
    const estado = await abre(page, FREE_USER, { comprados: [{ itemId: 'nancy_pro_mensal', purchaseToken: 'token-restaurar-0123456789' }] })
    await page.goto('/dashboard')
    await expect.poll(() => estado.verify.length).toBe(1)
    expect(estado.verify[0]).toEqual({ purchaseToken: 'token-restaurar-0123456789', productId: 'nancy_pro_mensal' })
  })
})

test.describe('Sem a cobrança do Google, nada muda', () => {
  test('recurso desligado no servidor: o app segue "sem compra" (só "Seu plano")', async ({ page }) => {
    await abre(page, FREE_USER, { recurso: false })
    await page.goto('/planos')
    await expect(page.getByRole('heading', { name: 'Seu plano' })).toBeVisible()
    expect(await page.locator('body').innerText()).not.toMatch(/R\$|Assinar/)
    await page.goto('/historico')
    await expect(page.getByRole('button', { name: 'Ver planos' })).toHaveCount(0)
  })

  test('site comum (fora do app): /planos continua com Mercado Pago, mesmo com a cobrança do Google "disponível"', async ({ page }) => {
    await abre(page, FREE_USER, { app: false })
    await page.goto('/planos')
    await expect(page.getByRole('heading', { name: /Controle total do/ })).toBeVisible()
    await expect(page.getByText('PIX ou cartão').first()).toBeVisible()
  })
})
