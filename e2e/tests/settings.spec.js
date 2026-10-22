// @ts-nocheck
const { test, expect }          = require('@playwright/test')
const { createMock }            = require('../helpers/mockApi')
const { injectSession, FREE_USER, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Fluxo de Configurações — E2E
// Estrutura: hub "/settings" com 3 abas (Gerenciar/Acompanhar/Sobre),
// cada item navega pra uma subtela própria (/settings/seguranca,
// /settings/pagamentos, /settings/fechamento, etc).
// ChangePasswordCard: botão toggle "Alterar senha", depois os campos
// ─────────────────────────────────────────────────────────────────

async function setupSettings(page, user = TEST_USER) {
  await injectSession(page, user)
  page.route('**/api/budget**',               (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  page.route('**/api/reports/history**',      (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  page.route('**/api/payments/history**',     (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  page.route('**/api/auth/2fa/**',            (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 8 }) }))
  page.route('**/api/auth/referral-stats**',  (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ referrals: 0, rewards: 0 }) }))
  page.route('**/api/notifications/**',       (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  page.route('**/api/auth/me**',              (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }))
}

test.describe('Configurações — Layout', () => {
  test('carrega a página de configurações sem erros', async ({ page }) => {
    await setupSettings(page)
    await page.goto('/settings')
    // Hero de configurações com nome do usuário
    await expect(page.getByText('Ana E2E').first()).toBeVisible()
  })

  test('exibe seção "Financeiro" com card de salário na página Finanças', async ({ page }) => {
    await setupSettings(page)
    await page.goto('/financas')
    await expect(page.getByPlaceholder('0,00').first()).toBeVisible()
  })
})

test.describe('Configurações — Salário', () => {
  test('atualiza salário com sucesso', async ({ page }) => {
    await setupSettings(page)
    page.route('**/api/budget/salary**', (route) => {
      if (route.request().method() !== 'PUT') return route.continue()
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ salary: 6000 }) })
    })

    await page.goto('/financas')
    const salaryInput = page.getByPlaceholder('0,00').first()
    await salaryInput.clear()
    await salaryInput.fill('6000')

    await page.getByRole('button', { name: /salvar/i }).first().click()

    await expect(page.getByText(/atualizado com sucesso/i)).toBeVisible()
  })
})

