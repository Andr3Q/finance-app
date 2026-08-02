import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Transactions from '../pages/Transactions.jsx'

vi.mock('../services/api.js', () => ({
  transactionsAPI:  { list: vi.fn(), remove: vi.fn(), importCSV: vi.fn() },
  installmentsAPI:  {
    list:   vi.fn(),
    create: vi.fn(),
    pay:    vi.fn(),
    unpay:  vi.fn(),
    remove: vi.fn(),
  },
}))

vi.mock('../services/cache.js', () => ({
  getCache:       vi.fn(() => null),
  setCache:       vi.fn(),
  invalidateCache: vi.fn(),
}))

vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { transactionsAPI, installmentsAPI } from '../services/api.js'

// ── Factories ────────────────────────────────────────────────────

const mkPlan = (overrides = {}) => ({
  id:                'plan-001',
  name:              'iPhone 15',
  amount:            500,
  totalInstallments: 12,
  paidInstallments:  0,
  ...overrides,
})

function setup() {
  transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
  installmentsAPI.list.mockResolvedValue({ data: [] })
  return render(
    <MemoryRouter>
      <Transactions />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Seção de parcelas visível ─────────────────────────────────────

describe('Transactions — seção de parcelas', () => {
  it('exibe o cabeçalho "Compras parceladas"', async () => {
    setup()
    expect(await screen.findByText(/compras parceladas/i)).toBeInTheDocument()
  })

  it('exibe mensagem vazia quando não há planos', async () => {
    setup()
    expect(await screen.findByText(/nenhuma compra parcelada/i)).toBeInTheDocument()
  })

  it('exibe o badge com contagem de parcelamentos ativos', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({
      data: [
        mkPlan({ id: 'p1', paidInstallments: 0 }),
        mkPlan({ id: 'p2', name: 'TV', paidInstallments: 0 }),
      ],
    })
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    expect(await screen.findByText('2')).toBeInTheDocument()
  })
})

// ── Renderização de cards ─────────────────────────────────────────

describe('Transactions — cards de parcela', () => {
  it('renderiza o nome do plano', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan()] })
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    expect(await screen.findByText('iPhone 15')).toBeInTheDocument()
  })

  it('exibe "0/12 pagas" no card', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan()] })
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    expect(await screen.findByText(/\/12 pagas/i)).toBeInTheDocument()
  })

  it('exibe botão "Pagar parcela 1/12" para plano com 0 parcelas pagas', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan()] })
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /pagar parcela 1\/12/i })).toBeInTheDocument()
  })

  it('exibe "✓ Quitado" quando todas as parcelas foram pagas', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({
      data: [mkPlan({ paidInstallments: 12 })],
    })
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    expect(await screen.findByText(/✓ quitado/i)).toBeInTheDocument()
  })

  it('não exibe botão "Pagar parcela" para plano quitado', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({
      data: [mkPlan({ paidInstallments: 12 })],
    })
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    await screen.findByText(/✓ quitado/i)
    expect(screen.queryByRole('button', { name: /pagar parcela/i })).not.toBeInTheDocument()
  })

  it('exibe botão "Desfazer" quando há parcelas pagas', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({
      data: [mkPlan({ paidInstallments: 3 })],
    })
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    expect(await screen.findByRole('button', { name: /desfazer/i })).toBeInTheDocument()
  })

  it('não exibe "Desfazer" quando paidInstallments é 0', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan({ paidInstallments: 0 })] })
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    await screen.findByRole('button', { name: /pagar parcela/i })
    expect(screen.queryByRole('button', { name: /desfazer/i })).not.toBeInTheDocument()
  })
})

// ── Ações de parcela ──────────────────────────────────────────────

describe('Transactions — pagar e desfazer parcela', () => {
  it('chama installmentsAPI.pay ao clicar em "Pagar parcela"', async () => {
    installmentsAPI.pay.mockResolvedValue({})
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan()] })
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })

    render(<MemoryRouter><Transactions /></MemoryRouter>)
    const btn = await screen.findByRole('button', { name: /pagar parcela 1\/12/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(installmentsAPI.pay).toHaveBeenCalledWith('plan-001')
    })
  })

  it('mostra toast de sucesso após pagar parcela', async () => {
    installmentsAPI.pay.mockResolvedValue({})
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan()] })
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })

    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /pagar parcela/i }))

    expect(await screen.findByText(/parcela registrada como transação/i)).toBeInTheDocument()
  })

  it('mostra toast de erro quando pay falha', async () => {
    installmentsAPI.pay.mockRejectedValue({
      response: { data: { error: 'Todas as parcelas já foram pagas.' } },
    })
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan()] })
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })

    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /pagar parcela/i }))

    expect(await screen.findByText(/todas as parcelas já foram pagas/i)).toBeInTheDocument()
  })

  it('chama installmentsAPI.unpay ao clicar em "Desfazer"', async () => {
    installmentsAPI.unpay.mockResolvedValue({})
    installmentsAPI.list.mockResolvedValue({
      data: [mkPlan({ paidInstallments: 3 })],
    })
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })

    render(<MemoryRouter><Transactions /></MemoryRouter>)
    const btn = await screen.findByRole('button', { name: /desfazer/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(installmentsAPI.unpay).toHaveBeenCalledWith('plan-001')
    })
  })

  it('mostra toast "Parcela desfeita." após desfazer', async () => {
    installmentsAPI.unpay.mockResolvedValue({})
    installmentsAPI.list.mockResolvedValue({
      data: [mkPlan({ paidInstallments: 2 })],
    })
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })

    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /desfazer/i }))

    expect(await screen.findByText(/parcela desfeita/i)).toBeInTheDocument()
  })
})

