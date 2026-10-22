import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import NewTransactionSheet from '../components/features/NewTransactionSheet.jsx'

vi.mock('../services/api.js', () => ({ transactionsAPI: { create: vi.fn(), update: vi.fn() } }))
const mockInvalidate = vi.fn()
vi.mock('../services/cache.js', () => ({ invalidateCache: (...a) => mockInvalidate(...a), getCache: vi.fn(), setCache: vi.fn() }))

import { transactionsAPI } from '../services/api.js'

const openSheet = (detail) => act(() => { window.dispatchEvent(new CustomEvent('nancy:new-transaction', { detail })) })

beforeEach(() => { vi.clearAllMocks() })

describe('NewTransactionSheet — folha aberta pelo menu do "+"', () => {
  it('fica fechada até o evento chegar', () => {
    render(<NewTransactionSheet />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Despesa (ou o evento sem detalhe) abre em Saída', async () => {
    render(<NewTransactionSheet />)
    openSheet({ type: 'expense' })
    expect(await screen.findByRole('dialog', { name: 'Nova transação' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Saída' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('Receita abre em Entrada', async () => {
    render(<NewTransactionSheet />)
    openSheet({ type: 'income' })
    await screen.findByRole('dialog')
    expect(screen.getByRole('button', { name: 'Entrada' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('valor inesperado no evento cai em Saída (nunca abre num tipo inválido)', async () => {
    render(<NewTransactionSheet />)
    openSheet({ type: 'qualquer-coisa' })
    await screen.findByRole('dialog')
    expect(screen.getByRole('button', { name: 'Saída' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a mesma folha reabre no tipo certo a cada pedido', async () => {
    render(<NewTransactionSheet />)
    openSheet({ type: 'income' })
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    openSheet({ type: 'expense' })
    await screen.findByRole('dialog')
    expect(screen.getByRole('button', { name: 'Saída' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('ao salvar: fecha, invalida o cache do Início e avisa as telas ("budget-updated") pra se recarregarem', async () => {
    transactionsAPI.create.mockResolvedValue({ data: {} })
    const updated = vi.fn()
    window.addEventListener('budget-updated', updated)
    try {
      render(<NewTransactionSheet />)
      openSheet({ type: 'expense' })
      await screen.findByRole('dialog')
      const amt = screen.getByPlaceholderText('0,00')
      fireEvent.change(amt, { target: { value: '30' } })
      fireEvent.blur(amt)
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))

      await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(mockInvalidate).toHaveBeenCalledWith('dashboard')
      expect(updated).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('budget-updated', updated)
    }
  })

  it('remove o ouvinte ao desmontar (não abre folha depois de a tela sair)', () => {
    const { unmount } = render(<NewTransactionSheet />)
    unmount()
    openSheet({ type: 'expense' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
