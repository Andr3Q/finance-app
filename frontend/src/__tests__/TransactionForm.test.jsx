import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TransactionForm from '../components/features/TransactionForm.jsx'

vi.mock('../services/api.js', () => ({
  transactionsAPI: {
    create: vi.fn(),
    update: vi.fn(),
  },
}))

import { transactionsAPI } from '../services/api.js'

const defaultProps = {
  onClose:   vi.fn(),
  onSuccess: vi.fn(),
}

function setup(props = {}) {
  return render(<TransactionForm {...defaultProps} {...props} />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TransactionForm — novo registro', () => {
  it('renderiza título "Registrar Gasto" por padrão', () => {
    setup()
    expect(screen.getByText('Registrar Gasto', { selector: '.mtitle' })).toBeInTheDocument()
  })

  it('mostra erro ao tentar submeter sem valor', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /registrar gasto/i }))
    expect(await screen.findByText('Insira um valor válido.')).toBeInTheDocument()
  })

  it('mostra campo Categoria apenas para gastos', () => {
    setup()
    expect(screen.getByText('Categoria')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Entrada'))
    expect(screen.queryByText('Categoria')).not.toBeInTheDocument()
  })

  it('não mostra campo Data no modo novo', () => {
    setup()
    expect(screen.queryByText('Data')).not.toBeInTheDocument()
  })

  it('troca título para "Registrar Entrada" ao clicar na tab Entrada', () => {
    setup()
    fireEvent.click(screen.getByText('Entrada'))
    expect(screen.getByText('Registrar Entrada', { selector: '.mtitle' })).toBeInTheDocument()
  })

  it('chama onClose ao clicar em Cancelar', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('cria transação e chama onSuccess ao submeter com valor válido', async () => {
    transactionsAPI.create.mockResolvedValue({ data: {} })
    setup()
    const amtInput = screen.getByPlaceholderText('0,00')
    fireEvent.change(amtInput, { target: { value: '150' } })
    fireEvent.blur(amtInput)
    fireEvent.click(screen.getByRole('button', { name: /registrar gasto/i }))
    await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1))
  })

  it('mostra erro do servidor quando create rejeita', async () => {
    transactionsAPI.create.mockRejectedValue({
      response: { data: { error: 'Limite excedido' } },
    })
    setup()
    const amtInput = screen.getByPlaceholderText('0,00')
    fireEvent.change(amtInput, { target: { value: '50' } })
    fireEvent.blur(amtInput)
    fireEvent.click(screen.getByRole('button', { name: /registrar gasto/i }))
    expect(await screen.findByText('Limite excedido')).toBeInTheDocument()
  })
})

describe('TransactionForm — modo edição', () => {
  const editProps = {
    editingId:   '42',
    initialData: { type: 'expense', amount: 200, description: 'Mercado', category: 'food', date: '2026-05-01' },
  }

  it('renderiza título "Editar Transação"', () => {
    setup(editProps)
    expect(screen.getByText('Editar Transação')).toBeInTheDocument()
  })

  it('mostra campo Data no modo edição', () => {
    setup(editProps)
    expect(screen.getByText('Data')).toBeInTheDocument()
  })

  it('chama update (não create) ao submeter', async () => {
    transactionsAPI.update.mockResolvedValue({ data: {} })
    setup(editProps)
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))
    await waitFor(() => expect(transactionsAPI.update).toHaveBeenCalledWith('42', expect.any(Object)))
    expect(transactionsAPI.create).not.toHaveBeenCalled()
  })

  it('regressão: transação lançada às 23h58 (Brasília) mantém o dia correto ao editar, não pula pro dia seguinte via UTC', async () => {
    // 23:58 de 31/ago em Brasília (UTC-3) = 02:58 de 01/set em UTC — é a janela
    // exata (21h-23h59) onde .toISOString() cru corrompia o mês/ano ao editar.
    transactionsAPI.update.mockResolvedValue({ data: {} })
    setup({
      editingId: '99',
      initialData: { type: 'expense', amount: 50, description: 'Jantar', category: 'food', date: '2026-09-01T02:58:00.000Z' },
    })

    // O campo de data tem que mostrar o dia real em Brasília (31/08), não o dia em UTC (01/09).
    expect(screen.getByDisplayValue('2026-08-31')).toBeInTheDocument()

    // Salvar sem tocar no campo de data não pode mudar o mês da transação.
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))
    await waitFor(() => expect(transactionsAPI.update).toHaveBeenCalledWith('99', expect.objectContaining({ date: '2026-08-31' })))
  })
})
