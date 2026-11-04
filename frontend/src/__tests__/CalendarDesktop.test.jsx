import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Calendar from '../pages/Calendar.jsx'

vi.mock('../services/api.js', () => ({
  transactionsAPI: { list: vi.fn() }, budgetAPI: { list: vi.fn() }, goalsAPI: { list: vi.fn() }, installmentsAPI: { list: vi.fn() },
}))
vi.mock('../components/layout/Navbar.jsx', () => ({ default: () => null }))
import { transactionsAPI, budgetAPI, goalsAPI, installmentsAPI } from '../services/api.js'

const NOW = new Date(2026, 9, 20, 12) // 20/out/2026, terça
const tx = (id, day, type, category, description, amount) => ({ id, type, category, description, amount, date: new Date(2026, 9, day, 12).toISOString() })
const setDesktop = (is) => { window.matchMedia = vi.fn(() => ({ matches: is, addEventListener() {}, removeEventListener() {} })) }
function setup({ txs = [], budgets = [], goals = [], installments = [] } = {}) {
  transactionsAPI.list.mockResolvedValue({ data: { data: txs } })
  budgetAPI.list.mockResolvedValue({ data: budgets })
  goalsAPI.list.mockResolvedValue({ data: goals })
  installmentsAPI.list.mockResolvedValue({ data: installments })
  return render(<MemoryRouter initialEntries={['/calendar']}><Routes><Route path="/calendar" element={<Calendar />} /></Routes></MemoryRouter>)
}
const day = (n) => screen.getByRole('button', { name: new RegExp(`^${n} de outubro`) })
const TXS = [
  tx('1', 5, 'income', 'income', 'Salário', 15000), tx('2', 5, 'expense', 'fixed', 'Aluguel', 3500),
  tx('3', 20, 'expense', 'food', 'Mercado', 240), tx('4', 20, 'expense', 'fixed', 'Academia', 200), tx('5', 20, 'expense', 'transport', 'Uber', 40),
]

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.useFakeTimers({ toFake: ['Date'], now: NOW }); setDesktop(true) })
afterEach(() => { vi.useRealTimers(); delete window.matchMedia })

