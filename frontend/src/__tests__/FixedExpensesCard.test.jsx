import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import FixedExpensesCard from '../components/features/settings/FixedExpensesCard.jsx'

vi.mock('../services/api.js', () => ({
  budgetAPI: {
    list:   vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    pay:    vi.fn(),
  },
  transactionsAPI: {
    autoLaunch: vi.fn(),
    create:     vi.fn(),
  },
}))
vi.mock('../services/cache.js', () => ({ invalidateCache: vi.fn() }))
vi.mock('../services/analytics.js', () => ({ analytics: { track: vi.fn() } }))

import { budgetAPI, transactionsAPI } from '../services/api.js'

function setUser(overrides = {}) {
  const user = { id: 'u1', plan: 'free', ...overrides }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  return user
}

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <FixedExpensesCard onMessage={vi.fn()} onUpgrade={vi.fn()} {...props} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  setUser()
})

// Regressão: testadores beta não conseguiam encontrar como marcar uma conta
// fixa como paga (só existia o botão "lançar TODAS de uma vez"); e pedir pro
// chat de IA criava transação sem nunca tirar o "pendente" da conta — ver
// backend/src/services/budgetPayment.js.

test('mostra "paga" pra conta já quitada e botão "Marcar como paga" pra pendente', async () => {
  budgetAPI.list.mockResolvedValue({ data: [
    { id: 'b1', name: 'Internet', amount: 89, paidThisMonth: true,  paidAmount: 89, paidDate: '2026-10-05' },
    { id: 'b2', name: 'Claro',    amount: 49, paidThisMonth: false, paidAmount: null, paidDate: null },
  ] })

  renderCard()

  expect(await screen.findByText('Internet')).toBeInTheDocument()
  expect(screen.getByText('paga')).toBeInTheDocument()
  // o botão de pagar fica no detalhe da linha: só aparece ao tocar na conta pendente
  expect(screen.queryByRole('button', { name: /marcar como paga/i })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /claro/i }))
  expect(screen.getByRole('button', { name: /marcar como paga/i })).toBeInTheDocument()
})

test('o detalhe de uma conta já paga mostra a data do pagamento e não oferece pagar de novo', async () => {
  budgetAPI.list.mockResolvedValue({ data: [
    { id: 'b1', name: 'Internet', amount: 89, paidThisMonth: true, paidAmount: 89, paidDate: '2026-10-05T12:00:00Z', endDate: '2027-03-10T12:00:00Z' },
  ] })

  renderCard()
  fireEvent.click(await screen.findByRole('button', { name: /internet/i }))

  expect(screen.getByText(/paga em 05\/10\/2026/i)).toBeInTheDocument()
  expect(screen.getByText(/^até 10.*mar.*27$/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /marcar como paga/i })).not.toBeInTheDocument()
})

test('o total mensal aparece no cabeçalho do cartão e as linhas mostram o vencimento', async () => {
  budgetAPI.list.mockResolvedValue({ data: [
    { id: 'b1', name: 'Aluguel', amount: 3500, dueDay: 5,    paidThisMonth: false },
    { id: 'b2', name: 'Celular', amount: 47.5, dueDay: null, paidThisMonth: false },
  ] })

  renderCard()

  expect(await screen.findByLabelText('Total mensal')).toHaveTextContent('R$ 3.547,50')
  expect(screen.getByText('Vence dia 5')).toBeInTheDocument()
  expect(screen.getByText('Sem dia de vencimento')).toBeInTheDocument()
})

test('clicar em "Marcar como paga" chama budgetAPI.pay com o id certo e atualiza a lista', async () => {
  budgetAPI.list
    .mockResolvedValueOnce({ data: [{ id: 'b2', name: 'Claro', amount: 49, paidThisMonth: false }] })
    .mockResolvedValueOnce({ data: [{ id: 'b2', name: 'Claro', amount: 49, paidThisMonth: true }] })
  budgetAPI.pay.mockResolvedValue({ data: {} })

  renderCard()
  fireEvent.click(await screen.findByRole('button', { name: /claro/i }))
  fireEvent.click(screen.getByRole('button', { name: /marcar como paga/i }))

  await waitFor(() => expect(budgetAPI.pay).toHaveBeenCalledWith('b2'))
  await waitFor(() => expect(screen.getByText('paga')).toBeInTheDocument())
})

test('botão de lançar mostra "todas como pagas" quando nenhuma conta foi paga ainda', async () => {
  budgetAPI.list.mockResolvedValue({ data: [
    { id: 'b1', name: 'Internet', amount: 89, paidThisMonth: false },
    { id: 'b2', name: 'Claro',    amount: 49, paidThisMonth: false },
  ] })

  renderCard()

  expect(await screen.findByRole('button', { name: /lançar todas como pagas/i })).toBeInTheDocument()
})

test('botão de lançar mostra a contagem quando só parte das contas está pendente', async () => {
  budgetAPI.list.mockResolvedValue({ data: [
    { id: 'b1', name: 'Internet', amount: 89, paidThisMonth: true },
    { id: 'b2', name: 'Claro',    amount: 49, paidThisMonth: false },
  ] })

  renderCard()

  expect(await screen.findByRole('button', { name: /lançar 1 pendente/i })).toBeInTheDocument()
})

test('quando todas as contas estão pagas, mostra mensagem de confirmação e esconde o botão de lançar', async () => {
  budgetAPI.list.mockResolvedValue({ data: [
    { id: 'b1', name: 'Internet', amount: 89, paidThisMonth: true },
  ] })

  renderCard()

  expect(await screen.findByText(/todas as contas fixas pagas este mês/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /lançar/i })).not.toBeInTheDocument()
})

test('clicar em "Lançar" chama transactionsAPI.autoLaunch e recarrega a lista (não mexe em user.autoLaunchMonth)', async () => {
  budgetAPI.list
    .mockResolvedValueOnce({ data: [{ id: 'b2', name: 'Claro', amount: 49, paidThisMonth: false }] })
    .mockResolvedValueOnce({ data: [{ id: 'b2', name: 'Claro', amount: 49, paidThisMonth: true }] })
  transactionsAPI.autoLaunch.mockResolvedValue({ data: { count: 1, alreadyLaunched: false } })

  renderCard()
  await screen.findByText('Claro')
  fireEvent.click(screen.getByRole('button', { name: /lançar/i }))

  await waitFor(() => expect(transactionsAPI.autoLaunch).toHaveBeenCalled())
  await waitFor(() => expect(budgetAPI.list).toHaveBeenCalledTimes(2))
})

test('adicionar conta nova não tenta criar transação automaticamente (fluxo unificado via "Marcar como paga")', async () => {
  budgetAPI.list.mockResolvedValue({ data: [] })
  budgetAPI.create.mockResolvedValue({ data: { id: 'b3' } })

  renderCard()
  await screen.findByText(/nenhuma conta fixa cadastrada/i)

  fireEvent.change(screen.getByPlaceholderText('Nome da conta'), { target: { value: 'Streaming' } })
  fireEvent.change(screen.getByPlaceholderText('Valor'), { target: { value: '29,90' } })
  fireEvent.click(screen.getByRole('button', { name: /^adicionar$/i }))

  await waitFor(() => expect(budgetAPI.create).toHaveBeenCalled())
  expect(transactionsAPI.create).not.toHaveBeenCalled()
})
