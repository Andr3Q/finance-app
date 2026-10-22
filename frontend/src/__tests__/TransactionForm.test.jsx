import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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

// Digita um valor no campo grande (CurrencyInput só confirma o valor no blur).
function typeAmount(value) {
  const amt = screen.getByPlaceholderText('0,00')
  fireEvent.change(amt, { target: { value } })
  fireEvent.blur(amt)
}

const CATEGORY_ORDER = ['Alimentação', 'Transporte', 'Shopping', 'Saúde', 'Contas fixas', 'Lazer', 'Educação', 'Casa', 'Outros']

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TransactionForm — folha "Nova transação" (tela 11)', () => {
  it('abre como "Nova transação" já em Saída, com botão Salvar', () => {
    setup()
    expect(screen.getByRole('dialog', { name: 'Nova transação' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nova transação' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saída' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Entrada' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument()
  })

  it('o tipo pedido pelo menu do "+" (Receita) abre direto em Entrada', () => {
    setup({ initialData: { type: 'income' } })
    expect(screen.getByRole('button', { name: 'Entrada' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('group', { name: 'Categoria' })).not.toBeInTheDocument()
  })

  it('valor em destaque com "R$" e placeholder 0,00; descrição com o exemplo do design', () => {
    setup()
    expect(screen.getByText('R$')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('0,00')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Descrição (ex.: Mercado)')).toBeInTheDocument()
  })

  it('só saídas têm categoria: todas as 9 aparecem como chips, na ordem do design, com Alimentação marcada', () => {
    setup()
    const chips = within(screen.getByRole('group', { name: 'Categoria' })).getAllByRole('button')
    expect(chips.map(c => c.textContent)).toEqual(CATEGORY_ORDER)
    expect(screen.getByRole('button', { name: 'Alimentação' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Transporte' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Entrada' }))
    expect(screen.queryByRole('group', { name: 'Categoria' })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Descrição (ex.: Salário)')).toBeInTheDocument()
  })

  it('não mostra campo Data no modo novo (a transação é sempre de hoje)', () => {
    setup()
    expect(screen.queryByLabelText('Data')).not.toBeInTheDocument()
  })

  it('mostra erro ao tentar salvar sem valor', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Insira um valor válido.')).toBeInTheDocument()
    expect(transactionsAPI.create).not.toHaveBeenCalled()
  })

  it('cria a saída com a categoria escolhida e chama onSuccess', async () => {
    transactionsAPI.create.mockResolvedValue({ data: {} })
    setup()
    typeAmount('150')
    fireEvent.change(screen.getByPlaceholderText('Descrição (ex.: Mercado)'), { target: { value: 'Uber' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transporte' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledTimes(1))
    expect(transactionsAPI.create).toHaveBeenCalledWith({ description: 'Uber', amount: 150, type: 'expense', category: 'transport' })
    await waitFor(() => expect(defaultProps.onSuccess).toHaveBeenCalledTimes(1))
  })

  it('entrada é salva sempre com a categoria "income", mesmo se uma chip de saída foi escolhida antes', async () => {
    transactionsAPI.create.mockResolvedValue({ data: {} })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Lazer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Entrada' }))
    typeAmount('5000')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'income', category: 'income', amount: 5000 })))
  })

  it('mostra o erro do servidor (ex.: limite do plano) e deixa tentar de novo', async () => {
    transactionsAPI.create.mockRejectedValue({ response: { data: { error: 'Limite excedido' } } })
    setup()
    typeAmount('50')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Limite excedido')
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeEnabled()
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  it('valor acima do máximo é recusado no cliente', async () => {
    setup()
    typeAmount('100000000')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText(/valor máximo permitido/i)).toBeInTheDocument()
    expect(transactionsAPI.create).not.toHaveBeenCalled()
  })
})

describe('TransactionForm — fechar e descartar', () => {
  it('fechar sem nada digitado fecha direto', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('tocar no fundo escurecido também fecha (sem nada digitado)', () => {
    const { container } = setup()
    fireEvent.click(container.querySelector('.ntx-overlay'))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })

  it('com dados digitados pergunta antes de descartar; "Continuar editando" mantém, "Descartar" fecha', () => {
    setup()
    fireEvent.change(screen.getByPlaceholderText('Descrição (ex.: Mercado)'), { target: { value: 'rascunho' } })
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(defaultProps.onClose).not.toHaveBeenCalled()
    expect(screen.getByText('Descartar alterações?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }))
    expect(screen.queryByText('Descartar alterações?')).not.toBeInTheDocument()
    expect(defaultProps.onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1)
  })
})

describe('TransactionForm — modo edição', () => {
  const editProps = {
    editingId:   '42',
    initialData: { type: 'expense', amount: 200, description: 'Mercado', category: 'food', date: '2026-05-01' },
  }

  it('renderiza título "Editar transação" e o botão "Salvar alterações"', () => {
    setup(editProps)
    expect(screen.getByRole('heading', { name: 'Editar transação' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument()
  })

  it('mostra o campo Data no modo edição, com a data da transação (no fuso de Brasília)', () => {
    // meio-dia em Brasília: não depende de o instante cair antes ou depois da meia-noite UTC
    setup({ ...editProps, initialData: { ...editProps.initialData, date: '2026-05-01T15:00:00.000Z' } })
    expect(screen.getByLabelText('Data')).toHaveValue('2026-05-01')
  })

  it('já abre com a categoria da transação marcada', () => {
    setup({ ...editProps, initialData: { ...editProps.initialData, category: 'health' } })
    expect(screen.getByRole('button', { name: 'Saúde' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Alimentação' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('chama update (não create) ao salvar', async () => {
    transactionsAPI.update.mockResolvedValue({ data: {} })
    setup(editProps)
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }))
    await waitFor(() => expect(transactionsAPI.update).toHaveBeenCalledWith('99', expect.objectContaining({ date: '2026-08-31' })))
  })
})
