// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { createMock }   = require('../helpers/mockApi')
const { injectSession } = require('../helpers/session')

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
  test('exibe botão "Entrar" e link para criar conta', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('button', { name: /^entrar$/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /^criar conta$/i })).toBeVisible()
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
    await page.getByPlaceholder('voce@email.com').fill('ana@test.com')
    await page.getByPlaceholder('••••••••').fill('Senha@123')
    await page.getByRole('button', { name: /^entrar$/i }).click()

    await expect(page).toHaveURL(/\/(dashboard|transactions)?$/)
  })

  test('exibe mensagem de erro com credenciais inválidas', async ({ page }) => {
    const mock = createMock(page)
    mock.fail('/api/auth/login', 'E-mail ou senha incorretos.', 400)

    await page.goto('/login')
    await page.getByPlaceholder('voce@email.com').fill('errado@test.com')
    await page.getByPlaceholder('••••••••').fill('SenhaErrada1')
    await page.getByRole('button', { name: /^entrar$/i }).click()

    await expect(page.getByText(/e-mail ou senha incorretos/i)).toBeVisible()
  })

  // Achado N2-1: campo vazio dizia "E-mail inválido" / "Mínimo 8 caracteres" em vez de pedir para preencher.
  test('campos vazios pedem para preencher, sem chamar o servidor', async ({ page }) => {
    const mock = createMock(page)
    let calls = 0
    await page.route('**/api/auth/login**', r => { calls++; r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) })
    await page.goto('/login')
    await page.getByRole('button', { name: /^entrar$/i }).click()

    await expect(page.getByText('Informe seu e-mail')).toBeVisible()
    await expect(page.getByText('Informe sua senha')).toBeVisible()
    expect(calls).toBe(0)
  })

  test('exibe campo de código 2FA quando conta tem 2FA ativado', async ({ page }) => {
    const mock = createMock(page)
    mock.post('/api/auth/login', { requires2FA: true, tempToken: 'temp-abc' })

    await page.goto('/login')
    await page.getByPlaceholder('voce@email.com').fill('ana@test.com')
    await page.getByPlaceholder('••••••••').fill('Senha@123')
    await page.getByRole('button', { name: /^entrar$/i }).click()

    // Exibe campo do código 2FA (placeholder "000 000")
    await expect(page.getByPlaceholder('000 000')).toBeVisible()
  })

  test('2FA: código inválido exibe erro', async ({ page }) => {
    const mock = createMock(page)
    mock.post('/api/auth/login', { requires2FA: true, tempToken: 'temp-abc' })
    mock.fail('/api/auth/2fa/verify-login', 'Código inválido.', 400)

    await page.goto('/login')
    await page.getByPlaceholder('voce@email.com').fill('ana@test.com')
    await page.getByPlaceholder('••••••••').fill('Senha@123')
    await page.getByRole('button', { name: /^entrar$/i }).click()

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

  test('navega para /register ao clicar em "Criar conta" e exibe formulário de cadastro', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('link', { name: /^criar conta$/i }).click()
    await expect(page).toHaveURL(/\/register/)
    // Exibe campo de nome (só aparece no modo register)
    await expect(page.getByPlaceholder('Como quer ser chamado?')).toBeVisible()
  })

  test('preenche formulário e cria conta com sucesso', async ({ page }) => {
    await page.goto('/register')

    await page.getByPlaceholder('Como quer ser chamado?').fill('João Teste')
    await page.getByPlaceholder('voce@email.com').fill('joao@test.com')
    await page.getByPlaceholder('Mínimo 8 caracteres').fill('Senha@123')

    const termsBox = page.getByRole('checkbox', { name: /termos/i })
    if (await termsBox.isVisible()) await termsBox.check()

    await page.getByRole('button', { name: /^criar conta$/i }).click()

    await expect(page).toHaveURL(/\/(dashboard|transactions|onboarding)?$/)
  })

  test('exibe erro quando e-mail já está cadastrado', async ({ page }) => {
    const mock = createMock(page)
    mock.fail('/api/auth/register', 'Este e-mail já está cadastrado.', 400)

    await page.goto('/register')

    await page.getByPlaceholder('Como quer ser chamado?').fill('João')
    await page.getByPlaceholder('voce@email.com').fill('existente@test.com')
    await page.getByPlaceholder('Mínimo 8 caracteres').fill('Senha@123')

    const termsBox = page.getByRole('checkbox', { name: /termos/i })
    if (await termsBox.isVisible()) await termsBox.check()

    await page.getByRole('button', { name: /^criar conta$/i }).click()
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

  // Achado N2-1: o campo vazio ia até o servidor (limite de 3 pedidos por hora) para só então dizer "E-mail inválido.".
  test('campo vazio ou e-mail inválido são barrados na tela, sem gastar um dos 3 pedidos por hora', async ({ page }) => {
    let calls = 0
    await page.route('**/api/auth/forgot-password**', r => { calls++; r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) })
    await page.goto('/forgot-password')
    await page.getByRole('button', { name: /enviar|recuperar/i }).click()
    await expect(page.getByText('Informe o e-mail da sua conta.')).toBeVisible()

    await page.getByRole('textbox').first().fill('abc')
    await page.getByRole('button', { name: /enviar|recuperar/i }).click()
    await expect(page.getByText('E-mail inválido.')).toBeVisible()
    expect(calls).toBe(0)
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

test.describe('Auth — sessão expirada em aparelho que já teve conta', () => {
  // "Já teve conta neste aparelho" só no PRIMEIRO carregamento da aba: o app apaga a flag quando o servidor diz que a sessão expirou
  // — se o init script a recolocasse a cada recarga, a abertura entraria em loop (sessão expirada → recarrega → flag → ...).
  const hadAccountBefore = (page) => page.addInitScript(() => {
    if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.setItem('nancy_has_account', '1') }
  })
  const ANA = { id: 'u1', name: 'Ana E2E', email: 'ana@test.com', plan: 'pro', salary: 5000, onboardingComplete: true, emailVerified: true, isOnTrial: false }

  // Achado N2-1: abrir /goals (favorito, link de notificação ou de cobrança) com a sessão expirada levava ao login, mas depois de
  // entrar a pessoa caía no Início: a conferência da sessão recarrega a página para o login e o state do roteador (de onde ela
  // veio) se perdia. Só acontecia em aparelho que já teve conta; num aparelho novo o state sobrevive.
  test('abrir uma rota protegida leva ao login e, depois de entrar, volta para ela', async ({ page }) => {
    await hadAccountBefore(page)
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    const mock = createMock(page)
    mock.fail('/api/auth/me', 'Sessão expirada.', 401)
    mock.post('/api/auth/login', { user: ANA })

    await page.goto('/goals?aba=metas')
    await expect(page).toHaveURL(/\/login$/)
    await page.getByPlaceholder('voce@email.com').fill('ana@test.com')
    await page.getByPlaceholder('••••••••').fill('Senha@123')
    await page.getByRole('button', { name: /^entrar$/i }).click()

    await expect(page).toHaveURL(/\/goals\?aba=metas$/)
  })

  // Achado da revisão independente: o destino guardado só era apagado quando a conferência da sessão dava certo; numa falha de rede/
  // servidor (sem 401) ele ficava na aba e um logout + login futuros caíam nele em vez do Início.
  test('falha de servidor na conferência da sessão (sem 401) não deixa o destino guardado para um login futuro', async ({ page }) => {
    await injectSession(page, ANA) // sessão em cache: o app segue funcionando mesmo com a conferência falhando
    await hadAccountBefore(page)
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    createMock(page).fail('/api/auth/me', 'Erro interno', 500)

    await page.goto('/goals')
    await expect(page).toHaveURL(/\/goals$/)
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('nancy_return_to'))).toBeNull()
  })

  test('quem abriu o login direto continua indo para o Início', async ({ page }) => {
    await hadAccountBefore(page)
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    const mock = createMock(page)
    mock.fail('/api/auth/me', 'Sessão expirada.', 401)
    mock.post('/api/auth/login', { user: ANA })

    await page.goto('/login')
    await page.getByPlaceholder('voce@email.com').fill('ana@test.com')
    await page.getByPlaceholder('••••••••').fill('Senha@123')
    await page.getByRole('button', { name: /^entrar$/i }).click()

    await expect(page).toHaveURL(/\/dashboard$/)
  })
})

// Achado do André (iPhone): ao abrir o app com a sessão expirada, a página recarrega direto para /login e o gerenciador de senhas do
// celular abria o "Iniciar a sessão com a senha de ...?" POR CIMA do vídeo da splash — o campo de senha já estava montado por baixo.
test.describe('Auth — a splash segura o formulário de login', () => {
  test('nunca existe campo de senha enquanto a splash está na tela; quando ela sai, o formulário aparece', async ({ page }) => {
    await page.addInitScript(() => {
      window.__nancySplashGone = false // desliga o atalho que os outros testes usam
      document.addEventListener('DOMContentLoaded', () => {
        const check = () => {
          const s = document.getElementById('app-splash')
          if (s && !s.classList.contains('splash-hide') && document.querySelector('input[type="password"]')) window.__senhaSobSplash = true
        }
        new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true })
        check()
      })
    })
    await page.route('**/api/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    await page.goto('/login')
    await expect(page.locator('#app-splash')).toBeHidden({ timeout: 20000 })
    await expect(page.locator('input[type="password"]')).toHaveCount(1)
    expect(await page.evaluate(() => !!window.__senhaSobSplash)).toBe(false)
  })
})