// ── Remover parcelamento ──────────────────────────────────────────

describe('Transactions — remover parcelamento', () => {
  beforeEach(() => {
    installmentsAPI.remove.mockResolvedValue({})
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan()] })
  })

  it('chama installmentsAPI.remove com id correto', async () => {
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByTitle('Remover'))
    // Modal de confirmação abre — clicar "Sim, excluir" para confirmar
    fireEvent.click(await screen.findByRole('button', { name: /sim, excluir/i }))
    await waitFor(() => {
      expect(installmentsAPI.remove).toHaveBeenCalledWith('plan-001')
    })
  })

  it('mostra toast "Parcelamento removido." após remoção', async () => {
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByTitle('Remover'))
    fireEvent.click(await screen.findByRole('button', { name: /sim, excluir/i }))
    expect(await screen.findByText(/parcelamento removido/i)).toBeInTheDocument()
  })

  it('não remove quando usuário cancela o confirm', async () => {
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByTitle('Remover'))
    fireEvent.click(await screen.findByRole('button', { name: /cancelar/i }))
    expect(installmentsAPI.remove).not.toHaveBeenCalled()
  })
})

// ── Formulário novo parcelamento ──────────────────────────────────

describe('Transactions — criar novo parcelamento', () => {
  beforeEach(() => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({ data: [] })
    installmentsAPI.create.mockResolvedValue({})
  })

  it('exibe formulário ao clicar em "+ Nova parcela"', async () => {
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /\+ nova parcela/i }))
    expect(screen.getByPlaceholderText(/celular samsung/i)).toBeInTheDocument()
  })

  it('esconde formulário ao clicar em "Cancelar"', async () => {
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /\+ nova parcela/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.queryByPlaceholderText(/celular samsung/i)).not.toBeInTheDocument()
  })

  it('não chama create se campos obrigatórios estão vazios', async () => {
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /\+ nova parcela/i }))
    fireEvent.submit(screen.getByPlaceholderText(/celular samsung/i).closest('form'))
    expect(installmentsAPI.create).not.toHaveBeenCalled()
  })

  it('chama installmentsAPI.create com dados corretos', async () => {
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /\+ nova parcela/i }))

    await userEvent.type(screen.getByPlaceholderText(/celular samsung/i), 'MacBook Pro')
    await userEvent.type(screen.getByPlaceholderText(/nº parcelas/i), '12')

    // CurrencyInput — digita no input textbox que não é "Nº parcelas"
    const amountInput = screen.getAllByRole('textbox').find(
      el => el.placeholder === 'Valor por parcela'
    )
    await userEvent.type(amountInput, '500')

    fireEvent.submit(screen.getByPlaceholderText(/celular samsung/i).closest('form'))

    await waitFor(() => {
      expect(installmentsAPI.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'MacBook Pro', totalInstallments: 12 })
      )
    })
  })

  it('mostra toast de sucesso após criar', async () => {
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /\+ nova parcela/i }))

    await userEvent.type(screen.getByPlaceholderText(/celular samsung/i), 'Notebook')
    await userEvent.type(screen.getByPlaceholderText(/nº parcelas/i), '6')
    const amountInput = screen.getAllByRole('textbox').find(
      el => el.placeholder === 'Valor por parcela'
    )
    await userEvent.type(amountInput, '300')

    fireEvent.submit(screen.getByPlaceholderText(/celular samsung/i).closest('form'))
    expect(await screen.findByText(/parcelamento criado/i)).toBeInTheDocument()
  })

  it('mostra toast de erro quando create falha', async () => {
    installmentsAPI.create.mockRejectedValue({
      response: { data: { error: 'Nome deve ter entre 2 e 100 caracteres.' } },
    })
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    fireEvent.click(await screen.findByRole('button', { name: /\+ nova parcela/i }))

    await userEvent.type(screen.getByPlaceholderText(/celular samsung/i), 'Notebook')
    await userEvent.type(screen.getByPlaceholderText(/nº parcelas/i), '6')
    const amountInput = screen.getAllByRole('textbox').find(
      el => el.placeholder === 'Valor por parcela'
    )
    await userEvent.type(amountInput, '300')

    fireEvent.submit(screen.getByPlaceholderText(/celular samsung/i).closest('form'))
    expect(await screen.findByText(/nome deve ter entre 2 e 100 caracteres/i)).toBeInTheDocument()
  })
})
