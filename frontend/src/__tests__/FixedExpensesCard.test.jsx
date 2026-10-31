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

test('"Lançar": o botão fica em "Lançando..." até a lista mostrar as contas pagas (não convida a tocar de novo)', async () => {
  let finishList
  budgetAPI.list
    .mockResolvedValueOnce({ data: [{ id: 'b2', name: 'Claro', amount: 49, paidThisMonth: false }] })
    .mockReturnValueOnce(new Promise(r => { finishList = r }))
  transactionsAPI.autoLaunch.mockResolvedValue({ data: { count: 1, alreadyLaunched: false } })

  renderCard()
  await screen.findByText('Claro')
  fireEvent.click(screen.getByRole('button', { name: /lançar/i }))
  await waitFor(() => expect(budgetAPI.list).toHaveBeenCalledTimes(2)) // a lista nova está a caminho
  expect(screen.getByRole('button', { name: /lançando/i })).toBeDisabled()

  finishList({ data: [{ id: 'b2', name: 'Claro', amount: 49, paidThisMonth: true }] })
  expect(await screen.findByText(/todas as contas fixas pagas este mês/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /lançando/i })).not.toBeInTheDocument()
})

describe('excluir conta fixa', () => {
  const two = { data: [
    { id: 'b1', name: 'Internet', amount: 89, paidThisMonth: false },
    { id: 'b2', name: 'Claro',    amount: 49.9, paidThisMonth: false },
  ] }

  test('a confirmação é um diálogo e diz QUAL conta (nome e valor) será removida', async () => {
    budgetAPI.list.mockResolvedValue(two)
    renderCard()
    await screen.findByText('Claro')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover' })[1])
    const dialog = screen.getByRole('dialog', { name: 'Excluir conta fixa' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('Claro · R$ 49,90')
    expect(dialog).toHaveTextContent('Esta conta fixa será removida permanentemente.')
  })

  test('Esc fecha a confirmação sem remover', async () => {
    budgetAPI.list.mockResolvedValue(two)
    renderCard()
    await screen.findByText('Claro')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover' })[0])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Excluir conta fixa' })).not.toBeInTheDocument()
    expect(budgetAPI.remove).not.toHaveBeenCalled()
  })

  test('"Sim, excluir" remove exatamente a conta mostrada na confirmação', async () => {
    budgetAPI.list.mockResolvedValue(two)
    budgetAPI.remove.mockResolvedValue({ data: {} })
    renderCard()
    await screen.findByText('Claro')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remover' })[1])
    fireEvent.click(screen.getByRole('button', { name: /sim, excluir/i }))
    await waitFor(() => expect(budgetAPI.remove).toHaveBeenCalledWith('b2'))
  })
})

