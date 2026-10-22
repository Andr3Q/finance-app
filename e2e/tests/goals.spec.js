// @ts-nocheck
const { test, expect }          = require('@playwright/test')
const { GOAL_ITEM }             = require('../helpers/mockApi')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Fluxo de Metas Financeiras — E2E
// Metas (Nancy 2, tela 19): cartão "Nova meta", depósito rápido "+ R$ 500", edição/remoção pelo nome da meta
// ─────────────────────────────────────────────────────────────────

async function setupGoals(page, goals = []) {
  await injectSession(page)
  page.route('**/api/goals**', (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(goals) })
    route.continue()
  })
  page.route('**/api/transactions/subscriptions**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  page.route('**/api/auth/me**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_USER) })
  })
}

test.describe('Metas — Listagem', () => {
  test('exibe o cartão "Nova meta" com "Criar meta" desligado até preencher', async ({ page }) => {
    await setupGoals(page)
    await page.goto('/goals')
    await expect(page.getByRole('heading', { name: 'Nova meta' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Criar meta' })).toBeDisabled()
  })

  test('sem metas só aparece o cartão "Nova meta"', async ({ page }) => {
    await setupGoals(page)
    await page.goto('/goals')
    await expect(page.getByRole('heading', { name: 'Metas' })).toBeVisible()
    await expect(page.locator('.gl-card')).toHaveCount(0)
  })

  test('exibe card da meta com nome correto', async ({ page }) => {
    await setupGoals(page, [GOAL_ITEM])
    await page.goto('/goals')
    await expect(page.getByText('Reserva de emergência')).toBeVisible()
  })

  test('exibe percentual de progresso 20% (2000/10000)', async ({ page }) => {
    await setupGoals(page, [GOAL_ITEM])
    await page.goto('/goals')
    await expect(page.getByText('20%')).toBeVisible()
  })

  test('exibe múltiplas metas simultaneamente', async ({ page }) => {
    const goal2 = { ...GOAL_ITEM, id: 'goal-002', title: 'Viagem Europa', targetAmount: 8000, currentAmount: 500 }
    await setupGoals(page, [GOAL_ITEM, goal2])
    await page.goto('/goals')
    await expect(page.getByText('Reserva de emergência')).toBeVisible()
    await expect(page.getByText('Viagem Europa')).toBeVisible()
  })
})

test.describe('Metas — Criar meta', () => {
  test.beforeEach(async ({ page }) => {
    await injectSession(page)
    page.route('**/api/goals**', (route) => {
      const method = route.request().method()
      if (method === 'GET')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
      if (method === 'POST')
        return route.fulfill({
          status: 201, contentType: 'application/json',
          body: JSON.stringify({ ...GOAL_ITEM, id: 'goal-new', title: 'Fundo Emergência', targetAmount: 5000, currentAmount: 0 }),
        })
      route.continue()
    })
    page.route('**/api/transactions/subscriptions**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    page.route('**/api/auth/me**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_USER) })
    })
    await page.goto('/goals')
  })

  test('cria meta com sucesso e exibe toast', async ({ page }) => {
    await page.getByPlaceholder('Ex.: Carro novo').fill('Fundo Emergência')
    await page.getByPlaceholder('Valor alvo (R$)').fill('5000')
    await page.getByRole('button', { name: 'Criar meta' }).click()
    await expect(page.getByText('Meta criada!')).toBeVisible()
  })

  test('"Criar meta" fica desligado sem nome ou sem valor', async ({ page }) => {
    await page.getByPlaceholder('Valor alvo (R$)').fill('5000')
    await expect(page.getByRole('button', { name: 'Criar meta' })).toBeDisabled()
    await page.getByPlaceholder('Ex.: Carro novo').fill('Carro')
    await expect(page.getByRole('button', { name: 'Criar meta' })).toBeEnabled()
  })
})

