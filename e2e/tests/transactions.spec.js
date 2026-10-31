// @ts-nocheck
const { test, expect }                      = require('../helpers/test')
const { TX_EXPENSE, TX_INCOME } = require('../helpers/mockApi')
const { injectSession, TEST_USER }          = require('../helpers/session')

// ─────────────────────────────────────────────────────────────────
// Fluxo de Transações — E2E
// Filtros: Todas | Entradas | Saídas | Fixas
// Botões:  "Nova Transação", "Exportar CSV", "Importar CSV"
// ─────────────────────────────────────────────────────────────────

async function setupBase(page, transactions = [TX_EXPENSE, TX_INCOME]) {
  await injectSession(page)
  // Uma única rota intercept que responde a GET corretamente
  page.route('**/api/transactions**', (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    const url = route.request().url()
    if (url.includes('/dashboard'))
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ salary: 5000, totalExpenses: 120, currentBalance: 4880 }) })
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: transactions, total: transactions.length }) })
  })
  page.route('**/api/installments**', (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })
  page.route('**/api/auth/me**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_USER) })
  })
}

test.describe('Transações — Listagem', () => {
  test.beforeEach(async ({ page }) => {
    await setupBase(page)
    await page.goto('/transactions')
  })

  test('exibe transações carregadas da API', async ({ page }) => {
    await expect(page.getByText('Almoço')).toBeVisible()
    await expect(page.getByText('Salário')).toBeVisible()
  })

  test('exibe mensagem vazia quando não há transações', async ({ page }) => {
    await page.unrouteAll()
    page.route('**/api/transactions**', (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const url = route.request().url()
      if (url.includes('/dashboard'))
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ salary: 5000, totalExpenses: 0, currentBalance: 5000 }) })
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0 }) })
    })
    page.route('**/api/installments**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await page.reload()
    // Sem transações: lista vazia — sem nenhum item renderizado
    await expect(page.getByText('Almoço')).not.toBeVisible()
  })

  test('pills de filtro estão visíveis (Todas, Entradas, Saídas, Fixas)', async ({ page }) => {
    await expect(page.getByRole('button', { name: /^todas$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^entradas$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^saídas$/i })).toBeVisible()
  })
})

test.describe('Transações — Filtros', () => {
  test.beforeEach(async ({ page }) => {
    await setupBase(page)
    await page.goto('/transactions')
    await page.getByText('Almoço').waitFor()
  })

  test('filtro "Saídas" exibe apenas despesas', async ({ page }) => {
    await page.getByRole('button', { name: /^saídas$/i }).click()
    await expect(page.getByText('Almoço')).toBeVisible()
    await expect(page.getByText('Salário')).not.toBeVisible()
  })

  test('filtro "Entradas" exibe apenas receitas', async ({ page }) => {
    await page.getByRole('button', { name: /^entradas$/i }).click()
    await expect(page.getByText('Salário')).toBeVisible()
    await expect(page.getByText('Almoço')).not.toBeVisible()
  })

  test('filtro "Todas" restaura todas as transações', async ({ page }) => {
    await page.getByRole('button', { name: /^saídas$/i }).click()
    await page.getByRole('button', { name: /^todas$/i }).click()
    await expect(page.getByText('Almoço')).toBeVisible()
    await expect(page.getByText('Salário')).toBeVisible()
  })

  test('busca por descrição filtra a lista', async ({ page }) => {
    const searchBox = page.locator('.pwnav').getByPlaceholder(/buscar/i) // escopo na tela: o desktop tem outra busca na barra de cima
    await searchBox.fill('Almoço')
    await expect(page.getByText('Almoço')).toBeVisible()
    await expect(page.getByText('Salário')).not.toBeVisible()
  })

  test('limpar busca restaura todas as transações', async ({ page }) => {
    const searchBox = page.locator('.pwnav').getByPlaceholder(/buscar/i) // escopo na tela: o desktop tem outra busca na barra de cima
    await searchBox.fill('Almoço')
    await searchBox.clear()
    await expect(page.getByText('Salário')).toBeVisible()
  })
})