// Formulário "Adicionar conta fixa" no padrão Nancy 2 (sem emoji, data de encerramento opcional)
describe('formulário de adicionar', () => {
  const dateToggle = () => screen.getByRole('button', { name: /data de encerramento/i })
  const emptyList = async () => { budgetAPI.list.mockResolvedValue({ data: [] }); renderCard(); await screen.findByText(/nenhuma conta fixa cadastrada/i) }

  test('a data de encerramento é uma linha com ícone e texto (sem emoji), opcional', async () => {
    await emptyList()
    expect(dateToggle()).toHaveTextContent('Data de encerramento')
    expect(dateToggle()).toHaveTextContent('opcional')
    expect(dateToggle()).not.toHaveTextContent('📅')
    expect(document.querySelector('.fa-form').textContent).not.toMatch(/📅/u)
    expect(dateToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByPlaceholderText('DD')).not.toBeInTheDocument()
  })

  test('tocar abre DD/MM/AAAA (foco avança sozinho) e tocar de novo fecha e limpa', async () => {
    await emptyList()
    fireEvent.click(dateToggle())
    expect(dateToggle()).toHaveAttribute('aria-expanded', 'true')
    expect(dateToggle()).toHaveTextContent('Remover')
    fireEvent.change(screen.getByPlaceholderText('DD'), { target: { value: '31' } })
    expect(screen.getByPlaceholderText('MM')).toHaveFocus()
    fireEvent.change(screen.getByPlaceholderText('MM'), { target: { value: '12' } })
    expect(screen.getByPlaceholderText('AAAA')).toHaveFocus()
    fireEvent.click(dateToggle())
    expect(screen.queryByPlaceholderText('DD')).not.toBeInTheDocument()
    fireEvent.click(dateToggle())
    expect(screen.getByPlaceholderText('DD')).toHaveValue('')
  })

  test('conta com data de encerramento válida é criada com a data em ISO', async () => {
    budgetAPI.create.mockResolvedValue({ data: { id: 'b9' } })
    await emptyList()
    fireEvent.change(screen.getByPlaceholderText('Nome da conta'), { target: { value: 'Academia' } })
    fireEvent.change(screen.getByPlaceholderText('Valor'), { target: { value: '120,00' } })
    fireEvent.change(screen.getByPlaceholderText('Dia venc.'), { target: { value: '10' } })
    fireEvent.click(dateToggle())
    fireEvent.change(screen.getByPlaceholderText('DD'), { target: { value: '31' } })
    fireEvent.change(screen.getByPlaceholderText('MM'), { target: { value: '12' } })
    fireEvent.change(screen.getByPlaceholderText('AAAA'), { target: { value: '2027' } })
    fireEvent.click(screen.getByRole('button', { name: /^adicionar$/i }))
    await waitFor(() => expect(budgetAPI.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Academia', dueDay: 10, endDate: '2027-12-31' })))
  })

  test('data incompleta ou inexistente mostra o erro e não cria', async () => {
    await emptyList()
    fireEvent.change(screen.getByPlaceholderText('Nome da conta'), { target: { value: 'Academia' } })
    fireEvent.change(screen.getByPlaceholderText('Valor'), { target: { value: '120,00' } })
    fireEvent.click(dateToggle())
    fireEvent.change(screen.getByPlaceholderText('DD'), { target: { value: '31' } })
    fireEvent.click(screen.getByRole('button', { name: /^adicionar$/i }))
    expect(await screen.findByText('Por favor, insira uma data válida.')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('MM'), { target: { value: '02' } })
    fireEvent.change(screen.getByPlaceholderText('AAAA'), { target: { value: '2027' } })
    fireEvent.click(screen.getByRole('button', { name: /^adicionar$/i }))
    await waitFor(() => expect(screen.getByText('Por favor, insira uma data válida.')).toBeInTheDocument())
    expect(budgetAPI.create).not.toHaveBeenCalled()
  })

  test('mês com 1 dígito não é aceito (a data precisa de DD, MM e AAAA completos)', async () => {
    await emptyList()
    fireEvent.change(screen.getByPlaceholderText('Nome da conta'), { target: { value: 'Academia' } })
    fireEvent.change(screen.getByPlaceholderText('Valor'), { target: { value: '120,00' } })
    fireEvent.click(dateToggle())
    fireEvent.change(screen.getByPlaceholderText('DD'), { target: { value: '31' } })
    fireEvent.change(screen.getByPlaceholderText('MM'), { target: { value: '1' } })
    fireEvent.change(screen.getByPlaceholderText('AAAA'), { target: { value: '2027' } })
    fireEvent.click(screen.getByRole('button', { name: /^adicionar$/i }))
    expect(await screen.findByText('Por favor, insira uma data válida.')).toBeInTheDocument()
    expect(budgetAPI.create).not.toHaveBeenCalled()
  })

  test('dia de vencimento fora de 1 a 31 mostra o erro e não cria', async () => {
    await emptyList()
    fireEvent.change(screen.getByPlaceholderText('Nome da conta'), { target: { value: 'Luz' } })
    fireEvent.change(screen.getByPlaceholderText('Valor'), { target: { value: '90,00' } })
    fireEvent.change(screen.getByPlaceholderText('Dia venc.'), { target: { value: '40' } })
    fireEvent.click(screen.getByRole('button', { name: /^adicionar$/i }))
    expect(await screen.findByText('O dia de vencimento deve ser um número entre 1 e 31.')).toBeInTheDocument()
    expect(budgetAPI.create).not.toHaveBeenCalled()
  })

  test('sem nome ou valor avisa e não cria', async () => {
    const onMessage = vi.fn()
    budgetAPI.list.mockResolvedValue({ data: [] })
    renderCard({ onMessage })
    await screen.findByText(/nenhuma conta fixa cadastrada/i)
    fireEvent.click(screen.getByRole('button', { name: /^adicionar$/i }))
    expect(onMessage).toHaveBeenCalledWith('Preencha o nome e o valor da conta fixa.', 'error')
    expect(budgetAPI.create).not.toHaveBeenCalled()
  })
})