describe('Calendário no desktop (design "Nancy Desktop", tela 19)', () => {
  it('título do mês, legenda, dias da semana (segunda primeiro) e outubro/2026 começando na quinta', async () => {
    setup({ txs: TXS })
    expect(await screen.findByRole('heading', { name: 'Outubro 2026' })).toBeInTheDocument()
    expect(document.querySelector('.ndc-legend')).toHaveTextContent('EntradaSaída')
    expect([...document.querySelectorAll('.ndc-dow')].map(d => d.textContent)).toEqual(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'])
    const cells = [...document.querySelectorAll('.ndc-grid > .ndc-cell')]
    expect(cells.slice(0, 3).every(c => c.classList.contains('empty'))).toBe(true) // seg, ter, qua vazias
    expect(cells[3].textContent).toBe('1')
    expect(document.querySelector('.fin-hero')).toBeNull()
  })

  it('cada dia mostra até duas etiquetas coloridas: entrada verde, saída azul, conta a vencer cinza', async () => {
    setup({ txs: TXS, budgets: [{ id: 'b', name: 'Celular', amount: 47, dueDay: 25, paidThisMonth: false }] })
    await screen.findByRole('heading', { name: 'Outubro 2026' })
    const d5 = day(5)
    expect([...d5.querySelectorAll('.ndc-chip')].map(c => [c.textContent, c.className.replace('ndc-chip ', '')])).toEqual([['Salário', 'in'], ['Aluguel', 'out']])
    expect(day(20).querySelectorAll('.ndc-chip')).toHaveLength(2) // três lançamentos: só as duas primeiras cabem
    expect(day(25).querySelector('.ndc-chip')).toHaveTextContent('Celular')
    expect(day(25).querySelector('.ndc-chip')).toHaveClass('due')
  })

  it('hoje já vem escolhido e o painel lista os lançamentos do dia com sinal e valor', async () => {
    setup({ txs: TXS })
    await screen.findByRole('heading', { name: 'Outubro 2026' })
    expect(day(20)).toHaveAttribute('aria-pressed', 'true')
    expect(day(20)).toHaveClass('today', 'sel')
    expect(screen.getByRole('heading', { name: '20 de outubro · hoje' })).toBeInTheDocument()
    const evs = [...document.querySelectorAll('.ndc-ev')]
    expect(evs.map(e => e.querySelector('.ndc-ev-name').textContent)).toEqual(['Mercado', 'Academia', 'Uber'])
    expect(evs[0].querySelector('.ndc-ev-sub')).toHaveTextContent('Alimentação')
    expect(evs[0].querySelector('.ndc-ev-amt')).toHaveTextContent('− R$ 240,00')
  })

  it('escolher outro dia troca o painel (entrada com +, verde); tocar de novo desmarca', async () => {
    setup({ txs: TXS })
    await screen.findByRole('heading', { name: 'Outubro 2026' })
    fireEvent.click(day(5))
    expect(screen.getByRole('heading', { name: '5 de outubro' })).toBeInTheDocument()
    const sal = [...document.querySelectorAll('.ndc-ev')].find(e => e.textContent.includes('Salário'))
    expect(sal.querySelector('.ndc-ev-amt')).toHaveTextContent('+ R$ 15.000,00')
    expect(sal.querySelector('.ndc-ev-amt')).toHaveClass('in')
    fireEvent.click(day(5))
    expect(screen.getByText('Clique em um dia para ver os lançamentos.')).toBeInTheDocument()
  })

  it('dia sem nada: "Nenhum lançamento neste dia."; vencimento, parcela e meta aparecem com o rótulo certo', async () => {
    setup({
      budgets: [{ id: 'b', name: 'Celular', amount: 47, dueDay: 25, paidThisMonth: false }],
      goals: [{ id: 'g', title: 'Viagem', targetAmount: 8000, deadline: new Date(2026, 9, 30, 12).toISOString() }],
      installments: [{ id: 'i', name: 'Notebook', amount: 600, totalInstallments: 10, paidInstallments: 1, startMonth: 9, startYear: 2026 }],
    })
    await screen.findByRole('heading', { name: 'Outubro 2026' })
    fireEvent.click(day(21))
    expect(screen.getByText('Nenhum lançamento neste dia.')).toBeInTheDocument()
    fireEvent.click(day(25))
    expect(document.querySelector('.ndc-ev-sub')).toHaveTextContent('Vencimento')
    fireEvent.click(day(1))
    expect(document.querySelector('.ndc-ev-sub')).toHaveTextContent('Parcela 2/10')
    fireEvent.click(day(30))
    expect(document.querySelector('.ndc-ev-sub')).toHaveTextContent('Prazo da meta')
    expect(document.querySelector('.ndc-legend')).toHaveTextContent('Meta') // a bolinha de meta só existe quando o mês tem prazo
  })

  it('trocar de mês e "Hoje" continuam: o botão Hoje só aparece fora do mês atual', async () => {
    setup({ txs: TXS })
    await screen.findByRole('heading', { name: 'Outubro 2026' })
    expect(screen.queryByRole('button', { name: 'Hoje' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(await screen.findByRole('heading', { name: 'Novembro 2026' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(await screen.findByRole('heading', { name: 'Outubro 2026' })).toBeInTheDocument()
  })

  it('"ocultar valores" esconde os reais no painel', async () => {
    localStorage.setItem('hide-balance', '1')
    setup({ txs: TXS })
    await screen.findByRole('heading', { name: 'Outubro 2026' })
    expect(within(document.querySelector('.ndc-day')).queryByText(/240/)).not.toBeInTheDocument()
    expect(document.querySelector('.ndc-ev-amt')).toHaveTextContent('R$ ••••')
  })
})

describe('Calendário — celular continua o mesmo', () => {
  it('abaixo de 901px: cabeçalho azul e grade do celular', async () => {
    setDesktop(false)
    setup({ txs: TXS })
    expect(await screen.findByRole('heading', { name: 'Calendário' })).toBeInTheDocument()
    expect(document.querySelector('.cl-cells')).not.toBeNull()
    expect(document.querySelector('.ndc-grid')).toBeNull()
  })
})
