// @ts-nocheck
/**
 * Helpers para interceptar chamadas de API via page.route().
 *
 * Uso:
 *   const mock = createMock(page)
 *   mock.get('/api/transactions', [])
 *   mock.post('/api/transactions', { id: '1', ... }, 201)
 *   mock.fail('/api/transactions', 'Saldo insuficiente', 400)
 */

function createMock(page) {
  /**
   * Intercepta GET e responde com JSON.
   */
  function get(path, body, status = 200) {
    page.route(`**${path}**`, (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    })
  }

  /**
   * Intercepta POST/PATCH/PUT e responde com JSON.
   */
  function post(path, body, status = 200, methods = ['POST', 'PUT', 'PATCH']) {
    page.route(`**${path}**`, (route) => {
      if (!methods.includes(route.request().method())) return route.continue()
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    })
  }

  /**
   * Intercepta DELETE e responde com JSON.
   */
  function del(path, body = {}, status = 200) {
    page.route(`**${path}**`, (route) => {
      if (route.request().method() !== 'DELETE') return route.continue()
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    })
  }

  /**
   * Faz qualquer método neste path retornar erro.
   */
  function fail(path, error, status = 400) {
    page.route(`**${path}**`, (route) => {
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error }) })
    })
  }

  /**
   * Intercepta qualquer método com handler customizado.
   */
  function handle(path, fn) {
    page.route(`**${path}**`, fn)
  }

  return { get, post, del, fail, handle }
}

// ── Fixtures de dados de teste ────────────────────────────────────

const _now   = new Date()
const _month = _now.getMonth() + 1
const _year  = _now.getFullYear()

const TX_EXPENSE = {
  id: 'tx-001', type: 'expense', category: 'food', amount: 120,
  description: 'Almoço', date: _now.toISOString(),
  month: _month, year: _year, archived: false,
}

const TX_INCOME = {
  id: 'tx-002', type: 'income', category: 'salary', amount: 5000,
  description: 'Salário', date: _now.toISOString(),
  month: _month, year: _year, archived: false,
}

const BUDGET_ITEM = {
  id: 'bud-001', name: 'Aluguel', amount: 1500, category: 'housing', userId: 'e2e-user-001',
}

const GOAL_ITEM = {
  id: 'goal-001', title: 'Reserva de emergência', targetAmount: 10000,
  currentAmount: 2000, deadline: '2026-12-31', color: '#4ac46e', userId: 'e2e-user-001',
}

const INSTALLMENT_ITEM = {
  id:                'inst-001',
  name:              'iPhone 15',
  amount:            500,
  totalInstallments: 12,
  paidInstallments:  2,
  startMonth:        5,
  startYear:         2026,
}

const DASHBOARD_SUMMARY = {
  salary:        5000,
  totalExpenses: 1200,
  totalIncome:   0,
  totalFixedCosts: 1500,
  currentBalance: 2300,
  percentUsed:    33,
}

module.exports = {
  createMock,
  TX_EXPENSE, TX_INCOME, BUDGET_ITEM, GOAL_ITEM, INSTALLMENT_ITEM, DASHBOARD_SUMMARY,
}
