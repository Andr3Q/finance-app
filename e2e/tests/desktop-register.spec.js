// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { createMock } = require('../helpers/mockApi')

// ─────────────────────────────────────────────────────────────────
// Criar conta no desktop (design "Nancy Desktop", tela 04, 1440×900): o mesmo painel azul do Entrar e o formulário de 420px
// com campos de 50px, barra de força de 6px, caixa de aceite de 25px (22 + 2×1,5 de borda) e o botão de 52px.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 1440, height: 900 } })

const USER = { id: 'u1', name: 'Ana Souza', email: 'ana@test.com', plan: 'pro', salary: 0, onboardingComplete: false, emailVerified: false, isOnTrial: true }

async function open(page) {
  await page.goto('/register')
  await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 }) // a abertura (≈4s) cobre a tela
  await expect(page.getByRole('button', { name: 'Criar conta', exact: true })).toBeVisible()
}
const box = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 } }, sel)

test.describe('Criar conta desktop — medidas e visual do design', () => {
  test('mesmo painel azul do Entrar (46% + 112px, título de 60px, sem cartões) e formulário de 420px centralizado', async ({ page }) => {
    await open(page)
    expect(await box(page, '.ad-hero')).toMatchObject({ x: 0, w: 774.4, h: 900 })
    await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-size', '60px')
    await expect(page.locator('.ad-cards')).toHaveCount(0)
    const inner = await box(page, '.ad-panel-inner')
    expect(inner).toMatchObject({ x: 897.2, w: 420 })
    expect(inner.h).toBeCloseTo(517.9, 0) // a mesma altura do bloco no protótipo
  })

  test('textos, três campos de 50px, barra de força de 6px, caixa de 25px e botão de 52px', async ({ page }) => {
    await open(page)
    await expect(page.getByRole('heading', { level: 2, name: 'Crie sua conta' })).toHaveCSS('font-size', '36px')
    await expect(page.getByText('Grátis para sempre. Leva menos de 1 minuto.')).toBeVisible()
    for (const id of ['#f-name', '#f-email', '#f-pass']) expect((await box(page, id)).h, id).toBe(50)
    await expect(page.getByPlaceholder('Como quer ser chamado?')).toBeVisible()
    await expect(page.getByPlaceholder('Mínimo 8 caracteres')).toBeVisible()
    expect(await box(page, '.ad-strength-track')).toMatchObject({ w: 410, h: 6 }) // 420 − 10 do espaço do rótulo (vazio)
    await expect(page.locator('.ad-strength-track')).toHaveCSS('background-color', 'rgb(238, 243, 255)')
    expect(await box(page, '.ad-terms-box')).toMatchObject({ w: 25, h: 25 })
    await expect(page.locator('.ad-terms-box')).toHaveCSS('border-top-color', 'rgb(201, 217, 255)')
    expect((await box(page, '.ad-btn-primary')).h).toBe(52)
    await expect(page.locator('.ad-btn-primary')).toHaveCSS('background-color', 'rgb(21, 70, 255)')
  })

  test('nada sai da janela (1440 e 1024) e a página não rola para o lado', async ({ page }) => {
    await open(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440)
    await page.setViewportSize({ width: 1024, height: 768 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1024)
    const inner = await box(page, '.ad-panel-inner')
    expect(inner.x + inner.w).toBeLessThanOrEqual(1024)
  })
})

test.describe('Criar conta desktop — o formulário funciona', () => {
  test('a barra de força acompanha a senha e a caixa marca/desmarca', async ({ page }) => {
    await open(page)
    await page.getByPlaceholder('Mínimo 8 caracteres').fill('abc')
    await expect(page.locator('.ad-strength-label')).toHaveText('Muito fraca')
    await expect(page.locator('.ad-strength-track div')).toHaveCSS('background-color', 'rgb(214, 51, 74)')
    await page.getByPlaceholder('Mínimo 8 caracteres').fill('Abcdefg1')
    await expect(page.locator('.ad-strength-label')).toHaveText('Forte')
    // 100% da trilha (que encolhe quando aparece o rótulo); a barra anima em .3s
    await expect.poll(async () => ({ cheia: (await box(page, '.ad-strength-track div')).w === (await box(page, '.ad-strength-track')).w })).toEqual({ cheia: true })
    expect((await box(page, '.ad-strength-track')).w).toBeLessThan(410)
    await expect(page.locator('.ad-terms-box')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await page.getByText('Li e aceito os').click({ position: { x: 20, y: 8 } }) // no começo do texto
    await expect(page.getByRole('checkbox')).toBeChecked()
    await expect(page.locator('.ad-terms-box')).toHaveCSS('background-color', 'rgb(21, 70, 255)')
    const caixa = await box(page, '.ad-terms-box')
    await page.mouse.click(caixa.x + caixa.w / 2, caixa.y + caixa.h / 2) // na caixa, como o mouse faz (a caixa de clique fica por cima do desenho)
    await expect(page.getByRole('checkbox')).not.toBeChecked()
    await page.getByRole('checkbox').check() // como o leitor de tela e os testes antigos fazem
  })

  test('campos vazios e termos sem aceitar pedem para preencher, sem chamar o servidor', async ({ page }) => {
    let chamou = false
    await page.route('**/api/auth/register', r => { chamou = true; r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) })
    await open(page)
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click()
    await expect(page.getByText('Nome obrigatório')).toBeVisible()
    await expect(page.getByText('Informe seu e-mail')).toBeVisible()
    await expect(page.getByText(/Mínimo 8 caracteres com letra maiúscula/)).toBeVisible()
    await expect(page.getByText('Você precisa aceitar os termos para continuar')).toBeVisible()
    expect(chamou).toBe(false)
  })

  test('cadastro certo manda os dados e leva ao app', async ({ page }) => {
    let corpo = null
    const mock = createMock(page)
    mock.get('/api/transactions/dashboard', { salary: 0, totalExpenses: 0, currentBalance: 0 })
    mock.get('/api/transactions', { data: [], total: 0 })
    mock.get('/api/budget', [])
    mock.get('/api/installments', [])
    mock.get('/api/goals', [])
    await page.route('**/api/auth/register', r => { corpo = r.request().postDataJSON(); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'jwt', user: USER }) }) })
    await open(page)
    await page.getByPlaceholder('Como quer ser chamado?').fill('Ana Souza')
    await page.getByPlaceholder('voce@email.com').fill('ana@test.com')
    await page.getByPlaceholder('Mínimo 8 caracteres').fill('Senha@123')
    await page.getByText('Li e aceito os').click({ position: { x: 20, y: 8 } })
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click()
    await expect(page).toHaveURL(/\/(dashboard|verify-email)?$/)
    expect(corpo).toMatchObject({ name: 'Ana Souza', email: 'ana@test.com', password: 'Senha@123', salary: 0 })
  })

  test('e-mail já cadastrado mostra a mensagem do servidor', async ({ page }) => {
    const mock = createMock(page)
    mock.fail('/api/auth/register', 'Este e-mail já está cadastrado.', 400)
    await open(page)
    await page.getByPlaceholder('Como quer ser chamado?').fill('Ana Souza')
    await page.getByPlaceholder('voce@email.com').fill('ana@test.com')
    await page.getByPlaceholder('Mínimo 8 caracteres').fill('Senha@123')
    await page.getByText('Li e aceito os').click({ position: { x: 20, y: 8 } })
    await page.getByRole('button', { name: 'Criar conta', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Este e-mail já está cadastrado.')
  })

  test('Termos e Política abrem em outra aba (o cadastro preenchido não se perde); Voltar leva à Boas-vindas', async ({ page }) => {
    await open(page)
    await page.getByPlaceholder('Como quer ser chamado?').fill('Ana Souza')
    const [aba] = await Promise.all([page.context().waitForEvent('page'), page.getByRole('link', { name: 'Termos de Uso' }).click()])
    await aba.waitForLoadState()
    expect(aba.url()).toMatch(/\/termos$/)
    await expect(page.getByPlaceholder('Como quer ser chamado?')).toHaveValue('Ana Souza')
    await page.getByRole('link', { name: 'Voltar' }).click()
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Comece grátis.' })).toBeVisible()
  })
})

test.describe('Criar conta desktop — no celular', () => {
  test('continua o Criar conta do celular', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/register')
    await expect(page.locator('#app-splash')).toHaveCount(0, { timeout: 20000 })
    await expect(page.locator('.lw-page')).toBeVisible()
    await expect(page.locator('.ad-split')).toHaveCount(0)
  })
})
