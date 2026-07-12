// @ts-nocheck
const { test, expect }          = require('@playwright/test')
const { GOAL_ITEM }             = require('../helpers/mockApi')
const { injectSession, TEST_USER } = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Fluxo de Metas Financeiras — E2E
// Botões reais: "Nova meta", "Depositar", "Remover"
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
  test('exibe botão "Nova meta" na página', async ({ page }) => {
    await setupGoals(page)
    await page.goto('/goals')
    await expect(page.getByRole('button', { name: /nova meta/i })).toBeVisible()
  })

  test('exibe mensagem vazia quando não há metas', async ({ page }) => {
    await setupGoals(page)
    await page.goto('/goals')
    await expect(page.getByText(/nenhuma meta|sem metas|crie sua primeira|adicione uma meta/i)).toBeVisible()
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

  test('abre modal ao clicar em "Nova meta"', async ({ page }) => {
    await page.getByRole('button', { name: /nova meta/i }).click()
    // Placeholder real do input de nome: "Ex: Reserva de emergência"
    await expect(page.getByPlaceholder(/reserva de emergência/i)).toBeVisible()
  })

  test('cria meta com sucesso e exibe toast', async ({ page }) => {
    await page.getByRole('button', { name: /nova meta/i }).click()
    await page.getByPlaceholder(/reserva de emergência/i).fill('Fundo Emergência')

    // Primeiro CurrencyInput com placeholder "0,00" = valor-alvo
    await page.getByPlaceholder('0,00').first().fill('5000')

    await page.getByRole('button', { name: /criar meta/i }).click()
    await expect(page.getByText(/criada|adicionada|sucesso/i)).toBeVisible()
  })

  test('exibe toast de erro ao salvar sem nome', async ({ page }) => {
    await page.getByRole('button', { name: /nova meta/i }).click()
    // Deixa nome vazio, preenche valor
    await page.getByPlaceholder('0,00').first().fill('5000')
    await page.getByRole('button', { name: /criar meta/i }).click()
    await expect(page.getByText('Informe o nome da meta.')).toBeVisible()
  })

  test('"Cancelar" fecha o modal sem criar', async ({ page }) => {
    await page.getByRole('button', { name: /nova meta/i }).click()
    await expect(page.getByPlaceholder(/reserva de emergência/i)).toBeVisible()
    await page.getByRole('button', { name: /^cancelar$/i }).click()
    await expect(page.getByPlaceholder(/reserva de emergência/i)).not.toBeVisible()
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

  test('botão "Depositar" está visível no card da meta', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^depositar$/i })).toBeVisible()
  })

  test('abre modal de depósito ao clicar em "Depositar"', async ({ page }) => {
    await page.getByRole('button', { name: /^depositar$/i }).click()
    // Modal tem título "Depositar na meta"
    await expect(page.getByText(/depositar na meta/i)).toBeVisible()
  })

  test('realiza depósito com sucesso e exibe toast', async ({ page }) => {
    await page.getByRole('button', { name: /^depositar$/i }).click()
    await page.getByPlaceholder('0,00').fill('500')
    // Botão de confirmar no modal de depósito
    await page.getByRole('button', { name: /^depositar$/i }).last().click()
    await expect(page.getByText(/depósito registrado|meta atingida/i)).toBeVisible()
  })
})

test.describe('Metas — Excluir meta', () => {
  test('clica em "Remover" e exclui a meta', async ({ page }) => {
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

    // Botão real: texto "Remover" → abre modal customizado
    await page.getByRole('button', { name: /^remover$/i }).click()
    // Confirmar no modal customizado de exclusão
    await page.getByRole('button', { name: /sim, excluir/i }).click()
    await expect(page.getByText(/removida|excluída|sucesso/i)).toBeVisible()
  })
})
