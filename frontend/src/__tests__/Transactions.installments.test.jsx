import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Transactions from '../pages/Transactions.jsx'

vi.mock('../services/api.js', () => ({
  transactionsAPI:  { list: vi.fn(), remove: vi.fn(), importCSV: vi.fn(), monthlyRecap: vi.fn() },
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
import { invalidateCache } from '../services/cache.js'

// Mesmo cálculo do fix em Transactions.jsx — usado nos testes pra descobrir
// qual é o mês REAL atual (Brasília) sem depender de mockar a data do sistema.
function currentBrasiliaMonthYear() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric',
  }).formatToParts(new Date())
  const get = (type) => Number(parts.find(p => p.type === type).value)
  return { month: get('month'), year: get('year') }
}

// ── Factories ────────────────────────────────────────────────────

const mkPlan = (overrides = {}) => ({
  id:                'plan-001',
  name:              'iPhone 15',
  amount:            500,
  totalInstallments: 12,
  paidInstallments:  0,
  ...overrides,
})

// A seção "Compras parceladas" abre pelo atalho "Parcelados" do cabeçalho do
// Extrato (tela 10) — começa recolhida, então os testes abrem o atalho primeiro.
async function renderOpen() {
  const utils = render(<MemoryRouter><Transactions /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: /^parcelados$/i }))
  return utils
}

async function setup() {
  transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
  installmentsAPI.list.mockResolvedValue({ data: [] })
  return renderOpen()
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Seção de parcelas visível ─────────────────────────────────────

describe('Transactions — seção de parcelas', () => {
  it('exibe o cabeçalho "Compras parceladas"', async () => {
    await setup()
    expect(await screen.findByText(/compras parceladas/i)).toBeInTheDocument()
  })

  it('exibe mensagem vazia quando não há planos', async () => {
    await setup()
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
    await renderOpen()
    expect(await screen.findByText('2')).toBeInTheDocument()
  })
})

// ── Renderização de cards ─────────────────────────────────────────

describe('Transactions — cards de parcela', () => {
  it('renderiza o nome do plano', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan()] })
    await renderOpen()
    expect(await screen.findByText('iPhone 15')).toBeInTheDocument()
  })

  it('exibe "0/12 pagas" no card', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan()] })
    await renderOpen()
    expect(await screen.findByText(/\/12 pagas/i)).toBeInTheDocument()
  })

  it('exibe botão "Pagar parcela 1/12" para plano com 0 parcelas pagas', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan()] })
    await renderOpen()
    expect(await screen.findByRole('button', { name: /pagar parcela 1\/12/i })).toBeInTheDocument()
  })

  it('exibe "✓ Quitado" quando todas as parcelas foram pagas', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({
      data: [mkPlan({ paidInstallments: 12 })],
    })
    await renderOpen()
    expect(await screen.findByText(/✓ quitado/i)).toBeInTheDocument()
  })

  it('não exibe botão "Pagar parcela" para plano quitado', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({
      data: [mkPlan({ paidInstallments: 12 })],
    })
    await renderOpen()
    await screen.findByText(/✓ quitado/i)
    expect(screen.queryByRole('button', { name: /pagar parcela/i })).not.toBeInTheDocument()
  })

  it('exibe botão "Desfazer" quando há parcelas pagas', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({
      data: [mkPlan({ paidInstallments: 3 })],
    })
    await renderOpen()
    expect(await screen.findByRole('button', { name: /desfazer/i })).toBeInTheDocument()
  })

  it('não exibe "Desfazer" quando paidInstallments é 0', async () => {
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan({ paidInstallments: 0 })] })
    await renderOpen()
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

    await renderOpen()
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

    await renderOpen()
    fireEvent.click(await screen.findByRole('button', { name: /pagar parcela/i }))

    expect(await screen.findByText(/parcela registrada como transação/i)).toBeInTheDocument()
  })

  it('mostra toast de erro quando pay falha', async () => {
    installmentsAPI.pay.mockRejectedValue({
      response: { data: { error: 'Todas as parcelas já foram pagas.' } },
    })
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan()] })
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })

    await renderOpen()
    fireEvent.click(await screen.findByRole('button', { name: /pagar parcela/i }))

    expect(await screen.findByText(/todas as parcelas já foram pagas/i)).toBeInTheDocument()
  })

  it('chama installmentsAPI.unpay ao clicar em "Desfazer"', async () => {
    installmentsAPI.unpay.mockResolvedValue({})
    installmentsAPI.list.mockResolvedValue({
      data: [mkPlan({ paidInstallments: 3 })],
    })
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })

    await renderOpen()
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

    await renderOpen()
    fireEvent.click(await screen.findByRole('button', { name: /desfazer/i }))

    expect(await screen.findByText(/parcela desfeita/i)).toBeInTheDocument()
  })

  // Regressão: /pay sempre cria a transação no mês REAL atual (nowBrasilia()
  // no backend), não no mês que a tela está mostrando. Sem isso, pagar uma
  // parcela enquanto o usuário navegou pra outro mês invalidava só o cache do
  // mês visto (sem mudança nenhuma) e deixava o mês real com cache velho.
  it('ao pagar parcela vendo um mês diferente do atual, invalida o cache do mês REAL também', async () => {
    installmentsAPI.pay.mockResolvedValue({})
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan()] })
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })

    await renderOpen()
    fireEvent.click(await screen.findByLabelText('Mês anterior')) // sai do mês atual

    fireEvent.click(await screen.findByRole('button', { name: /pagar parcela/i }))

    const { month, year } = currentBrasiliaMonthYear()
    await waitFor(() => {
      expect(invalidateCache).toHaveBeenCalledWith(`transactions:list:${year}-${month}`)
    })
  })

  it('ao desfazer parcela vendo um mês diferente do atual, invalida o cache do mês REAL também', async () => {
    installmentsAPI.unpay.mockResolvedValue({})
    installmentsAPI.list.mockResolvedValue({ data: [mkPlan({ paidInstallments: 2 })] })
    transactionsAPI.list.mockResolvedValue({ data: { data: [] } })

    await renderOpen()
    fireEvent.click(await screen.findByLabelText('Mês anterior'))

    fireEvent.click(await screen.findByRole('button', { name: /desfazer/i }))

    const { month, year } = currentBrasiliaMonthYear()
    await waitFor(() => {
      expect(invalidateCache).toHaveBeenCalledWith(`transactions:list:${year}-${month}`)
    })
  })
})

