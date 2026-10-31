import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import BillsMonth from '../pages/BillsMonth.jsx'

vi.mock('../services/api.js', () => ({ budgetAPI: { list: vi.fn(), pay: vi.fn() } }))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { budgetAPI } from '../services/api.js'
import { invalidateCache } from '../services/cache.js'

const bill = (over = {}) => ({ id: 'b1', name: 'Aluguel', amount: 3500, dueDay: 5, paidThisMonth: false, paidDate: null, ...over })
const SIX = [
  bill({ id: 'a', name: 'Celular', amount: 47, dueDay: 25 }),
  bill({ id: 'b', name: 'Aluguel', amount: 3500, dueDay: 5, paidThisMonth: true, paidDate: '2026-10-05T12:00:00Z' }),
  bill({ id: 'c', name: 'Academia', amount: 200, dueDay: 20 }),
  bill({ id: 'd', name: 'Internet', amount: 150, dueDay: 15, paidThisMonth: true }),
]

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage({ bills = SIX, entries = ['/contas-do-mes'], index } = {}) {
  budgetAPI.list.mockResolvedValue({ data: bills })
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/contas-do-mes" element={<BillsMonth />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 21, 12) }) })
afterEach(() => { vi.useRealTimers() })

describe('Contas do mês — resumo e lista', () => {
  it('cabeçalho com o mês, resumo (pagas, total, pendentes) e contas por vencimento', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Contas do mês' })).toBeInTheDocument()
    expect(screen.getByText('Compromissos de outubro')).toBeInTheDocument()
    const summary = screen.getByLabelText('Resumo do mês')
    expect(within(summary).getByText('2/4')).toBeInTheDocument()
    expect(within(summary).getByText('R$ 3.897,00')).toBeInTheDocument() // soma de todas, pagas ou não
    expect(within(summary).getByText('2 pendentes')).toBeInTheDocument()
    expect(screen.getAllByText(/^Vence dia/).map(e => e.textContent)).toEqual(['Vence dia 5', 'Vence dia 15', 'Vence dia 20', 'Vence dia 25'])
  })

  it('cada conta mostra "Paga" ou "Pendente"; com tudo pago o status vira "Tudo pago"', async () => {
    renderPage()
    await screen.findByText('Aluguel')
    expect(screen.getAllByText('Paga')).toHaveLength(2)
    expect(screen.getAllByText('Pendente')).toHaveLength(2)

    renderPage({ bills: [bill({ paidThisMonth: true })] })
    expect(await screen.findByText('Tudo pago')).toBeInTheDocument()
  })

  it('a dica "Toque numa conta para marcar como paga" some quando está tudo pago (não há mais o que marcar)', async () => {
    const { unmount } = renderPage()
    await screen.findByText('Aluguel')
    expect(screen.getByText('Toque numa conta para marcar como paga.')).toBeInTheDocument()
    unmount()

    renderPage({ bills: [bill({ paidThisMonth: true })] })
    await screen.findByText('Tudo pago')
    expect(screen.queryByText('Toque numa conta para marcar como paga.')).not.toBeInTheDocument()
  })

  it('uma conta pendente aparece como "1 pendente" (singular)', async () => {
    renderPage({ bills: [bill(), bill({ id: 'z', name: 'Luz', paidThisMonth: true })] })
    expect(await screen.findByText('1 pendente')).toBeInTheDocument()
  })

  it('ocultar valores (preferência do Início) esconde os R$', async () => {
    localStorage.setItem('hide-balance', '1')
    renderPage()
    await screen.findByText('Aluguel')
    expect(screen.queryByText(/R\$ \d/)).not.toBeInTheDocument()
    expect(screen.getAllByText('R$ ••••').length).toBeGreaterThan(4)
  })

  it('sem contas cadastradas: aviso e botão que leva a cadastrar (Finanças)', async () => {
    renderPage({ bills: [] })
    expect(await screen.findByText(/nenhuma conta fixa cadastrada/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cadastrar contas/i }))
    expect(screen.getByTestId('where')).toHaveTextContent('/financas')
  })
})

describe('Contas do mês — marcar como paga', () => {
  it('tocar numa pendente pede confirmação e só paga depois de confirmar', async () => {
    budgetAPI.pay.mockResolvedValue({ data: {} })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /academia, pendente/i }))
    const dialog = await screen.findByRole('dialog', { name: 'Marcar como paga' })
    expect(within(dialog).getByText(/Academia · R\$ 200,00/)).toBeInTheDocument()
    expect(budgetAPI.pay).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar como paga' }))
    await waitFor(() => expect(budgetAPI.pay).toHaveBeenCalledWith('c'))
    expect(await screen.findByText(/academia marcada como paga/i)).toBeInTheDocument()
    expect(invalidateCache).toHaveBeenCalledWith('dashboard')
    expect(budgetAPI.list).toHaveBeenCalledTimes(2) // recarrega a lista
  })

  it('cancelar a confirmação não paga nada', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /academia, pendente/i }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(budgetAPI.pay).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('erro ao pagar mostra a mensagem do servidor', async () => {
    budgetAPI.pay.mockRejectedValue({ response: { data: { error: 'Limite de transações do plano atingido.' } } })
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /academia, pendente/i }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Marcar como paga' }))
    expect(await screen.findByText(/limite de transações do plano atingido/i)).toBeInTheDocument()
  })

  it('tocar numa conta já paga não paga de novo: explica como desfazer', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /aluguel, paga/i }))
    expect(await screen.findByText(/já está paga.*apague o lançamento no extrato/i)).toBeInTheDocument()
    expect(budgetAPI.pay).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Contas do mês — tecla Esc', () => {
  it('Esc fecha a confirmação de pagamento sem pagar', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /academia, pendente/i }))
    expect(await screen.findByRole('dialog', { name: 'Marcar como paga' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Marcar como paga' })).not.toBeInTheDocument()
    expect(budgetAPI.pay).not.toHaveBeenCalled()
  })
})

describe('Contas do mês — navegação', () => {
  it('voltar retorna à tela anterior; aberta direto pela URL vai pro Extrato', async () => {
    const first = renderPage({ entries: ['/dashboard', '/contas-do-mes'], index: 1 })
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard')
    first.unmount()
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/transactions')
  })
})