test.describe('Metas — Depositar valor', () => {
  test.beforeEach(async ({ page }) => {
    await injectSession(page)
    page.route('**/api/goals**', (route) => {
      const method = route.request().method()
      if (method === 'GET')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([GOAL_ITEM]) })
      if (method === 'PATCH')
        return route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ ...GOAL_ITEM, currentAmount: 2500 }),
        })
      route.continue()
    })
    page.route('**/api/transactions/subscriptions**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    // Mock analytics se necessário
    page.route('**/api/agent/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    page.route('**/api/auth/me**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_USER) })
    })
    await page.goto('/goals')
    await page.getByText('Reserva de emergência').waitFor()
  })

  test('o card mostra o depósito rápido "+ R$ 500"', async ({ page }) => {
    await expect(page.getByRole('button', { name: /depositar na meta reserva de emergência/i })).toHaveText('+ R$ 500')
  })

  test('abre o depósito com 500 preenchido e só deposita ao confirmar', async ({ page }) => {
    await page.getByRole('button', { name: /depositar na meta/i }).click()
    await expect(page.getByText(/depositar na meta/i).first()).toBeVisible()
    await expect(page.getByPlaceholder('0,00')).toHaveValue('500,00')
  })

  test('realiza depósito com sucesso e exibe toast', async ({ page }) => {
    await page.getByRole('button', { name: /depositar na meta/i }).click()
    await page.getByRole('button', { name: /^depositar$/i }).last().click()
    await expect(page.getByText(/depósito registrado|meta atingida/i)).toBeVisible()
  })
})

test.describe('Metas — Excluir meta', () => {
  test('remove a meta pela edição, com confirmação', async ({ page }) => {
    await injectSession(page)

    let deleted = false
    page.route('**/api/goals**', (route) => {
      const method = route.request().method()
      if (method === 'GET')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deleted ? [] : [GOAL_ITEM]) })
      if (method === 'DELETE') {
        deleted = true
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Meta removida.' }) })
      }
      route.continue()
    })
    page.route('**/api/transactions/subscriptions**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    await page.goto('/goals')
    await page.getByText('Reserva de emergência').waitFor()

    // tocar no nome abre a edição, que tem "Remover meta" → modal de confirmação
    await page.getByRole('button', { name: /editar meta reserva de emergência/i }).click()
    await page.getByRole('button', { name: 'Remover meta' }).click()
    // Confirmar no modal customizado de exclusão
    await page.getByRole('button', { name: /sim, excluir/i }).click()
    await expect(page.getByText(/removida|excluída|sucesso/i)).toBeVisible()
  })
})

test.describe('Metas — visual do design (celular)', () => {
  test.use({ viewport: { width: 393, height: 852 } })

  test('tela azul com atalhos, cartões brancos, depósito azul e "Nova meta" tracejado; Metas aceso na barra', async ({ page }) => {
    await setupGoals(page, [GOAL_ITEM])
    await page.goto('/goals')
    await page.getByText('Reserva de emergência').waitFor()
    await expect(page.getByRole('button', { name: /Histórico/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Assinaturas/ })).toBeVisible()
    await expect(page.locator('.dsb-mn-item.active .dsb-mn-lbl')).toHaveText('Metas')
    const m = await page.evaluate(() => {
      const cs = (s) => getComputedStyle(document.querySelector(s))
      return {
        theme: document.documentElement.getAttribute('data-theme'), blue: cs('.gl-blue').backgroundColor, card: cs('.gl-card').backgroundColor,
        dep: cs('.gl-dep').backgroundColor, newBorder: cs('.gl-new').borderTopStyle, create: cs('.gl-create').backgroundColor,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(m).toEqual({ theme: 'light', blue: 'rgb(28, 72, 255)', card: 'rgb(255, 255, 255)', dep: 'rgb(28, 72, 255)', newBorder: 'dashed', create: 'rgb(61, 226, 159)', overflow: 0 })
  })
})
