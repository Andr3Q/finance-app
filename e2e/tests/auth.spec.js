// @ts-nocheck
const { test, expect } = require('@playwright/test')
const { createMock }   = require('../helpers/mockApi')

// ─────────────────────────────────────────────────────────────────
// Fluxo de Autenticação — E2E
// ─────────────────────────────────────────────────────────────────

test.describe('Auth — Landing', () => {
  test('exibe links "Já tenho conta" e "Criar conta grátis" na landing', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: /já tenho conta/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /criar conta grátis/i }).first()).toBeVisible()
  })

  test('clicar em "Já tenho conta" navega para /login', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /já tenho conta/i }).first().click()
    await expect(page).toHaveURL(/\/login/)
  })

  test('clicar em "Criar conta grátis" navega para /register', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: /criar conta grátis/i }).first().click()
    await expect(page).toHaveURL(/\/register|\/login/)
  })
})

test.describe('Auth — Login', () => {
  test('exibe tabs "Entrar" e "Criar conta"', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /^entrar$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^criar conta$/i })).toBeVisible()
  })

  test('login com credenciais válidas redireciona para o dashboard', async ({ page }) => {
    const mock = createMock(page)
    mock.post('/api/auth/login', {
      token: 'jwt-test',
      user: {
        id: 'u1', name: 'Ana E2E', email: 'ana@test.com',
        plan: 'pro', salary: 5000, onboardingComplete: true,
        emailVerified: true, isOnTrial: false,
      }
    })
    mock.get('/api/transactions/dashboard', { salary: 5000, totalExpenses: 0, currentBalance: 5000 })
    mock.get('/api/transactions', { data: [], total: 0 })
    mock.get('/api/budget', [])
    mock.get('/api/installments', [])
    mock.get('/api/goals', [])

    await page.goto('/login')
    await page.getByPlaceholder('seu@email.com').fill('ana@test.com')
    await page.getByPlaceholder('••••••••').fill('Senha@123')
    await page.getByRole('button', { name: /entrar na conta/i }).click()

    await expect(page).toHaveURL(/\/(dashboard|transactions)?$/)
  })

  test('exibe mensagem de erro com credenciais inválidas', async ({ page }) => {
    const mock = createMock(page)
    mock.fail('/api/auth/login', 'E-mail ou senha incorretos.', 400)

    await page.goto('/login')
    await page.getByPlaceholder('seu@email.com').fill('errado@test.com')
    await page.getByPlaceholder('••••••••').fill('SenhaErrada1')
    await page.getByRole('button', { name: /entrar na conta/i }).click()

    await expect(page.getByText(/e-mail ou senha incorretos/i)).toBeVisible()
  })

  test('exibe campo de código 2FA quando conta tem 2FA ativado', async ({ page }) => {
    const mock = createMock(page)
    mock.post('/api/auth/login', { requires2FA: true, tempToken: 'temp-abc' })

    await page.goto('/login')
    await page.getByPlaceholder('seu@email.com').fill('ana@test.com')
    await page.getByPlaceholder('••••••••').fill('Senha@123')
    await page.getByRole('button', { name: /entrar na conta/i }).click()

    // Exibe campo do código 2FA (placeholder "000 000")
    await expect(page.getByPlaceholder('000 000')).toBeVisible()
  })

  test('2FA: código inválido exibe erro', async ({ page }) => {
    const mock = createMock(page)
    mock.post('/api/auth/login', { requires2FA: true, tempToken: 'temp-abc' })
    mock.fail('/api/auth/2fa/verify-login', 'Código inválido.', 400)

    await page.goto('/login')
    await page.getByPlaceholder('seu@email.com').fill('ana@test.com')
    await page.getByPlaceholder('••••••••').fill('Senha@123')
    await page.getByRole('button', { name: /entrar na conta/i }).click()

    await page.getByPlaceholder('000 000').fill('000000')
    await page.getByRole('button', { name: /verificar|confirmar/i }).click()

    await expect(page.getByText(/código inválido/i)).toBeVisible()
  })

  test('link "Esqueci minha senha" navega para /forgot-password', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: /esqueci|recuperar/i }).click()
    await expect(page).toHaveURL(/forgot/)
  })
})

