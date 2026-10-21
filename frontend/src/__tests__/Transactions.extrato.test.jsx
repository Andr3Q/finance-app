import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Transactions from '../pages/Transactions.jsx'

vi.mock('../services/api.js', () => ({
  transactionsAPI: { list: vi.fn(), remove: vi.fn(), importCSV: vi.fn(), monthlyRecap: vi.fn() },
  installmentsAPI: { list: vi.fn(), create: vi.fn(), pay: vi.fn(), unpay: vi.fn(), remove: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
// O formulário de transação tem testes próprios — aqui só interessa quando e com o quê ele abre.
vi.mock('../components/features/TransactionForm.jsx', () => ({
  default: ({ initialData, editingId }) => (
    <div role="dialog" aria-label="formulário">{editingId ? `editando ${initialData.description}` : 'nova transação'}</div>
  ),
}))

import { transactionsAPI, installmentsAPI } from '../services/api.js'

const now  = new Date()
const MONTHS_PT = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
// Outro dia do MESMO mês (nunca hoje), pra o teste não atravessar a virada de mês.
const otherDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() === 1 ? 2 : 1, 12)

const tx = (over = {}) => ({
  id: 'tx-1', description: 'Almoço', amount: 100, type: 'expense', category: 'food',
  date: now.toISOString(), month: now.getMonth() + 1, year: now.getFullYear(), archived: false, ...over,
})

const txs = [
  tx({ id: 'a', description: 'Academia', amount: 200, category: 'fixed' }),
  tx({ id: 'b', description: 'Roupa', amount: 350, category: 'shopping' }),
  tx({ id: 'c', description: 'Dividendos', amount: 1800, type: 'income', category: 'income', date: otherDay.toISOString() }),
]
const recap = { hasData: true, saved: 9500, totalIncome: 10800, totalExpenses: 7300 }

function setup({ list = txs, recapRes = recap } = {}) {
  transactionsAPI.list.mockResolvedValue({ data: { data: list } })
  installmentsAPI.list.mockResolvedValue({ data: [] })
  if (recapRes instanceof Error) transactionsAPI.monthlyRecap.mockRejectedValue(recapRes)
  else transactionsAPI.monthlyRecap.mockResolvedValue({ data: recapRes })
  return render(
    <MemoryRouter initialEntries={['/transactions']}>
      <Routes>
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/financas" element={<div>Página Finanças</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear()
})

describe('Extrato — cartão do resultado do mês', () => {
  it('mostra o resultado e as entradas/saídas do mês (mesmo cálculo da story "Você guardou")', async () => {
    setup()
    expect(await screen.findByText(`Resultado de ${MONTHS_PT[now.getMonth()]}`)).toBeInTheDocument()
    expect(await screen.findByText('+R$ 9.500,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 10.800,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 7.300,00')).toBeInTheDocument()
    expect(transactionsAPI.monthlyRecap).toHaveBeenCalledWith(0)
  })

  it('resultado negativo aparece com sinal de menos e estilo de alerta', async () => {
    setup({ recapRes: { hasData: true, saved: -300, totalIncome: 0, totalExpenses: 300 } })
    const val = await screen.findByText('−R$ 300,00')
    expect(val).toHaveClass('neg')
  })

  it('sem o cálculo do servidor mostra "—" no resultado e usa as transações nas entradas/saídas', async () => {
    setup({ recapRes: new Error('fora do ar') })
    await screen.findByText('Academia')
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('R$ 1.800,00')).toBeInTheDocument() // entradas calculadas das transações
    expect(screen.getByText('R$ 550,00')).toBeInTheDocument()   // saídas: 200 + 350
  })

  it('mês sem lançamentos não inventa resultado ("—")', async () => {
    setup({ list: [], recapRes: { hasData: false, saved: 3500, totalIncome: 0, totalExpenses: 0 } })
    await screen.findByText(/nenhuma transação encontrada/i)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.queryByText('+R$ 3.500,00')).not.toBeInTheDocument()
  })

  it('voltar um mês pede o resultado daquele mês (offset -1) e o próximo mês fica desabilitado no mês atual', async () => {
    setup()
    await screen.findByText('Academia')
    expect(screen.getByLabelText('Próximo mês')).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Mês anterior'))
    await waitFor(() => expect(transactionsAPI.monthlyRecap).toHaveBeenCalledWith(-1))
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const yearSuffix = prev.getFullYear() !== now.getFullYear() ? ` de ${prev.getFullYear()}` : ''
    expect(await screen.findByText(`Resultado de ${MONTHS_PT[prev.getMonth()]}${yearSuffix}`)).toBeInTheDocument()
    expect(screen.getByLabelText('Próximo mês')).toBeEnabled()
  })
})

describe('Extrato — lista por dia', () => {
  it('um cartão por dia: hoje leva "HOJE ·" e cada cabeçalho mostra o líquido do dia', async () => {
    setup()
    const today = await screen.findByText(/^HOJE · [A-ZÁ]{3}, \d{2} [A-Z]{3}$/)
    expect(within(today.parentElement).getByText('−R$ 550,00')).toBeInTheDocument()   // 200 + 350 em saídas
    const other = screen.getByText(/^(?!HOJE)[A-ZÁ]{3}, \d{2} [A-Z]{3}$/)
    expect(within(other.parentElement).getByText('+R$ 1.800,00')).toBeInTheDocument() // só uma entrada
  })

  it('cada linha mostra descrição, categoria e valor com sinal; contas fixas aparecem na lista', async () => {
    setup()
    expect(await screen.findByText('Academia')).toBeInTheDocument()
    expect(screen.getByText('Conta Fixa')).toBeInTheDocument()
    expect(screen.getByText('−R$ 200,00')).toBeInTheDocument()
    expect(screen.getByText('+R$ 1.800,00', { selector: '.ex-row-val' })).toBeInTheDocument()
  })

  it('filtros: Entradas e Saídas separam pelo tipo (Saídas inclui contas fixas)', async () => {
    setup()
    await screen.findByText('Academia')
    await userEvent.click(screen.getByRole('button', { name: /^entradas$/i }))
    expect(screen.getByText('Dividendos')).toBeInTheDocument()
    expect(screen.queryByText('Academia')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^saídas$/i }))
    expect(screen.getByText('Academia')).toBeInTheDocument()
    expect(screen.getByText('Roupa')).toBeInTheDocument()
    expect(screen.queryByText('Dividendos')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^todas$/i }))
    expect(screen.getByText('Dividendos')).toBeInTheDocument()
  })

  it('busca filtra por descrição e o × limpa', async () => {
    setup()
    await screen.findByText('Academia')
    await userEvent.type(screen.getByPlaceholderText('Buscar no extrato'), 'roup')
    expect(screen.getByText('Roupa')).toBeInTheDocument()
    expect(screen.queryByText('Academia')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Limpar busca'))
    expect(screen.getByText('Academia')).toBeInTheDocument()
  })

  it('tocar na linha abre a edição daquela transação', async () => {
    setup()
    await userEvent.click(await screen.findByText('Roupa'))
    expect(screen.getByRole('dialog', { name: 'formulário' })).toHaveTextContent('editando Roupa')
  })

  it('× abre a confirmação, e só "Sim, excluir" remove (cancelar não remove)', async () => {
    transactionsAPI.remove.mockResolvedValue({})
    setup()
    await screen.findByText('Roupa')
    const row = screen.getByText('Roupa').closest('.ex-row')
    await userEvent.click(within(row).getByLabelText('Remover transação'))
    expect(screen.getByText('Remover transação', { selector: 'span' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(transactionsAPI.remove).not.toHaveBeenCalled()

    await userEvent.click(within(row).getByLabelText('Remover transação'))
    await userEvent.click(screen.getByRole('button', { name: /sim, excluir/i }))
    await waitFor(() => expect(transactionsAPI.remove).toHaveBeenCalledWith('b'))
  })
})

describe('Extrato — atalhos do cabeçalho', () => {
  it('"Contas do mês" leva para onde as contas fixas são gerenciadas hoje (/financas)', async () => {
    setup()
    await userEvent.click(await screen.findByRole('button', { name: /contas do mês/i }))
    expect(await screen.findByText('Página Finanças')).toBeInTheDocument()
  })

  it('"Parcelados" abre e fecha a seção de compras parceladas (recolhida por padrão)', async () => {
    setup()
    const chip = await screen.findByRole('button', { name: /^parcelados$/i })
    expect(screen.queryByText(/compras parceladas/i)).not.toBeInTheDocument()
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(await screen.findByText(/compras parceladas/i)).toBeInTheDocument()
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip)
    expect(screen.queryByText(/compras parceladas/i)).not.toBeInTheDocument()
  })
})

describe('Extrato — privacidade e plano', () => {
  it('com "ocultar valores" ligado (preferência do Início), nenhum valor em reais aparece', async () => {
    localStorage.setItem('hide-balance', '1')
    setup()
    await screen.findByText('Academia')
    expect(screen.queryByText('+R$ 9.500,00')).not.toBeInTheDocument()
    expect(screen.queryByText('−R$ 200,00')).not.toBeInTheDocument()
    expect(screen.queryByText(/R\$ \d/)).not.toBeInTheDocument()
    expect(screen.getAllByText('R$ ••••').length).toBeGreaterThanOrEqual(5)
  })

  it('o banner de limite do plano só aparece perto do limite (80%+)', async () => {
    sessionStorage.setItem('user', JSON.stringify({ plan: 'free' }))
    const many = Array.from({ length: 16 }, (_, i) => tx({ id: `m${i}`, description: `Item ${i}` }))
    const { unmount } = setup({ list: many })
    expect(await screen.findByText(/16 de 20 transações este mês/i)).toBeInTheDocument()
    unmount()

    setup({ list: many.slice(0, 3) })
    await screen.findByText('Item 0')
    expect(screen.queryByText(/de 20 transações/i)).not.toBeInTheDocument()
  })
})