test.describe('Configurações — Alterar senha', () => {
  test.beforeEach(async ({ page }) => {
    await setupSettings(page)
    await page.goto('/settings/seguranca')
    // Nancy 2 (tela 26): o formulário de senha já vem aberto
  })

  test('exibe os campos do formulário de senha já abertos', async ({ page }) => {
    await expect(page.getByPlaceholder('Senha atual', { exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Nova senha', { exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Confirmar nova senha')).toBeVisible()
  })

  test('exibe erro quando senha atual está vazia ao submeter', async ({ page }) => {
    // Preenche nova senha e confirmação mas deixa atual vazia
    await page.getByPlaceholder('Nova senha', { exact: true }).fill('Nova@Senha99')
    await page.getByPlaceholder('Confirmar nova senha').fill('Nova@Senha99')
    await page.getByRole('button', { name: 'Atualizar senha' }).click()

    await expect(page.getByText(/informe a senha atual/i)).toBeVisible()
  })

  test('exibe erro quando senhas não coincidem', async ({ page }) => {
    await page.getByPlaceholder('Senha atual', { exact: true }).fill('Atual@123')
    await page.getByPlaceholder('Nova senha', { exact: true }).fill('Nova@Senha99')
    await page.getByPlaceholder('Confirmar nova senha').fill('SenhaDiferente9')
    await page.getByRole('button', { name: 'Atualizar senha' }).click()

    await expect(page.getByText(/não coincidem/i)).toBeVisible()
  })

  test('altera senha com sucesso e exibe toast', async ({ page }) => {
    page.route('**/api/auth/password**', (route) => {
      if (route.request().method() !== 'PUT') return route.continue()
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Senha alterada com sucesso!' }) })
    })

    await page.getByPlaceholder('Senha atual', { exact: true }).fill('Atual@123')
    await page.getByPlaceholder('Nova senha', { exact: true }).fill('Nova@Senha99')
    await page.getByPlaceholder('Confirmar nova senha').fill('Nova@Senha99')
    await page.getByRole('button', { name: 'Atualizar senha' }).click()

    await expect(page.getByText(/senha alterada/i)).toBeVisible()
  })

  test('exibe erro quando senha atual está errada', async ({ page }) => {
    page.route('**/api/auth/password**', (route) => {
      if (route.request().method() !== 'PUT') return route.continue()
      route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Senha atual incorreta.' }) })
    })

    await page.getByPlaceholder('Senha atual', { exact: true }).fill('SenhaErrada1')
    await page.getByPlaceholder('Nova senha', { exact: true }).fill('Nova@Senha99')
    await page.getByPlaceholder('Confirmar nova senha').fill('Nova@Senha99')
    await page.getByRole('button', { name: 'Atualizar senha' }).click()

    await expect(page.getByText(/senha atual incorreta/i)).toBeVisible()
  })
})

test.describe('Configurações — Cancelar plano', () => {
  test('card "Cancelar plano Pro" visível para usuário Pro pago', async ({ page }) => {
    await setupSettings(page, { ...TEST_USER, isOnTrial: false })
    await page.goto('/settings/pagamentos')
    await expect(page.getByText(/cancelar plano pro/i)).toBeVisible()
  })

  test('card "Cancelar plano" NÃO aparece para usuário Free', async ({ page }) => {
    await setupSettings(page, FREE_USER)
    await page.goto('/settings/pagamentos')
    await expect(page.getByText(/cancelar plano/i)).not.toBeVisible()
  })

  test('abre modal de confirmação ao clicar em "Cancelar plano"', async ({ page }) => {
    await setupSettings(page, { ...TEST_USER, isOnTrial: false })
    await page.goto('/settings/pagamentos')
    await page.getByRole('button', { name: /cancelar plano/i }).click()
    await expect(page.getByText(/confirmar cancelamento/i)).toBeVisible()
  })

  test('fecha modal ao clicar em "Voltar"', async ({ page }) => {
    await setupSettings(page, { ...TEST_USER, isOnTrial: false })
    await page.goto('/settings/pagamentos')
    await page.getByRole('button', { name: /cancelar plano/i }).click()
    // exact:true evita colidir com o link "Voltar para Mais" da casca da subtela
    await page.getByRole('button', { name: 'Voltar', exact: true }).click()
    await expect(page.getByText(/confirmar cancelamento/i)).not.toBeVisible()
  })

  test('cancela plano com sucesso e exibe toast', async ({ page }) => {
    await setupSettings(page, { ...TEST_USER, isOnTrial: false })
    page.route('**/api/auth/downgrade**', (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Plano cancelado.' }) })
    })

    await page.goto('/settings/pagamentos')
    await page.getByRole('button', { name: /cancelar plano/i }).click()
    await page.getByPlaceholder('Sua senha atual').fill('minhasenha')
    await page.getByRole('button', { name: /sim, cancelar/i }).click()

    await expect(page.getByText(/assinatura cancelada/i)).toBeVisible()
  })
})

test.describe('Configurações — Fechar mês (Balanço mensal)', () => {
  test('tela "Balanço mensal" com o botão de fechar visível para Pro', async ({ page }) => {
    await setupSettings(page)
    await page.goto('/settings/fechamento')
    await expect(page.getByRole('heading', { name: 'Balanço mensal' })).toBeVisible()
    await expect(page.getByRole('button', { name: /fechar mês e gerar pdf/i })).toBeVisible()
  })

  test('plano grátis: o botão abre o convite "Recurso Pro"', async ({ page }) => {
    await setupSettings(page, FREE_USER)
    await page.goto('/settings/fechamento')
    await page.getByRole('button', { name: /fechar mês e gerar pdf/i }).click()
    await expect(page.getByText(/exclusivo do plano pro/i).first()).toBeVisible()
  })

  test('fecha mês com sucesso e exibe toast', async ({ page }) => {
    await setupSettings(page)
    page.route('**/api/reports/monthly-close**', (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ message: 'Mês fechado com sucesso! Relatório enviado para ana.e2e@test.com' }),
      })
    })

    await page.addInitScript(() => { window.confirm = () => true })
    await page.goto('/settings/fechamento')
    await page.getByRole('button', { name: /fechar mês e gerar pdf/i }).click()

    await expect(page.getByText(/mês fechado com sucesso/i)).toBeVisible()
  })
})

test.describe('Configurações — Histórico de pagamentos', () => {
  test('exibe histórico para Pro com pagamentos anteriores', async ({ page }) => {
    await setupSettings(page)
    page.route('**/api/payments/history**', (route) => {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ paymentId: 'pay_abc123456', plan: 'pro', period: 'monthly', processedAt: new Date('2026-03-15').toISOString() }]),
      })
    })
    await page.goto('/settings/pagamentos')
    await expect(page.getByText(/histórico de pagamentos/i)).toBeVisible()
    await expect(page.getByText(/plano pro — mensal/i)).toBeVisible()
  })

  test('não exibe card para Free sem pagamentos', async ({ page }) => {
    await setupSettings(page, FREE_USER)
    await page.goto('/settings/pagamentos')
    await expect(page.getByText(/histórico de pagamentos/i)).not.toBeVisible()
  })
})
