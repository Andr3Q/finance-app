// @ts-nocheck
const { test, expect } = require('../helpers/test')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Primeiros passos (Nancy 2, tela 07) e o tema claro. O onboarding abre por cima do Início (tema
// claro imposto) e as telas de auth também aparecem pra quem salvou o tema claro: as regras antigas
// `[data-theme="light"] .auth-*` deixavam o título escuro em cima do azul.
// ─────────────────────────────────────────────────────────────────

test.use({ viewport: { width: 393, height: 852 } })

const json = (o, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(o) })

test('onboarding no celular: tela cheia, título branco, voltar translúcido sem borda e "Pular por agora"', async ({ page }) => {
  const user = { ...TEST_USER, onboardingComplete: false, salary: 0 } // sem salário informado: abre perguntando quanto ganha
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

test('quem já informou o salário no cadastro não é perguntado de novo: o onboarding abre em "Contas fixas"', async ({ page }) => {
  const user = { ...TEST_USER, onboardingComplete: false, salary: 5000 }
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.goto('/dashboard')

  // dentro da janela do onboarding: o Início por trás também tem um "Contas fixas" (aparece conforme os dados carregam)
  const ob = page.locator('.ob-shell')
  await expect(ob.getByRole('heading', { name: 'Contas fixas' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Vamos começar' })).toHaveCount(0)
  await expect(page.getByText('Quanto você ganha por mês?')).toHaveCount(0)
})

// ── Achados do QA N2-1 ─────────────────────────────────────────────────────────────────────────────────────────────────
const EMPTY_DASH = { summary: { salary: 0, totalIncome: 0, totalExpenses: 0, totalFixedCosts: 0, unpaidFixedCosts: 0, unpaidBudgetIds: [], totalAvailable: 0, currentBalance: 0, percentUsed: 0 }, transactions: [], limits: [], budgets: [] }
const FULL_DASH = { summary: { salary: 5000, totalIncome: 1500, totalExpenses: 2840, totalFixedCosts: 2000, unpaidFixedCosts: 0, unpaidBudgetIds: [], totalAvailable: 6500, currentBalance: 3660, percentUsed: 44 }, transactions: [], limits: [], budgets: [{ id: 'b1', name: 'Aluguel', amount: 2000, dueDay: 1 }] }

test('concluir o onboarding atualiza o Início na hora (antes ficava zerado até o F5)', async ({ page }) => {
  const user = { ...TEST_USER, onboardingComplete: false, salary: 5000 } // abre em "Contas fixas"
  await injectSession(page, user)
  let finished = false
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  // Antes de concluir o servidor ainda não tem nada para mostrar; DEPOIS de concluir devolve os dados que a pessoa informou.
  // (Em desenvolvimento o React lê duas vezes ao montar — por isso o resultado depende do momento, não da contagem de leituras.)
  await page.route('**/api/auth/complete-onboarding**', r => { finished = true; return r.fulfill(json({ ok: true })) })
  await page.route('**/api/transactions/dashboard**', r => r.fulfill(json(finished ? FULL_DASH : EMPTY_DASH)))
  await page.goto('/dashboard')

  const ob = page.locator('.ob-shell')
  await expect(ob.getByRole('heading', { name: 'Contas fixas' })).toBeVisible()
  await expect(page.locator('.home-stat-val').first()).toHaveText('0') // por trás do onboarding o Início ainda está zerado (é o que a pessoa via)
  await ob.getByRole('button', { name: 'Pular por agora' }).click() // 2 -> 3
  await ob.getByRole('button', { name: 'Pular por agora' }).click() // 3 -> concluir

  await expect(page.locator('.ob-shell')).toHaveCount(0)
  await expect(page.locator('.home-stat-val').first()).toHaveText('6.500') // Entradas = salário + entradas, SEM recarregar a página
})

test('"Pular" com salário digitado pergunta no próprio app (não no diálogo do navegador)', async ({ page }) => {
  const user = { ...TEST_USER, onboardingComplete: false, salary: 0 }
  await injectSession(page, user)
  let nativeDialogs = 0
  page.on('dialog', d => { nativeDialogs++; d.dismiss() })
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.goto('/dashboard')

  await page.getByPlaceholder('0,00').fill('8500')
  await page.getByRole('button', { name: 'Pular por agora' }).click()
  const dialog = page.getByRole('dialog', { name: 'Pular sem salvar o salário?' })
  await expect(dialog).toBeVisible()
  expect(nativeDialogs).toBe(0)
  await dialog.getByRole('button', { name: 'Continuar editando' }).click()
  await expect(page.getByPlaceholder('0,00')).toHaveValue('8500') // o valor continua lá
  await page.getByRole('button', { name: 'Pular por agora' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Pular mesmo assim' }).click()
  await expect(page.locator('.ob-shell').getByRole('heading', { name: 'Contas fixas' })).toBeVisible()
  expect(nativeDialogs).toBe(0)
})

// Achado N2-1: salário vazio ou negativo seguia para "Contas fixas" sem nenhuma mensagem (e o servidor nem chegava a ser chamado).
test('"Continuar" sem salário válido avisa no próprio campo e só avança com um valor maior que zero', async ({ page }) => {
  const user = { ...TEST_USER, onboardingComplete: false, salary: 0 }
  const saved = []
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.route('**/api/budget/salary**', r => { saved.push(JSON.parse(r.request().postData() || '{}').salary); r.fulfill(json({ salary: saved.at(-1) })) })
  await page.goto('/dashboard')

  const field = page.getByLabel('Salário mensal')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('alert')).toHaveText('Informe seu salário ou toque em "Pular por agora".')
  await field.fill('-500')
  await expect(page.getByRole('alert')).toHaveCount(0) // corrigir tira o aviso
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByRole('alert')).toHaveText('Informe um valor maior que zero.')
  await expect(page.getByText('Quanto você ganha por mês?')).toBeVisible() // continua no passo 1
  expect(saved).toEqual([])

  await field.fill('4500')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.locator('.ob-shell').getByRole('heading', { name: 'Contas fixas' })).toBeVisible()
  expect(saved).toEqual([4500])
})

test('o texto das contas fixas aponta o caminho real: Perfil → Finanças', async ({ page }) => {
  const user = { ...TEST_USER, onboardingComplete: false, salary: 5000 }
  await injectSession(page, user)
  await page.route('**/api/**', r => r.fulfill(json([])))
  await page.route('**/api/auth/me**', r => r.fulfill(json(user)))
  await page.goto('/dashboard')
  await expect(page.locator('.ob-shell').getByText(/Você pode incluir mais depois em Perfil → Finanças\./)).toBeVisible()
})

test('quem salvou o tema claro vê o título das telas de auth em branco sobre o azul', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('theme', 'light'))
  await page.goto('/login')
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible()
  const color = await page.evaluate(() => getComputedStyle(document.querySelector('.auth-hero .auth-title')).color)
  expect(color).toBe('rgb(255, 255, 255)')
})
