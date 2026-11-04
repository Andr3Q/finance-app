import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'
import BillsMonth from '../pages/BillsMonth.jsx'

vi.mock('../services/api.js', () => ({ budgetAPI: { list: vi.fn(), pay: vi.fn() } }))
vi.mock('../services/cache.js', () => ({ getCache: vi.fn(() => null), setCache: vi.fn(), invalidateCache: vi.fn() }))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { budgetAPI } from '../services/api.js'

const bill = (over = {}) => ({ id: 'b1', name: 'Aluguel', amount: 3500, dueDay: 5, paidThisMonth: false, paidDate: null, ...over })
const SIX = [
  bill({ id: 'a', name: 'Celular', amount: 47, dueDay: 25 }),
  bill({ id: 'b', name: 'Aluguel', amount: 3500, dueDay: 5, paidThisMonth: true, paidDate: '2026-10-05T12:00:00Z' }),
  bill({ id: 'c', name: 'Academia', amount: 200, dueDay: 20 }),
  bill({ id: 'd', name: 'Internet', amount: 150, dueDay: 15, paidThisMonth: true }),
  bill({ id: 'e', name: 'Boleto', amount: 90, dueDay: null }),
]
function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}</div> }
const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function renderPage(bills = SIX) {
  budgetAPI.list.mockResolvedValue({ data: bills })
  return render(
    <MemoryRouter initialEntries={['/contas-do-mes']}>
      <Where />
      <Routes>
        <Route path="/contas-do-mes" element={<BillsMonth />} />
        <Route path="*" element={<div>outra tela</div>} />
      </Routes>
    </MemoryRouter>
  )
}
const rows = () => [...document.querySelectorAll('.ndb-item')]

beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 21, 12) })
  setDesktop(true)
})
afterEach(() => { vi.useRealTimers(); delete window.matchMedia })

describe('Contas do mês no desktop (design "Nancy Desktop", tela 16)', () => {
  it('abas do Extrato (Contas do mês acesa) e os três números: Pagas, Total do mês e Status', async () => {
    renderPage()
    await screen.findByText('Aluguel')
    const tabs = within(screen.getByRole('navigation', { name: 'Seções do extrato' })).getAllByRole('button')
    expect(tabs.map(t => t.textContent)).toEqual(['Extrato', 'Contas do mês', 'Parceladas', 'Análise'])
    expect(tabs[1]).toHaveClass('on')
    const stats = [...document.querySelectorAll('.ndb-stat')]
    expect(stats[0]).toHaveTextContent('Pagas2/5')
    expect(stats[0]).toHaveClass('ndb-stat--blue')
    expect(stats[1]).toHaveTextContent('Total do mêsR$ 3.987,00')
    expect(stats[2]).toHaveTextContent('Status3 pendentes')
  })

  it('uma linha por conta, por vencimento (sem dia por último), com círculo, valor e etiqueta Paga/Pendente', async () => {
    renderPage()
    await screen.findByText('Aluguel')
    expect(rows().map(r => r.querySelector('.ndb-name').textContent)).toEqual(['Aluguel', 'Internet', 'Academia', 'Celular', 'Boleto'])
    expect(rows()[0].querySelector('.ndb-due')).toHaveTextContent('Vence dia 5')
    expect(rows()[0].querySelector('.ndb-amt')).toHaveTextContent('R$ 3.500,00')
    expect(rows()[0].querySelector('.ndb-pill')).toHaveTextContent('Paga')
    expect(rows()[0].querySelector('.ndb-check')).toHaveClass('on')
    expect(rows()[0].querySelector('.ndb-check svg')).not.toBeNull()
    expect(rows()[2].querySelector('.ndb-pill')).toHaveTextContent('Pendente')
    expect(rows()[2].querySelector('.ndb-check')).not.toHaveClass('on')
    expect(rows()[4].querySelector('.ndb-due')).toHaveTextContent('Sem dia de vencimento')
  })

  it('tudo pago: o status vira "Tudo pago" e some a dica', async () => {
    renderPage(SIX.map(b => ({ ...b, paidThisMonth: true })))
    await screen.findByText('Aluguel')
    expect(document.querySelectorAll('.ndb-stat')[2]).toHaveTextContent('Tudo pago')
    expect(screen.queryByText('Toque numa conta para marcar como paga.')).not.toBeInTheDocument()
  })

  it('tocar numa pendente pede confirmação e só então paga; tocar numa paga só avisa (não há "desmarcar")', async () => {
    vi.useRealTimers()
    budgetAPI.pay.mockResolvedValue({})
    renderPage()
    await screen.findByText('Academia')
    await userEvent.click(within(rows()[0]).getByRole('button'))
    expect(await screen.findByText(/Aluguel já está paga/)).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Marcar como paga' })).not.toBeInTheDocument()
    await userEvent.click(within(rows()[2]).getByRole('button'))
    expect(await screen.findByRole('dialog', { name: 'Marcar como paga' })).toBeInTheDocument()
    expect(budgetAPI.pay).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Marcar como paga' }))
    await waitFor(() => expect(budgetAPI.pay).toHaveBeenCalledWith('c'))
  })

  it('sem contas: convida a cadastrar e leva às Finanças', async () => {
    vi.useRealTimers()
    renderPage([])
    expect(await screen.findByRole('heading', { name: 'Nenhuma conta fixa cadastrada' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar contas' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/financas')
  })

  it('"ocultar valores" esconde os reais', async () => {
    localStorage.setItem('hide-balance', '1')
    renderPage()
    await screen.findByText('Aluguel')
    expect(document.body.textContent).not.toMatch(/3\.500|3\.987/)
    expect(rows()[0].querySelector('.ndb-amt')).toHaveTextContent('R$ ••••')
  })
})

describe('Contas do mês — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul e lista do celular', async () => {
    setDesktop(false)
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Contas do mês' })).toBeInTheDocument()
    expect(document.querySelector('.cm-list')).not.toBeNull()
    expect(document.querySelector('.ndb-card')).toBeNull()
  })
})
