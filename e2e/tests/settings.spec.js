// @ts-nocheck
const { test, expect }          = require('../helpers/test')
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
  test('botão "Não renovar" visível para usuário Pro pago', async ({ page }) => {
    await setupSettings(page, { ...TEST_USER, isOnTrial: false })
    await page.goto('/settings/pagamentos')
    await expect(page.getByRole('button', { name: 'Não renovar' })).toBeVisible()
  })

  test('botão de cancelar NÃO aparece para usuário Free', async ({ page }) => {
    await setupSettings(page, FREE_USER)
    await page.goto('/settings/pagamentos')
    await expect(page.getByRole('heading', { name: 'Plano Grátis' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Não renovar' })).toHaveCount(0)
  })

  test('abre modal de confirmação ao clicar em "Não renovar"', async ({ page }) => {
    await setupSettings(page, { ...TEST_USER, isOnTrial: false })
    await page.goto('/settings/pagamentos')
    await page.getByRole('button', { name: 'Não renovar' }).click()
    await expect(page.getByText(/não renovar o plano/i)).toBeVisible()
  })

  test('fecha modal ao clicar em "Voltar"', async ({ page }) => {
    await setupSettings(page, { ...TEST_USER, isOnTrial: false })
    await page.goto('/settings/pagamentos')
    await page.getByRole('button', { name: 'Não renovar' }).click()
    // dentro do modal: o "Voltar" do cabeçalho da tela é outro botão
    await page.locator('.gls-modal').getByRole('button', { name: 'Voltar', exact: true }).click()
    await expect(page.getByText(/não renovar o plano/i)).not.toBeVisible()
  })

  test('cancela plano com sucesso e troca o botão pelo aviso de acesso garantido', async ({ page }) => {
    await setupSettings(page, { ...TEST_USER, isOnTrial: false, planExpiresAt: '2030-01-20T15:00:00Z' })
    page.route('**/api/auth/downgrade**', (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Plano cancelado.' }) })
    })

    await page.goto('/settings/pagamentos')
    await page.getByRole('button', { name: 'Não renovar' }).click()
    await page.getByPlaceholder('Sua senha atual').fill('minhasenha')
    await page.getByRole('button', { name: /sim, não renovar/i }).click()

    await expect(page.locator('.toast')).toContainText('seu plano não será renovado.')
    await expect(page.locator('.pg-cancelled')).toContainText('Acesso premium garantido até')
    await expect(page.getByRole('button', { name: 'Não renovar' })).toHaveCount(0)
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

    await page.goto('/settings/fechamento')
    await page.getByRole('button', { name: /fechar mês e gerar pdf/i }).click()
    // a confirmação é uma janela do app (não a caixa nativa do navegador)
    await page.getByRole('dialog', { name: 'Fechar o mês?' }).getByRole('button', { name: 'Fechar mês' }).click()

    await expect(page.getByText(/mês fechado com sucesso/i)).toBeVisible()
  })
})

test.describe('Configurações — Histórico de pagamentos', () => {
  const PAYMENTS = [
    { paymentId: 'pay_4', plan: 'elite', period: 'monthly', processedAt: '2026-10-20T15:00:00Z', amount: 34.9, method: 'card', cardLast4: '4021' },
    { paymentId: 'pay_3', plan: 'elite', period: 'monthly', processedAt: '2026-09-20T15:00:00Z', amount: 34.9, method: 'card', cardLast4: '4021' },
    { paymentId: 'pay_2', plan: 'elite', period: 'monthly', processedAt: '2026-08-20T15:00:00Z', amount: 34.9, method: 'pix', cardLast4: null },
    { paymentId: 'pay_1', plan: 'pro',   period: 'monthly', processedAt: '2026-07-20T15:00:00Z', amount: 9.9,  method: null, cardLast4: null },
  ]

  test('layout do design: cartão do plano com o último valor e o histórico com uma linha por pagamento', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-21T15:00:00Z'))
    await page.setViewportSize({ width: 393, height: 852 })
    await setupSettings(page, { ...TEST_USER, plan: 'elite', planExpiresAt: '2026-11-20T15:00:00Z' })
    page.route('**/api/payments/history**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYMENTS) }))
    await page.goto('/settings/pagamentos')
    await expect(page.locator('.fin-hero-sub')).toHaveText('Histórico e renovação')
    await expect(page.locator('.pg-plan-title')).toHaveText('Plano Elite')
    await expect(page.locator('.pg-plan-sub')).toHaveText('Válido até 20 nov 2026 · cartão •••• 4021')
    await expect(page.locator('.pg-plan-amt')).toHaveText('R$ 34,90')
    await expect(page.locator('.pg-row-date')).toHaveText(['20 out 2026', '20 set 2026', '20 ago 2026', '20 jul 2026'])
    await expect(page.locator('.pg-row-sub')).toHaveText(['Elite · cartão', 'Elite · cartão', 'Elite · PIX', 'Pro · mensal'])
    await expect(page.locator('.pg-row-amt')).toHaveText(['R$ 34,90', 'R$ 34,90', 'R$ 34,90', 'R$ 9,90'])
    await expect(page.locator('.pg-row-ok')).toHaveCount(4)
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Perfil')
    const m = await page.evaluate(() => {
      const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width), Math.round(b.height)] }
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return { plan: r('.pg-plan'), hist: r('.pg-hist'), cancel: r('.pg-cancel'), ico: cs('.pg-plan-ico').backgroundColor, cancelColor: cs('.pg-cancel').color, theme: document.documentElement.getAttribute('data-theme') }
    })
    expect(m.plan.slice(0, 2)).toEqual([18, 357]) // 393 - 2 × 18 de margem
    expect(m.hist.slice(0, 2)).toEqual([18, 357])
    expect(m.cancel).toEqual([18, 357, 53])
    expect(m.ico).toBe('rgb(25, 200, 132)')
    expect(m.cancelColor).toBe('rgb(214, 69, 69)')
    expect(m.theme).toBe('light')
  })

  test('exibe histórico para Pro com pagamentos anteriores (sem a forma de pagamento, mostra o período)', async ({ page }) => {
    await setupSettings(page)
    page.route('**/api/payments/history**', (route) => {
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify([{ paymentId: 'pay_abc123456', plan: 'pro', period: 'monthly', processedAt: new Date('2026-03-15T15:00:00Z').toISOString(), amount: 9.9 }]),
      })
    })
    await page.goto('/settings/pagamentos')
    await expect(page.getByRole('heading', { name: 'Histórico' })).toBeVisible()
    await expect(page.locator('.pg-row-sub')).toHaveText('Pro · mensal')
    await expect(page.locator('.pg-row-amt')).toHaveText('R$ 9,90')
  })

  test('Free sem pagamentos: sem histórico, só o convite pros planos', async ({ page }) => {
    await setupSettings(page, FREE_USER)
    await page.goto('/settings/pagamentos')
    await expect(page.getByRole('heading', { name: 'Plano Grátis' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Histórico' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Ver planos' }).click()
    await expect(page).toHaveURL(/\/planos$/)
  })
})