test.describe('Auth — Registro', () => {
  test.beforeEach(async ({ page }) => {
    const mock = createMock(page)
    mock.post('/api/auth/register', {
      token: 'jwt-test-token',
      user: {
        id: 'new-user-1', name: 'João Teste', email: 'joao@test.com',
        salary: 0, plan: 'pro', isOnTrial: true,
        trialEndsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        referralCode: 'JOA12345',
      }
    }, 201)
    mock.get('/api/transactions/dashboard', { salary: 0, totalExpenses: 0, currentBalance: 0 })
    mock.get('/api/transactions', { data: [], total: 0 })
    mock.get('/api/budget', [])
    mock.get('/api/installments', [])
    mock.get('/api/goals', [])
  })

  test('alterna para aba de cadastro ao clicar em "Criar conta"', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /^criar conta$/i }).click()
    // Exibe campo de nome (só aparece no modo register)
    await expect(page.getByPlaceholder('André Pereira')).toBeVisible()
  })

  test('preenche formulário e cria conta com sucesso', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /^criar conta$/i }).click()

    await page.getByPlaceholder('André Pereira').fill('João Teste')
    await page.getByPlaceholder('seu@email.com').fill('joao@test.com')
    await page.getByPlaceholder('Mínimo 8 caracteres').fill('Senha@123')
    await page.getByPlaceholder('Repita a senha').fill('Senha@123')

    const termsBox = page.getByRole('checkbox', { name: /termos/i })
    if (await termsBox.isVisible()) await termsBox.check()

    await page.getByRole('button', { name: /criar minha conta grátis/i }).click()

    await expect(page).toHaveURL(/\/(dashboard|transactions|onboarding)?$/)
  })

  test('exibe erro quando e-mail já está cadastrado', async ({ page }) => {
    const mock = createMock(page)
    mock.fail('/api/auth/register', 'Este e-mail já está cadastrado.', 400)

    await page.goto('/login')
    await page.getByRole('button', { name: /^criar conta$/i }).click()

    await page.getByPlaceholder('André Pereira').fill('João')
    await page.getByPlaceholder('seu@email.com').fill('existente@test.com')
    await page.getByPlaceholder('Mínimo 8 caracteres').fill('Senha@123')
    await page.getByPlaceholder('Repita a senha').fill('Senha@123')

    const termsBox = page.getByRole('checkbox', { name: /termos/i })
    if (await termsBox.isVisible()) await termsBox.check()

    await page.getByRole('button', { name: /criar minha conta grátis/i }).click()
    await expect(page.getByText(/já está cadastrado/i)).toBeVisible()
  })
})

test.describe('Auth — Recuperação de senha', () => {
  test('envia e-mail de recuperação com sucesso', async ({ page }) => {
    const mock = createMock(page)
    mock.post('/api/auth/forgot-password', { message: 'E-mail enviado.' })

    await page.goto('/forgot-password')
    await page.getByRole('textbox').first().fill('ana@test.com')
    await page.getByRole('button', { name: /enviar|recuperar/i }).click()

    await expect(page.getByText(/e-mail enviado|verifique sua caixa|link de recuperação/i).first()).toBeVisible()
  })

  test('exibe erro quando e-mail não encontrado', async ({ page }) => {
    const mock = createMock(page)
    mock.fail('/api/auth/forgot-password', 'E-mail não encontrado.', 404)

    await page.goto('/forgot-password')
    await page.getByRole('textbox').first().fill('naoexiste@test.com')
    await page.getByRole('button', { name: /enviar|recuperar/i }).click()

    await expect(page.getByText(/não encontrado/i)).toBeVisible()
  })
})
