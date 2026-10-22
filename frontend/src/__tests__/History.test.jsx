import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import History from '../pages/History.jsx'

vi.mock('../services/api.js', () => ({
  transactionsAPI: { monthlyHistory: vi.fn() },
  agentAPI:        { monthlyReport: vi.fn() },
}))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))

import { transactionsAPI, agentAPI } from '../services/api.js'

const m = (month, saved, over = {}) => ({ month, year: 2026, saved, income: saved, expenses: 0, active: true, ...over })
const SIX = [m(5, 5200), m(6, 6100), m(7, 4800), m(8, 6900), m(9, 7200), m(10, 9500)]

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function renderPage({ plan = 'pro', data = SIX, entries = ['/historico'], index } = {}) {
  const user = { id: 'u1', plan }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  if (data instanceof Error) transactionsAPI.monthlyHistory.mockRejectedValue(data)
  else transactionsAPI.monthlyHistory.mockResolvedValue({ data })
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Where />
      <Routes>
        <Route path="/historico" element={<History />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear() })

describe('Histórico', () => {
  it('um item por mês com o resultado abreviado, e o mês atual (último) em destaque', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Histórico' })).toBeInTheDocument()
    expect(screen.getByText('Últimos 6 meses')).toBeInTheDocument()
    expect(screen.getByText('Resultado por mês')).toBeInTheDocument()
    const cols = await screen.findAllByRole('listitem')
    expect(cols.map(c => c.textContent)).toEqual(['5.2kMai', '6.1kJun', '4.8kJul', '6.9kAgo', '7.2kSet', '9.5kOut'])
    expect(cols.map(c => c.querySelector('.hs-bar').classList.contains('cur'))).toEqual([false, false, false, false, false, true])
    expect(transactionsAPI.monthlyHistory).toHaveBeenCalledWith(6)
  })

  it('a altura das barras é proporcional ao resultado', async () => {
    renderPage()
    const bars = (await screen.findAllByRole('listitem')).map(c => parseInt(c.querySelector('.hs-bar').style.height))
    expect(bars.at(-1)).toBe(136)                       // o maior ocupa a altura toda
    expect(bars[0]).toBe(Math.round((5200 / 9500) * 136))
  })

  it('frase de destaque do mês atual', async () => {
    renderPage()
    expect(await screen.findByText('Seu melhor mês do ano')).toBeInTheDocument()
    expect(screen.getByText(/superou a média dos meses anteriores em 57%/)).toBeInTheDocument()
  })

  it('mês sem movimento aparece vazio ("–") e resultado negativo ganha barra vermelha', async () => {
    renderPage({ data: [m(8, 5000, { active: false }), m(9, -1200), m(10, 4000)] })
    const cols = await screen.findAllByRole('listitem')
    expect(cols[0].textContent).toBe('–Ago')
    expect(cols[0].querySelector('.hs-bar')).toHaveClass('off')
    expect(cols[1].textContent).toBe('-1.2kSet')
    expect(cols[1].querySelector('.hs-bar')).toHaveClass('neg')
  })

  it('sem nenhum lançamento: mensagem de vazio', async () => {
    renderPage({ data: [m(10, 0, { active: false })] })
    expect(await screen.findByText('Sem dados de histórico ainda')).toBeInTheDocument()
  })

  it('plano gratuito vê o convite do Pro e nada é buscado', async () => {
    renderPage({ plan: 'free' })
    expect(await screen.findByText('Recurso Pro')).toBeInTheDocument()
    expect(transactionsAPI.monthlyHistory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planos')
  })

  it('falha ao carregar: mensagem e "Tentar de novo"', async () => {
    renderPage({ data: new Error('offline') })
    expect(await screen.findByText('Não foi possível carregar')).toBeInTheDocument()
    transactionsAPI.monthlyHistory.mockResolvedValue({ data: SIX })
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Resultado por mês')).toBeInTheDocument()
  })

  it('relatório mensal da IA: só Elite, gera e mostra o texto', async () => {
    agentAPI.monthlyReport.mockResolvedValue({ data: { report: 'Outubro foi ótimo.' } })
    const pro = renderPage({ plan: 'pro' })
    await screen.findByText('Resultado por mês')
    expect(screen.queryByText('Relatório mensal da Nancy')).not.toBeInTheDocument()
    pro.unmount()

    renderPage({ plan: 'elite' })
    fireEvent.click(await screen.findByRole('button', { name: 'Gerar relatório' }))
    await waitFor(() => expect(agentAPI.monthlyReport).toHaveBeenCalledWith(new Date().getMonth() + 1, new Date().getFullYear()))
    expect(await screen.findByText('Outubro foi ótimo.')).toBeInTheDocument()
  })

  it('voltar retorna à tela anterior; aberto direto pela URL vai pras Metas', async () => {
    const first = renderPage({ entries: ['/goals', '/historico'], index: 1 })
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/goals')
    first.unmount()
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/goals')
  })
})
