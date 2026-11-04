import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import History from '../pages/History.jsx'

vi.mock('../services/api.js', () => ({ transactionsAPI: { monthlyHistory: vi.fn() }, agentAPI: { monthlyReport: vi.fn() } }))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { transactionsAPI, agentAPI } from '../services/api.js'

const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
const m = (month, saved, over = {}) => ({ month, year: 2026, saved, income: saved, expenses: 0, active: true, ...over })
const SIX = [m(5, 5200), m(6, 6100), m(7, 4800), m(8, 6900), m(9, 7200), m(10, 9500)]
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
function setup({ plan = 'elite', data = SIX } = {}) {
  const user = { id: 'u-hist', plan }
  sessionStorage.setItem('user', JSON.stringify(user))
  window.dispatchEvent(new CustomEvent('user-updated', { detail: user }))
  if (data instanceof Error) transactionsAPI.monthlyHistory.mockRejectedValue(data)
  else transactionsAPI.monthlyHistory.mockResolvedValue({ data })
  return render(<MemoryRouter initialEntries={['/historico']}><Where /><Routes><Route path="/historico" element={<History />} /><Route path="*" element={<div>outra tela</div>} /></Routes></MemoryRouter>)
}
const cols = () => [...document.querySelectorAll('.nhs-col')]

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); setDesktop(true) })
afterEach(() => { delete window.matchMedia })

describe('Histórico no desktop (design "Nancy Desktop", tela 21)', () => {
  it('abas de Metas (Histórico acesa) e "Resultado por mês" com uma barra por mês e o mês atual em verde', async () => {
    setup()
    await screen.findByText('Resultado por mês')
    const tabs = within(screen.getByRole('navigation', { name: 'Seções de metas' })).getAllByRole('button')
    expect(tabs[1]).toHaveTextContent('Histórico')
    expect(cols().map(c => c.querySelector('.nhs-mon').textContent)).toEqual(['Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out'])
    expect(cols().map(c => c.querySelector('.nhs-val').textContent)).toEqual(['5,2k', '6,1k', '4,8k', '6,9k', '7,2k', '9,5k'])
    expect(cols()[5].querySelector('.nhs-bar')).toHaveClass('cur')
    expect(cols()[0].querySelector('.nhs-bar')).not.toHaveClass('cur')
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('altura proporcional: a maior barra mede 230px e as outras a sua parte', async () => {
    setup()
    await screen.findByText('Resultado por mês')
    const h = cols().map(c => c.querySelector('.nhs-bar').style.height)
    expect(h[5]).toBe('230px')
    expect(h[0]).toBe('126px') // 5,2k de 9,5k
  })

  it('mês negativo fica vermelho e mês sem movimento fica apagado com "–"', async () => {
    setup({ data: [m(5, -1200), m(6, 0, { active: false }), m(7, 3000), m(8, 4000), m(9, 5000), m(10, 6000)] })
    await screen.findByText('Resultado por mês')
    expect(cols()[0].querySelector('.nhs-bar')).toHaveClass('neg')
    expect(cols()[1].querySelector('.nhs-bar')).toHaveClass('off')
    expect(cols()[1].querySelector('.nhs-val')).toHaveTextContent('–')
  })

  it('frase sobre o mês atual continua (abaixo do gráfico)', async () => {
    setup()
    await screen.findByText('Resultado por mês')
    expect(document.querySelector('.nhs-insight h2').textContent.length).toBeGreaterThan(0)
  })

  it('relatório da IA (Elite): escolhe mês e ano e gera', async () => {
    agentAPI.monthlyReport.mockResolvedValue({ data: { report: 'Seu mês foi bom.' } })
    setup()
    await screen.findByText('Relatório mensal da Nancy')
    fireEvent.change(screen.getByLabelText('Mês do relatório'), { target: { value: '9' } })
    await userEvent.click(screen.getByRole('button', { name: 'Gerar relatório' }))
    await waitFor(() => expect(agentAPI.monthlyReport).toHaveBeenCalledWith(9, new Date().getFullYear()))
    expect(await screen.findByText('Seu mês foi bom.')).toBeInTheDocument()
  })

  it('plano Pro vê o gráfico sem o relatório; plano gratuito vê o convite e vai aos planos', async () => {
    const { unmount } = setup({ plan: 'pro' })
    await screen.findByText('Resultado por mês')
    expect(screen.queryByText('Relatório mensal da Nancy')).not.toBeInTheDocument()
    unmount()
    setup({ plan: 'free' })
    expect(await screen.findByRole('heading', { name: 'Recurso Pro' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver planos' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planos')
  })

  it('falha: "Tentar de novo"; sem dados: aviso', async () => {
    const { unmount } = setup({ data: new Error('rede') })
    const retry = await screen.findByRole('button', { name: 'Tentar de novo' })
    transactionsAPI.monthlyHistory.mockResolvedValue({ data: SIX })
    await userEvent.click(retry)
    expect(await screen.findByText('Resultado por mês')).toBeInTheDocument()
    unmount()
    setup({ data: SIX.map(x => ({ ...x, active: false })) })
    expect(await screen.findByText('Sem dados de histórico ainda')).toBeInTheDocument()
  })
})

describe('Histórico — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul e gráfico do celular', async () => {
    setDesktop(false)
    setup()
    expect(await screen.findByRole('heading', { name: 'Histórico' })).toBeInTheDocument()
    expect(document.querySelector('.hs-chart')).not.toBeNull()
    expect(document.querySelector('.nhs-chart')).toBeNull()
  })
})