// ── Navegação rápida entre meses (race condition) ──────────────────

describe('Transactions — navegação rápida entre meses', () => {
  // Regressão: sem guarda de sequência, a resposta da 1ª fetch (mês inicial,
  // rede lenta) podia chegar DEPOIS da 2ª fetch (mês pra onde o usuário já
  // navegou) e sobrescrever `transactions` com o array do mês errado — que o
  // filtro de render (t.month === selMonth) então esconde por completo,
  // fazendo o mês certo (já carregado corretamente) sumir da tela sozinho.
  it('resposta lenta de uma fetch antiga não sobrescreve o mês pra onde o usuário já navegou', async () => {
    installmentsAPI.list.mockResolvedValue({ data: [] })

    const today     = new Date()
    const prevDate   = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const prevMonth  = prevDate.getMonth() + 1
    const prevYear   = prevDate.getFullYear()

    let resolveFirst
    const firstPending = new Promise(res => { resolveFirst = res })

    transactionsAPI.list
      .mockImplementationOnce(() => firstPending) // 1ª fetch (mês inicial, no mount) fica pendurada
      .mockResolvedValueOnce({
        data: {
          data: [{
            id: 'tx-novo', description: 'Mês novo', amount: 200, type: 'expense',
            category: 'food', month: prevMonth, year: prevYear, date: `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`,
          }],
        },
      })

    await renderOpen()
    fireEvent.click(await screen.findByLabelText('Mês anterior')) // dispara a 2ª fetch, mês diferente da 1ª

    await waitFor(() => expect(screen.getByText('Mês novo')).toBeInTheDocument())

    // Só agora a 1ª fetch (mês antigo, já abandonado) finalmente resolve.
    resolveFirst({
      data: {
        data: [{
          id: 'tx-velho', description: 'Mês velho', amount: 100, type: 'expense',
          category: 'food', month: today.getMonth() + 1, year: today.getFullYear(), date: today.toISOString().slice(0, 10),
        }],
      },
    })
    await new Promise(r => setTimeout(r, 0))

    // Com a guarda de sequência, essa resposta atrasada é descartada — o mês
    // certo continua exibido, não vira uma tela vazia.
    expect(screen.getByText('Mês novo')).toBeInTheDocument()
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
    await renderOpen()
    fireEvent.click(await screen.findByTitle('Remover'))
    // Modal de confirmação abre — clicar "Sim, excluir" para confirmar
    fireEvent.click(await screen.findByRole('button', { name: /sim, excluir/i }))
    await waitFor(() => {
      expect(installmentsAPI.remove).toHaveBeenCalledWith('plan-001')
    })
  })

  it('mostra toast "Parcelamento removido." após remoção', async () => {
    await renderOpen()
    fireEvent.click(await screen.findByTitle('Remover'))
    fireEvent.click(await screen.findByRole('button', { name: /sim, excluir/i }))
    expect(await screen.findByText(/parcelamento removido/i)).toBeInTheDocument()
  })

  it('não remove quando usuário cancela o confirm', async () => {
    await renderOpen()
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
    await renderOpen()
    fireEvent.click(await screen.findByRole('button', { name: /\+ nova parcela/i }))
    expect(screen.getByPlaceholderText(/celular samsung/i)).toBeInTheDocument()
  })

  it('esconde formulário ao clicar em "Cancelar"', async () => {
    await renderOpen()
    fireEvent.click(await screen.findByRole('button', { name: /\+ nova parcela/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.queryByPlaceholderText(/celular samsung/i)).not.toBeInTheDocument()
  })

  it('não chama create se campos obrigatórios estão vazios', async () => {
    await renderOpen()
    fireEvent.click(await screen.findByRole('button', { name: /\+ nova parcela/i }))
    fireEvent.submit(screen.getByPlaceholderText(/celular samsung/i).closest('form'))
    expect(installmentsAPI.create).not.toHaveBeenCalled()
  })

  it('chama installmentsAPI.create com dados corretos', async () => {
    await renderOpen()
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
    await renderOpen()
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
    await renderOpen()
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