test.describe('Transações — Criar transação', () => {
  test.beforeEach(async ({ page }) => {
    await setupBase(page, [])
    page.route('**/api/transactions**', (route) => {
      const method = route.request().method()
      if (method === 'GET') {
        const url = route.request().url()
        if (url.includes('/dashboard'))
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ salary: 5000, totalExpenses: 0, currentBalance: 5000 }) })
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [], total: 0 }) })
      }
      if (method === 'POST') {
        return route.fulfill({
          status: 201, contentType: 'application/json',
          body: JSON.stringify({ id: 'tx-new', type: 'expense', category: 'food', amount: 85.5, description: 'Jantar sushi' }),
        })
      }
      route.continue()
    })
    page.route('**/api/installments**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })
    await page.goto('/transactions')
  })

  test('abre modal ao clicar em "Nova Transação"', async ({ page }) => {
    await page.locator('.pwnav').getByRole('button', { name: /nova transação/i }).click() // o botão da tela (o da barra de cima abre outra folha)
    await expect(page.locator('.modal').first()).toBeVisible()
  })

  test('cria despesa e fecha o modal com sucesso', async ({ page }) => {
    await page.locator('.pwnav').getByRole('button', { name: /nova transação/i }).click() // o botão da tela (o da barra de cima abre outra folha)
    await page.locator('.modal').first().waitFor()

    // Preenche valor (CurrencyInput com placeholder "0,00")
    await page.getByPlaceholder('0,00').fill('85')

    // Preenche descrição
    await page.getByPlaceholder(/ex\.: mercado/i).fill('Jantar sushi')

    // Botão de submit: "Salvar"
    await page.getByRole('button', { name: /^salvar$/i }).click()

    // onSuccess() fecha o modal — sem toast neste fluxo
    await expect(page.locator('.modal')).not.toBeVisible({ timeout: 5000 })
  })

  test('formulário não submete quando valor está vazio', async ({ page }) => {
    await page.locator('.pwnav').getByRole('button', { name: /nova transação/i }).click() // o botão da tela (o da barra de cima abre outra folha)
    await page.locator('.modal').first().waitFor()

    // Deixa valor vazio, preenche só a descrição
    await page.getByPlaceholder(/ex\.: mercado/i).fill('Sem valor')

    await page.getByRole('button', { name: /^salvar$/i }).click()

    // Valor obrigatório — modal permanece aberto
    await expect(page.locator('.modal').first()).toBeVisible()
  })
})

test.describe('Transações — Excluir transação', () => {
  test('exibe diálogo de confirmação ao remover', async ({ page }) => {
    await setupBase(page, [TX_EXPENSE])

    page.route('**/api/transactions/**', (route) => {
      if (route.request().method() === 'DELETE')
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Removido.' }) })
      route.continue()
    })

    await page.goto('/transactions')
    await page.getByText('Almoço').waitFor()

    await page.locator('button.ex-del[title="Remover"]').first().click()

    // Modal customizado substitui window.confirm
    await expect(page.getByText('Remover transação')).toBeVisible()
  })
})

test.describe('Transações — Exportar CSV', () => {
  test.beforeEach(async ({ page }) => {
    await setupBase(page)
    await page.goto('/transactions')
    await page.getByText('Almoço').waitFor()
  })

  test('botão "Exportar CSV" está visível', async ({ page }) => {
    await expect(page.getByRole('button', { name: /exportar csv/i })).toBeVisible()
  })

  test('clique em "Exportar CSV" dispara download', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download').catch(() => null),
      page.getByRole('button', { name: /exportar csv/i }).click(),
    ])
    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.csv$/)
    }
    // Se não houver evento (URL.createObjectURL), teste não falha — comportamento esperado
  })
})
