import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import Analysis from '../pages/Analysis.jsx'

vi.mock('../services/api.js', () => ({ transactionsAPI: { dashboard: vi.fn() } }))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { transactionsAPI } from '../services/api.js'

const e = (category, amount) => ({ type: 'expense', category, amount })
const PAYLOAD = {
  summary: { salary: 5000, totalIncome: 1500 },
  transactions: [e('fixed', 5080), e('food', 1165), e('transport', 575), e('shopping', 350), e('health', 130)],
}

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage({ data = PAYLOAD, entries = ['/analise'], index } = {}) {
  if (data instanceof Error) transactionsAPI.dashboard.mockRejectedValue(data)
  else transactionsAPI.dashboard.mockResolvedValue({ data })
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/analise" element={<Analysis />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear() })

describe('Análise do mês', () => {
  it('cartão do maior gasto variável e lista por categoria, do maior pro menor, com % da renda', async () => {
    renderPage()
    const top = await screen.findByLabelText('Maior gasto variável')
    expect(within(top).getByText('Alimentação')).toBeInTheDocument()
    expect(within(top).getByText('R$ 1.165,00')).toBeInTheDocument()
    expect(within(top).getByText('52% do total')).toBeInTheDocument()

    const rows = screen.getAllByRole('listitem')
    expect(rows.map(r => within(r).getByText(/^(Contas fixas|Alimentação|Transporte|Shopping|Saúde)$/).textContent)).toEqual(['Contas fixas', 'Alimentação', 'Transporte', 'Shopping', 'Saúde'])
    expect(within(rows[0]).getByText('R$ 5.080,00')).toBeInTheDocument()
    expect(rows.map(r => within(r).getByTitle('% da renda do mês').textContent)).toEqual(['78%', '18%', '9%', '5%', '2%'])
  })

  it('o convite pra Nancy abre o chat já com a pergunta de quanto cortar', async () => {
    const heard = vi.fn()
    window.addEventListener('nancy:open-agent-chat', heard)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /quer que a nancy sugira onde cortar r\$ 350 este mês\?/i }))
    window.removeEventListener('nancy:open-agent-chat', heard)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard.mock.calls[0][0].detail.message).toBe('Onde posso cortar R$ 350 dos meus gastos este mês?')
  })

  it('sem gasto variável (só contas fixas): sem cartão do topo e o convite fica genérico', async () => {
    renderPage({ data: { summary: { salary: 5000, totalIncome: 0 }, transactions: [e('fixed', 3000)] } })
    expect(await screen.findByText('Gastos por categoria')).toBeInTheDocument()
    expect(screen.queryByLabelText('Maior gasto variável')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /quer que a nancy analise seus gastos deste mês\?/i })).toBeInTheDocument()
  })

  it('sem nenhuma saída no mês: mensagem de vazio', async () => {
    renderPage({ data: { summary: {}, transactions: [] } })
    expect(await screen.findByText('Nenhum gasto este mês ainda')).toBeInTheDocument()
  })

  it('ocultar valores esconde os R$ (percentuais continuam)', async () => {
    localStorage.setItem('hide-balance', '1')
    renderPage()
    await screen.findByText('Gastos por categoria')
    expect(screen.queryByText(/R\$ \d/)).not.toBeInTheDocument()
    expect(screen.getAllByText('R$ ••••').length).toBeGreaterThan(5)
    expect(screen.getByText('78%')).toBeInTheDocument()
  })

  it('falha ao carregar (sem cache): mensagem e "Tentar de novo" que refaz a busca', async () => {
    renderPage({ data: new Error('offline') })
    expect(await screen.findByText('Não foi possível carregar')).toBeInTheDocument()
    transactionsAPI.dashboard.mockResolvedValue({ data: PAYLOAD })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Gastos por categoria')).toBeInTheDocument()
    await waitFor(() => expect(transactionsAPI.dashboard).toHaveBeenCalledTimes(2))
  })

  it('voltar retorna à tela anterior; aberta direto pela URL vai pro Extrato', async () => {
    const first = renderPage({ entries: ['/dashboard', '/analise'], index: 1 })
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard')
    first.unmount()
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/transactions')
  })
})
