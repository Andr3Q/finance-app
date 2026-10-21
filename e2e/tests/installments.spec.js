// @ts-nocheck
const { test, expect }                          = require('@playwright/test')
const { createMock, INSTALLMENT_ITEM, TX_EXPENSE } = require('../helpers/mockApi')
const { injectSession, TEST_USER }              = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Fluxo de Parcelamentos — E2E
// Cobre: listar, criar, pagar, desfazer, quitado, excluir
// ─────────────────────────────────────────────────────────────────

async function setupBase(page, installments = []) {
  await injectSession(page)
  const mock = createMock(page)
  mock.get('/api/transactions', { data: [TX_EXPENSE], total: 1 })
  mock.get('/api/installments', installments)
  mock.get('/api/transactions/dashboard', {
    salary: 5000, totalExpenses: 120, currentBalance: 4880,
  })
  mock.get('/api/auth/me', TEST_USER)
  return mock
}

// "Compras parceladas" abre pelo atalho "Parcelados" do cabeçalho do Extrato
// (tela 10) — a seção começa recolhida, então todo teste abre o atalho primeiro.
async function goToParcelados(page) {
  await page.goto('/transactions')
  await page.getByRole('button', { name: /^parcelados$/i }).click()
}

test.describe('Parcelamentos — Seção', () => {
  test('exibe cabeçalho "Compras parceladas"', async ({ page }) => {
    await setupBase(page)
    await goToParcelados(page)
    await expect(page.getByText(/compras parceladas/i)).toBeVisible()
  })

  test('exibe mensagem vazia quando não há planos', async ({ page }) => {
    await setupBase(page)
    await goToParcelados(page)
    await expect(page.getByText(/nenhuma compra parcelada/i)).toBeVisible()
  })

  test('exibe badge com quantidade de parcelamentos ativos', async ({ page }) => {
    await setupBase(page, [INSTALLMENT_ITEM, { ...INSTALLMENT_ITEM, id: 'inst-002', name: 'MacBook' }])
    await goToParcelados(page)
    await expect(page.locator('.parc-badge')).toHaveText('2')
  })
})

test.describe('Parcelamentos — Renderização de card', () => {
  test.beforeEach(async ({ page }) => {
    await setupBase(page, [INSTALLMENT_ITEM])
    await goToParcelados(page)
    await page.getByText('iPhone 15').waitFor()
  })

  test('exibe nome do parcelamento', async ({ page }) => {
    await expect(page.getByText('iPhone 15')).toBeVisible()
  })

  test('exibe progresso "2/12 pagas"', async ({ page }) => {
    await expect(page.getByText(/2.*\/.*12.*pagas/i)).toBeVisible()
  })

  test('exibe botão "Pagar parcela 3/12"', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /pagar parcela 3\/12/i })
    ).toBeVisible()
  })

  test('exibe botão "Desfazer" quando paidInstallments > 0', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /desfazer/i })
    ).toBeVisible()
  })
})

test.describe('Parcelamentos — Card quitado', () => {
  test('exibe "✓ Quitado" e não mostra botão de pagar', async ({ page }) => {
    const done = { ...INSTALLMENT_ITEM, paidInstallments: 12 }
    await setupBase(page, [done])
    await goToParcelados(page)

    await expect(page.getByText(/quitado/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /pagar parcela/i })).not.toBeVisible()
  })
})

test.describe('Parcelamentos — Pagar parcela', () => {
  test.beforeEach(async ({ page }) => {
    await injectSession(page)

    let paid = false
    page.route('**/api/installments**', (route) => {
      const method = route.request().method()
      const url    = route.request().url()

      if (method === 'GET') {
        const item = paid
          ? { ...INSTALLMENT_ITEM, paidInstallments: 3 }
          : INSTALLMENT_ITEM
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([item]) })
        return
      }
      if (method === 'PATCH' && url.includes('/pay')) {
        paid = true
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ plan: { ...INSTALLMENT_ITEM, paidInstallments: 3 }, transaction: {} }),
        })
        return
      }
      route.continue()
    })

    page.route('**/api/transactions**', (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0 }) })
    })
    page.route('**/api/transactions/dashboard**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ salary: 5000, totalExpenses: 0, currentBalance: 5000 }) })
    })

    await goToParcelados(page)
    await page.getByText('iPhone 15').waitFor()
  })

  test('clicar em "Pagar parcela" exibe toast de sucesso', async ({ page }) => {
    await page.getByRole('button', { name: /pagar parcela 3\/12/i }).click()
    await expect(page.getByText(/parcela registrada como transação/i)).toBeVisible()
  })

  test('progresso avança para 3/12 após pagar', async ({ page }) => {
    await page.getByRole('button', { name: /pagar parcela 3\/12/i }).click()
    await expect(page.getByText(/3.*\/.*12.*pagas/i)).toBeVisible()
  })
})

