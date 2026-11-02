import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TransactionForm from '../components/features/TransactionForm.jsx'

vi.mock('../services/api.js', () => ({ transactionsAPI: { create: vi.fn(), update: vi.fn() } }))
import { transactionsAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const setup = (props = {}) => render(<TransactionForm onClose={vi.fn()} onSuccess={vi.fn()} {...props} />)
const typeAmount = (value) => { const a = screen.getByPlaceholderText('0,00'); fireEvent.change(a, { target: { value } }); fireEvent.blur(a) }

beforeEach(() => { vi.clearAllMocks(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Nova transação no desktop (design "Nancy Desktop", tela 11)', () => {
  it('cartão centralizado com os rótulos do desktop: Despesa / Receita e descrição "Descrição"', () => {
    setup()
    expect(document.querySelector('.ntx-overlay')).toHaveClass('ntx-d')
    expect(screen.getByRole('dialog', { name: 'Nova transação' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Despesa' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Receita' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('button', { name: 'Saída' })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Descrição')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument()
  })

  it('Receita fica verde (classe inc) e some com as categorias', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Despesa' })).not.toHaveClass('inc')
    fireEvent.click(screen.getByRole('button', { name: 'Receita' }))
    expect(screen.getByRole('button', { name: 'Receita' })).toHaveClass('on', 'inc')
    expect(screen.getByRole('button', { name: 'Despesa' })).not.toHaveClass('on')
    expect(screen.queryByRole('group', { name: 'Categoria' })).not.toBeInTheDocument()
  })

  it('as nove categorias continuam, com os ícones do design nas que ele desenha', () => {
    setup()
    const chips = [...document.querySelectorAll('.ntx-chip')]
    expect(chips.map(c => c.textContent)).toEqual(['Alimentação', 'Transporte', 'Shopping', 'Saúde', 'Contas fixas', 'Lazer', 'Educação', 'Casa', 'Outros'])
    expect(chips[0]).toHaveAttribute('aria-pressed', 'true')
    expect(chips.every(c => c.querySelector('svg'))).toBe(true)
  })

  it('salvar manda a mesma transação de sempre (tipo, valor, descrição e categoria) e chama onSuccess', async () => {
    transactionsAPI.create.mockResolvedValue({ data: {} })
    const onSuccess = vi.fn()
    setup({ onSuccess })
    typeAmount('85')
    fireEvent.change(screen.getByPlaceholderText('Descrição'), { target: { value: 'Corrida' } })
    fireEvent.click(screen.getByRole('button', { name: 'Transporte' }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(transactionsAPI.create).toHaveBeenCalledWith({ description: 'Corrida', amount: 85, type: 'expense', category: 'transport' })
  })

  it('receita é salva com a categoria income', async () => {
    transactionsAPI.create.mockResolvedValue({ data: {} })
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Receita' }))
    typeAmount('1800')
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledWith({ description: '', amount: 1800, type: 'income', category: 'income' }))
  })

  it('sem valor avisa; na edição o título, a data e "Salvar alterações" continuam', () => {
    const { unmount } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(screen.getByText('Insira um valor válido.')).toBeInTheDocument()
    unmount()
    setup({ editingId: 'x', initialData: { type: 'expense', description: 'Academia', amount: 200, category: 'fixed', date: '2026-10-20T15:00:00.000Z' } })
    expect(screen.getByRole('heading', { name: 'Editar transação' })).toBeInTheDocument()
    expect(screen.getByLabelText('Data')).toHaveValue('2026-10-20')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument()
  })
})

describe('Nova transação — celular continua com Saída / Entrada', () => {
  it('abaixo de 901px: sem .ntx-d, rótulos Saída/Entrada e o exemplo na descrição', () => {
    setDesktop(false)
    setup()
    expect(document.querySelector('.ntx-overlay')).not.toHaveClass('ntx-d')
    expect(screen.getByRole('button', { name: 'Saída' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrada' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Descrição (ex.: Mercado)')).toBeInTheDocument()
  })
})
