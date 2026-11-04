import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Notifications from '../pages/Notifications.jsx'

import { resetStoriesCache } from '../services/storiesData.js'
vi.mock('../services/api.js', () => ({
  transactionsAPI: { dashboard: vi.fn(), monthlyRecap: vi.fn(), weeklyTipAvailable: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
vi.mock('../utils/notifications.js', () => ({
  getSalaryNotif: vi.fn(() => null), getTrialNotif: vi.fn(() => null), playSoftChime: vi.fn(),
}))
vi.mock('../utils/storySlides.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildRecapSlides: vi.fn(() => new Array(6).fill({})),
}))

import { transactionsAPI } from '../services/api.js'
import { getCache } from '../services/cache.js'
import { getSalaryNotif, getTrialNotif } from '../utils/notifications.js'
import { resetTipAvailableCache } from '../hooks/useTipAvailable.js'

const NOW = new Date(2026, 9, 28, 12)
const payload = (over = {}) => ({
  summary: { unpaidBudgetIds: ['b1'], totalExpenses: 3000, totalIncome: 500 },
  transactions: [{ id: 't1', type: 'expense', category: 'food', amount: 1230 }],
  limits: [{ category: 'food', amount: 1500 }],
  budgets: [{ id: 'b1', name: 'Academia', amount: 200, dueDay: 28, endDate: null }],
  ...over,
})
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.state ? ` ${JSON.stringify(l.state)}` : ''}</div> }
const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function setup({ data = payload() } = {}) {
  if (data instanceof Error) transactionsAPI.dashboard.mockRejectedValue(data)
  else transactionsAPI.dashboard.mockResolvedValue({ data })
  transactionsAPI.monthlyRecap.mockResolvedValue({ data: { hasData: true } })
  return render(
    <MemoryRouter initialEntries={['/notificacoes']}>
      <Where />
      <Routes>
        <Route path="/notificacoes" element={<Notifications />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const rows = () => [...document.querySelectorAll('.ndn-item')]

beforeEach(() => {
  resetStoriesCache()
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  sessionStorage.setItem('user', JSON.stringify({ id: 'u1' }))
  resetTipAvailableCache()
  transactionsAPI.weeklyTipAvailable.mockResolvedValue({ data: { available: true } })
  localStorage.setItem('nancy:stories-seen', JSON.stringify({ 'dicas:2026-W44': Date.now() }))
  getCache.mockReturnValue(null)
  getSalaryNotif.mockReturnValue({ status: 'today', msg: '' })
  getTrialNotif.mockReturnValue(null)
  vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  setDesktop(true)
})
afterEach(() => { vi.useRealTimers(); delete window.matchMedia })

describe('Notificações no desktop (design "Nancy Desktop", tela 14)', () => {
  it('um cartão com uma linha por aviso: ícone azul, título, texto e quando, na ordem de importância', async () => {
    setup()
    await screen.findByText('Academia vence hoje')
    expect(rows().map(r => r.querySelector('.ndn-name').textContent)).toEqual([
      'Academia vence hoje', 'Lembrete de salário', 'Alimentação em 82% do limite', 'Resumo de outubro pronto',
    ])
    const bill = rows()[0]
    expect(bill.querySelector('.ndn-text')).toHaveTextContent('R$ 200,00 · conta fixa')
    expect(bill.querySelector('.ndn-when').textContent).not.toBe('')
    expect(rows().every(r => r.querySelector('.ndn-ico svg'))).toBe(true)
    expect(document.querySelector('.ntf-card')).toBeNull() // a árvore do celular não aparece
  })

  it('tocar num aviso leva à tela dele (conta vencendo → Contas do mês; resumo → stories)', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /Academia vence hoje/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/contas-do-mes')
  })

  it('"ocultar valores" esconde os reais nos textos', async () => {
    localStorage.setItem('hide-balance', '1')
    setup()
    await screen.findByText('Academia vence hoje')
    expect(screen.getByText('R$ •••• · conta fixa')).toBeInTheDocument()
    expect(screen.getByText('Faltam R$ •••• até o teto do mês.')).toBeInTheDocument()
  })

  it('sem avisos: "Tudo em dia"; falha: "Tentar de novo" busca de novo', async () => {
    getSalaryNotif.mockReturnValue(null)
    const { unmount } = setup({ data: payload({ summary: { unpaidBudgetIds: [], totalExpenses: 0, totalIncome: 0 }, transactions: [], limits: [], budgets: [] }) })
    expect(await screen.findByText('Tudo em dia')).toBeInTheDocument()
    unmount()
    setup({ data: new Error('rede') })
    const retry = await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(screen.getByText('Não foi possível carregar')).toBeInTheDocument()
    const antes = transactionsAPI.dashboard.mock.calls.length
    transactionsAPI.dashboard.mockResolvedValue({ data: payload() })
    await userEvent.click(retry)
    expect(await screen.findByText('Academia vence hoje')).toBeInTheDocument()
    expect(transactionsAPI.dashboard).toHaveBeenCalledTimes(antes + 1)
  })

  it('o atalho das preferências continua, abaixo do cartão', async () => {
    setup()
    await screen.findByText('Academia vence hoje')
    await userEvent.click(screen.getByRole('button', { name: 'Preferências de notificação' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/notificacoes')
  })
})

describe('Notificações — celular continua o mesmo', () => {
  it('abaixo de 901px a árvore é a do celular', async () => {
    setDesktop(false)
    setup()
    await screen.findByText('Academia vence hoje')
    expect(document.querySelector('.ntf-card')).not.toBeNull()
    expect(document.querySelector('.ndn-card')).toBeNull()
  })
})