test.describe('Parcelamentos — Desfazer parcela', () => {
  test('clicar em "Desfazer" exibe toast "Parcela desfeita."', async ({ page }) => {
    await injectSession(page)

    page.route('**/api/installments**', (route) => {
      const method = route.request().method()
      if (method === 'GET') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([INSTALLMENT_ITEM]) })
        return
      }
      if (method === 'PATCH') {
        route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ ...INSTALLMENT_ITEM, paidInstallments: 1 }),
        })
        return
      }
      route.continue()
    })
    page.route('**/api/transactions**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0 }) })
    })
    page.route('**/api/transactions/dashboard**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ salary: 5000, totalExpenses: 0, currentBalance: 5000 }) })
    })

    await goToParcelados(page)
    await page.getByRole('button', { name: /desfazer/i }).click()
    await expect(page.getByText(/parcela desfeita/i)).toBeVisible()
  })
})

test.describe('Parcelamentos — Excluir', () => {
  test('clica no X e remove o parcelamento', async ({ page }) => {
    await injectSession(page)

    let deleted = false
    page.route('**/api/installments**', (route) => {
      const method = route.request().method()
      if (method === 'GET') {
        const list = deleted ? [] : [INSTALLMENT_ITEM]
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) })
        return
      }
      if (method === 'DELETE') {
        deleted = true
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Parcelamento removido.' }) })
        return
      }
      route.continue()
    })
    page.route('**/api/transactions**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0 }) })
    })
    page.route('**/api/transactions/dashboard**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ salary: 5000, totalExpenses: 0, currentBalance: 5000 }) })
    })

    await goToParcelados(page)
    await page.getByText('iPhone 15').waitFor()

    await page.locator('[title="Remover"]').click()
    // Modal de confirmação — clicar "Sim, excluir" para confirmar
    await page.getByRole('button', { name: /sim, excluir/i }).click()
    await expect(page.getByText(/parcelamento removido/i)).toBeVisible()
  })
})

test.describe('Parcelamentos — Criar novo plano', () => {
  test.beforeEach(async ({ page }) => {
    await injectSession(page)

    page.route('**/api/installments**', (route) => {
      const method = route.request().method()
      if (method === 'GET') {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
        return
      }
      if (method === 'POST') {
        route.fulfill({
          status: 201, contentType: 'application/json',
          body: JSON.stringify({ ...INSTALLMENT_ITEM, id: 'inst-new', name: 'MacBook Air', amount: 800, paidInstallments: 0, totalInstallments: 10 }),
        })
        return
      }
      route.continue()
    })
    page.route('**/api/transactions**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0 }) })
    })
    page.route('**/api/transactions/dashboard**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ salary: 5000, totalExpenses: 0, currentBalance: 5000 }) })
    })

    await goToParcelados(page)
  })

  test('clicar em "+ Nova parcela" exibe o formulário', async ({ page }) => {
    await page.getByRole('button', { name: /\+ nova parcela/i }).click()
    await expect(page.getByPlaceholder(/celular samsung/i)).toBeVisible()
  })

  test('preenche e cria parcelamento com sucesso', async ({ page }) => {
    await page.getByRole('button', { name: /\+ nova parcela/i }).click()

    await page.getByPlaceholder(/celular samsung/i).fill('MacBook Air')

    // CurrencyInput (placeholder "Valor por parcela")
    await page.getByPlaceholder(/valor por parcela/i).fill('800')

    await page.getByPlaceholder(/nº parcelas/i).fill('10')

    await page.getByRole('button', { name: /adicionar/i }).click()

    await expect(page.getByText(/parcelamento criado/i)).toBeVisible()
  })

  test('não cria quando campos obrigatórios estão vazios', async ({ page }) => {
    await page.getByRole('button', { name: /\+ nova parcela/i }).click()
    await page.getByRole('button', { name: /adicionar/i }).click()

    // O formulário não submete — permanece na tela
    await expect(page.getByPlaceholder(/celular samsung/i)).toBeVisible()
  })

  test('"Cancelar" fecha o formulário', async ({ page }) => {
    await page.getByRole('button', { name: /\+ nova parcela/i }).click()
    await expect(page.getByPlaceholder(/celular samsung/i)).toBeVisible()

    await page.getByRole('button', { name: /cancelar/i }).click()
    await expect(page.getByPlaceholder(/celular samsung/i)).not.toBeVisible()
  })
})
